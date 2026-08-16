from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ProvincialMetric(BaseModel):
    key: str
    label: str
    category: str
    value: float | None = None
    previous_value: float | None = None
    change: float | None = None
    change_kind: Literal["points", "percent", "absolute"] = "absolute"
    unit_kind: Literal["percent", "persons", "currency", "units", "index"] = "units"
    reference_period: str | None = None
    previous_reference_period: str | None = None
    released_at: datetime | None = None
    table_id: str
    table_url: str
    status: Literal["available", "unavailable"] = "available"
    note: str | None = None


class ProvincialProfile(BaseModel):
    code: str
    name: str
    metrics: list[ProvincialMetric] = Field(default_factory=list)
    official_source_name: str | None = None
    official_source_url: str | None = None


class ProvincialStatisticsSourceStatus(BaseModel):
    source: str
    status: Literal["ok", "partial", "unavailable"]
    detail: str | None = None


class ProvincialStatisticsSnapshot(BaseModel):
    requested_region: str
    language: Literal["fr", "en"]
    provinces: list[ProvincialProfile] = Field(default_factory=list)
    source_statuses: list[ProvincialStatisticsSourceStatus] = Field(default_factory=list)
    generated_at: datetime
    refresh_after_seconds: int = 1800
