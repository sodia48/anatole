import asyncio
import logging
from datetime import UTC, datetime
from time import monotonic

from app.schemas.discovery import ScreenerRow, ScreenerSnapshot
from app.schemas.stocks import Candle, Quote
from app.services.market_data import market_data_service
from app.services.tsx60 import TSX60
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    tsx_composite_universe_service,
)

logger = logging.getLogger(__name__)


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def _momentum(candles: list[Candle], current_price: float, sessions: int = 20) -> float:
    if len(candles) <= sessions or candles[-sessions - 1].close == 0:
        return 0.0
    return (current_price / candles[-sessions - 1].close - 1) * 100


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


def _trend(price: float, sma_20: float | None, sma_50: float | None) -> str:
    if sma_20 is None or sma_50 is None:
        return "Indéterminée"
    if price > sma_20 > sma_50:
        return "Haussière"
    if price < sma_20 < sma_50:
        return "Baissière"
    return "Mixte"


def _breakout_metrics(candles: list[Candle], current_price: float) -> tuple[float | None, bool | None, float | None]:
    """Compare the current quote with the 20 completed sessions before it."""
    if len(candles) < 21:
        return None, None, None
    previous = candles[-21:-1]
    if len(previous) != 20:
        return None, None, None
    prior_high = max(item.high for item in previous)
    if prior_high <= 0:
        return None, None, None
    breakout = current_price > prior_high
    return round(prior_high, 4), breakout, round((current_price / prior_high - 1) * 100, 4)


def tsx60_constituents() -> list[CompositeConstituent]:
    return [
        CompositeConstituent(ticker=item.symbol, name=item.name, sector=item.sector)
        for item in TSX60
    ]


def build_rows_from_quotes_and_histories(
    constituents: list[CompositeConstituent],
    quotes: list[Quote],
    histories: dict[str, list[Candle]],
) -> list[ScreenerRow]:
    quote_by_symbol = {
        quote.symbol.replace("-", ".").upper(): quote
        for quote in quotes
    }
    rows: list[ScreenerRow] = []
    for constituent in constituents:
        symbol = constituent.ticker
        quote = quote_by_symbol.get(symbol.upper())
        candles = histories.get(symbol, [])
        if quote is None:
            continue
        technicals = market_data_service.calculate_technicals(candles) if candles else None
        average_volume = _average_volume(candles) if candles else None
        relative_volume = quote.volume / average_volume if average_volume else None
        momentum_20d = _momentum(candles, quote.price) if candles else None
        trend = (
            _trend(quote.price, technicals.sma_20, technicals.sma_50)
            if technicals is not None
            else None
        )
        score = (
            _score(
                quote.change_percent,
                momentum_20d,
                relative_volume,
                technicals.rsi_14,
                trend,
            )
            if momentum_20d is not None and relative_volume is not None and trend is not None
            else None
        )
        prior_high_20d, breakout_20d, breakout_percent = (
            _breakout_metrics(candles, quote.price)
            if candles
            else (None, None, None)
        )
        rows.append(ScreenerRow(
            ticker=quote.ticker,
            symbol=symbol,
            name=constituent.name,
            sector=constituent.sector or "Non classé",
            price=round(quote.price, 4),
            change_percent=round(quote.change_percent, 4),
            volume=quote.volume,
            average_volume_20d=average_volume,
            relative_volume=round(relative_volume, 2) if relative_volume is not None else None,
            momentum_20d=round(momentum_20d, 2) if momentum_20d is not None else None,
            rsi_14=technicals.rsi_14 if technicals is not None else None,
            sma_20=technicals.sma_20 if technicals is not None else None,
            sma_50=technicals.sma_50 if technicals is not None else None,
            trend=trend,
            score=score,
            signal=_signal(score) if score is not None else None,
            source=quote.source,
            delayed=quote.delayed,
            quote_as_of=quote.timestamp,
            prior_high_20d=prior_high_20d,
            breakout_20d=breakout_20d,
            breakout_percent=breakout_percent,
        ))
    return rows


class ScreenerService:
    tsx60_cache_ttl_seconds = 45.0
    composite_cache_ttl_seconds = 180.0
    tsx60_stale_seconds = 900.0
    composite_stale_seconds = 21_600.0
    composite_history_concurrency = 16
    composite_max_constituents = 260
    composite_history_deadline_seconds = 7.0

    def __init__(self) -> None:
        self._cache: dict[
            str,
            tuple[float, ScreenerSnapshot],
        ] = {}
        self._locks = {
            "tsx60": asyncio.Lock(),
            "composite": asyncio.Lock(),
        }
        self._refresh_tasks: dict[str, asyncio.Task[None]] = {}

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

    def _stale_ttl(self, universe: str) -> float:
        return (
            self.composite_stale_seconds
            if universe == "composite"
            else self.tsx60_stale_seconds
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
                tsx60_constituents(),
            )

        try:
            constituents = (
                await tsx_composite_universe_service
                .get_constituents()
            )
        except Exception as error:  # noqa: BLE001
            logger.warning(
                "composite_screener_tsx60_fallback error=%s detail=%s",
                type(error).__name__,
                error,
            )
            return (
                "S&P/TSX Composite — repli TSX 60",
                [
                    CompositeConstituent(
                        ticker=item.symbol,
                        name=item.name,
                        sector=item.sector,
                    )
                    for item in TSX60
                ],
            )
        return (
            "S&P/TSX Composite",
            constituents[
                : self.composite_max_constituents
            ],
        )

    async def _build_snapshot(self, normalized: str) -> ScreenerSnapshot:
        started_at = monotonic()
        universe_name, constituents = await self._constituents(normalized)
        symbols = [item.ticker for item in constituents]
        quotes, histories = await asyncio.gather(
            market_data_service.get_quotes(symbols),
            market_data_service.get_history_many(
                symbols,
                range_="3mo",
                interval="1d",
                concurrency=(
                    self.composite_history_concurrency
                    if normalized == "composite"
                    else 12
                ),
                deadline_seconds=(
                    self.composite_history_deadline_seconds
                    if normalized == "composite"
                    else 5.0
                ),
            ),
        )
        rows = build_rows_from_quotes_and_histories(
            constituents,
            quotes,
            histories,
        )
        snapshot = ScreenerSnapshot(
            universe=universe_name,
            items=sorted(rows, key=lambda item: item.score if item.score is not None else -1, reverse=True),
            sectors=sorted({item.sector for item in rows}),
            generated_at=datetime.now(UTC),
            refresh_after_seconds=180 if normalized == "composite" else 45,
            live_items=sum(item.source != "demo-fallback" for item in rows),
            fallback_items=sum(item.source == "demo-fallback" for item in rows),
        )
        logger.info(
            "screener_snapshot_complete universe=%s constituents=%s rows=%s history_coverage=%s duration_ms=%s",
            normalized,
            len(constituents),
            len(rows),
            round(len(histories) / max(len(constituents), 1) * 100, 1),
            round((monotonic() - started_at) * 1000),
        )
        return snapshot

    async def _refresh(self, normalized: str) -> ScreenerSnapshot:
        async with self._locks[normalized]:
            cached = self._cache.get(normalized)
            if cached is not None and monotonic() - cached[0] < self._ttl(normalized):
                return cached[1]
            snapshot = await self._build_snapshot(normalized)
            self._cache[normalized] = (monotonic(), snapshot)
            return snapshot

    async def _refresh_in_background(self, normalized: str) -> None:
        try:
            await self._refresh(normalized)
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001
            logger.warning(
                "screener_background_refresh_failed universe=%s error=%s detail=%s",
                normalized,
                type(error).__name__,
                error,
            )
        finally:
            self._refresh_tasks.pop(normalized, None)

    def _schedule_refresh(self, normalized: str) -> None:
        task = self._refresh_tasks.get(normalized)
        if task is None or task.done():
            self._refresh_tasks[normalized] = asyncio.create_task(
                self._refresh_in_background(normalized)
            )

    async def get_snapshot(
        self,
        universe: str = "composite",
    ) -> ScreenerSnapshot:
        normalized = self._normalize_universe(universe)
        now = monotonic()
        cached = self._cache.get(normalized)
        if cached is not None:
            age = now - cached[0]
            if age < self._ttl(normalized):
                return cached[1]
            if age < self._stale_ttl(normalized):
                self._schedule_refresh(normalized)
                logger.info(
                    "screener_stale_snapshot_served universe=%s age_seconds=%s",
                    normalized,
                    round(age, 1),
                )
                return cached[1]
        return await self._refresh(normalized)

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
