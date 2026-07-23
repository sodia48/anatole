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
from app.services.yahoo_statements import (
    YahooStatementsResult,
    yahoo_statements_service,
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


def _mark_calculated(
    data: dict[str, Any],
    field: str,
    value: float | None,
) -> None:
    if value is None or data.get(field) is not None:
        return
    data[field] = value
    calculated = set(data.get("calculated_fields") or [])
    calculated.add(field)
    data["calculated_fields"] = sorted(calculated)


def _derive_exact_fields(data: dict[str, Any]) -> dict[str, Any]:
    _mark_calculated(
        data,
        "gross_profit",
        data["total_revenue"] - data["cost_of_revenue"]
        if data.get("total_revenue") is not None
        and data.get("cost_of_revenue") is not None
        else None,
    )
    _mark_calculated(
        data,
        "free_cash_flow",
        data["operating_cash_flow"] + data["capital_expenditure"]
        if data.get("operating_cash_flow") is not None
        and data.get("capital_expenditure") is not None
        else None,
    )
    _mark_calculated(
        data,
        "ebitda",
        data["ebit"] + abs(data["depreciation_amortization"])
        if data.get("ebit") is not None
        and data.get("depreciation_amortization") is not None
        else None,
    )
    _mark_calculated(
        data,
        "net_debt",
        data["total_debt"] - data["total_cash"]
        if data.get("total_debt") is not None
        and data.get("total_cash") is not None
        else None,
    )
    _mark_calculated(
        data,
        "stockholder_equity",
        data["total_assets"] - data["total_liabilities"]
        if data.get("total_assets") is not None
        and data.get("total_liabilities") is not None
        else None,
    )
    _mark_calculated(
        data,
        "total_liabilities",
        data["total_assets"] - data["stockholder_equity"]
        if data.get("total_assets") is not None
        and data.get("stockholder_equity") is not None
        else None,
    )
    _mark_calculated(
        data,
        "total_assets",
        data["total_liabilities"] + data["stockholder_equity"]
        if data.get("total_liabilities") is not None
        and data.get("stockholder_equity") is not None
        else None,
    )
    return data


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
        if rows and rows[0].period_type == "quarterly"
        else 1
    )
    output: list[FinancialPeriod] = []

    for index, period in enumerate(rows):
        data = _derive_exact_fields(period.model_dump())
        revenue = data.get("total_revenue")
        data["gross_margin"] = _safe_div(
            data.get("gross_profit"), revenue, 100
        )
        data["operating_margin"] = _safe_div(
            data.get("operating_income"), revenue, 100
        )
        data["net_margin"] = _safe_div(
            data.get("net_income"), revenue, 100
        )
        data["free_cash_flow_margin"] = _safe_div(
            data.get("free_cash_flow"), revenue, 100
        )

        prior_index = index + gap
        if prior_index < len(rows):
            prior = rows[prior_index]
            data["revenue_growth_yoy"] = _growth(
                data.get("total_revenue"), prior.total_revenue
            )
            data["operating_income_growth_yoy"] = _growth(
                data.get("operating_income"), prior.operating_income
            )
            data["net_income_growth_yoy"] = _growth(
                data.get("net_income"), prior.net_income
            )
            data["eps_growth_yoy"] = _growth(
                data.get("diluted_eps"), prior.diluted_eps
            )
            data["free_cash_flow_growth_yoy"] = _growth(
                data.get("free_cash_flow"), prior.free_cash_flow
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
    stronger: FinancialPeriod,
) -> FinancialPeriod:
    data = fallback.model_dump()
    calculated = set(fallback.calculated_fields)

    for field in VALUE_FIELDS:
        value = getattr(stronger, field)
        if value is not None:
            data[field] = value
            calculated.discard(field)

    calculated.update(stronger.calculated_fields)
    data["calculated_fields"] = sorted(calculated)

    if stronger.currency:
        data["currency"] = stronger.currency
    if stronger.source is not None:
        data["source"] = stronger.source

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
            tsx_composite_universe_service.find(ticker)
        )
        is_composite = constituent is not None
        local_annual, local_quarterly = self.local.get(ticker)

        sec_result: SECEdgarResult | None = None
        issuer_result: IssuerFinancialsResult | None = None
        yahoo_result: YahooStatementsResult | None = None
        errors: list[str] = []

        async def sec_task() -> None:
            nonlocal sec_result
            try:
                sec_result = await (
                    sec_edgar_financials_provider.get_financials(ticker)
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"SEC EDGAR: {type(exc).__name__}")

        async def issuer_task() -> None:
            nonlocal issuer_result
            try:
                issuer_result = await (
                    issuer_financial_documents_service.get_financials(
                        ticker, snapshot.website
                    )
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(
                    f"Site investisseurs: {type(exc).__name__}"
                )

        async def yahoo_task() -> None:
            nonlocal yahoo_result
            try:
                yahoo_result = await (
                    yahoo_statements_service.get_financials(
                        ticker,
                        snapshot.financial_currency
                        or snapshot.currency,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(
                    f"Yahoo structuré: {type(exc).__name__}"
                )

        await asyncio.gather(sec_task(), issuer_task(), yahoo_task())

        yahoo_annual = yahoo_result.annual if yahoo_result else []
        yahoo_quarterly = (
            yahoo_result.quarterly if yahoo_result else []
        )

        # quoteSummary -> Yahoo statements
        annual = merge_periods(
            snapshot.annual_financials,
            yahoo_annual,
            limit=5,
        )
        quarterly = merge_periods(
            snapshot.quarterly_financials,
            yahoo_quarterly,
            limit=12,
        )

        # Yahoo statements -> official filings
        official_annual: list[FinancialPeriod] = []
        official_quarterly: list[FinancialPeriod] = []
        source_types: set[str] = set()
        sec_cik: str | None = None

        if yahoo_annual or yahoo_quarterly:
            source_types.add("yahoo_structured")

        if sec_result is not None:
            sec_cik = sec_result.cik
            official_annual.extend(sec_result.annual)
            official_quarterly.extend(sec_result.quarterly)
            source_types.add("sec_edgar_xbrl")

        if issuer_result is not None:
            official_annual.extend(issuer_result.annual)
            official_quarterly.extend(issuer_result.quarterly)
            if issuer_result.annual or issuer_result.quarterly:
                source_types.add("issuer_official_document")

        if local_annual or local_quarterly:
            official_annual.extend(local_annual)
            official_quarterly.extend(local_quarterly)
            source_types.add("issuer_official_normalized")

        annual = merge_periods(annual, official_annual, limit=5)
        quarterly = merge_periods(
            quarterly, official_quarterly, limit=12
        )

        official_periods = [
            period
            for period in annual + quarterly
            if period.source is not None
            and period.source.confidence == "official"
        ]
        structured_periods = [
            period
            for period in annual + quarterly
            if period.source is not None
            and period.source.source_type == "yahoo_structured"
        ]

        official_fields = sum(
            1
            for period in official_periods
            for field in VALUE_FIELDS
            if getattr(period, field) is not None
        )
        structured_fields = sum(
            1
            for period in structured_periods
            for field in VALUE_FIELDS
            if getattr(period, field) is not None
        )
        calculated_fields = sum(
            len(period.calculated_fields)
            for period in annual + quarterly
        )

        reporting_currency = next(
            (
                period.currency
                for period in official_periods
                if period.currency
            ),
            None,
        ) or next(
            (
                period.currency
                for period in structured_periods
                if period.currency
            ),
            snapshot.financial_currency or snapshot.currency,
        )

        documents_found = (
            len(issuer_result.documents) if issuer_result else 0
        )
        documents_parsed = (
            issuer_result.parsed_documents if issuer_result else 0
        )
        discovery_url = (
            issuer_result.website
            if issuer_result is not None
            else snapshot.website
        )

        if official_periods:
            status = "official" if official_fields >= 45 else "mixed"
            message = (
                "Les dépôts officiels ont priorité. Les champs "
                "officiels absents sont complétés par les états "
                "financiers structurés de Yahoo."
            )
        elif structured_periods:
            status = "fallback"
            message = (
                "Les états financiers structurés utilisés dans la "
                "bêta ont été restaurés. Les calculs exacts complètent "
                "uniquement les champs mathématiquement déterminables."
            )
        else:
            status = (
                "fallback"
                if snapshot.status != "unavailable"
                else "unavailable"
            )
            message = (
                "Aucun état financier structuré ou officiel n'a été "
                "récupéré. Anatole conserve les données disponibles "
                "sans inventer de valeurs."
            )

        if (
            issuer_result is not None
            and issuer_result.error
            and not official_periods
        ):
            message += f" Site investisseurs: {issuer_result.error}"
        if errors:
            message += " " + " · ".join(errors)

        data = snapshot.model_dump()
        data["annual_financials"] = annual
        data["quarterly_financials"] = quarterly
        data["financial_currency"] = reporting_currency
        data["official_coverage"] = OfficialCoverage(
            is_tsx_composite=is_composite,
            status=status,
            official_periods=len(official_periods),
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
            structured_periods=len(structured_periods),
            annual_structured_periods=sum(
                period.period_type == "annual"
                for period in structured_periods
            ),
            quarterly_structured_periods=sum(
                period.period_type == "quarterly"
                for period in structured_periods
            ),
            structured_fields=structured_fields,
            calculated_fields=calculated_fields,
            yahoo_statements_error=(
                yahoo_result.error if yahoo_result else None
            ),
            discovery_url=discovery_url,
            message=message,
        )
        data["status"] = (
            "available"
            if official_fields + structured_fields >= 25
            else "partial"
            if official_periods or structured_periods
            else snapshot.status
        )
        data["source"] = (
            "Official filings + Yahoo Finance structured "
            "statements + quoteSummary"
            if official_periods
            else "Yahoo Finance structured statements + quoteSummary"
            if structured_periods
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
                automatic_source = "yahoo_structured"
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
