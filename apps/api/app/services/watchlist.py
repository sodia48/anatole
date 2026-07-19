import re
import time
from datetime import UTC, datetime

from fastapi import HTTPException

from app.schemas.watchlist import WatchlistSnapshot, WatchlistSummary
from app.services.market_data import market_data_service


_ALLOWED_TICKER = re.compile(r"^[A-Z0-9.-]{1,15}$")


class WatchlistService:
    def __init__(self) -> None:
        self._cache: dict[tuple[str, ...], tuple[float, WatchlistSnapshot]] = {}
        self.cache_seconds = 10

    def _clean_tickers(self, tickers: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in tickers:
            value = raw.strip().upper()
            if value.endswith(".TO"):
                value = value[:-3]
            if not value or not _ALLOWED_TICKER.fullmatch(value):
                raise HTTPException(status_code=422, detail=f"Ticker invalide: {raw}")
            normalized = market_data_service.normalize_ticker(value)
            if normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(value)
        if not cleaned:
            raise HTTPException(status_code=422, detail="La watchlist doit contenir au moins un ticker")
        return cleaned[:30]

    async def get_snapshot(self, tickers: list[str]) -> WatchlistSnapshot:
        cleaned = self._clean_tickers(tickers)
        cache_key = tuple(cleaned)
        cached = self._cache.get(cache_key)
        now = time.monotonic()
        if cached and now - cached[0] < self.cache_seconds:
            return cached[1]

        quotes = await market_data_service.get_quotes(cleaned)
        advancers = sum(1 for quote in quotes if quote.change_percent > 0.005)
        decliners = sum(1 for quote in quotes if quote.change_percent < -0.005)
        unchanged = len(quotes) - advancers - decliners
        average = sum(quote.change_percent for quote in quotes) / len(quotes) if quotes else 0.0
        snapshot = WatchlistSnapshot(
            tickers=[quote.ticker for quote in quotes],
            items=quotes,
            summary=WatchlistSummary(
                advancers=advancers,
                decliners=decliners,
                unchanged=unchanged,
                average_change_percent=round(average, 4),
            ),
            generated_at=datetime.now(UTC),
            refresh_after_seconds=20,
        )
        self._cache[cache_key] = (now, snapshot)
        if len(self._cache) > 128:
            oldest_key = min(self._cache, key=lambda key: self._cache[key][0])
            self._cache.pop(oldest_key, None)
        return snapshot


watchlist_service = WatchlistService()
