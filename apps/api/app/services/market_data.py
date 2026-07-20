from __future__ import annotations

import asyncio
import math
import random
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any, Awaitable, Callable, TypeVar
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from app.core.config import settings
from app.schemas.stocks import (
    Candle,
    FocusSnapshot,
    Quote,
    StockProfile,
    Technicals,
)
from app.services.indicators import calculate_technicals


T = TypeVar("T")


class DemoProvider:
    """Fournisseur explicitement réservé au mode de démonstration."""

    def normalize_ticker(self, ticker: str) -> str:
        value = ticker.strip().upper()

        if not value:
            raise ValueError("Ticker cannot be empty")

        if value.startswith("^") or value.endswith(("=F", "=X")):
            return value

        if value.endswith((".TO", ".V", ".CN", ".NE")):
            return value

        return f"{value.replace('.', '-')}.TO"

    def _seed(self, ticker: str) -> int:
        return sum(
            (index + 1) * ord(char)
            for index, char in enumerate(ticker)
        )

    async def history(
        self,
        ticker: str,
        range_: str,
        interval: str,
    ) -> list[Candle]:
        symbol = self.normalize_ticker(ticker)
        randomizer = random.Random(self._seed(symbol))

        count_by_range = {
            "1d": 390,
            "5d": 390,
            "1mo": 30,
            "3mo": 90,
            "6mo": 130,
            "ytd": 180,
            "1y": 260,
            "2y": 520,
            "5y": 260,
            "10y": 520,
        }
        count = count_by_range.get(range_, 260)

        if interval in {"1m", "2m", "5m", "15m", "30m", "60m", "90m"}:
            step = timedelta(minutes=5)
            current = datetime.now(UTC) - step * count
        elif interval in {"1wk", "1w"}:
            step = timedelta(days=7)
            current = datetime.now(UTC) - step * count
        else:
            step = timedelta(days=1)
            current = datetime.now(UTC) - timedelta(days=count * 1.5)

        price = 45 + (self._seed(symbol) % 120)
        output: list[Candle] = []

        while len(output) < count:
            current += step

            if interval not in {
                "1m",
                "2m",
                "5m",
                "15m",
                "30m",
                "60m",
                "90m",
            } and current.weekday() >= 5:
                continue

            drift = 0.00035 + 0.0018 * math.sin(len(output) / 31)
            shock = randomizer.gauss(0, 0.012)
            open_price = price * (
                1 + randomizer.gauss(0, 0.003)
            )
            close = max(1, price * (1 + drift + shock))
            high = max(open_price, close) * (
                1 + abs(randomizer.gauss(0.006, 0.004))
            )
            low = min(open_price, close) * (
                1 - abs(randomizer.gauss(0.006, 0.004))
            )
            volume = int(
                700_000
                + abs(randomizer.gauss(0, 450_000))
            )

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
        change = last.close - previous.close
        normalized = self.normalize_ticker(ticker)
        symbol = normalized.removesuffix(".TO")

        return Quote(
            ticker=normalized,
            symbol=symbol,
            name=f"{symbol} — démonstration",
            exchange="TSX",
            currency="CAD",
            price=last.close,
            previous_close=previous.close,
            change=round(change, 4),
            change_percent=round(
                change / previous.close * 100,
                4,
            ),
            day_high=last.high,
            day_low=last.low,
            volume=last.volume,
            timestamp=datetime.now(UTC),
            source="demo-explicit",
            delayed=True,
        )

    async def profile(self, ticker: str) -> StockProfile:
        symbol = self.normalize_ticker(ticker)

        return StockProfile(
            ticker=symbol,
            name=(
                f"{symbol.removesuffix('.TO')} "
                "— profil de démonstration"
            ),
            exchange="TSX",
            currency="CAD",
            sector="Marché canadien",
            industry="Titre coté",
            description=(
                "Données de démonstration utilisées uniquement lorsque "
                "MARKET_DATA_PROVIDER=demo."
            ),
        )


class YahooProvider:
    base_url = (
        "https://query1.finance.yahoo.com/v8/finance/chart"
    )
    default_exchange_timezone = "America/Toronto"

    def normalize_ticker(self, ticker: str) -> str:
        value = ticker.strip().upper()

        if not value:
            raise ValueError("Ticker cannot be empty")

        if value.startswith("^") or value.endswith(("=F", "=X")):
            return value

        if value.endswith((".TO", ".V", ".CN", ".NE")):
            return value

        # Yahoo représente les catégories d'actions TSX par un trait d'union.
        return f"{value.replace('.', '-')}.TO"

    async def _chart(
        self,
        ticker: str,
        range_: str,
        interval: str,
        *,
        include_pre_post: bool = False,
    ) -> dict[str, Any]:
        symbol = self.normalize_ticker(ticker)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Anatole/0.7"
            ),
            "Accept": "application/json",
        }
        timeout_seconds = max(
            5.0,
            float(settings.yahoo_timeout_seconds),
        )
        timeout = httpx.Timeout(
            connect=min(timeout_seconds, 8.0),
            read=timeout_seconds,
            write=8.0,
            pool=8.0,
        )

        async with httpx.AsyncClient(
            timeout=timeout,
            headers=headers,
            follow_redirects=True,
        ) as client:
            response = await client.get(
                f"{self.base_url}/{symbol}",
                params={
                    "range": range_,
                    "interval": interval,
                    "includePrePost": (
                        "true" if include_pre_post else "false"
                    ),
                    "events": "div,splits",
                },
            )
            response.raise_for_status()
            payload = response.json()
            result = payload.get("chart", {}).get("result") or []

            if not result:
                raise RuntimeError(
                    "Yahoo chart payload is empty"
                )

            return result[0]

    @staticmethod
    def _positive_float(value: Any) -> float | None:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None

        return parsed if parsed > 0 else None

    @staticmethod
    def _safe_int(value: Any, fallback: int = 0) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback

    def _timezone(self, meta: dict[str, Any]) -> ZoneInfo:
        timezone_name = str(
            meta.get("exchangeTimezoneName")
            or self.default_exchange_timezone
        )

        try:
            return ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            return ZoneInfo(
                self.default_exchange_timezone
            )

    def _valid_candles(
        self,
        result: dict[str, Any],
    ) -> list[tuple[int, float, float, float, int]]:
        timestamps = result.get("timestamp") or []
        raw_quote = (
            ((result.get("indicators") or {}).get("quote") or [{}])[0]
        )

        closes = raw_quote.get("close") or []
        highs = raw_quote.get("high") or []
        lows = raw_quote.get("low") or []
        volumes = raw_quote.get("volume") or []

        valid: list[
            tuple[int, float, float, float, int]
        ] = []

        for index, raw_timestamp in enumerate(timestamps):
            try:
                close = closes[index]
                high = highs[index]
                low = lows[index]

                if close is None or high is None or low is None:
                    continue

                volume = (
                    self._safe_int(volumes[index])
                    if index < len(volumes)
                    else 0
                )

                valid.append(
                    (
                        int(raw_timestamp),
                        float(close),
                        float(high),
                        float(low),
                        volume,
                    )
                )
            except (IndexError, TypeError, ValueError):
                continue

        if not valid:
            raise RuntimeError(
                "Yahoo quote payload is empty"
            )

        return valid

    def _session_candles(
        self,
        valid: list[tuple[int, float, float, float, int]],
        timezone: ZoneInfo,
    ) -> dict[
        date,
        list[tuple[int, float, float, float, int]],
    ]:
        sessions: dict[
            date,
            list[tuple[int, float, float, float, int]],
        ] = defaultdict(list)

        for candle in valid:
            session_date = datetime.fromtimestamp(
                candle[0],
                UTC,
            ).astimezone(timezone).date()
            sessions[session_date].append(candle)

        return dict(sessions)

    def _previous_session_close(
        self,
        meta: dict[str, Any],
        valid: list[tuple[int, float, float, float, int]],
    ) -> float:
        # Ordre essentiel : clôture régulière précédente avant la
        # référence de la plage graphique.
        for key in (
            "regularMarketPreviousClose",
            "previousClose",
        ):
            previous_close = self._positive_float(
                meta.get(key)
            )

            if previous_close is not None:
                return previous_close

        timezone = self._timezone(meta)
        regular_market_time = self._safe_int(
            meta.get("regularMarketTime"),
            valid[-1][0],
        )
        current_session_date = datetime.fromtimestamp(
            regular_market_time,
            UTC,
        ).astimezone(timezone).date()

        sessions = self._session_candles(
            valid,
            timezone,
        )
        previous_dates = sorted(
            session_date
            for session_date in sessions
            if session_date < current_session_date
        )

        if previous_dates:
            previous_session = sessions[previous_dates[-1]]
            return previous_session[-1][1]

        # Dernier recours seulement. Avec une requête de deux séances,
        # chartPreviousClose ne peut plus représenter une semaine.
        chart_previous_close = self._positive_float(
            meta.get("chartPreviousClose")
        )

        if chart_previous_close is not None:
            return chart_previous_close

        raise RuntimeError(
            "Previous session close is unavailable"
        )

    def _session_market_values(
        self,
        meta: dict[str, Any],
        valid: list[tuple[int, float, float, float, int]],
    ) -> tuple[float, float, int]:
        timezone = self._timezone(meta)
        regular_market_time = self._safe_int(
            meta.get("regularMarketTime"),
            valid[-1][0],
        )
        current_session_date = datetime.fromtimestamp(
            regular_market_time,
            UTC,
        ).astimezone(timezone).date()

        sessions = self._session_candles(
            valid,
            timezone,
        )
        current_session = (
            sessions.get(current_session_date)
            or [valid[-1]]
        )

        fallback_high = max(
            candle[2] for candle in current_session
        )
        fallback_low = min(
            candle[3] for candle in current_session
        )
        fallback_volume = sum(
            candle[4] for candle in current_session
        )

        day_high = self._positive_float(
            meta.get("regularMarketDayHigh")
        )
        day_low = self._positive_float(
            meta.get("regularMarketDayLow")
        )

        return (
            day_high
            if day_high is not None
            else fallback_high,
            day_low
            if day_low is not None
            else fallback_low,
            self._safe_int(
                meta.get("regularMarketVolume"),
                fallback_volume,
            ),
        )

    def _quote_from_result(
        self,
        ticker: str,
        result: dict[str, Any],
    ) -> Quote:
        meta = result.get("meta") or {}
        valid = self._valid_candles(result)
        last = valid[-1]

        previous_close = self._previous_session_close(
            meta,
            valid,
        )
        price = (
            self._positive_float(
                meta.get("regularMarketPrice")
            )
            or last[1]
        )
        change = price - previous_close
        day_high, day_low, volume = (
            self._session_market_values(
                meta,
                valid,
            )
        )

        normalized = self.normalize_ticker(ticker)
        quote_timestamp = self._safe_int(
            meta.get("regularMarketTime"),
            last[0],
        )

        return Quote(
            ticker=normalized,
            symbol=normalized.removesuffix(".TO"),
            name=str(
                meta.get("longName")
                or meta.get("shortName")
                or normalized.removesuffix(".TO")
            ),
            exchange=str(
                meta.get("exchangeName") or "TSX"
            ),
            currency=str(
                meta.get("currency") or "CAD"
            ),
            price=price,
            previous_close=previous_close,
            change=round(change, 6),
            change_percent=round(
                (
                    change
                    / previous_close
                    * 100
                )
                if previous_close
                else 0.0,
                6,
            ),
            day_high=day_high,
            day_low=day_low,
            volume=volume,
            timestamp=datetime.fromtimestamp(
                quote_timestamp,
                UTC,
            ),
            source="yahoo-public-session",
            delayed=True,
        )

    async def quote(self, ticker: str) -> Quote:
        # Deux séances, sans pré/post-marché : référence quotidienne
        # exacte et stable pour Focus, WebSocket, quote et watchlist.
        result = await self._chart(
            ticker,
            "2d",
            "5m",
            include_pre_post=False,
        )
        return self._quote_from_result(
            ticker,
            result,
        )

    async def quotes_many(
        self,
        tickers: list[str],
    ) -> list[Quote]:
        semaphore = asyncio.Semaphore(10)

        async def fetch_one(ticker: str) -> Quote:
            async with semaphore:
                return await self.quote(ticker)

        results = await asyncio.gather(
            *(fetch_one(ticker) for ticker in tickers),
            return_exceptions=True,
        )

        output: list[Quote] = []
        errors: list[Exception] = []

        for result in results:
            if isinstance(result, Quote):
                output.append(result)
            elif isinstance(result, Exception):
                errors.append(result)

        if not output and errors:
            raise errors[0]

        return output

    async def history(
        self,
        ticker: str,
        range_: str,
        interval: str,
    ) -> list[Candle]:
        result = await self._chart(
            ticker,
            range_,
            interval,
            include_pre_post=False,
        )
        timestamps = result.get("timestamp") or []
        raw_quote = (
            ((result.get("indicators") or {}).get("quote") or [{}])[0]
        )
        output: list[Candle] = []

        for index, timestamp in enumerate(timestamps):
            try:
                values = [
                    raw_quote.get(field, [None])[index]
                    for field in (
                        "open",
                        "high",
                        "low",
                        "close",
                    )
                ]

                if any(
                    value is None
                    for value in values
                ):
                    continue

                output.append(
                    Candle(
                        time=int(timestamp),
                        open=float(values[0]),
                        high=float(values[1]),
                        low=float(values[2]),
                        close=float(values[3]),
                        volume=int(
                            (
                                raw_quote.get(
                                    "volume",
                                    [0],
                                )[index]
                            )
                            or 0
                        ),
                    )
                )
            except (
                IndexError,
                TypeError,
                ValueError,
            ):
                continue

        if len(output) < 2:
            raise RuntimeError(
                "Yahoo history contains insufficient candles"
            )

        return output

    def profile_from_quote(
        self,
        quote: Quote,
    ) -> StockProfile:
        return StockProfile(
            ticker=quote.ticker,
            name=quote.name,
            exchange=quote.exchange,
            currency=quote.currency,
            sector="Marché canadien",
            industry=None,
            description=(
                "Profil de base provenant du flux de marché public. "
                "Les fondamentaux détaillés seront branchés lors "
                "du prochain jalon."
            ),
        )

    async def profile(
        self,
        ticker: str,
    ) -> StockProfile:
        quote = await self.quote(ticker)
        return self.profile_from_quote(quote)


class MarketDataService:
    def __init__(self) -> None:
        self.demo = DemoProvider()
        self.yahoo = YahooProvider()
        self._last_good_quotes: dict[str, Quote] = {}

    def normalize_ticker(self, ticker: str) -> str:
        return self.yahoo.normalize_ticker(ticker)

    @property
    def demo_mode(self) -> bool:
        return (
            settings.market_data_provider.lower()
            == "demo"
        )

    async def _with_explicit_demo(
        self,
        primary: Callable[[], Awaitable[T]],
        fallback: Callable[[], Awaitable[T]],
    ) -> T:
        if self.demo_mode:
            return await fallback()

        return await primary()

    async def get_quote(
        self,
        ticker: str,
    ) -> Quote:
        normalized = self.normalize_ticker(ticker)

        if self.demo_mode:
            return await self.demo.quote(ticker)

        try:
            quote = await self.yahoo.quote(ticker)
            self._last_good_quotes[normalized] = quote
            return quote
        except Exception:
            cached = self._last_good_quotes.get(
                normalized
            )

            if cached is not None:
                return cached.model_copy(
                    update={
                        "source": (
                            "yahoo-public-session-cache"
                        ),
                        "delayed": True,
                    }
                )

            raise

    async def get_quotes(
        self,
        tickers: list[str],
    ) -> list[Quote]:
        if self.demo_mode:
            return list(
                await asyncio.gather(
                    *(
                        self.demo.quote(ticker)
                        for ticker in tickers
                    )
                )
            )

        results = await asyncio.gather(
            *(
                self.get_quote(ticker)
                for ticker in tickers
            ),
            return_exceptions=True,
        )

        return [
            result
            for result in results
            if isinstance(result, Quote)
        ]

    async def get_history(
        self,
        ticker: str,
        range_: str = "1y",
        interval: str = "1d",
    ) -> list[Candle]:
        return await self._with_explicit_demo(
            lambda: self.yahoo.history(
                ticker,
                range_,
                interval,
            ),
            lambda: self.demo.history(
                ticker,
                range_,
                interval,
            ),
        )

    async def get_profile(
        self,
        ticker: str,
    ) -> StockProfile:
        if self.demo_mode:
            return await self.demo.profile(ticker)

        quote = await self.get_quote(ticker)
        return self.yahoo.profile_from_quote(quote)

    async def get_history_many(
        self,
        tickers: list[str],
        range_: str = "3mo",
        interval: str = "1d",
        concurrency: int = 10,
    ) -> dict[str, list[Candle]]:
        semaphore = asyncio.Semaphore(
            max(1, concurrency)
        )

        async def fetch(
            ticker: str,
        ) -> tuple[str, list[Candle]]:
            async with semaphore:
                return (
                    ticker,
                    await self.get_history(
                        ticker,
                        range_,
                        interval,
                    ),
                )

        results = await asyncio.gather(
            *(fetch(ticker) for ticker in tickers)
        )
        return {
            ticker: candles
            for ticker, candles in results
        }

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
        quote_task = asyncio.create_task(
            self.get_quote(ticker)
        )
        history_task = asyncio.create_task(
            self.get_history(
                ticker,
                range_,
                interval,
            )
        )

        quote, history = await asyncio.gather(
            quote_task,
            history_task,
        )
        profile = (
            await self.demo.profile(ticker)
            if self.demo_mode
            else self.yahoo.profile_from_quote(quote)
        )

        return FocusSnapshot(
            quote=quote,
            history=history,
            technicals=self.calculate_technicals(
                history
            ),
            profile=profile,
            generated_at=datetime.now(UTC),
        )


market_data_service = MarketDataService()
