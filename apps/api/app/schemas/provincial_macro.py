from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ProvinceCode = Literal[
    "QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL"
]

Specificity = Literal[
    "province-direct",
    "province-normalized",
    "fiscal-direct",
]

SourceKind = Literal[
    "statistics",
    "economic_accounts",
    "dashboard",
    "finance",
    "statcan",
]


class ProvincialMacroSource(BaseModel):
    key: str
    label: str
    region: ProvinceCode
    kind: SourceKind
    url: str
    status: Literal["available", "partial", "unavailable"] = "available"
    count: int = Field(default=0, ge=0)
    detail: str | None = None


class ProvincialMacroRelease(BaseModel):
    id: str
    region: ProvinceCode
    province: str
    title: str
    summary: str
    category: str
    importance: Literal["Élevée", "Moyenne", "Faible"]
    importance_score: int = Field(ge=0, le=100)
    source: str
    source_kind: SourceKind
    source_url: str
    published_at: datetime | None = None
    period: str | None = None
    official: bool = True
    specificity: Specificity = "province-direct"


class ProvincialMacroEvent(BaseModel):
    id: str
    region: ProvinceCode
    province: str
    title: str
    description: str
    category: str
    importance: Literal["Élevée", "Moyenne", "Faible"]
    importance_score: int = Field(ge=0, le=100)
    starts_at: datetime
    time_is_estimated: bool = False
    source: str
    source_kind: SourceKind
    source_url: str
    official: bool = True
    specificity: Specificity = "province-direct"


class ProvincialMacroSnapshot(BaseModel):
    region: ProvinceCode
    province: str
    language: Literal["fr", "en"] = "fr"
    mode: Literal["province-first"] = "province-first"
    latest_releases: list[ProvincialMacroRelease] = Field(default_factory=list)
    upcoming_events: list[ProvincialMacroEvent] = Field(default_factory=list)
    sources: list[ProvincialMacroSource] = Field(default_factory=list)
    generated_at: datetime
    refresh_after_seconds: int = Field(default=900, ge=30)
    message: str | None = None
