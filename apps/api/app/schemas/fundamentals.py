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


class AnnualFinancial(BaseModel):
    period_end: datetime
    currency: str | None = None
    total_revenue: float | None = None
    gross_profit: float | None = None
    operating_income: float | None = None
    net_income: float | None = None
    operating_cash_flow: float | None = None
    capital_expenditure: float | None = None
    free_cash_flow: float | None = None
    total_cash: float | None = None
    total_debt: float | None = None
    total_assets: float | None = None
    stockholder_equity: float | None = None


class EarningsQuarter(BaseModel):
    period: str
    actual: float | None = None
    estimate: float | None = None
    surprise_percent: float | None = None


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
    annual_financials: list[AnnualFinancial] = Field(default_factory=list)
    earnings_history: list[EarningsQuarter] = Field(default_factory=list)
    analysts: AnalystConsensus
    events: CorporateEvents
    source: str
    generated_at: datetime
    refresh_after_seconds: int = 1800
