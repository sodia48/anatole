from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic

from app.schemas.market import (
    CockpitSnapshot,
    MarketBreadth,
    MarketTile,
    SectorSnapshot,
)
from app.services.market_data import market_data_service
from app.services.tsx60 import (
    TSX60,
    TSX60_AS_OF,
    TSX60_SOURCE,
)
from app.services.tsx_composite_universe import (
    XIC_UNIVERSE_SOURCE,
    tsx_composite_universe_service,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CockpitConstituent:
    symbol: str
    name: str
    sector: str
    weight: float


def _canonical_symbol(value: str) -> str:
    return (
        value.strip()
        .upper()
        .removesuffix(".TO")
        .replace("-", ".")
    )


class CockpitService:
    cache_ttl_seconds = 15.0
    composite_cache_ttl_seconds = 90.0
    composite_quote_timeout_seconds = 70.0

    def __init__(self) -> None:
        # Ces deux attributs restent les caches TSX 60 historiques afin de
        # préserver la compatibilité avec Qualité des données et les tests.
        self._cached: CockpitSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

        self._composite_cached: CockpitSnapshot | None = None
        self._composite_cached_at = 0.0
        self._composite_lock = asyncio.Lock()

    @staticmethod
    def _tsx60_constituents() -> list[CockpitConstituent]:
        return [
            CockpitConstituent(
                symbol=item.symbol,
                name=item.name,
                sector=item.sector,
                weight=item.weight,
            )
            for item in TSX60
        ]

    async def _composite_constituents(self) -> list[CockpitConstituent]:
        entries = await tsx_composite_universe_service.get_constituents()
        fallback_weight = 100.0 / max(len(entries), 1)

        return [
            CockpitConstituent(
                symbol=entry.ticker,
                name=entry.name,
                sector=entry.sector or "Other",
                weight=max(entry.weight or fallback_weight, 0.01),
            )
            for entry in entries
        ]

    @staticmethod
    def _previous_tiles(
        snapshot: CockpitSnapshot | None,
    ) -> dict[str, MarketTile]:
        if snapshot is None:
            return {}
        return {
            _canonical_symbol(tile.symbol): tile
            for tile in snapshot.constituents
        }

    async def _build_snapshot(
        self,
        *,
        constituents: list[CockpitConstituent],
        universe: str,
        universe_as_of: str,
        universe_source: str,
        previous: CockpitSnapshot | None,
        refresh_after_seconds: int,
        include_unavailable: bool,
        quote_timeout_seconds: float | None = None,
    ) -> CockpitSnapshot:
        generated_at = datetime.now(UTC)
        symbols = [item.symbol for item in constituents]

        quote_request = market_data_service.get_quotes(symbols)
        if quote_timeout_seconds is not None:
            quotes = await asyncio.wait_for(
                quote_request,
                timeout=quote_timeout_seconds,
            )
        else:
            quotes = await quote_request

        quote_by_symbol = {
            _canonical_symbol(quote.symbol): quote
            for quote in quotes
        }
        previous_tiles = self._previous_tiles(previous)
        tiles: list[MarketTile] = []

        for item in constituents:
            key = _canonical_symbol(item.symbol)
            quote = quote_by_symbol.get(key)

            if quote is not None:
                tiles.append(
                    MarketTile(
                        ticker=quote.ticker,
                        symbol=item.symbol,
                        name=item.name,
                        sector=item.sector,
                        weight=item.weight,
                        price=quote.price,
                        change=quote.change,
                        change_percent=quote.change_percent,
                        volume=quote.volume,
                        timestamp=quote.timestamp,
                        source=quote.source,
                        delayed=quote.delayed,
                    )
                )
                continue

            previous_tile = previous_tiles.get(key)
            if previous_tile is not None:
                tiles.append(
                    previous_tile.model_copy(
                        update={
                            "name": item.name,
                            "sector": item.sector,
                            "weight": item.weight,
                        }
                    )
                )
                continue

            if include_unavailable:
                tiles.append(
                    MarketTile(
                        ticker=market_data_service.normalize_ticker(
                            item.symbol
                        ),
                        symbol=item.symbol,
                        name=item.name,
                        sector=item.sector,
                        weight=item.weight,
                        price=0.0,
                        change=0.0,
                        change_percent=0.0,
                        volume=0,
                        timestamp=generated_at,
                        source="unavailable",
                        delayed=True,
                    )
                )

        # Ne remplace jamais une bonne carte par une réponse vide.
        if not tiles and previous is not None:
            return previous

        priced_tiles = [
            tile for tile in tiles if tile.source != "unavailable"
        ]
        weighted_tiles = priced_tiles or tiles
        total_weight = sum(tile.weight for tile in weighted_tiles) or 1.0
        weighted_change = (
            sum(
                tile.weight * tile.change_percent
                for tile in weighted_tiles
            )
            / total_weight
        )

        advancers = sum(
            tile.change_percent > 0.001 for tile in priced_tiles
        )
        decliners = sum(
            tile.change_percent < -0.001 for tile in priced_tiles
        )
        unchanged = sum(
            abs(tile.change_percent) <= 0.001 for tile in priced_tiles
        )

        breadth = MarketBreadth(
            advancers=advancers,
            decliners=decliners,
            unchanged=unchanged,
            advance_ratio=round(
                advancers / max(advancers + decliners, 1) * 100,
                2,
            ),
        )

        sectors: list[SectorSnapshot] = []
        for sector in sorted({tile.sector for tile in tiles}):
            members = [tile for tile in tiles if tile.sector == sector]
            priced_members = [
                tile for tile in members if tile.source != "unavailable"
            ]
            sector_weight = sum(tile.weight for tile in members)
            priced_weight = (
                sum(tile.weight for tile in priced_members) or 1.0
            )
            sector_change = (
                sum(
                    tile.weight * tile.change_percent
                    for tile in priced_members
                )
                / priced_weight
                if priced_members
                else 0.0
            )

            sectors.append(
                SectorSnapshot(
                    sector=sector,
                    weight=round(sector_weight, 2),
                    change_percent=round(sector_change, 4),
                    advancers=sum(
                        tile.change_percent > 0.001
                        for tile in priced_members
                    ),
                    decliners=sum(
                        tile.change_percent < -0.001
                        for tile in priced_members
                    ),
                    unchanged=sum(
                        abs(tile.change_percent) <= 0.001
                        for tile in priced_members
                    ),
                )
            )

        sectors.sort(key=lambda item: item.weight, reverse=True)
        ranked_tiles = priced_tiles or tiles

        return CockpitSnapshot(
            universe=universe,
            universe_as_of=universe_as_of,
            universe_source=universe_source,
            weighted_change_percent=round(weighted_change, 4),
            breadth=breadth,
            sectors=sectors,
            constituents=sorted(
                tiles,
                key=lambda tile: tile.weight,
                reverse=True,
            ),
            top_gainers=sorted(
                ranked_tiles,
                key=lambda tile: tile.change_percent,
                reverse=True,
            )[:5],
            top_losers=sorted(
                ranked_tiles,
                key=lambda tile: tile.change_percent,
            )[:5],
            generated_at=generated_at,
            refresh_after_seconds=refresh_after_seconds,
        )

    async def get_tsx60(self) -> CockpitSnapshot:
        now = monotonic()
        if (
            self._cached is not None
            and now - self._cached_at < self.cache_ttl_seconds
        ):
            return self._cached

        async with self._lock:
            now = monotonic()
            if (
                self._cached is not None
                and now - self._cached_at < self.cache_ttl_seconds
            ):
                return self._cached

            snapshot = await self._build_snapshot(
                constituents=self._tsx60_constituents(),
                universe="S&P/TSX 60",
                universe_as_of=TSX60_AS_OF,
                universe_source=TSX60_SOURCE,
                previous=self._cached,
                refresh_after_seconds=15,
                include_unavailable=False,
            )
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot

    async def get_composite(self) -> CockpitSnapshot:
        now = monotonic()
        if (
            self._composite_cached is not None
            and now - self._composite_cached_at
            < self.composite_cache_ttl_seconds
        ):
            return self._composite_cached

        async with self._composite_lock:
            now = monotonic()
            if (
                self._composite_cached is not None
                and now - self._composite_cached_at
                < self.composite_cache_ttl_seconds
            ):
                return self._composite_cached

            try:
                constituents = await self._composite_constituents()
                snapshot = await self._build_snapshot(
                    constituents=constituents,
                    universe="S&P/TSX Composite",
                    universe_as_of=(
                        tsx_composite_universe_service.as_of
                        or datetime.now(UTC).date().isoformat()
                    ),
                    universe_source=XIC_UNIVERSE_SOURCE,
                    previous=self._composite_cached,
                    refresh_after_seconds=90,
                    include_unavailable=True,
                    quote_timeout_seconds=(
                        self.composite_quote_timeout_seconds
                    ),
                )
            except Exception as error:  # noqa: BLE001
                if self._composite_cached is not None:
                    logger.warning(
                        "composite_cockpit_stale_fallback error=%s detail=%s",
                        type(error).__name__,
                        error,
                    )
                    return self._composite_cached
                logger.warning(
                    "composite_cockpit_tsx60_fallback error=%s detail=%s",
                    type(error).__name__,
                    error,
                )
                snapshot = await self._build_snapshot(
                    constituents=self._tsx60_constituents(),
                    universe="S&P/TSX Composite — repli TSX 60",
                    universe_as_of=TSX60_AS_OF,
                    universe_source=(
                        f"{TSX60_SOURCE} — repli temporaire; "
                        f"{XIC_UNIVERSE_SOURCE} indisponible"
                    ),
                    previous=None,
                    refresh_after_seconds=90,
                    include_unavailable=False,
                )

            self._composite_cached = snapshot
            self._composite_cached_at = monotonic()
            return snapshot


cockpit_service = CockpitService()
