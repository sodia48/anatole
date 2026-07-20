import asyncio

from datetime import UTC, datetime
from time import monotonic

from app.schemas.market import (
    CockpitSnapshot,
    MarketBreadth,
    MarketTile,
    SectorSnapshot,
)
from app.services.session_quotes import session_quote_service
from app.services.tsx60 import (
    TSX60,
    TSX60_AS_OF,
    TSX60_SOURCE,
)


class CockpitService:
    cache_ttl_seconds = 15.0

    def __init__(self) -> None:
        self._cached: CockpitSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

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

            symbols = [item.symbol for item in TSX60]
            quotes = await session_quote_service.get_quotes(symbols)
            quote_by_symbol = {
                quote.symbol.replace("-", "."): quote
                for quote in quotes
            }

            previous_tiles = (
                {
                    tile.symbol: tile
                    for tile in self._cached.constituents
                }
                if self._cached is not None
                else {}
            )

            tiles: list[MarketTile] = []

            for item in TSX60:
                quote = quote_by_symbol.get(item.symbol)

                if quote is None:
                    previous_tile = previous_tiles.get(item.symbol)

                    if previous_tile is not None:
                        tiles.append(previous_tile)

                    continue

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

            # Ne remplace jamais une bonne carte complÃ¨te par une rÃ©ponse vide.
            if not tiles and self._cached is not None:
                return self._cached

            total_weight = sum(tile.weight for tile in tiles) or 1.0
            weighted_change = (
                sum(
                    tile.weight * tile.change_percent
                    for tile in tiles
                )
                / total_weight
            )

            advancers = sum(
                tile.change_percent > 0.001
                for tile in tiles
            )
            decliners = sum(
                tile.change_percent < -0.001
                for tile in tiles
            )
            unchanged = len(tiles) - advancers - decliners

            breadth = MarketBreadth(
                advancers=advancers,
                decliners=decliners,
                unchanged=unchanged,
                advance_ratio=round(
                    advancers
                    / max(advancers + decliners, 1)
                    * 100,
                    2,
                ),
            )

            sectors: list[SectorSnapshot] = []

            for sector in sorted(
                {tile.sector for tile in tiles}
            ):
                members = [
                    tile
                    for tile in tiles
                    if tile.sector == sector
                ]
                sector_weight = sum(
                    tile.weight for tile in members
                )
                sector_change = (
                    sum(
                        tile.weight * tile.change_percent
                        for tile in members
                    )
                    / max(sector_weight, 0.0001)
                )

                sectors.append(
                    SectorSnapshot(
                        sector=sector,
                        weight=round(sector_weight, 2),
                        change_percent=round(
                            sector_change,
                            4,
                        ),
                        advancers=sum(
                            tile.change_percent > 0.001
                            for tile in members
                        ),
                        decliners=sum(
                            tile.change_percent < -0.001
                            for tile in members
                        ),
                        unchanged=sum(
                            abs(tile.change_percent) <= 0.001
                            for tile in members
                        ),
                    )
                )

            sectors.sort(
                key=lambda item: item.weight,
                reverse=True,
            )

            snapshot = CockpitSnapshot(
                universe="S&P/TSX 60",
                universe_as_of=TSX60_AS_OF,
                universe_source=TSX60_SOURCE,
                weighted_change_percent=round(
                    weighted_change,
                    4,
                ),
                breadth=breadth,
                sectors=sectors,
                constituents=sorted(
                    tiles,
                    key=lambda tile: tile.weight,
                    reverse=True,
                ),
                top_gainers=sorted(
                    tiles,
                    key=lambda tile: tile.change_percent,
                    reverse=True,
                )[:5],
                top_losers=sorted(
                    tiles,
                    key=lambda tile: tile.change_percent,
                )[:5],
                generated_at=datetime.now(UTC),
                refresh_after_seconds=15,
            )

            self._cached = snapshot
            self._cached_at = monotonic()

            return snapshot


cockpit_service = CockpitService()

