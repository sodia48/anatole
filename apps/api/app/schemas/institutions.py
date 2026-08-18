from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


InstitutionHoldingStatus = Literal[
    "new",
    "increased",
    "reduced",
    "closed",
    "unchanged",
]
InstitutionSourceState = Literal[
    "available",
    "partial",
    "unavailable",
    "stale",
]


class InstitutionSourceStatus(BaseModel):
    source: str
    status: InstitutionSourceState
    detail: str
    url: str
    updated_at: datetime | None = None


class InstitutionSummary(BaseModel):
    cik: str
    name: str
    country: str
    report_period: date
    filed_at: date
    filing_url: str
    total_13f_value: float = Field(ge=0)
    holdings_count: int = Field(ge=0)
    previous_total_13f_value: float = Field(ge=0)
    top10_concentration_percent: float = Field(ge=0, le=100)
    new_positions_count: int = Field(ge=0)
    increased_positions_count: int = Field(ge=0)
    reduced_positions_count: int = Field(ge=0)
    closed_positions_count: int = Field(ge=0)
    comparison_available: bool = True


class InstitutionHolding(BaseModel):
    cusip: str
    ticker: str | None = None
    issuer: str
    security_class: str
    shares: float = Field(ge=0)
    previous_shares: float = Field(ge=0)
    share_change: float
    share_change_percent: float | None = None
    value: float = Field(ge=0)
    portfolio_weight_percent: float = Field(ge=0, le=100)
    previous_value: float = Field(ge=0)
    put_call: str | None = None
    status: InstitutionHoldingStatus


class InstitutionDetail(BaseModel):
    institution: InstitutionSummary
    holdings: list[InstitutionHolding] = Field(default_factory=list)
    previous_report_period: date | None = None
    source_statuses: list[InstitutionSourceStatus] = Field(default_factory=list)
    generated_at: datetime
    stale: bool = False
    message: str | None = None


class InstitutionFlow(BaseModel):
    ticker: str | None = None
    cusip: str
    issuer: str
    institutions_holding: int = Field(ge=0)
    institutions_increased: int = Field(ge=0)
    institutions_reduced: int = Field(ge=0)
    institutions_new: int = Field(ge=0)
    institutions_closed: int = Field(ge=0)
    aggregate_share_change: float | None = None
    current_reported_value: float = Field(ge=0)
    institution_names: list[str] = Field(default_factory=list)


class InstitutionsSnapshot(BaseModel):
    institutions: list[InstitutionSummary] = Field(default_factory=list)
    top_increased: list[InstitutionFlow] = Field(default_factory=list)
    top_new: list[InstitutionFlow] = Field(default_factory=list)
    top_reduced: list[InstitutionFlow] = Field(default_factory=list)
    top_closed: list[InstitutionFlow] = Field(default_factory=list)
    report_period: date | None = None
    previous_report_period: date | None = None
    generated_at: datetime
    sources: list[InstitutionSourceStatus] = Field(default_factory=list)
    stale: bool = False
    message: str | None = None
