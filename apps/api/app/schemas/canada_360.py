from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Freshness = Literal["live", "fresh", "stale", "unavailable"]
SnapshotStatus = Literal["ok", "partial", "unavailable"]
SourceStatus = Literal["ok", "partial", "unavailable"]


class Canada360Metric(BaseModel):
    key: str
    label: str
    category: str
    value: float | None = None
    change: float | None = None
    change_kind: Literal["points", "percent", "absolute"] = "absolute"
    unit: str
    source_name: str
    source_url: str | None = None
    reference_period: str | None = None
    observed_at: datetime | None = None
    freshness: Freshness = "unavailable"
    official: bool = False
    derived: bool = False
    delayed: bool = False


class Canada360Province(BaseModel):
    code: str
    name: str
    status: SourceStatus = "unavailable"
    metrics: list[Canada360Metric] = Field(default_factory=list)
    source_name: str | None = None
    source_url: str | None = None


class Canada360SourceStatus(BaseModel):
    key: str
    label: str
    status: SourceStatus
    detail: str | None = None


class Canada360Snapshot(BaseModel):
    language: Literal["fr", "en"]
    status: SnapshotStatus
    macro: list[Canada360Metric] = Field(default_factory=list)
    rates: list[Canada360Metric] = Field(default_factory=list)
    markets: list[Canada360Metric] = Field(default_factory=list)
    provinces: list[Canada360Province] = Field(default_factory=list)
    sources: list[Canada360SourceStatus] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    generated_at: datetime
    refresh_after_seconds: int = 30
