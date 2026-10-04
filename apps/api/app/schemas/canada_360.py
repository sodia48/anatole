from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Freshness = Literal["live", "fresh", "stale", "unavailable"]
SnapshotStatus = Literal["ok", "partial", "unavailable"]
SourceStatus = Literal["ok", "partial", "unavailable"]


class Canada360AssistantLink(BaseModel):
    label: str
    url: str
    level: Literal["federal", "provincial", "statistics"]
    agency: str | None = None
    jurisdiction: str | None = None
    updated_at: str | None = None


class Canada360AssistantProfile(BaseModel):
    age: int | None = Field(default=None, ge=13, le=120)
    family_status: Literal[
        "single",
        "married",
        "common_law",
        "divorced",
        "widowed",
    ] | None = None
    employment_status: Literal[
        "unemployed",
        "employed",
        "student",
        "self_employed",
    ] | None = None
    children: int | None = Field(default=None, ge=0, le=20)
    province: str | None = Field(
        default=None,
        pattern="^(QC|ON|BC|AB|SK|MB|NB|NS|PE|NL|YT|NT|NU)$",
    )
    objective: str | None = Field(default=None, max_length=80)


class Canada360AssistantTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=6000)
    links: list[Canada360AssistantLink] = Field(default_factory=list)
    source_line: str | None = Field(default=None, max_length=1000)
    feedback: Literal["up", "down"] | None = None


class Canada360AssistantConversation(BaseModel):
    conversation_id: str
    lang: Literal["fr", "en"] = "fr"
    jurisdiction: str = Field(
        default="CA",
        pattern="^(CA|QC|ON|BC|AB|SK|MB|NB|NS|PE|NL|YT|NT|NU)$",
    )
    topic: str = Field(default="services", max_length=40)
    profile: Canada360AssistantProfile = Field(
        default_factory=Canada360AssistantProfile
    )
    history: list[Canada360AssistantTurn] = Field(default_factory=list)


class Canada360AssistantRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    lang: Literal["fr", "en"] = "fr"
    jurisdiction: str = Field(
        default="CA",
        pattern="^(CA|QC|ON|BC|AB|SK|MB|NB|NS|PE|NL|YT|NT|NU)$",
    )
    mode: Literal["ask", "compare", "find"] = "ask"
    conversation_id: str | None = Field(
        default=None,
        pattern="^[0-9a-fA-F-]{36}$",
    )


class Canada360AssistantResponse(BaseModel):
    answer: str
    links: list[Canada360AssistantLink] = Field(default_factory=list)
    source_line: str | None = None
    mode: Literal["ask", "compare", "find"] = "ask"
    jurisdiction: str
    conversation_id: str = ""
    history: list[Canada360AssistantTurn] = Field(default_factory=list)
    profile: Canada360AssistantProfile = Field(
        default_factory=Canada360AssistantProfile
    )
    intent: Literal[
        "statistics",
        "services",
        "followup",
        "compare",
        "comparison",
        "explanation",
        "navigation",
        "compare_statistics",
        "explain_difference",
        "benefit_or_program",
        "eligibility",
        "procedure",
        "deadline",
        "amount",
        "government_document",
        "life_event",
        "business_support",
        "immigration",
        "tax",
        "health_admin",
        "local_resource",
    ] = "services"


class Canada360AssistantFeedbackRequest(BaseModel):
    conversation_id: str = Field(pattern="^[0-9a-fA-F-]{36}$")
    turn_index: int = Field(ge=0, le=15)
    rating: Literal["up", "down"]
    lang: Literal["fr", "en"] = "fr"
    jurisdiction: str = Field(
        default="CA",
        pattern="^(CA|QC|ON|BC|AB|SK|MB|NB|NS|PE|NL|YT|NT|NU)$",
    )


class Canada360MetricPoint(BaseModel):
    period: str
    value: float


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
    history: list[Canada360MetricPoint] = Field(default_factory=list)


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
