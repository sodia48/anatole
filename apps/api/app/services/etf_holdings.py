from __future__ import annotations

import asyncio
import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any

import pandas as pd

from app.data.etf_catalog import ETF_CATALOG
from app.schemas.etf_holdings import (
    EtfAssetAllocation,
    EtfHoldingDriver,
    EtfHoldingsSnapshot,
    EtfSectorAllocation,
)


COMPOSITION_CACHE_SECONDS = 21_600
QUOTE_CACHE_SECONDS = 30
REQUEST_TIMEOUT_SECONDS = 35
DEFAULT_HOLDING_LIMIT = 12
MAX_HOLDING_LIMIT = 25

CATALOG_BY_TICKER = {
    item["ticker"].strip().upper(): item
    for item in ETF_CATALOG
}
CATALOG_TICKERS = set(CATALOG_BY_TICKER)

SECTOR_LABELS = {
    "realestate": "Immobilier",
    "consumer_cyclical": "Consommation discrétionnaire",
    "basic_materials": "Matériaux",
    "consumer_defensive": "Consommation de base",
    "technology": "Technologies",
    "communication_services": "Communications",
    "financial_services": "Services financiers",
    "utilities": "Services publics",
    "industrials": "Industries",
    "energy": "Énergie",
    "healthcare": "Santé",
}

ASSET_LABELS = {
    "cashPosition": "Liquidités",
    "stockPosition": "Actions",
    "bondPosition": "Obligations",
    "preferredPosition": "Actions privilégiées",
    "convertiblePosition": "Titres convertibles",
    "otherPosition": "Autres",
}


@dataclass(slots=True)
class Composition:
    ticker: str
    normalized_symbol: str
    description: str | None
    overview: dict[str, Any]
    rows: list[dict[str, Any]]
    sectors: dict[str, float]
    asset_classes: dict[str, float]
    fetched_at: datetime


def _normalize_etf_symbol(ticker: str) -> str:
    value = ticker.strip().upper()

    if not value:
        raise ValueError("ETF ticker cannot be empty")

    if value.endswith((".TO", ".V", ".NE", ".CN")):
        return value

    return f"{value.replace('.', '-')}.TO"


def _display_symbol(symbol: str) -> str:
    value = symbol.strip().upper()

    for suffix in (".TO", ".V", ".NE", ".CN"):
        if value.endswith(suffix):
            value = value[: -len(suffix)]
            break

    return value.replace("-", ".")


def _finite_number(value: Any) -> float | None:
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


def _percent(value: Any) -> float | None:
    parsed = _finite_number(value)

    if parsed is None:
        return None

    # Yahoo fund percentages are normally returned as fractions.
    return parsed * 100 if abs(parsed) <= 1.5 else parsed


def _humanize_key(value: str) -> str:
    spaced = re.sub(
        r"(?<!^)(?=[A-Z])",
        " ",
        value.replace("_", " "),
    )
    return " ".join(spaced.split()).capitalize()


def _instrument_type(symbol: str, name: str) -> str:
    display = _display_symbol(symbol)

    if display in CATALOG_TICKERS or " ETF" in f" {name.upper()}":
        return "etf"

    if not symbol or symbol in {"-", "N/A", "NA"}:
        return "other"

    return "equity"


def parse_top_holdings(
    frame: pd.DataFrame,
    *,
    limit: int = DEFAULT_HOLDING_LIMIT,
) -> list[dict[str, Any]]:
    if not isinstance(frame, pd.DataFrame) or frame.empty:
        return []

    output: list[dict[str, Any]] = []

    for index, row in frame.iterrows():
        symbol = str(index or "").strip().upper()
        name = str(
            row.get(
                "Name",
                row.get("Holding Name", symbol),
            )
            or symbol
        ).strip()
        weight = _percent(
            row.get(
                "Holding Percent",
                row.get(
                    "Weight",
                    row.get("weight"),
                ),
            )
        )

        if (
            not symbol
            or symbol in {"-", "N/A", "NA"}
            or weight is None
            or weight <= 0
        ):
            continue

        output.append(
            {
                "symbol": symbol,
                "display_symbol": _display_symbol(symbol),
                "name": name,
                "weight_percent": weight,
                "instrument_type": _instrument_type(symbol, name),
            }
        )

    output.sort(
        key=lambda item: item["weight_percent"],
        reverse=True,
    )
    return output[: max(1, min(limit, MAX_HOLDING_LIMIT))]


def _close_series(
    history: pd.DataFrame,
    symbol: str,
) -> pd.Series:
    if not isinstance(history, pd.DataFrame) or history.empty:
        return pd.Series(dtype=float)

    columns = history.columns

    if isinstance(columns, pd.MultiIndex):
        level_zero = set(columns.get_level_values(0))
        level_one = set(columns.get_level_values(1))

        if symbol in level_zero:
            section = history[symbol]

            for field in ("Close", "Adj Close"):
                if field in section.columns:
                    return pd.to_numeric(
                        section[field],
                        errors="coerce",
                    ).dropna()

        for field in ("Close", "Adj Close"):
            if field in level_zero and symbol in level_one:
                return pd.to_numeric(
                    history[field][symbol],
                    errors="coerce",
                ).dropna()

    for field in ("Close", "Adj Close"):
        if field in columns:
            return pd.to_numeric(
                history[field],
                errors="coerce",
            ).dropna()

    return pd.Series(dtype=float)


def extract_quote_changes(
    history: pd.DataFrame,
    symbols: list[str],
) -> dict[str, dict[str, float | None]]:
    output: dict[str, dict[str, float | None]] = {}

    for symbol in symbols:
        series = _close_series(history, symbol)

        if series.empty:
            output[symbol] = {
                "price": None,
                "change_percent": None,
            }
            continue

        price = _finite_number(series.iloc[-1])
        previous = (
            _finite_number(series.iloc[-2])
            if len(series) >= 2
            else None
        )
        change_percent = (
            (price / previous - 1) * 100
            if price is not None
            and previous not in (None, 0)
            else None
        )

        output[symbol] = {
            "price": price,
            "change_percent": change_percent,
        }

    return output


def _fetch_composition_sync(
    normalized_symbol: str,
    limit: int,
) -> Composition:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError(
            "yfinance is required for ETF holdings"
        ) from exc

    ticker = yf.Ticker(normalized_symbol)
    funds_data = ticker.funds_data

    rows = parse_top_holdings(
        funds_data.top_holdings,
        limit=limit,
    )
    sectors = dict(
        funds_data.sector_weightings or {}
    )
    asset_classes = dict(
        funds_data.asset_classes or {}
    )
    overview = dict(
        funds_data.fund_overview or {}
    )

    return Composition(
        ticker=_display_symbol(normalized_symbol),
        normalized_symbol=normalized_symbol,
        description=funds_data.description or None,
        overview=overview,
        rows=rows,
        sectors=sectors,
        asset_classes=asset_classes,
        fetched_at=datetime.now(UTC),
    )


def _download_quotes_sync(
    symbols: list[str],
) -> dict[str, dict[str, float | None]]:
    if not symbols:
        return {}

    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError(
            "yfinance is required for ETF quote enrichment"
        ) from exc

    history = yf.download(
        tickers=symbols,
        period="5d",
        interval="1d",
        auto_adjust=False,
        progress=False,
        group_by="ticker",
        threads=True,
        timeout=12,
    )

    return extract_quote_changes(
        history,
        symbols,
    )


class EtfHoldingsService:
    def __init__(self) -> None:
        self._composition_cache: dict[
            str,
            tuple[float, Composition],
        ] = {}
        self._snapshot_cache: dict[
            tuple[str, int],
            tuple[float, EtfHoldingsSnapshot],
        ] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, symbol: str) -> asyncio.Lock:
        lock = self._locks.get(symbol)

        if lock is None:
            lock = asyncio.Lock()
            self._locks[symbol] = lock

        return lock

    async def _composition(
        self,
        normalized_symbol: str,
        limit: int,
        *,
        force_refresh: bool,
    ) -> Composition:
        cached = self._composition_cache.get(
            normalized_symbol
        )
        now = monotonic()

        if (
            not force_refresh
            and cached is not None
            and now - cached[0]
            < COMPOSITION_CACHE_SECONDS
        ):
            return cached[1]

        composition = await asyncio.to_thread(
            _fetch_composition_sync,
            normalized_symbol,
            limit,
        )
        self._composition_cache[normalized_symbol] = (
            monotonic(),
            composition,
        )
        return composition

    @staticmethod
    def _catalog_metadata(
        ticker: str,
    ) -> dict[str, str]:
        item = CATALOG_BY_TICKER.get(
            ticker.strip().upper(),
            {},
        )

        return {
            "name": str(
                item.get(
                    "name",
                    ticker.strip().upper(),
                )
            ),
            "provider": str(
                item.get("provider", "N/D")
            ),
            "category": str(
                item.get(
                    "category",
                    "Autres expositions",
                )
            ),
            "exposure": str(
                item.get(
                    "exposure",
                    "Exposition ETF",
                )
            ),
        }

    @staticmethod
    def _sector_items(
        values: dict[str, float],
    ) -> list[EtfSectorAllocation]:
        output: list[EtfSectorAllocation] = []

        for key, raw_value in values.items():
            value = _percent(raw_value)

            if value is None or value <= 0:
                continue

            output.append(
                EtfSectorAllocation(
                    key=key,
                    label=SECTOR_LABELS.get(
                        key,
                        _humanize_key(key),
                    ),
                    weight_percent=value,
                )
            )

        return sorted(
            output,
            key=lambda item: item.weight_percent,
            reverse=True,
        )

    @staticmethod
    def _asset_items(
        values: dict[str, float],
    ) -> list[EtfAssetAllocation]:
        output: list[EtfAssetAllocation] = []

        for key, raw_value in values.items():
            value = _percent(raw_value)

            if value is None or value <= 0:
                continue

            output.append(
                EtfAssetAllocation(
                    key=key,
                    label=ASSET_LABELS.get(
                        key,
                        _humanize_key(key),
                    ),
                    weight_percent=value,
                )
            )

        return sorted(
            output,
            key=lambda item: item.weight_percent,
            reverse=True,
        )

    async def snapshot(
        self,
        ticker: str,
        *,
        limit: int = DEFAULT_HOLDING_LIMIT,
        force_refresh: bool = False,
    ) -> EtfHoldingsSnapshot:
        clean_ticker = ticker.strip().upper()
        normalized_symbol = _normalize_etf_symbol(
            clean_ticker
        )
        bounded_limit = max(
            1,
            min(limit, MAX_HOLDING_LIMIT),
        )
        cache_key = (
            normalized_symbol,
            bounded_limit,
        )
        cached = self._snapshot_cache.get(
            cache_key
        )
        now = monotonic()

        if (
            not force_refresh
            and cached is not None
            and now - cached[0]
            < QUOTE_CACHE_SECONDS
        ):
            return cached[1]

        async with self._lock_for(
            normalized_symbol
        ):
            cached = self._snapshot_cache.get(
                cache_key
            )
            now = monotonic()

            if (
                not force_refresh
                and cached is not None
                and now - cached[0]
                < QUOTE_CACHE_SECONDS
            ):
                return cached[1]

            metadata = self._catalog_metadata(
                clean_ticker
            )

            try:
                async with asyncio.timeout(
                    REQUEST_TIMEOUT_SECONDS
                ):
                    composition = await self._composition(
                        normalized_symbol,
                        bounded_limit,
                        force_refresh=force_refresh,
                    )
                    symbols = [
                        normalized_symbol,
                        *[
                            row["symbol"]
                            for row in composition.rows
                        ],
                    ]
                    quotes = await asyncio.to_thread(
                        _download_quotes_sync,
                        symbols,
                    )
            except Exception as exc:  # noqa: BLE001
                stale = self._snapshot_cache.get(
                    cache_key
                )

                if stale is not None:
                    stale_snapshot = stale[1].model_copy(
                        update={
                            "message": (
                                "Les dernières positions chargées "
                                "sont affichées; la mise à jour a échoué."
                            )
                        }
                    )
                    return stale_snapshot

                return EtfHoldingsSnapshot(
                    ticker=clean_ticker,
                    normalized_symbol=normalized_symbol,
                    name=metadata["name"],
                    provider=metadata["provider"],
                    category=metadata["category"],
                    exposure=metadata["exposure"],
                    status="unavailable",
                    message=(
                        "Les positions détaillées de cet ETF "
                        "sont temporairement indisponibles. "
                        f"{type(exc).__name__}"
                    ),
                    source_name=(
                        "Yahoo Finance public fund data "
                        "via yfinance"
                    ),
                    source_url=(
                        "https://finance.yahoo.com/quote/"
                        f"{normalized_symbol}/holdings/"
                    ),
                    generated_at=datetime.now(UTC),
                )

            etf_quote = quotes.get(
                normalized_symbol,
                {},
            )
            holdings: list[EtfHoldingDriver] = []

            for rank, row in enumerate(
                composition.rows,
                start=1,
            ):
                quote = quotes.get(
                    row["symbol"],
                    {},
                )
                change_percent = _finite_number(
                    quote.get("change_percent")
                )
                contribution = (
                    row["weight_percent"]
                    * change_percent
                    / 100
                    if change_percent is not None
                    else None
                )

                holdings.append(
                    EtfHoldingDriver(
                        rank=rank,
                        symbol=row["symbol"],
                        display_symbol=row[
                            "display_symbol"
                        ],
                        name=row["name"],
                        instrument_type=row[
                            "instrument_type"
                        ],
                        weight_percent=row[
                            "weight_percent"
                        ],
                        price=_finite_number(
                            quote.get("price")
                        ),
                        change_percent=change_percent,
                        contribution_percent_points=contribution,
                    )
                )

            contributions = [
                item.contribution_percent_points
                for item in holdings
                if item.contribution_percent_points
                is not None
            ]
            positive = sum(
                value
                for value in contributions
                if value > 0
            )
            negative = sum(
                value
                for value in contributions
                if value < 0
            )
            net = (
                sum(contributions)
                if contributions
                else None
            )
            quoted_holdings = sum(
                item.change_percent is not None
                for item in holdings
            )

            snapshot = EtfHoldingsSnapshot(
                ticker=clean_ticker,
                normalized_symbol=normalized_symbol,
                name=metadata["name"],
                provider=metadata["provider"],
                category=metadata["category"],
                exposure=metadata["exposure"],
                description=composition.description,
                currency="CAD",
                price=_finite_number(
                    etf_quote.get("price")
                ),
                change_percent=_finite_number(
                    etf_quote.get(
                        "change_percent"
                    )
                ),
                holdings=holdings,
                sectors=self._sector_items(
                    composition.sectors
                ),
                asset_classes=self._asset_items(
                    composition.asset_classes
                ),
                top_holdings_weight_percent=sum(
                    item.weight_percent
                    for item in holdings
                ),
                net_driver_contribution_percent_points=net,
                positive_driver_contribution_percent_points=(
                    positive
                    if contributions
                    else None
                ),
                negative_driver_contribution_percent_points=(
                    negative
                    if contributions
                    else None
                ),
                quoted_holdings=quoted_holdings,
                total_holdings_returned=len(
                    holdings
                ),
                status=(
                    "available"
                    if holdings
                    and quoted_holdings
                    == len(holdings)
                    else "partial"
                    if holdings
                    else "unavailable"
                ),
                message=(
                    "La contribution est une approximation calculée "
                    "comme poids du titre × variation de séance."
                    if holdings
                    else (
                        "Aucune position détaillée n'a été publiée "
                        "pour cet ETF."
                    )
                ),
                source_name=(
                    "Yahoo Finance public fund holdings "
                    "via yfinance"
                ),
                source_url=(
                    "https://finance.yahoo.com/quote/"
                    f"{normalized_symbol}/holdings/"
                ),
                generated_at=datetime.now(UTC),
                refresh_after_seconds=QUOTE_CACHE_SECONDS,
            )
            self._snapshot_cache[cache_key] = (
                monotonic(),
                snapshot,
            )
            return snapshot


etf_holdings_service = EtfHoldingsService()
