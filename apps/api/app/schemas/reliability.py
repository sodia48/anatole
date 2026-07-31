from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ClientEventRequest(BaseModel):
    kind: Literal[
        "javascript_error",
        "unhandled_rejection",
        "api_failure",
        "performance",
    ]
    message: str = Field(min_length=1, max_length=1000)
    route: str = Field(default="/", max_length=300)
    stack: str | None = Field(default=None, max_length=4000)
    request_id: str | None = Field(default=None, max_length=100)
    user_agent: str | None = Field(default=None, max_length=500)
    viewport_width: int | None = Field(default=None, ge=240, le=10_000)
    viewport_height: int | None = Field(default=None, ge=240, le=10_000)
    occurred_at: datetime | None = None


class FeedbackReportRequest(BaseModel):
    category: Literal["bug", "data", "performance", "interface", "other"]
    message: str = Field(min_length=5, max_length=2000)
    route: str = Field(default="/", max_length=300)
    section: str | None = Field(default=None, max_length=80)
    universe: str | None = Field(default=None, max_length=40)
    request_id: str | None = Field(default=None, max_length=100)
    user_agent: str | None = Field(default=None, max_length=500)
    viewport_width: int | None = Field(default=None, ge=240, le=10_000)
    viewport_height: int | None = Field(default=None, ge=240, le=10_000)
    app_version: str | None = Field(default=None, max_length=40)
    consent_diagnostics: bool = True

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return " ".join(value.strip().split())


class FeedbackReportResponse(BaseModel):
    accepted: bool = True
    report_id: str
    received_at: datetime
    detail: str


class ReliabilityRequestSample(BaseModel):
    path: str
    method: str
    status_code: int
    duration_ms: float
    request_id: str
    occurred_at: datetime


class ReliabilitySnapshot(BaseModel):
    status: Literal["healthy", "degraded", "critical"]
    uptime_seconds: float
    total_requests: int
    total_4xx: int
    total_5xx: int
    total_exceptions: int
    error_rate_5xx: float
    average_duration_ms: float
    p95_duration_ms: float
    max_duration_ms: float
    slow_requests: int
    reports_received: int
    last_report_at: datetime | None = None
    upstream_metrics: dict[str, int | str | None]
    recent_errors: list[ReliabilityRequestSample]
    generated_at: datetime
