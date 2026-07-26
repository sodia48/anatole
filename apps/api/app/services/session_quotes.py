from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.stocks import Quote

logger = logging.getLogger(__name__)


def _env_float(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


class SessionQuoteService:
    """Cotations de séance, bornées et mises en cache."""

    base_url = "https://query1.finance.yahoo.com/v8/finance/chart"
    default_exchange_timezone = "America/Toronto"

    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, Quote] = AsyncStaleCache(
            max_entries=3000
        )

    @staticmethod
    def normalize_ticker(ticker: str) -> str:
        value = ticker.strip().upper()
        if not value:
            raise ValueError("Ticker cannot be empty")
        if value.startswith("^") or value.endswith(("=F", "=X")):
            return value
        if value.endswith((".TO", ".V", ".CN", ".NE")):
            return value
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
        name = str(
            meta.get("exchangeTimezoneName")
            or self.default_exchange_timezone
        )
        try:
            return ZoneInfo(name)
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
        for key in ("regularMarketPreviousClose", "previousClose"):
            value = self._positive_float(meta.get(key))
            if value is not None:
                return value

        timezone = self._timezone(meta)
        market_time = self._safe_int(
            meta.get("regularMarketTime"),
            valid[-1][0],
        )
        current_date = datetime.fromtimestamp(
            market_time,
            UTC,
        ).astimezone(timezone).date()
        sessions = self._session_dates(valid, timezone)
        previous_dates = sorted(day for day in sessions if day < current_date)
        if previous_dates:
            return sessions[previous_dates[-1]][-1][1]

        fallback = self._positive_float(meta.get("chartPreviousClose"))
        if fallback is not None:
            return fallback
        raise RuntimeError("Previous session close is unavailable")

    def _current_session_values(
        self,
        meta: dict[str, Any],
        valid: list[tuple[int, float, float, float, int]],
    ) -> tuple[float, float, int]:
        timezone = self._timezone(meta)
        market_time = self._safe_int(
            meta.get("regularMarketTime"),
            valid[-1][0],
        )
        current_date = datetime.fromtimestamp(
            market_time,
            UTC,
        ).astimezone(timezone).date()
        sessions = self._session_dates(valid, timezone)
        current = sessions.get(current_date) or [valid[-1]]

        high = self._positive_float(meta.get("regularMarketDayHigh"))
        low = self._positive_float(meta.get("regularMarketDayLow"))
        volume = self._safe_int(
            meta.get("regularMarketVolume"),
            sum(item[4] for item in current),
        )
        return (
            high if high is not None else max(item[2] for item in current),
            low if low is not None else min(item[3] for item in current),
            volume,
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
        price = self._positive_float(meta.get("regularMarketPrice")) or last[1]
        change = price - previous_close
        high, low, volume = self._current_session_values(meta, valid)
        normalized = self.normalize_ticker(ticker)
        timestamp = self._safe_int(
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
            day_high=high,
            day_low=low,
            volume=volume,
            timestamp=datetime.fromtimestamp(timestamp, UTC),
            source="yahoo-public-session",
            delayed=True,
        )

    async def _load_quote(self, ticker: str) -> Quote:
        symbol = self.normalize_ticker(ticker)
        payload = await shared_http_client.get_json(
            f"{self.base_url}/{symbol}",
            params={
                "range": "2d",
                "interval": "5m",
                "includePrePost": "false",
                "events": "div,splits",
            },
        )
        results = payload.get("chart", {}).get("result") or []
        if not results:
            raise RuntimeError("Yahoo chart result is empty")
        return self._quote_from_result(ticker, results[0])

    async def get_quote(self, ticker: str) -> Quote:
        normalized = self.normalize_ticker(ticker)
        quote = await self._cache.get_or_load(
            normalized,
            lambda: self._load_quote(ticker),
            fresh_seconds=_env_float("QUOTE_CACHE_TTL_SECONDS", 25.0),
            stale_seconds=_env_float("QUOTE_STALE_TTL_SECONDS", 1800.0),
        )
        return quote

    async def get_quotes(self, tickers: list[str]) -> list[Quote]:
        # Déduplication avant gather : la même action n'est jamais demandée
        # plusieurs fois dans un même snapshot.
        unique: dict[str, str] = {}
        for ticker in tickers:
            try:
                unique.setdefault(self.normalize_ticker(ticker), ticker)
            except ValueError:
                continue

        results = await asyncio.gather(
            *(self.get_quote(ticker) for ticker in unique.values()),
            return_exceptions=True,
        )

        output: list[Quote] = []
        for normalized, result in zip(unique, results, strict=False):
            if isinstance(result, Quote):
                output.append(result)
                continue
            logger.warning(
                "session_quote_unavailable ticker=%s error=%s detail=%s",
                normalized,
                type(result).__name__,
                result,
            )
        return output


session_quote_service = SessionQuoteService()
