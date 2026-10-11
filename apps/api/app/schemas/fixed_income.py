"""Official fixed-income observations and explicit coverage boundaries."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal

from pydantic import BaseModel, Field


Coverage = Literal["full", "partial", "limited", "unavailable"]
Freshness = Literal["delayed", "stale", "unavailable"]


class FixedIncomeDataQuality(BaseModel):
    scope: Literal["federal_curve", "province_profiles", "province_issues", "municipal_profiles", "municipal_issues", "secondary_market_yields"]
    status: Coverage
    source: str | None = None
    observed_at: datetime | None = None
    freshness: Freshness = "unavailable"
    coverage: str


class FixedIncomeCurvePoint(BaseModel):
    official_series_id: str
    label: str
    tenor: str
    latest: float | None = None
    previous: float | None = None
    bp_change: float | None = None
    observed_at: datetime | None = None
    source_url: str
    freshness: Freshness = "unavailable"


class FixedIncomeSignal(BaseModel):
    kind: Literal["ten_year_move", "curve_zero_cross", "curve_shape_change", "policy_change"]
    detail: str
    observed_at: datetime
    source_url: str


class CanadaYieldCurveSnapshot(BaseModel):
    points: list[FixedIncomeCurvePoint] = Field(default_factory=list)
    marketable_averages: list[FixedIncomeCurvePoint] = Field(default_factory=list)
    spread_2s10s_bps: float | None = None
    spread_2s5s_bps: float | None = None
    spread_5s_long_bps: float | None = None
    spread_10s_long_bps: float | None = None
    policy_rate: FixedIncomeCurvePoint | None = None
    real_long_yield: FixedIncomeCurvePoint | None = None
    curve_shape: Literal["inverted", "flat", "normal", "unknown"] = "unknown"
    signals: list[FixedIncomeSignal] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: str = "Bank of Canada Valet"
    debt_management_url: str = "https://www.canada.ca/en/department-finance/services/publications/debt-management.html"
    quality: FixedIncomeDataQuality


class FixedIncomeHistoryObservation(BaseModel):
    observed_at: date
    yields_percent: dict[str, float]


class CanadaYieldHistory(BaseModel):
    period: Literal["1D", "1W", "1M", "3M", "1Y", "5Y", "10Y"]
    observations: list[FixedIncomeHistoryObservation] = Field(default_factory=list)
    source_url: str
    quality: FixedIncomeDataQuality


class GovernmentBondIssue(BaseModel):
    issuer_level: Literal["federal", "provincial", "municipal"]
    issuer: str
    jurisdiction: str | None = None
    city: str | None = None
    cusip: str | None = None
    isin: str | None = None
    settlement_date: date | None = None
    issue_date: date | None = None
    maturity_date: date | None = None
    coupon_percent: float | None = None
    issue_amount: float | None = None
    currency: str | None = None
    outstanding_amount: float | None = None
    bond_type: str | None = None
    green: bool | None = None
    social: bool | None = None
    sustainable: bool | None = None
    official_url: str
    yield_percent: float | None = None
    spread_to_canada_bps: float | None = None
    yield_source: str | None = None
    observed_at: datetime | None = None


class FixedIncomeIssuesResponse(BaseModel):
    issues: list[GovernmentBondIssue] = Field(default_factory=list)
    quality: FixedIncomeDataQuality


class DebtFieldSource(BaseModel):
    official_url: str
    observed_at: datetime | None = None
    description: str


class ProvincialDebtProfile(BaseModel):
    code: str
    name: str
    issuer: str
    investor_relations_url: str | None = None
    debt_management_url: str | None = None
    borrowing_program_url: str | None = None
    parser_support: bool = False
    last_verified: date | None = None
    coverage: Coverage = "unavailable"
    borrowing_program_amount: float | None = None
    fiscal_year: str | None = None
    debt_outstanding: float | None = None
    average_term: float | None = None
    fixed_floating_mix: str | None = None
    currency_mix: str | None = None
    green_social_sustainable_program: str | None = None
    recent_issues: list[GovernmentBondIssue] = Field(default_factory=list)
    last_updated: datetime | None = None
    source_urls: list[str] = Field(default_factory=list)
    field_sources: dict[str, DebtFieldSource] = Field(default_factory=dict)
    quality: FixedIncomeDataQuality


class MunicipalDebtProfile(BaseModel):
    slug: str
    city: str
    province: str
    official_url: str | None = None
    coverage: Coverage = "unavailable"
    debt_outstanding: float | None = None
    borrowing_program_amount: float | None = None
    fiscal_year: str | None = None
    bond_programs: list[str] = Field(default_factory=list)
    green_social_sustainable_program: str | None = None
    recent_issues: list[GovernmentBondIssue] = Field(default_factory=list)
    last_updated: datetime | None = None
    source_urls: list[str] = Field(default_factory=list)
    field_sources: dict[str, DebtFieldSource] = Field(default_factory=dict)
    quality: FixedIncomeDataQuality
