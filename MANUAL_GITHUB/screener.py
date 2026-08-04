import asyncio
from datetime import UTC, datetime
from time import monotonic

from app.schemas.discovery import ScreenerRow, ScreenerSnapshot
from app.schemas.stocks import Candle
from app.services.market_data import market_data_service
from app.services.tsx60 import TSX60
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    tsx_composite_universe_service,
)


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def _momentum(candles: list[Candle], sessions: int = 20) -> float:
    if len(candles) <= sessions or candles[-sessions - 1].close == 0:
        return 0.0
    return (candles[-1].close / candles[-sessions - 1].close - 1) * 100


def _average_volume(candles: list[Candle], sessions: int = 20) -> int:
    sample = candles[-sessions:] if len(candles) >= sessions else candles
    return int(sum(item.volume for item in sample) / max(len(sample), 1))


def _score(change_percent: float, momentum_20d: float, relative_volume: float, rsi: float | None, trend: str) -> float:
    change_score = _clamp(50 + change_percent * 7)
    momentum_score = _clamp(50 + momentum_20d * 3.2)
    volume_score = _clamp(relative_volume * 45)
    rsi_score = 50.0 if rsi is None else _clamp(100 - abs(rsi - 60) * 2.4)
    trend_score = {"Haussière": 88.0, "Mixte": 55.0, "Baissière": 20.0}.get(trend, 45.0)
    return round(change_score * 0.18 + momentum_score * 0.28 + volume_score * 0.16 + rsi_score * 0.18 + trend_score * 0.20, 1)


def _signal(score: float) -> str:
    if score >= 72:
        return "Momentum fort"
    if score >= 60:
        return "Constructif"
    if score <= 32:
        return "Sous pression"
    if score <= 44:
        return "Fragile"
    return "Neutre"


class ScreenerService:
    tsx60_cache_ttl_seconds = 45.0
    composite_cache_ttl_seconds = 180.0
    composite_history_concurrency = 16
    composite_max_constituents = 260

    def __init__(self) -> None:
        self._cache: dict[
            str,
            tuple[float, ScreenerSnapshot],
        ] = {}
        self._locks = {
            "tsx60": asyncio.Lock(),
            "composite": asyncio.Lock(),
        }

    @staticmethod
    def _normalize_universe(
        universe: str,
    ) -> str:
        normalized = (
            universe.strip()
            .lower()
            .replace("-", "")
            .replace("_", "")
            .replace(" ", "")
        )
        if normalized in {
            "composite",
            "tsxcomposite",
            "sptsxcomposite",
        }:
            return "composite"
        if normalized in {
            "tsx60",
            "sptsx60",
            "60",
        }:
            return "tsx60"
        raise ValueError(
            "Universe must be 'composite' or 'tsx60'"
        )

    def _ttl(self, universe: str) -> float:
        return (
            self.composite_cache_ttl_seconds
            if universe == "composite"
            else self.tsx60_cache_ttl_seconds
        )

    async def _constituents(
        self,
        universe: str,
    ) -> tuple[
        str,
        list[CompositeConstituent],
    ]:
        if universe == "tsx60":
            return (
                "S&P/TSX 60",
                [
                    CompositeConstituent(
                        ticker=item.symbol,
                        name=item.name,
                        sector=item.sector,
                    )
                    for item in TSX60
                ],
            )

        constituents = (
            await tsx_composite_universe_service
            .get_constituents()
        )
        return (
            "S&P/TSX Composite",
            constituents[
                : self.composite_max_constituents
            ],
        )

    async def get_snapshot(
        self,
        universe: str = "composite",
    ) -> ScreenerSnapshot:
        normalized = self._normalize_universe(
            universe
        )
        now = monotonic()
        cached = self._cache.get(normalized)

        if (
            cached is not None
            and now - cached[0] <
            self._ttl(normalized)
        ):
            return cached[1]

        async with self._locks[normalized]:
            now = monotonic()
            cached = self._cache.get(
                normalized
            )
            if (
                cached is not None
                and now - cached[0] <
                self._ttl(normalized)
            ):
                return cached[1]

            universe_name, constituents = (
                await self._constituents(
                    normalized
                )
            )
            symbols = [
                item.ticker
                for item in constituents
            ]

            quotes, histories = (
                await asyncio.gather(
                    market_data_service
                    .get_quotes(symbols),
                    market_data_service
                    .get_history_many(
                        symbols,
                        range_="3mo",
                        interval="1d",
                        concurrency=(
                            self.composite_history_concurrency
                            if normalized
                            == "composite"
                            else 12
                        ),
                    ),
                )
            )

            quote_by_symbol = {
                quote.symbol.replace(
                    "-", "."
                ): quote
                for quote in quotes
            }
            rows: list[ScreenerRow] = []

            for constituent in constituents:
                symbol = constituent.ticker
                quote = quote_by_symbol.get(
                    symbol
                )
                candles = histories.get(
                    symbol,
                    [],
                )

                if quote is None or not candles:
                    continue

                technicals = (
                    market_data_service
                    .calculate_technicals(
                        candles
                    )
                )
                avg_volume = _average_volume(
                    candles
                )
                relative_volume = (
                    quote.volume / avg_volume
                    if avg_volume
                    else 0.0
                )
                momentum_20d = _momentum(
                    candles
                )
                score = _score(
                    quote.change_percent,
                    momentum_20d,
                    relative_volume,
                    technicals.rsi_14,
                    technicals.trend,
                )

                rows.append(
                    ScreenerRow(
                        ticker=quote.ticker,
                        symbol=symbol,
                        name=constituent.name,
                        sector=(
                            constituent.sector
                            or "Non classé"
                        ),
                        price=round(
                            quote.price,
                            4,
                        ),
                        change_percent=round(
                            quote.change_percent,
                            4,
                        ),
                        volume=quote.volume,
                        average_volume_20d=(
                            avg_volume
                        ),
                        relative_volume=round(
                            relative_volume,
                            2,
                        ),
                        momentum_20d=round(
                            momentum_20d,
                            2,
                        ),
                        rsi_14=(
                            technicals.rsi_14
                        ),
                        sma_20=(
                            technicals.sma_20
                        ),
                        sma_50=(
                            technicals.sma_50
                        ),
                        trend=technicals.trend,
                        score=score,
                        signal=_signal(score),
                        source=quote.source,
                        delayed=quote.delayed,
                    )
                )

            snapshot = ScreenerSnapshot(
                universe=universe_name,
                items=sorted(
                    rows,
                    key=lambda item: (
                        item.score
                    ),
                    reverse=True,
                ),
                sectors=sorted(
                    {
                        item.sector
                        for item in rows
                    }
                ),
                generated_at=datetime.now(
                    UTC
                ),
                refresh_after_seconds=(
                    180
                    if normalized
                    == "composite"
                    else 45
                ),
                live_items=sum(
                    item.source
                    != "demo-fallback"
                    for item in rows
                ),
                fallback_items=sum(
                    item.source
                    == "demo-fallback"
                    for item in rows
                ),
            )
            self._cache[normalized] = (
                monotonic(),
                snapshot,
            )
            return snapshot

    async def get_tsx60(
        self,
    ) -> ScreenerSnapshot:
        return await self.get_snapshot(
            "tsx60"
        )

    async def get_composite(
        self,
    ) -> ScreenerSnapshot:
        return await self.get_snapshot(
            "composite"
        )


screener_service = ScreenerService()
