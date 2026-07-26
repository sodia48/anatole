from __future__ import annotations

import math
import os
import random
from datetime import UTC, datetime, timedelta
from typing import Any

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
        intraday = interval in {
            "1m", "2m", "5m", "15m", "30m", "60m", "90m"
        }
        step = timedelta(minutes=5) if intraday else timedelta(days=1)
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

    async def quote(self, ticker: str) -> Quote:
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
            source="demo-explicit",
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
    def __init__(self) -> None:
        self.demo = DemoProvider()
        self.yahoo = YahooProvider()

    @property
    def demo_mode(self) -> bool:
        return os.getenv("MARKET_DATA_PROVIDER", "yahoo").lower() == "demo"

    def normalize_ticker(self, ticker: str) -> str:
        return self.yahoo.normalize_ticker(ticker)

    async def get_quote(self, ticker: str) -> Quote:
        if self.demo_mode:
            return await self.demo.quote(ticker)
        return await self.yahoo.quote(ticker)

    async def get_quotes(self, tickers: list[str]) -> list[Quote]:
        if self.demo_mode:
            import asyncio
            return list(
                await asyncio.gather(
                    *(self.demo.quote(ticker) for ticker in tickers)
                )
            )
        return await session_quote_service.get_quotes(tickers)

    async def get_history(
        self,
        ticker: str,
        range_: str = "1y",
        interval: str = "1d",
    ) -> list[Candle]:
        if self.demo_mode:
            return await self.demo.history(ticker, range_, interval)
        return await self.yahoo.history(ticker, range_, interval)

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
        # Deux appels maximum : une cotation + un historique.
        # Le profil est construit à partir de la cotation déjà reçue.
        import asyncio
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
