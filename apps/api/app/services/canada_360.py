from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Awaitable

import httpx

from app.schemas.canada_360 import (
    Canada360Metric,
    Canada360Province,
    Canada360Snapshot,
    Canada360SourceStatus,
)
from app.schemas.provincial_statistics import ProvincialMetric
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.market_data import market_data_service
from app.services.provincial_statistics import (
    METRICS,
    PROVINCES,
    provincial_statistics_service,
)

logger = logging.getLogger(__name__)

CANADA_GEOGRAPHY = {
    "code": "CA",
    "fr": "Canada",
    "en": "Canada",
}

MARKET_SERIES = (
    ("tsx_composite", "S&P/TSX Composite", "S&P/TSX Composite", "^GSPTSE", "index"),
    ("usd_cad", "USD/CAD", "USD/CAD", "CAD=X", "cad_per_usd"),
    ("wti", "Pétrole WTI", "WTI crude oil", "CL=F", "usd_per_barrel"),
    ("gold", "Or", "Gold", "GC=F", "usd_per_ounce"),
)


def _lang(value: str | None) -> str:
    return "en" if str(value or "").strip().lower().startswith("en") else "fr"


def _status(count: int, expected: int) -> str:
    if count <= 0:
        return "unavailable"
    if count >= expected:
        return "ok"
    return "partial"


def _from_statcan(
    metric: ProvincialMetric,
    *,
    source_name: str,
    freshness: str = "fresh",
) -> Canada360Metric:
    return Canada360Metric(
        key=metric.key,
        label=metric.label,
        category=metric.category,
        value=metric.value,
        change=metric.change,
        change_kind=metric.change_kind,
        unit=metric.unit_kind,
        source_name=source_name,
        source_url=metric.table_url,
        reference_period=metric.reference_period,
        observed_at=metric.released_at,
        freshness=freshness if metric.value is not None else "unavailable",
        official=True,
        derived=False,
        delayed=False,
    )


class Canada360Service:
    macro_deadline_seconds = 4.5
    rates_deadline_seconds = 2.5
    market_deadline_seconds = 2.8
    fresh_seconds = 60.0
    partial_seconds = 15.0

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, Canada360Snapshot]] = {}
        self._last_good: dict[str, Canada360Snapshot] = {}
        self._lock = asyncio.Lock()
        self._province_warm_tasks: dict[str, asyncio.Task[None]] = {}

    async def _load_macro(
        self,
        lang: str,
    ) -> tuple[list[Canada360Metric], list[str]]:
        timeout = httpx.Timeout(connect=4.0, read=8.0, write=4.0, pool=4.0)
        headers = {
            "Accept": "application/json",
            "User-Agent": "Anatole/Canada360",
        }
        async with httpx.AsyncClient(
            timeout=timeout,
            headers=headers,
            follow_redirects=True,
        ) as client:
            results = await asyncio.gather(
                *(
                    provincial_statistics_service._metric_for_provinces(
                        client,
                        spec,
                        [CANADA_GEOGRAPHY],
                        lang,
                    )
                    for spec in METRICS
                )
            )

        metrics: list[Canada360Metric] = []
        issues: list[str] = []
        source_name = "Statistics Canada" if lang == "en" else "Statistique Canada"

        for by_code, issue in results:
            if issue:
                issues.append(issue)
            metric = by_code.get("CA")
            if metric is not None:
                metrics.append(_from_statcan(metric, source_name=source_name))
        return metrics, issues

    async def _load_rates(self, lang: str) -> list[Canada360Metric]:
        payload = await bank_of_canada_valet_service.yields()
        two_year = payload.get("V39051") or []
        ten_year = payload.get("V39055") or []
        source_name = "Bank of Canada" if lang == "en" else "Banque du Canada"
        source_url = "https://www.bankofcanada.ca/rates/interest-rates/canadian-bonds/"
        output: list[Canada360Metric] = []

        if two_year:
            timestamp, value = two_year[-1]
            output.append(
                Canada360Metric(
                    key="canada_2y",
                    label="Canada 2-year yield" if lang == "en" else "Taux Canada 2 ans",
                    category="Rates" if lang == "en" else "Taux",
                    value=float(value),
                    unit="percent",
                    source_name=source_name,
                    source_url=source_url,
                    observed_at=datetime.fromtimestamp(timestamp, UTC),
                    freshness="fresh",
                    official=True,
                )
            )

        if ten_year:
            timestamp, value = ten_year[-1]
            output.append(
                Canada360Metric(
                    key="canada_10y",
                    label="Canada 10-year yield" if lang == "en" else "Taux Canada 10 ans",
                    category="Rates" if lang == "en" else "Taux",
                    value=float(value),
                    unit="percent",
                    source_name=source_name,
                    source_url=source_url,
                    observed_at=datetime.fromtimestamp(timestamp, UTC),
                    freshness="fresh",
                    official=True,
                )
            )

        if two_year and ten_year:
            two_timestamp, two_value = two_year[-1]
            ten_timestamp, ten_value = ten_year[-1]
            output.append(
                Canada360Metric(
                    key="curve_10y_2y",
                    label="10Y–2Y curve" if lang == "en" else "Courbe 10 ans – 2 ans",
                    category="Rates" if lang == "en" else "Taux",
                    value=float(ten_value) - float(two_value),
                    change_kind="points",
                    unit="percent",
                    source_name=source_name,
                    source_url=source_url,
                    observed_at=datetime.fromtimestamp(
                        min(two_timestamp, ten_timestamp),
                        UTC,
                    ),
                    freshness="fresh",
                    official=True,
                    derived=True,
                )
            )
        return output

    async def _load_markets(self, lang: str) -> list[Canada360Metric]:
        symbols = [item[3] for item in MARKET_SERIES]
        quotes = await market_data_service.get_quotes(
            symbols,
            deadline_seconds=self.market_deadline_seconds,
        )
        by_symbol: dict[str, Any] = {}
        for quote in quotes:
            by_symbol[str(quote.symbol).upper()] = quote
            by_symbol[str(quote.ticker).upper()] = quote

        output: list[Canada360Metric] = []
        for key, label_fr, label_en, symbol, unit in MARKET_SERIES:
            quote = by_symbol.get(symbol.upper())
            if quote is None:
                continue
            if key == "tsx_composite":
                category = "Market" if lang == "en" else "Marché"
            elif key == "usd_cad":
                category = "FX" if lang == "en" else "Devise"
            else:
                category = "Commodities" if lang == "en" else "Matières premières"
            output.append(
                Canada360Metric(
                    key=key,
                    label=label_en if lang == "en" else label_fr,
                    category=category,
                    value=float(quote.price),
                    change=float(quote.change_percent),
                    change_kind="percent",
                    unit=unit,
                    source_name="Yahoo Finance — public market data",
                    source_url=f"https://finance.yahoo.com/quote/{symbol}",
                    observed_at=quote.timestamp,
                    freshness="fresh",
                    official=False,
                    delayed=bool(quote.delayed),
                )
            )
        return output

    def _schedule_province_warm(self, lang: str) -> None:
        current = self._province_warm_tasks.get(lang)
        if current is not None and not current.done():
            return

        async def warm() -> None:
            try:
                await provincial_statistics_service.get_snapshot(
                    region="all",
                    lang=lang,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "canada360_province_warm_failed lang=%s error=%s",
                    lang,
                    type(exc).__name__,
                )

        self._province_warm_tasks[lang] = asyncio.create_task(warm())

    def _provinces_from_cache(
        self,
        lang: str,
    ) -> tuple[list[Canada360Province], bool]:
        snapshot, stale = provincial_statistics_service.peek_snapshot(
            region="all",
            lang=lang,
        )
        if snapshot is None:
            self._schedule_province_warm(lang)
            return (
                [
                    Canada360Province(
                        code=item["code"],
                        name=item[lang],
                        status="unavailable",
                        metrics=[],
                        source_name=item[
                            "source_name_en" if lang == "en" else "source_name_fr"
                        ],
                        source_url=item["source_url"],
                    )
                    for item in PROVINCES
                ],
                False,
            )

        if stale:
            self._schedule_province_warm(lang)

        by_code = {profile.code: profile for profile in snapshot.provinces}
        profiles: list[Canada360Province] = []
        for item in PROVINCES:
            profile = by_code.get(item["code"])
            metrics = (
                [
                    _from_statcan(
                        metric,
                        source_name=(
                            "Statistics Canada — WDS"
                            if lang == "en"
                            else "Statistique Canada — WDS"
                        ),
                        freshness="stale" if stale else "fresh",
                    )
                    for metric in profile.metrics
                ]
                if profile is not None
                else []
            )
            profiles.append(
                Canada360Province(
                    code=item["code"],
                    name=item[lang],
                    status=_status(len(metrics), len(METRICS)),
                    metrics=metrics,
                    source_name=(
                        profile.official_source_name
                        if profile is not None
                        else item[
                            "source_name_en" if lang == "en" else "source_name_fr"
                        ]
                    ),
                    source_url=(
                        profile.official_source_url
                        if profile is not None
                        else item["source_url"]
                    ),
                )
            )
        return profiles, stale

    async def _safe(
        self,
        label: str,
        call: Awaitable[Any],
        timeout_seconds: float,
    ) -> tuple[Any | None, str | None]:
        try:
            return await asyncio.wait_for(call, timeout=timeout_seconds), None
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "canada360_source_failed source=%s error=%s detail=%s",
                label,
                type(exc).__name__,
                exc,
            )
            return None, f"{label}: {type(exc).__name__}"

    async def _build(self, lang: str) -> Canada360Snapshot:
        macro_result, rates_result, market_result = await asyncio.gather(
            self._safe(
                "StatCan",
                self._load_macro(lang),
                self.macro_deadline_seconds,
            ),
            self._safe(
                "BoC",
                self._load_rates(lang),
                self.rates_deadline_seconds,
            ),
            self._safe(
                "Market",
                self._load_markets(lang),
                self.market_deadline_seconds + 0.5,
            ),
        )

        macro_payload, macro_error = macro_result
        rates_payload, rates_error = rates_result
        market_payload, market_error = market_result

        macro: list[Canada360Metric] = []
        macro_issues: list[str] = []
        if isinstance(macro_payload, tuple):
            macro, macro_issues = macro_payload

        rates = rates_payload if isinstance(rates_payload, list) else []
        markets = market_payload if isinstance(market_payload, list) else []
        provinces, province_stale = self._provinces_from_cache(lang)

        issues = [
            issue
            for issue in (macro_error, rates_error, market_error)
            if issue
        ]
        issues.extend(macro_issues[:4])

        provinces_with_data = sum(bool(item.metrics) for item in provinces)
        if provinces_with_data == 0:
            issues.append(
                "Provincial indicators are warming in background"
                if lang == "en"
                else "Les indicateurs provinciaux se chargent en arrière-plan"
            )
        elif province_stale:
            issues.append(
                "Latest available provincial snapshot is being refreshed"
                if lang == "en"
                else "Le dernier portrait provincial disponible est en cours d’actualisation"
            )

        source_statuses = [
            Canada360SourceStatus(
                key="statcan",
                label="Statistics Canada" if lang == "en" else "Statistique Canada",
                status=_status(len(macro), len(METRICS)),
                detail=f"{len(macro)}/{len(METRICS)}",
            ),
            Canada360SourceStatus(
                key="bank-of-canada",
                label="Bank of Canada" if lang == "en" else "Banque du Canada",
                status=_status(len(rates), 3),
                detail=f"{len(rates)}/3",
            ),
            Canada360SourceStatus(
                key="market",
                label="Public market data" if lang == "en" else "Données de marché publiques",
                status=_status(len(markets), len(MARKET_SERIES)),
                detail=f"{len(markets)}/{len(MARKET_SERIES)}",
            ),
            Canada360SourceStatus(
                key="provinces",
                label="Provincial indicators" if lang == "en" else "Indicateurs provinciaux",
                status=_status(provinces_with_data, len(PROVINCES)),
                detail=f"{provinces_with_data}/{len(PROVINCES)}",
            ),
        ]

        available = len(macro) + len(rates) + len(markets) + sum(
            len(item.metrics) for item in provinces
        )
        if available == 0:
            overall = "unavailable"
        elif all(item.status == "ok" for item in source_statuses):
            overall = "ok"
        else:
            overall = "partial"

        return Canada360Snapshot(
            language=lang,
            status=overall,
            macro=macro,
            rates=rates,
            markets=markets,
            provinces=provinces,
            sources=source_statuses,
            issues=list(dict.fromkeys(issues)),
            generated_at=datetime.now(UTC),
            refresh_after_seconds=(
                int(self.fresh_seconds)
                if overall == "ok"
                else int(self.partial_seconds)
            ),
        )

    async def get_snapshot(
        self,
        lang: str | None = "fr",
        *,
        force: bool = False,
    ) -> Canada360Snapshot:
        language = _lang(lang)
        now = monotonic()
        cached = self._cache.get(language)
        if (
            not force
            and cached is not None
            and now - cached[0] < cached[1].refresh_after_seconds
        ):
            return cached[1]

        async with self._lock:
            now = monotonic()
            cached = self._cache.get(language)
            if (
                not force
                and cached is not None
                and now - cached[0] < cached[1].refresh_after_seconds
            ):
                return cached[1]

            try:
                snapshot = await self._build(language)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                previous = self._last_good.get(language)
                if previous is not None:
                    return previous.model_copy(
                        update={
                            "status": "partial",
                            "issues": list(
                                dict.fromkeys(
                                    [
                                        *previous.issues,
                                        f"Canada360: {type(exc).__name__}",
                                    ]
                                )
                            ),
                            "generated_at": datetime.now(UTC),
                            "refresh_after_seconds": int(self.partial_seconds),
                        }
                    )
                raise

            self._cache[language] = (monotonic(), snapshot)
            if snapshot.status != "unavailable":
                self._last_good[language] = snapshot
            return snapshot


canada_360_service = Canada360Service()
