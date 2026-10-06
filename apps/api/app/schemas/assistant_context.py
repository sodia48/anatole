"""Bounded, non-sensitive context and evidence for the global assistant."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.workspace import AssistantResponse, PortfolioPositionInput


Surface = Literal["stock", "etf", "portfolio", "market", "news", "canada360", "compare", "other"]
Skill = Literal["stock_analysis", "etf_analysis", "portfolio_analysis", "market_analysis", "compare", "news_context", "canada360", "data_quality", "guardrail"]
SYMBOL_RE = re.compile(r"^[A-Z^][A-Z0-9.^-]{0,14}$")
ROUTE_RE = re.compile(r"^/(?:focus/[A-Za-z0-9.^-]{1,15}|etf(?:/[A-Za-z0-9.^-]{1,15})?|portefeuille|comparateur|actualites|canada|terminal|screener|assistant|qualite)?$")
CONTEXT_ROUTE_RE = re.compile(r"^/(?:[A-Za-z0-9^][A-Za-z0-9.^-]{0,29}(?:/[A-Za-z0-9^][A-Za-z0-9.^-]{0,29}){0,3})?$")


class PortfolioScope(BaseModel):
    authorized: bool = False
    position_count: int = Field(default=0, ge=0, le=30)


class AssistantContext(BaseModel):
    surface: Surface = "other"
    route: str = Field(default="", max_length=100)
    symbol: str | None = None
    symbols: list[str] = Field(default_factory=list, max_length=5)
    instrument_type: Literal["stock", "etf", "index", "unknown"] = "unknown"
    portfolio_scope: PortfolioScope = Field(default_factory=PortfolioScope)
    language: Literal["fr", "en"] = "fr"
    as_of: datetime | None = None
    metadata: dict[str, str] = Field(default_factory=dict, max_length=4)

    @field_validator("symbol", mode="before")
    @classmethod
    def valid_symbol(cls, value: object) -> str | None:
        if value is None or value == "":
            return None
        clean = str(value).strip().upper().removesuffix(".TO")
        if not SYMBOL_RE.fullmatch(clean):
            raise ValueError("Invalid context symbol")
        return clean

    @field_validator("symbols", mode="before")
    @classmethod
    def valid_symbols(cls, value: object) -> list[str]:
        if not isinstance(value, list) or len(value) > 5:
            raise ValueError("Invalid context symbols")
        result: list[str] = []
        for raw in value:
            clean = str(raw).strip().upper().removesuffix(".TO")
            if not SYMBOL_RE.fullmatch(clean):
                raise ValueError("Invalid context symbol")
            if clean not in result:
                result.append(clean)
        return result

    @field_validator("route")
    @classmethod
    def valid_route(cls, value: str) -> str:
        if value and not CONTEXT_ROUTE_RE.fullmatch(value):
            raise ValueError("Invalid context route")
        return value

    @field_validator("metadata")
    @classmethod
    def limited_metadata(cls, value: dict[str, str]) -> dict[str, str]:
        allowed = {"selected_metric", "sector", "region", "view"}
        if any(key not in allowed or len(item) > 60 for key, item in value.items()):
            raise ValueError("Invalid context metadata")
        return value


class EvidenceFact(BaseModel):
    label: str
    value: str
    source: str
    timestamp: datetime | None = None
    freshness: Literal["live", "delayed", "stale", "fallback", "internal", "unknown"] = "unknown"
    provider: str | None = None
    confidence: Literal["high", "medium", "low"] = "medium"


class EvidenceSource(BaseModel):
    label: str
    type: str
    freshness: str
    timestamp: datetime | None = None
    url: str | None = None


class NavigationAction(BaseModel):
    label: str
    href: str
    kind: Literal["navigate"] = "navigate"

    @field_validator("href")
    @classmethod
    def internal_href(cls, value: str) -> str:
        path, _, query = value.partition("?")
        if (not ROUTE_RE.fullmatch(path) or len(query) > 100
                or (query and (path != "/comparateur" or not re.fullmatch(r"symbols=[A-Z0-9.^-]{1,15}(?:,[A-Z0-9.^-]{1,15}){0,4}", query)))):
            raise ValueError("Navigation action must be an allowlisted internal route")
        if any(path.startswith(prefix) and not SYMBOL_RE.fullmatch(path.removeprefix(prefix))
               for prefix in ("/focus/", "/etf/")):
            raise ValueError("Navigation action has an invalid symbol")
        if query and any(not SYMBOL_RE.fullmatch(symbol) for symbol in query.removeprefix("symbols=").split(",")):
            raise ValueError("Navigation action has an invalid comparison symbol")
        return value


class AnatoleEvidenceBundle(BaseModel):
    skill: Skill
    entities: list[str] = Field(default_factory=list)
    facts: list[EvidenceFact] = Field(default_factory=list)
    metric_groups: dict[str, list[EvidenceFact]] = Field(default_factory=dict)
    sector_metrics: list[EvidenceFact] = Field(default_factory=list)
    time_series_summary: str | None = None
    sources: list[EvidenceSource] = Field(default_factory=list)
    freshness: str = "unknown"
    missing_data: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    navigation_actions: list[NavigationAction] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class UnifiedAssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1200)
    context: AssistantContext = Field(default_factory=AssistantContext)
    conversation_id: UUID | None = None
    government_conversation_id: UUID | None = None
    portfolio_consent: bool = False
    portfolio_positions: list[PortfolioPositionInput] = Field(default_factory=list, max_length=30)

    @field_validator("portfolio_positions")
    @classmethod
    def bounded_portfolio_symbols(cls, value: list[PortfolioPositionInput]) -> list[PortfolioPositionInput]:
        if any(not SYMBOL_RE.fullmatch(item.symbol) for item in value):
            raise ValueError("Invalid portfolio symbol")
        return value


class UnifiedAssistantResponse(AssistantResponse):
    context: AssistantContext = Field(default_factory=AssistantContext)
    conversation_id: UUID | None = None
    actions: list[NavigationAction] = Field(default_factory=list)
    evidence: list[AnatoleEvidenceBundle] = Field(default_factory=list)
    permission_required: bool = False
    government_feedback: dict[str, str | int] | None = None
    government_profile: dict[str, str | int | None] | None = None
