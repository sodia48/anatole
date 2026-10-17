"""Sourced capital-use bridge and honest analyst snapshot."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CapitalValue(BaseModel):
    value: float | None = None
    status: Literal["reported", "calculated", "unavailable"]
    formula: str
    missing_inputs: list[str] = Field(default_factory=list)


class CapitalPeriod(BaseModel):
    period_end: datetime
    currency: str | None = None
    source_name: str
    source_url: str | None = None
    source_confidence: Literal["official", "secondary", "unclassified"]
    filed_at: datetime | None = None
    operating_cash_flow: CapitalValue
    capital_expenditure: CapitalValue
    dividends: CapitalValue
    repurchases: CapitalValue
    free_cash_flow: CapitalValue
    cash_after_allocations: CapitalValue
    capex_share_of_known_uses: CapitalValue
    earnings_cash_conversion: CapitalValue
    debt_change: CapitalValue


class AnalystEstimatePoint(BaseModel):
    period: str
    end_date: str | None = None
    eps_average: float | None = None
    revenue_average: float | None = None
    eps_analyst_count: int | None = None
    revenue_analyst_count: int | None = None


class ActualVsConsensus(BaseModel):
    period: str
    actual_eps: float
    estimated_eps: float
    difference_eps: float
    surprise_percent: float | None = None
    period_date_verified: bool = False


class AnalystContext(BaseModel):
    status: Literal["available", "partial", "unavailable"]
    as_of: datetime
    source_name: str
    source_confidence: Literal["secondary_snapshot"] = "secondary_snapshot"
    recommendation_key: str | None = None
    distribution: dict[str, int | None]
    target_low: float | None = None
    target_mean: float | None = None
    target_median: float | None = None
    target_high: float | None = None
    target_currency: str | None = None
    estimates: list[AnalystEstimatePoint] = Field(default_factory=list)
    actual_vs_consensus: list[ActualVsConsensus] = Field(default_factory=list)
    revision_history_status: Literal["unavailable"] = "unavailable"
    revision_history_reason_fr: str = "Aucun historique daté des révisions n'est fourni; les prévisions courantes ne constituent pas un historique."
    revision_history_reason_en: str = "No dated revision history is supplied; current forecasts are not historical revisions."


class FundamentalCapitalResearch(BaseModel):
    ticker: str
    status: Literal["available", "partial", "unavailable"]
    financial_currency: str | None = None
    stale: bool
    periods: list[CapitalPeriod]
    analysts: AnalystContext
    limitations_fr: list[str]
    limitations_en: list[str]
