from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any

import pandas as pd

from app.schemas.etf_history import (
    EtfHistoryPoint,
    EtfHistoryRange,
    EtfHistorySnapshot,
)


REQUEST_TIMEOUT_SECONDS = 35


@dataclass(frozen=True, slots=True)
class HistoryRangeSpec:
    period: str
    interval: str
    label: str
    cache_seconds: int
    refresh_after_seconds: int


RANGE_SPECS: dict[EtfHistoryRange, HistoryRangeSpec] = {
    "5d": HistoryRangeSpec(
        period="5d",
        interval="30m",
        label="5 jours",
        cache_seconds=30,
        refresh_after_seconds=30,
    ),
    "1mo": HistoryRangeSpec(
        period="1mo",
        interval="1d",
        label="1 mois",
        cache_seconds=300,
        refresh_after_seconds=300,
    ),
    "ytd": HistoryRangeSpec(
        period="ytd",
        interval="1d",
        label="Depuis le début de l’année",
        cache_seconds=300,
        refresh_after_seconds=300,
    ),
    "6mo": HistoryRangeSpec(
        period="6mo",
        interval="1d",
        label="6 mois",
        cache_seconds=300,
        refresh_after_seconds=300,
    ),
    "1y": HistoryRangeSpec(
        period="1y",
        interval="1d",
        label="1 an",
        cache_seconds=300,
        refresh_after_seconds=300,
    ),
    "5y": HistoryRangeSpec(
        period="5y",
        interval="1wk",
        label="5 ans",
        cache_seconds=1800,
        refresh_after_seconds=1800,
    ),
    "10y": HistoryRangeSpec(
        period="10y",
        interval="1wk",
        label="10 ans",
        cache_seconds=3600,
        refresh_after_seconds=3600,
    ),
}


def normalize_etf_symbol(ticker: str) -> str:
    value = ticker.strip().upper()

    if not value:
        raise ValueError("ETF ticker cannot be empty")

    if value.endswith((".TO", ".V", ".NE", ".CN")):
        return value

    return f"{value.replace('.', '-')}.TO"


def _finite(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None

    return parsed if math.isfinite(parsed) else None


def normalize_history_frame(
    frame: pd.DataFrame,
) -> list[EtfHistoryPoint]:
    if not isinstance(frame, pd.DataFrame) or frame.empty:
        return []

    column_lookup = {
        str(column).strip().lower(): column
        for column in frame.columns
    }

    required = {
        "open": column_lookup.get("open"),
        "high": column_lookup.get("high"),
        "low": column_lookup.get("low"),
        "close": column_lookup.get("close"),
    }

    if any(value is None for value in required.values()):
        return []

    volume_column = column_lookup.get("volume")
    output: list[EtfHistoryPoint] = []

    for index, row in frame.sort_index().iterrows():
        try:
            timestamp = pd.Timestamp(index)
        except (TypeError, ValueError):
            continue

        if pd.isna(timestamp):
            continue

        converted = timestamp.to_pydatetime()

        if converted.tzinfo is None:
            converted = converted.replace(tzinfo=UTC)
        else:
            converted = converted.astimezone(UTC)

        open_value = _finite(row[required["open"]])
        high_value = _finite(row[required["high"]])
        low_value = _finite(row[required["low"]])
        close_value = _finite(row[required["close"]])

        if (
            open_value is None
            or high_value is None
            or low_value is None
            or close_value is None
            or close_value <= 0
        ):
            continue

        volume_value = (
            _finite(row[volume_column])
            if volume_column is not None
            else None
        )

        output.append(
            EtfHistoryPoint(
                timestamp=converted,
                open=open_value,
                high=high_value,
                low=low_value,
                close=close_value,
                volume=max(
                    0,
                    int(volume_value or 0),
                ),
            )
        )

    # Remove duplicated timestamps while keeping the newest observation.
    deduplicated: dict[datetime, EtfHistoryPoint] = {
        point.timestamp: point
        for point in output
    }

    return [
        deduplicated[key]
        for key in sorted(deduplicated)
    ]


def build_history_snapshot(
    *,
    ticker: str,
    normalized_symbol: str,
    selected_range: EtfHistoryRange,
    points: list[EtfHistoryPoint],
    currency: str = "CAD",
    message: str | None = None,
) -> EtfHistorySnapshot:
    spec = RANGE_SPECS[selected_range]

    if not points:
        return EtfHistorySnapshot(
            ticker=ticker.strip().upper(),
            normalized_symbol=normalized_symbol,
            range=selected_range,
            range_label=spec.label,
            currency=currency,
            interval=spec.interval,
            status="unavailable",
            message=(
                message
                or "Aucun historique n’est disponible pour cette période."
            ),
            source_name="Yahoo Finance public price history via yfinance",
            source_url=(
                "https://finance.yahoo.com/quote/"
                f"{normalized_symbol}/history/"
            ),
            generated_at=datetime.now(UTC),
            refresh_after_seconds=spec.refresh_after_seconds,
        )

    first_close = points[0].close
    last_close = points[-1].close
    change = last_close - first_close
    change_percent = (
        change / first_close * 100
        if first_close
        else None
    )

    return EtfHistorySnapshot(
        ticker=ticker.strip().upper(),
        normalized_symbol=normalized_symbol,
        range=selected_range,
        range_label=spec.label,
        currency=currency,
        interval=spec.interval,
        points=points,
        first_close=first_close,
        last_close=last_close,
        change=change,
        change_percent=change_percent,
        period_high=max(point.high for point in points),
        period_low=min(point.low for point in points),
        status="available",
        message=message,
        source_name="Yahoo Finance public price history via yfinance",
        source_url=(
            "https://finance.yahoo.com/quote/"
            f"{normalized_symbol}/history/"
        ),
        generated_at=datetime.now(UTC),
        refresh_after_seconds=spec.refresh_after_seconds,
    )


def _fetch_history_sync(
    normalized_symbol: str,
    spec: HistoryRangeSpec,
) -> tuple[pd.DataFrame, str]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError(
            "yfinance is required for ETF history"
        ) from exc

    ticker = yf.Ticker(normalized_symbol)
    frame = ticker.history(
        period=spec.period,
        interval=spec.interval,
        auto_adjust=False,
        prepost=False,
        actions=False,
    )

    currency = "CAD"

    try:
        fast_info = ticker.fast_info
        value = (
            fast_info.get("currency")
            if hasattr(fast_info, "get")
            else getattr(fast_info, "currency", None)
        )

        if value:
            currency = str(value).upper()
    except Exception:  # noqa: BLE001
        pass

    return frame, currency


class EtfHistoryService:
    def __init__(self) -> None:
        self._cache: dict[
            tuple[str, EtfHistoryRange],
            tuple[float, EtfHistorySnapshot],
        ] = {}
        self._locks: dict[
            tuple[str, EtfHistoryRange],
            asyncio.Lock,
        ] = {}

    def _lock_for(
        self,
        key: tuple[str, EtfHistoryRange],
    ) -> asyncio.Lock:
        lock = self._locks.get(key)

        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock

        return lock

    async def snapshot(
        self,
        ticker: str,
        selected_range: EtfHistoryRange,
        *,
        force_refresh: bool = False,
    ) -> EtfHistorySnapshot:
        normalized_symbol = normalize_etf_symbol(ticker)
        spec = RANGE_SPECS[selected_range]
        key = (normalized_symbol, selected_range)
        cached = self._cache.get(key)
        now = monotonic()

        if (
            not force_refresh
            and cached is not None
            and now - cached[0] < spec.cache_seconds
        ):
            return cached[1]

        async with self._lock_for(key):
            cached = self._cache.get(key)
            now = monotonic()

            if (
                not force_refresh
                and cached is not None
                and now - cached[0] < spec.cache_seconds
            ):
                return cached[1]

            try:
                async with asyncio.timeout(
                    REQUEST_TIMEOUT_SECONDS
                ):
                    frame, currency = await asyncio.to_thread(
                        _fetch_history_sync,
                        normalized_symbol,
                        spec,
                    )
                points = normalize_history_frame(frame)
                snapshot = build_history_snapshot(
                    ticker=ticker,
                    normalized_symbol=normalized_symbol,
                    selected_range=selected_range,
                    points=points,
                    currency=currency,
                )
            except Exception as exc:  # noqa: BLE001
                stale = self._cache.get(key)

                if stale is not None:
                    return stale[1].model_copy(
                        update={
                            "message": (
                                "La dernière série disponible est affichée; "
                                "la mise à jour a échoué."
                            )
                        }
                    )

                snapshot = build_history_snapshot(
                    ticker=ticker,
                    normalized_symbol=normalized_symbol,
                    selected_range=selected_range,
                    points=[],
                    message=(
                        "L’historique est temporairement indisponible. "
                        f"{type(exc).__name__}"
                    ),
                )

            self._cache[key] = (
                monotonic(),
                snapshot,
            )
            return snapshot


etf_history_service = EtfHistoryService()
