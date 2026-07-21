from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FundamentalMetrics(BaseModel):
    market_cap: float | None = None
    enterprise_value: float | None = None
    trailing_pe: float | None = None
    forward_pe: float | None = None
    price_to_book: float | None = None
    price_to_sales: float | None = None
    enterprise_to_revenue: float | None = None
    enterprise_to_ebitda: float | None = None
    trailing_eps: float | None = None
    forward_eps: float | None = None
    beta: float | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    average_volume_10d: float | None = None
    average_volume_3m: float | None = None
    shares_outstanding: float | None = None
    dividend_rate: float | None = None
    dividend_yield: float | None = None
    payout_ratio: float | None = None
    total_revenue: float | None = None
    revenue_per_share: float | None = None
    gross_profit: float | None = None
    ebitda: float | None = None
    net_income_to_common: float | None = None
    free_cash_flow: float | None = None
    operating_cash_flow: float | None = None
    total_cash: float | None = None
    total_debt: float | None = None
    debt_to_equity: float | None = None
    current_ratio: float | None = None
    quick_ratio: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    profit_margin: float | None = None
    return_on_assets: float | None = None
    return_on_equity: float | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None


class FinancialSource(BaseModel):
    source_type: Literal[
        "sec_edgar_xbrl",
        "issuer_official_normalized",
        "yahoo_public",
    ]
    source_name: str
    source_url: str | None = None
    filed_at: datetime | None = None
    form: str | None = None
    confidence: Literal["official", "secondary"] = "official"


class OfficialCoverage(BaseModel):
    is_tsx_composite: bool = False
    status: Literal[
        "official",
        "mixed",
        "fallback",
        "unavailable",
    ] = "fallback"
    official_periods: int = 0
    annual_official_periods: int = 0
    quarterly_official_periods: int = 0
    official_fields: int = 0
    sec_cik: str | None = None
    source_types: list[str] = Field(default_factory=list)
    message: str | None = None


class CompositeCoverageItem(BaseModel):
    ticker: str
    name: str
    sector: str | None = None
    weight: float | None = None
    sec_cik: str | None = None
    has_local_official_data: bool = False
    automatic_source: Literal[
        "sec_edgar_xbrl",
        "issuer_official_normalized",
        "yahoo_public",
    ]
    status: Literal["official", "fallback"]


class CompositeCoverageSnapshot(BaseModel):
    universe: str = "S&P/TSX Composite"
    constituent_count: int
    official_automatic_count: int
    fallback_count: int
    generated_at: datetime
    source: str
    constituents: list[CompositeCoverageItem] = Field(
        default_factory=list
    )


class FinancialPeriod(BaseModel):
    period_end: datetime
    period_type: Literal["annual", "quarterly"]
    currency: str | None = None

    total_revenue: float | None = None
    cost_of_revenue: float | None = None
    gross_profit: float | None = None
    research_development: float | None = None
    selling_general_administrative: float | None = None
    total_operating_expenses: float | None = None
    operating_income: float | None = None
    ebit: float | None = None
    depreciation_amortization: float | None = None
    ebitda: float | None = None
    interest_expense: float | None = None
    income_before_tax: float | None = None
    income_tax_expense: float | None = None
    net_income: float | None = None
    basic_eps: float | None = None
    diluted_eps: float | None = None
    diluted_average_shares: float | None = None

    operating_cash_flow: float | None = None
    capital_expenditure: float | None = None
    free_cash_flow: float | None = None
    dividends_paid: float | None = None
    share_repurchases: float | None = None

    total_cash: float | None = None
    total_debt: float | None = None
    net_debt: float | None = None
    current_assets: float | None = None
    current_liabilities: float | None = None
    total_assets: float | None = None
    total_liabilities: float | None = None
    stockholder_equity: float | None = None

    gross_margin: float | None = None
    operating_margin: float | None = None
    net_margin: float | None = None
    free_cash_flow_margin: float | None = None

    revenue_growth_yoy: float | None = None
    operating_income_growth_yoy: float | None = None
    net_income_growth_yoy: float | None = None
    eps_growth_yoy: float | None = None
    free_cash_flow_growth_yoy: float | None = None
    source: FinancialSource | None = None


class TTMSummary(BaseModel):
    period_end: datetime | None = None
    currency: str | None = None
    total_revenue: float | None = None
    gross_profit: float | None = None
    operating_income: float | None = None
    ebitda: float | None = None
    net_income: float | None = None
    diluted_eps: float | None = None
    operating_cash_flow: float | None = None
    capital_expenditure: float | None = None
    free_cash_flow: float | None = None
    dividends_paid: float | None = None
    share_repurchases: float | None = None
    total_cash: float | None = None
    total_debt: float | None = None
    net_debt: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    net_margin: float | None = None
    free_cash_flow_margin: float | None = None


class FinancialHighlights(BaseModel):
    latest_period_end: datetime | None = None
    revenue_growth_yoy: float | None = None
    operating_income_growth_yoy: float | None = None
    net_income_growth_yoy: float | None = None
    eps_growth_yoy: float | None = None
    free_cash_flow_growth_yoy: float | None = None
    three_year_revenue_cagr: float | None = None
    three_year_net_income_cagr: float | None = None
    three_year_free_cash_flow_cagr: float | None = None
    cash_conversion_percent: float | None = None
    net_debt_to_ebitda: float | None = None


class EarningsQuarter(BaseModel):
    period: str
    actual: float | None = None
    estimate: float | None = None
    surprise_percent: float | None = None


class EarningsEstimate(BaseModel):
    period: str
    end_date: str | None = None
    eps_average: float | None = None
    eps_low: float | None = None
    eps_high: float | None = None
    eps_year_ago: float | None = None
    eps_growth: float | None = None
    eps_analyst_count: int | None = None
    revenue_average: float | None = None
    revenue_low: float | None = None
    revenue_high: float | None = None
    revenue_year_ago: float | None = None
    revenue_growth: float | None = None
    revenue_analyst_count: int | None = None


class AnalystConsensus(BaseModel):
    recommendation_key: str | None = None
    recommendation_mean: float | None = None
    analyst_count: int | None = None
    target_low: float | None = None
    target_mean: float | None = None
    target_median: float | None = None
    target_high: float | None = None
    current_price: float | None = None
    upside_to_mean_percent: float | None = None
    strong_buy: int | None = None
    buy: int | None = None
    hold: int | None = None
    sell: int | None = None
    strong_sell: int | None = None


class CorporateEvents(BaseModel):
    earnings_dates: list[datetime] = Field(default_factory=list)
    ex_dividend_date: datetime | None = None
    dividend_date: datetime | None = None


class FundamentalSnapshot(BaseModel):
    ticker: str
    symbol: str
    name: str
    exchange: str | None = None
    currency: str | None = None
    sector: str | None = None
    industry: str | None = None
    status: Literal["available", "partial", "unavailable"]
    message: str | None = None
    metrics: FundamentalMetrics
    annual_financials: list[FinancialPeriod] = Field(default_factory=list)
    quarterly_financials: list[FinancialPeriod] = Field(default_factory=list)
    ttm: TTMSummary
    highlights: FinancialHighlights
    earnings_history: list[EarningsQuarter] = Field(default_factory=list)
    earnings_estimates: list[EarningsEstimate] = Field(default_factory=list)
    analysts: AnalystConsensus
    events: CorporateEvents
    official_coverage: OfficialCoverage = Field(
        default_factory=OfficialCoverage
    )
    source: str
    generated_at: datetime
    refresh_after_seconds: int = 1800
