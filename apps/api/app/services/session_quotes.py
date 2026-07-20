from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from app.core.config import settings
from app.schemas.stocks import Quote

logger = logging.getLogger(__name__)


class SessionQuoteService:
    """
    Cotations de séance pour la heatmap.

    La variation est toujours calculée contre la dernière clôture de séance,
    jamais contre le début d'une plage graphique de plusieurs jours.
    """

    base_url = "https://query1.finance.yahoo.com/v8/finance/chart"
    default_exchange_timezone = "America/Toronto"

    def __init__(self) -> None:
        self._last_good: dict[str, Quote] = {}

    @staticmethod
    def normalize_ticker(ticker: str) -> str:
        value = ticker.strip().upper()

        if not value:
            raise ValueError("Ticker cannot be empty")

        if value.startswith("^") or value.endswith(("=F", "=X")):
            return value

        if value.endswith((".TO", ".V", ".CN", ".NE")):
            return value

        # Yahoo représente les catégories d'actions TSX avec un trait d'union.
        return f"{value.replace('.', '-')}.TO"

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
            return ZoneInfo(self.default_exchange_timezone)

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

        valid: list[tuple[int, float, float, float, int]] = []

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
            raise RuntimeError("Yahoo session quote payload is empty")

        return valid

    def _session_dates(
        self,
        valid: list[tuple[int, float, float, float, int]],
        timezone: ZoneInfo,
    ) -> dict[date, list[tuple[int, float, float, float, int]]]:
        sessions: dict[
            date,
            list[tuple[int, float, float, float, int]],
        ] = defaultdict(list)

        for candle in valid:
            local_date = datetime.fromtimestamp(
                candle[0],
                UTC,
            ).astimezone(timezone).date()
            sessions[local_date].append(candle)

        return dict(sessions)

    def _previous_session_close(
        self,
        meta: dict[str, Any],
        valid: list[tuple[int, float, float, float, int]],
    ) -> float:
        # Ces champs représentent explicitement la clôture précédente.
        for key in (
            "regularMarketPreviousClose",
            "previousClose",
        ):
            previous_close = self._positive_float(meta.get(key))
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

        sessions = self._session_dates(valid, timezone)
        previous_dates = sorted(
            session_date
            for session_date in sessions
            if session_date < current_session_date
        )

        if previous_dates:
            previous_session = sessions[previous_dates[-1]]
            return previous_session[-1][1]

        # chartPreviousClose n'est utilisé qu'en dernier recours. La requête
        # est limitée à deux séances, contrairement à l'ancienne plage 5d.
        chart_previous_close = self._positive_float(
            meta.get("chartPreviousClose")
        )
        if chart_previous_close is not None:
            return chart_previous_close

        raise RuntimeError("Previous session close is unavailable")

    def _current_session_values(
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

        sessions = self._session_dates(valid, timezone)
        current_session = sessions.get(current_session_date) or [valid[-1]]

        fallback_high = max(candle[2] for candle in current_session)
        fallback_low = min(candle[3] for candle in current_session)
        fallback_volume = sum(candle[4] for candle in current_session)

        day_high = self._positive_float(meta.get("regularMarketDayHigh"))
        day_low = self._positive_float(meta.get("regularMarketDayLow"))

        return (
            day_high if day_high is not None else fallback_high,
            day_low if day_low is not None else fallback_low,
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

        previous_close = self._previous_session_close(meta, valid)
        price = (
            self._positive_float(meta.get("regularMarketPrice"))
            or last[1]
        )
        change = price - previous_close
        day_high, day_low, volume = self._current_session_values(
            meta,
            valid,
        )

        symbol = self.normalize_ticker(ticker)
        quote_timestamp = self._safe_int(
            meta.get("regularMarketTime"),
            last[0],
        )

        return Quote(
            ticker=symbol,
            symbol=symbol.removesuffix(".TO"),
            name=str(
                meta.get("longName")
                or meta.get("shortName")
                or symbol.removesuffix(".TO")
            ),
            exchange=str(meta.get("exchangeName") or "TSX"),
            currency=str(meta.get("currency") or "CAD"),
            price=price,
            previous_close=previous_close,
            change=round(change, 6),
            change_percent=round(
                (change / previous_close * 100)
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

    async def get_quotes(
        self,
        tickers: list[str],
    ) -> list[Quote]:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Anatole/0.6"
            ),
            "Accept": "application/json",
        }
        timeout_seconds = min(
            float(settings.yahoo_timeout_seconds),
            8.0,
        )
        timeout = httpx.Timeout(
            connect=min(timeout_seconds, 5.0),
            read=timeout_seconds,
            write=5.0,
            pool=5.0,
        )
        semaphore = asyncio.Semaphore(10)

        async with httpx.AsyncClient(
            timeout=timeout,
            headers=headers,
            follow_redirects=True,
        ) as client:

            async def fetch_one(
                ticker: str,
            ) -> tuple[str, Quote | Exception]:
                symbol = self.normalize_ticker(ticker)

                try:
                    async with semaphore:
                        response = await client.get(
                            f"{self.base_url}/{symbol}",
                            params={
                                # Deux séances suffisent pour retrouver la
                                # clôture précédente et la séance courante.
                                "range": "2d",
                                "interval": "5m",
                                "includePrePost": "false",
                                "events": "div,splits",
                            },
                        )
                        response.raise_for_status()
                        payload = response.json()
                        results = (
                            payload.get("chart", {}).get("result")
                            or []
                        )

                        if not results:
                            raise RuntimeError(
                                "Yahoo chart result is empty"
                            )

                        quote = self._quote_from_result(
                            ticker,
                            results[0],
                        )
                        return ticker, quote
                except Exception as error:  # noqa: BLE001
                    return ticker, error

            results = await asyncio.gather(
                *(fetch_one(ticker) for ticker in tickers)
            )

        output: list[Quote] = []

        for ticker, result in results:
            normalized = self.normalize_ticker(ticker)

            if isinstance(result, Quote):
                self._last_good[normalized] = result
                output.append(result)
                continue

            cached = self._last_good.get(normalized)

            if cached is not None:
                output.append(
                    cached.model_copy(
                        update={
                            "source": "yahoo-public-session-cache",
                            "delayed": True,
                        }
                    )
                )

            logger.warning(
                "Session quote unavailable",
                extra={
                    "ticker": normalized,
                    "error": type(result).__name__,
                    "detail": str(result),
                    "cached": cached is not None,
                },
            )

        return output


session_quote_service = SessionQuoteService()
