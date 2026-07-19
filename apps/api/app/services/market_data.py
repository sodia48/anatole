import asyncio
import math
import random
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.stocks import Candle, FocusSnapshot, Quote, StockProfile, Technicals
from app.services.indicators import calculate_technicals


class DemoProvider:
    def normalize_ticker(self, ticker: str) -> str:
        value = ticker.strip().upper()
        if not value:
            raise ValueError("Ticker cannot be empty")
        if value.startswith("^") or value.endswith(("=F", "=X")):
            return value
        if value.endswith((".TO", ".V", ".CN", ".NE")):
            return value
        # Yahoo represents TSX share classes and units with a hyphen.
        return f"{value.replace('.', '-')}.TO"

    def _seed(self, ticker: str) -> int:
        return sum((index + 1) * ord(char) for index, char in enumerate(ticker))

    async def history(self, ticker: str, range_: str, interval: str) -> list[Candle]:
        symbol = self.normalize_ticker(ticker)
        randomizer = random.Random(self._seed(symbol))
        count = {"1mo": 30, "3mo": 90, "6mo": 130, "1y": 260, "2y": 520, "5y": 900}.get(range_, 260)
        start = datetime.now(UTC) - timedelta(days=count * 1.5)
        price = 45 + (self._seed(symbol) % 120)
        output: list[Candle] = []
        current = start
        while len(output) < count:
            current += timedelta(days=1)
            if current.weekday() >= 5:
                continue
            drift = 0.00035 + 0.0018 * math.sin(len(output) / 31)
            shock = randomizer.gauss(0, 0.012)
            open_price = price * (1 + randomizer.gauss(0, 0.003))
            close = max(1, price * (1 + drift + shock))
            high = max(open_price, close) * (1 + abs(randomizer.gauss(0.006, 0.004)))
            low = min(open_price, close) * (1 - abs(randomizer.gauss(0.006, 0.004)))
            volume = int(700_000 + abs(randomizer.gauss(0, 450_000)))
            output.append(Candle(time=int(current.timestamp()), open=round(open_price, 4), high=round(high, 4), low=round(low, 4), close=round(close, 4), volume=volume))
            price = close
        return output

    async def quote(self, ticker: str) -> Quote:
        history = await self.history(ticker, "1mo", "1d")
        last, previous = history[-1], history[-2]
        change = last.close - previous.close
        return Quote(
            ticker=self.normalize_ticker(ticker), symbol=self.normalize_ticker(ticker).split(".")[0], name=f"{self.normalize_ticker(ticker).split('.')[0]} — démonstration", exchange="TSX", currency="CAD",
            price=last.close, previous_close=previous.close, change=round(change, 4), change_percent=round(change / previous.close * 100, 4), day_high=last.high, day_low=last.low,
            volume=last.volume, timestamp=datetime.now(UTC), source="demo-fallback", delayed=True,
        )

    async def profile(self, ticker: str) -> StockProfile:
        symbol = self.normalize_ticker(ticker)
        return StockProfile(ticker=symbol, name=f"{symbol.split('.')[0]} — profil de démonstration", exchange="TSX", currency="CAD", sector="Marché canadien", industry="Titre coté", description="Données de secours utilisées lorsque la source publique n’est pas disponible. La structure API reste identique à celle de production.")


class YahooProvider:
    base_url = "https://query1.finance.yahoo.com/v8/finance/chart"

    def normalize_ticker(self, ticker: str) -> str:
        value = ticker.strip().upper()
        if not value:
            raise ValueError("Ticker cannot be empty")
        if value.startswith("^") or value.endswith(("=F", "=X")):
            return value
        if value.endswith((".TO", ".V", ".CN", ".NE")):
            return value
        # Yahoo represents TSX share classes and units with a hyphen.
        return f"{value.replace('.', '-')}.TO"

    async def _chart(self, ticker: str, range_: str, interval: str) -> dict[str, Any]:
        symbol = self.normalize_ticker(ticker)
        headers = {"User-Agent": "Mozilla/5.0 Anatole/0.1", "Accept": "application/json"}
        async with httpx.AsyncClient(timeout=settings.yahoo_timeout_seconds, headers=headers) as client:
            response = await client.get(f"{self.base_url}/{symbol}", params={"range": range_, "interval": interval, "events": "div,splits"})
            response.raise_for_status()
            payload = response.json()
        result = payload.get("chart", {}).get("result") or []
        if not result:
            raise RuntimeError("Yahoo chart payload is empty")
        return result[0]

    def _quote_from_result(self, ticker: str, result: dict[str, Any]) -> Quote:
        meta = result.get("meta") or {}
        timestamps = result.get("timestamp") or []
        raw_quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        valid: list[tuple[int, float, float, float, int]] = []
        for index, timestamp in enumerate(timestamps):
            try:
                close = (raw_quote.get("close") or [None])[index]
                high = (raw_quote.get("high") or [None])[index]
                low = (raw_quote.get("low") or [None])[index]
                volume = int(((raw_quote.get("volume") or [0])[index]) or 0)
                if close is None or high is None or low is None:
                    continue
                valid.append((int(timestamp), float(close), float(high), float(low), volume))
            except (IndexError, TypeError, ValueError):
                continue
        if not valid:
            raise RuntimeError("Yahoo quote payload is empty")
        last = valid[-1]
        previous_close = float(meta.get("chartPreviousClose") or meta.get("previousClose") or (valid[-2][1] if len(valid) > 1 else last[1]))
        price = float(meta.get("regularMarketPrice") or last[1])
        change = price - previous_close
        symbol = self.normalize_ticker(ticker)
        return Quote(
            ticker=symbol,
            symbol=symbol.removesuffix(".TO"),
            name=str(meta.get("longName") or meta.get("shortName") or symbol.removesuffix(".TO")),
            exchange=str(meta.get("exchangeName") or "TSX"),
            currency=str(meta.get("currency") or "CAD"),
            price=price,
            previous_close=previous_close,
            change=change,
            change_percent=(change / previous_close * 100) if previous_close else 0,
            day_high=float(meta.get("regularMarketDayHigh") or last[2]),
            day_low=float(meta.get("regularMarketDayLow") or last[3]),
            volume=int(meta.get("regularMarketVolume") or last[4]),
            timestamp=datetime.fromtimestamp(int(meta.get("regularMarketTime") or last[0]), UTC),
            source="yahoo-public",
            delayed=True,
        )

    async def quotes_many(self, tickers: list[str]) -> list[Quote]:
        headers = {"User-Agent": "Mozilla/5.0 Anatole/0.2", "Accept": "application/json"}
        semaphore = asyncio.Semaphore(12)
        timeout = httpx.Timeout(min(settings.yahoo_timeout_seconds, 6.0))
        async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
            async def fetch_one(ticker: str) -> Quote:
                symbol = self.normalize_ticker(ticker)
                async with semaphore:
                    response = await client.get(
                        f"{self.base_url}/{symbol}",
                        params={"range": "5d", "interval": "5m", "events": "div,splits"},
                    )
                    response.raise_for_status()
                    payload = response.json()
                    results = payload.get("chart", {}).get("result") or []
                    if not results:
                        raise RuntimeError("Yahoo chart payload is empty")
                    return self._quote_from_result(ticker, results[0])

            results = await asyncio.gather(*(fetch_one(ticker) for ticker in tickers), return_exceptions=True)

        output: list[Quote] = []
        for ticker, result in zip(tickers, results, strict=True):
            if isinstance(result, Quote):
                output.append(result)
            else:
                output.append(await DemoProvider().quote(ticker))
        return output

    async def history(self, ticker: str, range_: str, interval: str) -> list[Candle]:
        result = await self._chart(ticker, range_, interval)
        timestamps = result.get("timestamp") or []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        output: list[Candle] = []
        for index, timestamp in enumerate(timestamps):
            try:
                values = [quote.get(field, [None])[index] for field in ("open", "high", "low", "close")]
                if any(value is None for value in values):
                    continue
                output.append(Candle(time=int(timestamp), open=float(values[0]), high=float(values[1]), low=float(values[2]), close=float(values[3]), volume=int((quote.get("volume") or [0])[index] or 0)))
            except (IndexError, TypeError, ValueError):
                continue
        if len(output) < 2:
            raise RuntimeError("Yahoo history contains insufficient candles")
        return output

    async def quote(self, ticker: str) -> Quote:
        result = await self._chart(ticker, "5d", "5m")
        return self._quote_from_result(ticker, result)

    async def profile(self, ticker: str) -> StockProfile:
        quote = await self.quote(ticker)
        return StockProfile(ticker=quote.ticker, name=quote.name, exchange=quote.exchange, currency=quote.currency, sector="Marché canadien", industry=None, description="Profil de base provenant du flux de marché public. Les fondamentaux détaillés seront branchés lors du prochain jalon.")


class MarketDataService:
    def __init__(self) -> None:
        self.demo = DemoProvider()
        self.yahoo = YahooProvider()

    def normalize_ticker(self, ticker: str) -> str:
        return self.yahoo.normalize_ticker(ticker)

    async def _with_fallback(self, primary, fallback):
        if settings.market_data_provider.lower() == "demo":
            return await fallback()
        try:
            return await primary()
        except Exception:
            return await fallback()

    async def get_quote(self, ticker: str) -> Quote:
        return await self._with_fallback(lambda: self.yahoo.quote(ticker), lambda: self.demo.quote(ticker))

    async def get_quotes(self, tickers: list[str]) -> list[Quote]:
        if settings.market_data_provider.lower() == "demo":
            return list(await asyncio.gather(*(self.demo.quote(ticker) for ticker in tickers)))
        try:
            return await self.yahoo.quotes_many(tickers)
        except Exception:
            return list(await asyncio.gather(*(self.demo.quote(ticker) for ticker in tickers)))

    async def get_history(self, ticker: str, range_: str = "1y", interval: str = "1d") -> list[Candle]:
        return await self._with_fallback(lambda: self.yahoo.history(ticker, range_, interval), lambda: self.demo.history(ticker, range_, interval))

    async def get_profile(self, ticker: str) -> StockProfile:
        return await self._with_fallback(lambda: self.yahoo.profile(ticker), lambda: self.demo.profile(ticker))

    async def get_history_many(
        self,
        tickers: list[str],
        range_: str = "3mo",
        interval: str = "1d",
        concurrency: int = 10,
    ) -> dict[str, list[Candle]]:
        semaphore = asyncio.Semaphore(max(1, concurrency))

        async def fetch(ticker: str) -> tuple[str, list[Candle]]:
            async with semaphore:
                return ticker, await self.get_history(ticker, range_, interval)

        results = await asyncio.gather(*(fetch(ticker) for ticker in tickers))
        return {ticker: candles for ticker, candles in results}

    def calculate_technicals(self, candles: list[Candle]) -> Technicals:
        return calculate_technicals(candles)

    async def get_focus_snapshot(self, ticker: str, range_: str = "1y", interval: str = "1d") -> FocusSnapshot:
        quote, history, profile = await asyncio.gather(
            self.get_quote(ticker),
            self.get_history(ticker, range_, interval),
            self.get_profile(ticker),
        )
        return FocusSnapshot(quote=quote, history=history, technicals=self.calculate_technicals(history), profile=profile, generated_at=datetime.now(UTC))


market_data_service = MarketDataService()
