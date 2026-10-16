"""Public, source-aware output from the shared fundamental analysis engine."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FundamentalObservation(BaseModel):
    value: float
    period_end: datetime
    period_type: Literal["annual", "quarterly"]
    unit: Literal["money", "percent", "ratio"]
    currency: str | None = None
    nature: Literal["published", "calculated"]
    formula: str | None = None
    inputs: list[str] = Field(default_factory=list)
    source_name: str
    source_url: str | None = None
    source_type: str | None = None
    source_confidence: Literal["official", "secondary", "unclassified"] = "unclassified"
    filed_at: datetime | None = None


class FundamentalMeasure(BaseModel):
    key: str
    label_fr: str
    label_en: str
    dimension: str
    unit: Literal["money", "percent", "ratio"]
    observations: list[FundamentalObservation] = Field(default_factory=list)
    status: Literal["available", "insufficient", "not_applicable"]
    reason_fr: str | None = None
    reason_en: str | None = None
    method_fr: str
    method_en: str


class FundamentalScoreContribution(BaseModel):
    measure_key: str
    previous: float
    current: float
    direction: Literal["improving", "stable", "deteriorating"]
    points: int


class FundamentalDimension(BaseModel):
    key: str
    label_fr: str
    label_en: str
    measure_keys: list[str]
    available_count: int
    score: float | None = None
    score_status: Literal["directional", "insufficient", "not_applicable"]
    contributions: list[FundamentalScoreContribution] = Field(default_factory=list)
    explanation_fr: str
    explanation_en: str


class FundamentalFinding(BaseModel):
    kind: Literal["strength", "vulnerability", "observation"]
    text_fr: str
    text_en: str
    measure_keys: list[str]


class FundamentalDiagnostic(BaseModel):
    ticker: str
    name: str
    sector: str | None = None
    industry: str | None = None
    sector_family: str
    generated_at: datetime
    source_generated_at: datetime
    stale: bool
    financial_currency: str | None = None
    status: Literal["available", "partial", "unavailable"]
    measures: list[FundamentalMeasure]
    dimensions: list[FundamentalDimension]
    findings: list[FundamentalFinding]
    methodology_fr: str
    methodology_en: str
    missing_data: list[str] = Field(default_factory=list)
    global_score: None = None
