import asyncio
from datetime import UTC, datetime
from time import monotonic

from app.schemas.discovery import ScreenerRow, ScreenerSnapshot
from app.schemas.stocks import Candle
from app.services.market_data import market_data_service
from app.services.tsx60 import TSX60


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
    cache_ttl_seconds = 45.0

    def __init__(self) -> None:
        self._cached: ScreenerSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_tsx60(self) -> ScreenerSnapshot:
        now = monotonic()
        if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
            return self._cached

        async with self._lock:
            now = monotonic()
            if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
                return self._cached

            symbols = [item.symbol for item in TSX60]
            quotes, histories = await asyncio.gather(
                market_data_service.get_quotes(symbols),
                market_data_service.get_history_many(symbols, range_="3mo", interval="1d", concurrency=12),
            )
            quote_by_symbol = {quote.symbol.replace("-", "."): quote for quote in quotes}
            rows: list[ScreenerRow] = []

            for constituent in TSX60:
                quote = quote_by_symbol.get(constituent.symbol)
                candles = histories.get(constituent.symbol, [])
                if quote is None or not candles:
                    continue
                technicals = market_data_service.calculate_technicals(candles)
                avg_volume = _average_volume(candles)
                relative_volume = quote.volume / avg_volume if avg_volume else 0.0
                momentum_20d = _momentum(candles)
                score = _score(quote.change_percent, momentum_20d, relative_volume, technicals.rsi_14, technicals.trend)
                rows.append(
                    ScreenerRow(
                        ticker=quote.ticker,
                        symbol=constituent.symbol,
                        name=constituent.name,
                        sector=constituent.sector,
                        price=round(quote.price, 4),
                        change_percent=round(quote.change_percent, 4),
                        volume=quote.volume,
                        average_volume_20d=avg_volume,
                        relative_volume=round(relative_volume, 2),
                        momentum_20d=round(momentum_20d, 2),
                        rsi_14=technicals.rsi_14,
                        sma_20=technicals.sma_20,
                        sma_50=technicals.sma_50,
                        trend=technicals.trend,
                        score=score,
                        signal=_signal(score),
                        source=quote.source,
                        delayed=quote.delayed,
                    )
                )

            snapshot = ScreenerSnapshot(
                universe="S&P/TSX 60",
                items=sorted(rows, key=lambda item: item.score, reverse=True),
                sectors=sorted({item.sector for item in rows}),
                generated_at=datetime.now(UTC),
                refresh_after_seconds=45,
                live_items=sum(item.source != "demo-fallback" for item in rows),
                fallback_items=sum(item.source == "demo-fallback" for item in rows),
            )
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot


screener_service = ScreenerService()
