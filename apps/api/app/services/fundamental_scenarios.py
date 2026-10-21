"""Pure, explicit sensitivities over one sourced annual financial snapshot."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from app.schemas.fundamental_scenarios import (
    DCFResult,
    DCFSensitivity,
    DCFSettings,
    ScenarioAssumptions,
    ScenarioOutcome,
    ScenarioRequest,
    ScenarioSimulation,
    ScenarioValue,
)
from app.schemas.fundamentals import FinancialPeriod, FundamentalSnapshot
from app.services.fundamental_intelligence import sector_family


def _finite(value: float | None) -> float | None:
    return value if value is not None and math.isfinite(value) else None


def _result(value: float | None, unit: str, formula: str, *missing: str) -> ScenarioValue:
    valid = _finite(value)
    return ScenarioValue(value=round(valid, 6) if valid is not None else None,
                         unit=unit, status="calculated" if valid is not None else "unavailable",
                         formula=formula, missing_inputs=list(missing) if valid is None else [])


def _net_debt(row: FinancialPeriod) -> float | None:
    direct = _finite(row.net_debt)
    if direct is not None:
        return direct
    debt, cash = _finite(row.total_debt), _finite(row.total_cash)
    return debt - cash if debt is not None and cash is not None else None


def _dcf(snapshot: FundamentalSnapshot, row: FinancialPeriod | None, family: str,
         fcf: ScenarioValue, settings: DCFSettings | None) -> DCFResult:
    if family in {"bank", "insurance", "real_estate"}:
        return DCFResult(status="unavailable", reason="A generic FCF DCF is not suitable for this business model", settings=settings)
    age = (datetime.now(UTC).date() - row.period_end.date()).days if row else None
    if row is None or snapshot.stale or age is None or not 0 <= age <= 550:
        return DCFResult(status="unavailable", reason="Fresh annual observations are required", settings=settings)
    if row.currency is None or snapshot.currency is None or row.currency != snapshot.currency:
        return DCFResult(status="unavailable", reason="Financial and share currencies must match", settings=settings)
    comparable = sorted((item for item in snapshot.annual_financials
                         if item.period_type == "annual" and item.currency == row.currency
                         and item.source is not None and _finite(item.free_cash_flow) is not None
                         and item.free_cash_flow > 0), key=lambda item: item.period_end, reverse=True)
    if (len(comparable) < 2 or comparable[0].period_end != row.period_end
            or not 300 <= (comparable[0].period_end - comparable[1].period_end).days <= 430):
        return DCFResult(status="unavailable", reason="Two consecutive sourced positive annual cash flows are required", settings=settings)
    shares = _finite(snapshot.metrics.shares_outstanding)
    net_debt = _net_debt(row)
    if shares is None or shares <= 0 or net_debt is None:
        return DCFResult(status="unavailable", reason="Reported share count and net debt are required", settings=settings)
    if fcf.value is None or fcf.value <= 0:
        return DCFResult(status="unavailable", reason="Positive scenario free cash flow is required", settings=settings)
    if settings is None:
        return DCFResult(status="unavailable", reason="Explicit DCF rates and forecast growth are required")

    growth = settings.forecast_fcf_growth_percent / 100
    projected = [fcf.value * (1 + growth) ** year for year in range(5)]

    def value(discount_percent: float, terminal_percent: float) -> tuple[float, float, float] | None:
        if discount_percent - terminal_percent < 2:
            return None
        discount, terminal = discount_percent / 100, terminal_percent / 100
        pv = sum(cash / (1 + discount) ** (year + 1) for year, cash in enumerate(projected))
        terminal_value = projected[-1] * (1 + terminal) / (discount - terminal)
        enterprise = pv + terminal_value / (1 + discount) ** 5
        equity = enterprise - net_debt
        return enterprise, equity, equity / shares

    central = value(settings.discount_rate_percent, settings.terminal_growth_percent)
    if central is None or not all(math.isfinite(item) for item in central) or central[1] <= 0:
        return DCFResult(status="unavailable", reason="DCF assumptions do not produce positive finite equity value", settings=settings)
    sensitivity = []
    for discount in (settings.discount_rate_percent - 1, settings.discount_rate_percent, settings.discount_rate_percent + 1):
        for terminal in (settings.terminal_growth_percent - .5, settings.terminal_growth_percent, settings.terminal_growth_percent + .5):
            result = value(discount, terminal)
            if result and all(math.isfinite(item) for item in result) and result[1] > 0:
                sensitivity.append(DCFSensitivity(discount_rate_percent=round(discount, 2),
                                                  terminal_growth_percent=round(terminal, 2),
                                                  per_share=round(result[2], 6)))
    return DCFResult(status="calculated", settings=settings,
                     projected_fcf=[round(item, 6) for item in projected],
                     enterprise_value=round(central[0], 6), net_debt=round(net_debt, 6),
                     equity_value=round(central[1], 6), shares_outstanding=shares,
                     per_share=round(central[2], 6), sensitivity=sensitivity)


def _outcome(snapshot: FundamentalSnapshot, row: FinancialPeriod | None, family: str,
             assumptions: ScenarioAssumptions, dcf_settings: DCFSettings | None) -> ScenarioOutcome:
    if assumptions.commodity_price_change_percent is not None and family != "mining":
        raise ValueError("Commodity sensitivity is only available for mining companies")
    base_revenue = _finite(row.total_revenue) if row and row.currency else None
    if base_revenue is not None and base_revenue <= 0:
        base_revenue = None
    commodity_factor = 1 + (assumptions.commodity_price_change_percent or 0) * (assumptions.commodity_revenue_exposure_percent or 0) / 10_000
    revenue = _result(base_revenue * (1 + assumptions.revenue_change_percent / 100) * commodity_factor
                      if base_revenue is not None else None, "money",
                      "Reported revenue × (1 + revenue shock) × (1 + commodity price shock × user-supplied exposure)",
                      "annual revenue", "period currency")

    baseline_operating = _finite(row.operating_income) if row else None
    modeled_operating = None
    if revenue.value is not None and baseline_operating is not None and base_revenue is not None and family not in {"bank", "insurance"}:
        baseline_margin = baseline_operating / base_revenue
        modeled_operating = revenue.value * (baseline_margin + assumptions.operating_margin_change_points / 100
                                             - assumptions.incremental_cost_inflation_percent / 100)
    operating = _result(modeled_operating, "money",
                        "Scenario revenue × (reported operating margin + margin change − incremental cost inflation)",
                        "annual operating income", "comparable operating margin")

    tax_rate = None
    if row and _finite(row.income_before_tax) is not None and row.income_before_tax > 0 and _finite(row.income_tax_expense) is not None:
        candidate = abs(row.income_tax_expense) / row.income_before_tax
        if 0 <= candidate <= .5:
            tax_rate = candidate
    base_interest = _finite(row.interest_expense) if row else None
    interest_delta = 0.0 if assumptions.financing_cost_change_percent == 0 else (
        abs(base_interest) * assumptions.financing_cost_change_percent / 100 if base_interest is not None else None)
    base_income = _finite(row.net_income) if row else None
    modeled_income = (base_income + (modeled_operating - baseline_operating - interest_delta) * (1 - tax_rate)
                      if base_income is not None and modeled_operating is not None and baseline_operating is not None
                      and interest_delta is not None and tax_rate is not None else None)
    income = _result(modeled_income, "money",
                     "Reported net income + (change in operating income − change in interest cost) × (1 − reported effective tax rate)",
                     "annual net income", "effective tax rate", "interest expense when financing cost changes")

    base_ocf = _finite(row.operating_cash_flow) if row else None
    modeled_ocf = (base_ocf + (modeled_income - base_income)
                   - revenue.value * assumptions.working_capital_use_percent_revenue / 100
                   if base_ocf is not None and modeled_income is not None and base_income is not None and revenue.value is not None else None)
    ocf = _result(modeled_ocf, "money",
                  "Reported operating cash flow + change in modeled net income − scenario working-capital use",
                  "annual operating cash flow", "scenario net income")

    base_capex = _finite(row.capital_expenditure) if row else None
    modeled_fcf = (modeled_ocf - abs(base_capex) * (1 + assumptions.capex_change_percent / 100)
                   if modeled_ocf is not None and base_capex is not None else None)
    fcf = _result(modeled_fcf, "money", "Scenario operating cash flow − reported capital expenditure × (1 + capex change)",
                  "annual capital expenditure", "scenario operating cash flow")
    op_margin = _result(100 * modeled_operating / revenue.value if modeled_operating is not None and revenue.value else None,
                        "percent", "Scenario operating income / scenario revenue × 100", "scenario operating income")
    fcf_margin = _result(100 * modeled_fcf / revenue.value if modeled_fcf is not None and revenue.value else None,
                         "percent", "Scenario free cash flow / scenario revenue × 100", "scenario free cash flow")
    return ScenarioOutcome(
        key=assumptions.key, assumptions=assumptions, revenue=revenue,
        operating_income=operating, net_income=income, operating_cash_flow=ocf,
        free_cash_flow=fcf, operating_margin=op_margin, free_cash_flow_margin=fcf_margin,
        dcf=_dcf(snapshot, row, family, fcf, dcf_settings),
    )


def simulate_financial_scenarios(snapshot: FundamentalSnapshot, request: ScenarioRequest) -> ScenarioSimulation:
    """Calculate sensitivities without claiming a forecast or a market price."""
    family = sector_family(snapshot)
    annual = sorted((item for item in snapshot.annual_financials if item.period_type == "annual"),
                    key=lambda item: item.period_end, reverse=True)
    row = annual[0] if annual else None
    outcomes = [_outcome(snapshot, row, family, item, request.dcf) for item in request.scenarios]
    calculated = sum(item.revenue.status == "calculated" for item in outcomes)
    status = "unavailable" if calculated == 0 else "available" if all(item.free_cash_flow.status == "calculated" for item in outcomes) else "partial"
    source = row.source if row else None
    return ScenarioSimulation(
        ticker=snapshot.ticker, sector_family=family,
        baseline_period_end=row.period_end if row else None, currency=row.currency if row else None,
        baseline_source=source.source_name if source else snapshot.source,
        baseline_source_url=source.source_url if source else None,
        baseline_filed_at=source.filed_at if source else None,
        baseline_stale=snapshot.stale,
        status=status, outcomes=outcomes,
        limitations_fr=[
            "Sensibilités illustratives, pas des prévisions ni des prix de marché certains.",
            "Chocs annuels appliqués à un seul exercice publié; aucune trajectoire macroéconomique déduite.",
            "Le flux opérationnel suppose que la variation du résultat net se répercute en trésorerie, sauf l'hypothèse explicite de fonds de roulement.",
            "La DCF, si calculable, utilise cinq flux projetés et des taux saisis par l'utilisateur. Elle exclut banques, assurances et REIT.",
        ],
        limitations_en=[
            "Illustrative sensitivities, not forecasts or certain market prices.",
            "Annual shocks apply to one published year; no macroeconomic path is inferred.",
            "Operating cash flow assumes the modeled earnings change converts to cash, except for the explicit working-capital assumption.",
            "DCF, when available, uses five projected cash flows and user-entered rates. It excludes banks, insurers and REITs.",
        ],
    )
