"""Capital-use calculations over the same financial snapshot used by diagnostics."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from app.schemas.fundamental_capital import (
    ActualVsConsensus,
    AnalystContext,
    AnalystEstimatePoint,
    CapitalPeriod,
    CapitalValue,
    FundamentalCapitalResearch,
)
from app.schemas.fundamentals import FinancialPeriod, FundamentalSnapshot


def _finite(value: float | None) -> float | None:
    return value if value is not None and math.isfinite(value) else None


def _value(value: float | None, formula: str, *missing: str, reported: bool = False) -> CapitalValue:
    valid = _finite(value)
    return CapitalValue(value=round(valid, 6) if valid is not None else None,
                        status=("reported" if reported else "calculated") if valid is not None else "unavailable",
                        formula=formula, missing_inputs=[] if valid is not None else list(missing))


def _field(row: FinancialPeriod, field: str, *, absolute: bool = False) -> CapitalValue:
    value = _finite(getattr(row, field)) if row.currency else None
    if value is not None and absolute:
        value = abs(value)
    formula = f"abs({field})" if absolute else f"Reported {field}"
    return _value(value, formula, field, "period currency",
                  reported=not absolute and field not in row.calculated_fields)


def _period(snapshot: FundamentalSnapshot, row: FinancialPeriod, prior: FinancialPeriod | None) -> CapitalPeriod:
    ocf = _field(row, "operating_cash_flow")
    capex = _field(row, "capital_expenditure", absolute=True)
    dividends = _field(row, "dividends_paid", absolute=True)
    repurchases = _field(row, "share_repurchases", absolute=True)
    fcf = _field(row, "free_cash_flow")
    values = [ocf.value, capex.value, dividends.value, repurchases.value]
    after = values[0] - values[1] - values[2] - values[3] if all(value is not None for value in values) else None
    uses = values[1] + values[2] + values[3] if all(value is not None for value in values[1:]) else None
    capex_share = 100 * capex.value / uses if capex.value is not None and uses is not None and uses > 0 else None
    income = _finite(row.net_income)
    conversion = 100 * ocf.value / income if ocf.value is not None and income is not None and income > 0 else None
    same_periods = prior is not None and 300 <= (row.period_end - prior.period_end).days <= 430
    comparable = (same_periods and row.currency is not None and row.currency == prior.currency
                  and row.source is not None and prior.source is not None
                  and row.source.source_type == prior.source.source_type)
    current_debt, prior_debt = _finite(row.total_debt), _finite(prior.total_debt) if prior else None
    debt_change = current_debt - prior_debt if comparable and current_debt is not None and prior_debt is not None else None
    source = row.source
    return CapitalPeriod(
        period_end=row.period_end, currency=row.currency,
        source_name=source.source_name if source else snapshot.source,
        source_url=source.source_url if source else None,
        source_confidence=source.confidence if source else "unclassified",
        filed_at=source.filed_at if source else None,
        operating_cash_flow=ocf, capital_expenditure=capex, dividends=dividends,
        repurchases=repurchases, free_cash_flow=fcf,
        cash_after_allocations=_value(after, "Operating cash flow − |capex| − |dividends| − |repurchases|",
                                      "operating cash flow", "capital expenditure", "dividends", "repurchases"),
        capex_share_of_known_uses=_value(capex_share, "|capex| / (|capex| + |dividends| + |repurchases|) × 100",
                                         "capital expenditure", "dividends", "repurchases"),
        earnings_cash_conversion=_value(conversion, "Operating cash flow / positive net income × 100",
                                        "operating cash flow", "positive net income"),
        debt_change=_value(debt_change, "Current total debt − prior-year total debt",
                           "two comparable annual debt balances", "same currency", "same source definition"),
    )


def _analysts(snapshot: FundamentalSnapshot) -> AnalystContext:
    source_name = (snapshot.source if "yahoo" in snapshot.source.casefold() else "Secondary analyst snapshot")
    analyst = snapshot.analysts
    distribution = {key: getattr(analyst, key) for key in ("strong_buy", "buy", "hold", "sell", "strong_sell")}
    estimates = [AnalystEstimatePoint(
        period=item.period, end_date=item.end_date, eps_average=_finite(item.eps_average),
        revenue_average=_finite(item.revenue_average), eps_analyst_count=item.eps_analyst_count,
        revenue_analyst_count=item.revenue_analyst_count,
    ) for item in snapshot.earnings_estimates]
    comparisons = []
    for item in snapshot.earnings_history:
        actual, estimate = _finite(item.actual), _finite(item.estimate)
        if actual is None or estimate is None:
            continue
        comparisons.append(ActualVsConsensus(
            period=item.period, actual_eps=actual, estimated_eps=estimate,
            difference_eps=round(actual - estimate, 6),
            surprise_percent=round((actual - estimate) / abs(estimate) * 100, 4) if estimate != 0 else None,
            period_date_verified=False,
        ))
    has_summary = any(value is not None for value in (analyst.recommendation_key, analyst.target_mean, *distribution.values()))
    status = "available" if has_summary and (estimates or comparisons) else "partial" if has_summary or estimates or comparisons else "unavailable"
    return AnalystContext(
        status=status, as_of=snapshot.generated_at, source_name=source_name,
        recommendation_key=analyst.recommendation_key, distribution=distribution,
        target_low=_finite(analyst.target_low), target_mean=_finite(analyst.target_mean),
        target_median=_finite(analyst.target_median), target_high=_finite(analyst.target_high),
        target_currency=None, estimates=estimates, actual_vs_consensus=comparisons,
    )


def build_capital_research(snapshot: FundamentalSnapshot) -> FundamentalCapitalResearch:
    """Never convert current analyst forecasts into a revision time series."""
    rows = sorted((item for item in snapshot.annual_financials if item.period_type == "annual"),
                  key=lambda item: item.period_end, reverse=True)[:5]
    periods = [_period(snapshot, row, rows[index + 1] if index + 1 < len(rows) else None)
               for index, row in enumerate(rows)]
    analysts = _analysts(snapshot)
    cash_coverage = sum(item.operating_cash_flow.value is not None and item.capital_expenditure.value is not None
                        for item in periods)
    status = "available" if cash_coverage >= 2 else "partial" if periods or analysts.status != "unavailable" else "unavailable"
    return FundamentalCapitalResearch(
        ticker=snapshot.ticker, status=status, financial_currency=snapshot.financial_currency,
        stale=snapshot.stale, periods=periods, analysts=analysts,
        limitations_fr=[
            "Les montants de dépenses, dividendes et rachats sont présentés en valeur absolue; les signes du fournisseur ne sont pas interprétés comme de nouveaux flux.",
            "Le solde après allocations est une réconciliation illustrative, pas un flux disponible publié ni une mesure directe de réinvestissement dans la croissance.",
            "La variation de dette compare deux soldes annuels de même devise et définition; elle n'établit pas à elle seule un remboursement ou une émission.",
            "Le consensus est un instantané secondaire. Sa devise cible et les dates individuelles de révision ne sont pas vérifiables ici.",
        ],
        limitations_en=[
            "Capex, dividends and repurchases are shown as absolute uses; provider signs are not interpreted as new cash flows.",
            "Cash after allocations is an illustrative reconciliation, not published free cash flow or a direct measure of growth reinvestment.",
            "Debt change compares two annual balances with the same currency and definition; it does not by itself establish repayment or issuance.",
            "Consensus is a secondary snapshot. Target currency and individual revision dates are not verifiable here.",
        ],
    )
