from __future__ import annotations

import asyncio
import logging
import math
import os
import random
from datetime import UTC, datetime, timedelta
from typing import Any, Awaitable, Callable, TypeVar

from app.core.config import settings
from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.stocks import (
    Candle,
    FocusSnapshot,
    Quote,
    StockProfile,
    Technicals,
)
from app.services.indicators import calculate_technicals
from app.services.session_quotes import session_quote_service

logger = logging.getLogger(__name__)

T = TypeVar("T")


class DemoProvider:
    def normalize_ticker(self, ticker: str) -> str:
        return session_quote_service.normalize_ticker(ticker)

    def _seed(self, ticker: str) -> int:
        return sum((index + 1) * ord(char) for index, char in enumerate(ticker))

    async def history(
        self,
        ticker: str,
        range_: str,
        interval: str,
    ) -> list[Candle]:
        symbol = self.normalize_ticker(ticker)
        randomizer = random.Random(self._seed(symbol))
        count = {
            "1d": 390,
            "5d": 390,
            "1mo": 30,
            "3mo": 90,
            "6mo": 130,
            "ytd": 180,
            "1y": 260,
            "2y": 520,
            "5y": 900,
            "10y": 1200,
        }.get(range_, 260)
        intraday_minutes = {
            "1m": 1,
            "2m": 2,
            "5m": 5,
            "15m": 15,
            "30m": 30,
            "60m": 60,
            "90m": 90,
        }
        intraday = interval in intraday_minutes
        step = (
            timedelta(minutes=intraday_minutes[interval])
            if intraday
            else timedelta(weeks=1)
            if interval == "1wk"
            else timedelta(days=30)
            if interval == "1mo"
            else timedelta(days=1)
        )
        current = datetime.now(UTC) - step * count
        price = 45 + self._seed(symbol) % 120
        output: list[Candle] = []

        while len(output) < count:
            current += step
            if not intraday and current.weekday() >= 5:
                continue
            drift = 0.00035 + 0.0018 * math.sin(len(output) / 31)
            shock = randomizer.gauss(0, 0.012)
            open_price = price * (1 + randomizer.gauss(0, 0.003))
            close = max(1, price * (1 + drift + shock))
            high = max(open_price, close) * (
                1 + abs(randomizer.gauss(0.006, 0.004))
            )
            low = min(open_price, close) * (
                1 - abs(randomizer.gauss(0.006, 0.004))
            )
            volume = int(700_000 + abs(randomizer.gauss(0, 450_000)))
            output.append(
                Candle(
                    time=int(current.timestamp()),
                    open=round(open_price, 4),
                    high=round(high, 4),
                    low=round(low, 4),
                    close=round(close, 4),
                    volume=volume,
                )
            )
            price = close
        return output

    async def quote(
        self,
        ticker: str,
        *,
        source: str = "demo-explicit",
    ) -> Quote:
        history = await self.history(ticker, "1mo", "1d")
        last, previous = history[-1], history[-2]
        normalized = self.normalize_ticker(ticker)
        change = last.close - previous.close
        return Quote(
            ticker=normalized,
            symbol=normalized.removesuffix(".TO"),
            name=f"{normalized.removesuffix('.TO')} — démonstration",
            exchange="TSX",
            currency="CAD",
            price=last.close,
            previous_close=previous.close,
            change=round(change, 4),
            change_percent=round(change / previous.close * 100, 4),
            day_high=last.high,
            day_low=last.low,
            volume=last.volume,
            timestamp=datetime.now(UTC),
            source=source,
            delayed=True,
        )

    async def profile(self, ticker: str) -> StockProfile:
        normalized = self.normalize_ticker(ticker)
        return StockProfile(
            ticker=normalized,
            name=f"{normalized.removesuffix('.TO')} — démonstration",
            exchange="TSX",
            currency="CAD",
            sector="Marché canadien",
            industry="Titre coté",
            description="Données utilisées uniquement en mode demo explicite.",
        )


class YahooProvider:
    base_url = "https://query1.finance.yahoo.com/v8/finance/chart"

    def __init__(self) -> None:
        self._chart_cache: AsyncStaleCache[
            tuple[str, str, str],
            dict[str, Any],
        ] = AsyncStaleCache(max_entries=3000)

    def normalize_ticker(self, ticker: str) -> str:
        return session_quote_service.normalize_ticker(ticker)

    @staticmethod
    def _cache_policy(
        range_: str,
        interval: str,
    ) -> tuple[float, float]:
        intraday = interval in {
            "1m", "2m", "5m", "15m", "30m", "60m", "90m"
        }
        if intraday or range_ in {"1d", "2d", "5d"}:
            return (
                float(os.getenv("HISTORY_INTRADAY_TTL_SECONDS", "30")),
                float(os.getenv("HISTORY_INTRADAY_STALE_SECONDS", "1800")),
            )
        return (
            float(os.getenv("HISTORY_DAILY_TTL_SECONDS", "300")),
            float(os.getenv("HISTORY_DAILY_STALE_SECONDS", "86400")),
        )

    async def _load_chart(
        self,
        symbol: str,
        range_: str,
        interval: str,
    ) -> dict[str, Any]:
        payload = await shared_http_client.get_json(
            f"{self.base_url}/{symbol}",
            params={
                "range": range_,
                "interval": interval,
                "includePrePost": "false",
                "events": "div,splits",
            },
        )
        results = payload.get("chart", {}).get("result") or []
        if not results:
            raise RuntimeError("Yahoo chart payload is empty")
        return results[0]

    async def chart(
        self,
        ticker: str,
        range_: str,
        interval: str,
    ) -> dict[str, Any]:
        symbol = self.normalize_ticker(ticker)
        key = (symbol, range_, interval)
        fresh, stale = self._cache_policy(range_, interval)
        return await self._chart_cache.get_or_load(
            key,
            lambda: self._load_chart(symbol, range_, interval),
            fresh_seconds=fresh,
            stale_seconds=stale,
        )

    async def quote(self, ticker: str) -> Quote:
        # Une seule implémentation des cotations : pas de double appel
        # 1d/1m + 5d/5m comme dans l'ancienne version.
        return await session_quote_service.get_quote(ticker)

    async def history(
        self,
        ticker: str,
        range_: str,
        interval: str,
    ) -> list[Candle]:
        result = await self.chart(ticker, range_, interval)
        timestamps = result.get("timestamp") or []
        raw_quote = (
            ((result.get("indicators") or {}).get("quote") or [{}])[0]
        )
        output: list[Candle] = []

        for index, timestamp in enumerate(timestamps):
            try:
                values = [
                    raw_quote.get(field, [None])[index]
                    for field in ("open", "high", "low", "close")
                ]
                if any(value is None for value in values):
                    continue
                output.append(
                    Candle(
                        time=int(timestamp),
                        open=float(values[0]),
                        high=float(values[1]),
                        low=float(values[2]),
                        close=float(values[3]),
                        volume=int(
                            (raw_quote.get("volume") or [0])[index] or 0
                        ),
                    )
                )
            except (IndexError, TypeError, ValueError):
                continue

        if len(output) < 2:
            raise RuntimeError("Yahoo history contains insufficient candles")
        return output

    @staticmethod
    def profile_from_quote(quote: Quote) -> StockProfile:
        return StockProfile(
            ticker=quote.ticker,
            name=quote.name,
            exchange=quote.exchange,
            currency=quote.currency,
            sector="Marché canadien",
            industry=None,
            description=(
                "Profil de base provenant du flux public. "
                "Les fondamentaux détaillés sont servis séparément."
            ),
        )


class MarketDataService:
    strict_history_timeout_seconds = 10.0

    def __init__(self) -> None:
        self.demo = DemoProvider()
        self.yahoo = YahooProvider()

    @property
    def demo_mode(self) -> bool:
        return settings.market_data_provider.lower() == "demo"

    def normalize_ticker(self, ticker: str) -> str:
        return self.yahoo.normalize_ticker(ticker)

    async def _with_fallback(
        self,
        primary: Callable[[], Awaitable[T]],
        fallback: Callable[[], Awaitable[T]],
        *,
        label: str,
    ) -> T:
        if self.demo_mode:
            return await fallback()

        try:
            return await primary()
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001
            logger.warning(
                "market_data_fallback label=%s error=%s detail=%s",
                label,
                type(error).__name__,
                error,
            )
            return await fallback()

    async def get_quote(self, ticker: str) -> Quote:
        if self.demo_mode:
            return await self.demo.quote(
                ticker,
                source="demo-explicit",
            )

        return await self._with_fallback(
            lambda: self.yahoo.quote(ticker),
            lambda: self.demo.quote(
                ticker,
                source="demo-fallback",
            ),
            label=f"quote:{ticker}",
        )

    async def get_quotes(self, tickers: list[str]) -> list[Quote]:
        unique: list[str] = []
        seen: set[str] = set()
        for ticker in tickers:
            clean = ticker.strip().upper()
            if clean and clean not in seen:
                seen.add(clean)
                unique.append(ticker)

        if self.demo_mode:
            return list(
                await asyncio.gather(
                    *(
                        self.demo.quote(
                            ticker,
                            source="demo-explicit",
                        )
                        for ticker in unique
                    )
                )
            )

        public_quotes = await session_quote_service.get_quotes(unique)
        public_by_symbol = {
            quote.symbol.replace("-", ".").upper(): quote
            for quote in public_quotes
        }

        missing = [
            ticker
            for ticker in unique
            if ticker.strip().upper().replace("-", ".")
            not in public_by_symbol
        ]
        fallback_quotes = await asyncio.gather(
            *(
                self.demo.quote(
                    ticker,
                    source="demo-fallback",
                )
                for ticker in missing
            )
        )
        fallback_by_symbol = {
            quote.symbol.replace("-", ".").upper(): quote
            for quote in fallback_quotes
        }

        output: list[Quote] = []
        for ticker in unique:
            key = ticker.strip().upper().replace("-", ".")
            quote = public_by_symbol.get(key) or fallback_by_symbol.get(key)
            if quote is not None:
                output.append(quote)
        return output

    async def get_history(
        self,
        ticker: str,
        range_: str = "1y",
        interval: str = "1d",
    ) -> list[Candle]:
        return await self._with_fallback(
            lambda: self.yahoo.history(ticker, range_, interval),
            lambda: self.demo.history(ticker, range_, interval),
            label=f"history:{ticker}:{range_}:{interval}",
        )

    async def get_history_many(
        self,
        tickers: list[str],
        *,
        range_: str = "1y",
        interval: str = "1d",
        concurrency: int = 6,
    ) -> dict[str, list[Candle]]:
        semaphore = asyncio.Semaphore(max(1, min(concurrency, 8)))

        async def load(ticker: str) -> tuple[str, list[Candle]]:
            async with semaphore:
                candles = await self.get_history(
                    ticker,
                    range_=range_,
                    interval=interval,
                )
                return ticker, candles

        pairs = await asyncio.gather(*(load(ticker) for ticker in tickers))
        return dict(pairs)

    async def get_history_many_strict(
        self,
        tickers: list[str],
        *,
        range_: str = "1y",
        interval: str = "1d",
        concurrency: int = 6,
    ) -> dict[str, list[Candle]]:
        """Load real Yahoo histories without silently substituting demo data.

        Explicit demo mode remains deterministic for development and tests. In
        every other environment a failed symbol is omitted, so callers can
        expose real coverage and return N/D when it is insufficient.
        """
        unique = list(dict.fromkeys(ticker.strip().upper() for ticker in tickers if ticker.strip()))
        semaphore = asyncio.Semaphore(max(1, min(concurrency, 8)))

        async def load(ticker: str) -> tuple[str, list[Candle] | None]:
            async with semaphore:
                try:
                    history_call = (
                        self.demo.history(ticker, range_, interval)
                        if self.demo_mode
                        else self.yahoo.history(ticker, range_, interval)
                    )
                    candles = await asyncio.wait_for(
                        history_call,
                        timeout=self.strict_history_timeout_seconds,
                    )
                    return ticker, candles if len(candles) >= 2 else None
                except asyncio.CancelledError:
                    raise
                except Exception as error:  # noqa: BLE001
                    logger.warning(
                        "market_data_strict_history_unavailable ticker=%s error=%s detail=%s",
                        ticker,
                        type(error).__name__,
                        error,
                    )
                    return ticker, None

        pairs = await asyncio.gather(*(load(ticker) for ticker in unique))
        return {ticker: candles for ticker, candles in pairs if candles is not None}

    async def get_profile(self, ticker: str) -> StockProfile:
        if self.demo_mode:
            return await self.demo.profile(ticker)

        quote = await self.get_quote(ticker)
        return self.yahoo.profile_from_quote(quote)

    def calculate_technicals(
        self,
        candles: list[Candle],
    ) -> Technicals:
        return calculate_technicals(candles)

    async def get_focus_snapshot(
        self,
        ticker: str,
        range_: str = "1y",
        interval: str = "1d",
    ) -> FocusSnapshot:
        quote, history = await asyncio.gather(
            self.get_quote(ticker),
            self.get_history(ticker, range_, interval),
        )
        profile = (
            await self.demo.profile(ticker)
            if self.demo_mode
            else self.yahoo.profile_from_quote(quote)
        )
        return FocusSnapshot(
            quote=quote,
            history=history,
            technicals=self.calculate_technicals(history),
            profile=profile,
            generated_at=datetime.now(UTC),
        )


market_data_service = MarketDataService()
