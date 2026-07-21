from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

from app.schemas.fundamentals import (
    CompositeCoverageItem,
    CompositeCoverageSnapshot,
    FinancialPeriod,
    FinancialSource,
    FundamentalSnapshot,
    OfficialCoverage,
)
from app.services.issuer_documents import (
    IssuerFinancialsResult,
    issuer_financial_documents_service,
)
from app.services.sec_edgar import (
    SECEdgarResult,
    sec_edgar_financials_provider,
)
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    tsx_composite_universe_service,
)


DATA_DIRECTORY = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "official_financials"
)
REGISTRY_PATH = DATA_DIRECTORY / "registry.json"

VALUE_FIELDS = (
    "total_revenue",
    "cost_of_revenue",
    "gross_profit",
    "research_development",
    "selling_general_administrative",
    "total_operating_expenses",
    "operating_income",
    "ebit",
    "depreciation_amortization",
    "ebitda",
    "interest_expense",
    "income_before_tax",
    "income_tax_expense",
    "net_income",
    "basic_eps",
    "diluted_eps",
    "diluted_average_shares",
    "operating_cash_flow",
    "capital_expenditure",
    "free_cash_flow",
    "dividends_paid",
    "share_repurchases",
    "total_cash",
    "total_debt",
    "net_debt",
    "current_assets",
    "current_liabilities",
    "total_assets",
    "total_liabilities",
    "stockholder_equity",
)


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )
    except ValueError:
        return None
    return (
        parsed.replace(tzinfo=UTC)
        if parsed.tzinfo is None
        else parsed.astimezone(UTC)
    )


def _safe_div(
    numerator: float | None,
    denominator: float | None,
    scale: float = 1.0,
) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator * scale


def _growth(
    current: float | None,
    previous: float | None,
) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return (
        (current - previous)
        / abs(previous)
        * 100
    )


def _recompute(
    periods: list[FinancialPeriod],
) -> list[FinancialPeriod]:
    rows = sorted(
        periods,
        key=lambda item: item.period_end,
        reverse=True,
    )
    gap = (
        4
        if rows
        and rows[0].period_type == "quarterly"
        else 1
    )

    output: list[FinancialPeriod] = []

    for index, period in enumerate(rows):
        data = period.model_dump()
        revenue = period.total_revenue
        data["gross_margin"] = _safe_div(
            period.gross_profit,
            revenue,
            100,
        )
        data["operating_margin"] = _safe_div(
            period.operating_income,
            revenue,
            100,
        )
        data["net_margin"] = _safe_div(
            period.net_income,
            revenue,
            100,
        )
        data["free_cash_flow_margin"] = _safe_div(
            period.free_cash_flow,
            revenue,
            100,
        )

        prior_index = index + gap
        if prior_index < len(rows):
            prior = rows[prior_index]
            data["revenue_growth_yoy"] = _growth(
                period.total_revenue,
                prior.total_revenue,
            )
            data[
                "operating_income_growth_yoy"
            ] = _growth(
                period.operating_income,
                prior.operating_income,
            )
            data["net_income_growth_yoy"] = _growth(
                period.net_income,
                prior.net_income,
            )
            data["eps_growth_yoy"] = _growth(
                period.diluted_eps,
                prior.diluted_eps,
            )
            data[
                "free_cash_flow_growth_yoy"
            ] = _growth(
                period.free_cash_flow,
                prior.free_cash_flow,
            )

        output.append(FinancialPeriod(**data))

    return output


def _same_period(
    left: FinancialPeriod,
    right: FinancialPeriod,
) -> bool:
    return (
        left.period_type == right.period_type
        and abs(
            (
                left.period_end.date()
                - right.period_end.date()
            ).days
        )
        <= 5
    )


def _merge_period(
    fallback: FinancialPeriod,
    official: FinancialPeriod,
) -> FinancialPeriod:
    data = fallback.model_dump()

    for field in VALUE_FIELDS:
        value = getattr(official, field)
        if value is not None:
            data[field] = value

    if official.currency:
        data["currency"] = official.currency
    if official.source is not None:
        data["source"] = official.source

    return FinancialPeriod(**data)


def merge_periods(
    fallback: list[FinancialPeriod],
    official: list[FinancialPeriod],
    *,
    limit: int,
) -> list[FinancialPeriod]:
    output = list(fallback)

    for official_period in official:
        match_index = next(
            (
                index
                for index, candidate in enumerate(output)
                if _same_period(
                    candidate,
                    official_period,
                )
            ),
            None,
        )

        if match_index is None:
            output.append(official_period)
        else:
            output[match_index] = _merge_period(
                output[match_index],
                official_period,
            )

    return _recompute(
        sorted(
            output,
            key=lambda item: item.period_end,
            reverse=True,
        )[:limit]
    )


class LocalOfficialFinancialsProvider:
    def _registry(self) -> dict[str, Any]:
        if not REGISTRY_PATH.exists():
            return {"issuers": {}}
        try:
            payload = json.loads(
                REGISTRY_PATH.read_text(
                    encoding="utf-8"
                )
            )
        except (OSError, ValueError):
            return {"issuers": {}}
        return (
            payload
            if isinstance(payload, dict)
            else {"issuers": {}}
        )

    def has_ticker(self, ticker: str) -> bool:
        normalized = (
            ticker.strip()
            .upper()
            .removesuffix(".TO")
        )
        issuers = self._registry().get("issuers") or {}
        return normalized in issuers

    def _periods(
        self,
        ticker: str,
        period_type: str,
    ) -> list[FinancialPeriod]:
        normalized = (
            ticker.strip()
            .upper()
            .removesuffix(".TO")
        )
        issuers = self._registry().get("issuers") or {}
        issuer = issuers.get(normalized) or {}
        rows = issuer.get(
            "quarterly"
            if period_type == "quarterly"
            else "annual"
        ) or []
        output: list[FinancialPeriod] = []

        for row in rows:
            if not isinstance(row, dict):
                continue

            period_end = _datetime(
                row.get("period_end")
            )
            if period_end is None:
                continue

            source_data = row.get("source") or {}
            source = FinancialSource(
                source_type=(
                    "issuer_official_normalized"
                ),
                source_name=str(
                    source_data.get("name")
                    or issuer.get("name")
                    or f"{normalized} official filing"
                ),
                source_url=(
                    str(source_data.get("url"))
                    if source_data.get("url")
                    else None
                ),
                filed_at=_datetime(
                    source_data.get("filed_at")
                ),
                form=(
                    str(source_data.get("form"))
                    if source_data.get("form")
                    else None
                ),
                confidence="official",
            )

            values = {
                field: _number(row.get(field))
                for field in VALUE_FIELDS
            }
            output.append(
                FinancialPeriod(
                    period_end=period_end,
                    period_type=period_type,
                    currency=(
                        str(row.get("currency"))
                        if row.get("currency")
                        else None
                    ),
                    source=source,
                    **values,
                )
            )

        return _recompute(output)

    def get(
        self,
        ticker: str,
    ) -> tuple[
        list[FinancialPeriod],
        list[FinancialPeriod],
    ]:
        return (
            self._periods(ticker, "annual"),
            self._periods(ticker, "quarterly"),
        )


class OfficialFinancialsService:
    def __init__(self) -> None:
        self.local = LocalOfficialFinancialsProvider()

    async def enrich(
        self,
        snapshot: FundamentalSnapshot,
    ) -> FundamentalSnapshot:
        ticker = snapshot.symbol
        constituent = await (
            tsx_composite_universe_service.find(
                ticker
            )
        )
        is_composite = constituent is not None

        local_annual, local_quarterly = (
            self.local.get(ticker)
        )

        sec_result: SECEdgarResult | None = None
        issuer_result: IssuerFinancialsResult | None = None
        errors: list[str] = []

        async def sec_task() -> None:
            nonlocal sec_result
            try:
                sec_result = await (
                    sec_edgar_financials_provider
                    .get_financials(ticker)
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(
                    "SEC EDGAR: "
                    f"{type(exc).__name__}"
                )

        async def issuer_task() -> None:
            nonlocal issuer_result
            try:
                issuer_result = await (
                    issuer_financial_documents_service
                    .get_financials(
                        ticker,
                        snapshot.website,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(
                    "Site investisseurs: "
                    f"{type(exc).__name__}"
                )

        # The two official-source families are independent and can be
        # queried in parallel. Local normalized data requires no network.
        await asyncio.gather(
            sec_task(),
            issuer_task(),
        )

        # Priority inside the same reporting period:
        # SEC structured facts -> issuer document -> normalized local data.
        # Each later source only overwrites fields it actually provides.
        official_annual: list[FinancialPeriod] = []
        official_quarterly: list[FinancialPeriod] = []
        source_types: set[str] = set()
        sec_cik: str | None = None

        if sec_result is not None:
            sec_cik = sec_result.cik
            official_annual.extend(
                sec_result.annual
            )
            official_quarterly.extend(
                sec_result.quarterly
            )
            source_types.add("sec_edgar_xbrl")

        if issuer_result is not None:
            official_annual.extend(
                issuer_result.annual
            )
            official_quarterly.extend(
                issuer_result.quarterly
            )
            if (
                issuer_result.annual
                or issuer_result.quarterly
            ):
                source_types.add(
                    "issuer_official_document"
                )

        if local_annual or local_quarterly:
            official_annual.extend(local_annual)
            official_quarterly.extend(
                local_quarterly
            )
            source_types.add(
                "issuer_official_normalized"
            )

        annual = merge_periods(
            snapshot.annual_financials,
            official_annual,
            limit=5,
        )
        quarterly = merge_periods(
            snapshot.quarterly_financials,
            official_quarterly,
            limit=12,
        )

        official_periods = [
            period
            for period in annual + quarterly
            if period.source is not None
            and period.source.confidence == "official"
        ]
        official_fields = sum(
            1
            for period in official_periods
            for field in VALUE_FIELDS
            if getattr(period, field) is not None
        )

        reporting_currency = next(
            (
                period.currency
                for period in official_periods
                if period.currency
            ),
            snapshot.financial_currency
            or snapshot.currency,
        )

        documents_found = (
            len(issuer_result.documents)
            if issuer_result is not None
            else 0
        )
        documents_parsed = (
            issuer_result.parsed_documents
            if issuer_result is not None
            else 0
        )
        discovery_url = (
            issuer_result.website
            if issuer_result is not None
            else snapshot.website
        )

        if official_periods:
            status = (
                "official"
                if official_fields >= 45
                else "mixed"
            )
            message = (
                "Les valeurs officielles EDGAR ou publiées sur le "
                "site investisseurs remplacent automatiquement les "
                "valeurs secondaires, champ par champ."
            )
        else:
            status = (
                "fallback"
                if snapshot.status != "unavailable"
                else "unavailable"
            )
            message = (
                "Aucune extraction officielle suffisamment fiable "
                "n'a encore été obtenue. Anatole conserve les données "
                "secondaires disponibles et n'invente aucun champ."
            )

            if (
                issuer_result is not None
                and issuer_result.error
            ):
                message += (
                    f" Site investisseurs: "
                    f"{issuer_result.error}"
                )

        if errors:
            message += " " + " · ".join(errors)

        data = snapshot.model_dump()
        data["annual_financials"] = annual
        data["quarterly_financials"] = quarterly
        data["financial_currency"] = (
            reporting_currency
        )
        data["official_coverage"] = OfficialCoverage(
            is_tsx_composite=is_composite,
            status=status,
            official_periods=len(
                official_periods
            ),
            annual_official_periods=sum(
                period.period_type == "annual"
                for period in official_periods
            ),
            quarterly_official_periods=sum(
                period.period_type == "quarterly"
                for period in official_periods
            ),
            official_fields=official_fields,
            sec_cik=sec_cik,
            source_types=sorted(source_types),
            documents_found=documents_found,
            documents_parsed=documents_parsed,
            discovery_url=discovery_url,
            message=message,
        )
        data["source"] = (
            "Official issuer documents / SEC EDGAR + "
            "Yahoo Finance public quoteSummary"
            if official_periods
            else snapshot.source
        )

        return FundamentalSnapshot(**data)

    async def coverage(
        self,
    ) -> CompositeCoverageSnapshot:
        constituents = await (
            tsx_composite_universe_service
            .get_constituents()
        )
        items: list[CompositeCoverageItem] = []

        for constituent in constituents:
            resolved = None
            try:
                resolved = await (
                    sec_edgar_financials_provider
                    .resolve_cik(constituent.ticker)
                )
            except Exception:  # noqa: BLE001
                resolved = None

            local = self.local.has_ticker(
                constituent.ticker
            )

            if local:
                automatic_source = (
                    "issuer_official_normalized"
                )
                status = "official"
            elif resolved is not None:
                automatic_source = "sec_edgar_xbrl"
                status = "official"
            else:
                automatic_source = "yahoo_public"
                status = "fallback"

            items.append(
                CompositeCoverageItem(
                    ticker=constituent.ticker,
                    name=constituent.name,
                    sector=constituent.sector,
                    weight=constituent.weight,
                    sec_cik=(
                        resolved[0]
                        if resolved is not None
                        else None
                    ),
                    has_local_official_data=local,
                    automatic_source=automatic_source,
                    status=status,
                )
            )

        official_count = sum(
            item.status == "official"
            for item in items
        )

        return CompositeCoverageSnapshot(
            constituent_count=len(items),
            official_automatic_count=official_count,
            fallback_count=(
                len(items) - official_count
            ),
            generated_at=datetime.now(UTC),
            source=(
                "BlackRock XIC holdings for the "
                "operational constituent registry; "
                "SEC EDGAR and issuer normalized filings "
                "for official coverage"
            ),
            constituents=items,
        )


official_financials_service = (
    OfficialFinancialsService()
)
