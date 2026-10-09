"""Bounded, non-sensitive context and evidence for the global assistant."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.workspace import (
    AssistantResponse, PortfolioAttributionHorizon, PortfolioCorrelationCluster,
    PortfolioPositionInput, PortfolioRiskContributionSnapshot, PortfolioScenarioResult,
)


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


class PortfolioEvidencePosition(BaseModel):
    symbol: str
    name: str
    quantity: float
    average_cost: float
    price: float
    market_value: float
    weight_percent: float
    unrealized_pnl: float
    unrealized_pnl_percent: float | None = None
    day_change_percent: float
    sector: str
    currency: str
    base_currency: str
    source: str
    freshness: str


class PortfolioXRay(BaseModel):
    total_market_value: float | None = None
    total_cost_basis: float | None = None
    unrealized_pnl: float | None = None
    unrealized_pnl_percent: float | None = None
    day_pnl: float | None = None
    day_change_percent: float | None = None
    position_count: int = 0
    quote_coverage_percent: float = 0
    top_position_percent: float | None = None
    top_three_percent: float | None = None
    top_five_percent: float | None = None
    hhi: float | None = None
    effective_positions: float | None = None
    diversification_score: float | None = None
    sector_coverage_percent: float | None = None
    currency_coverage_percent: float | None = None
    history_coverage_percent: float | None = None
    etf_lookthrough_coverage_percent: float | None = None
    risk_contribution_coverage_percent: float | None = None
    attribution_coverage_percent: float | None = None
    correlation_coverage_percent: float | None = None
    stress_coverage_percent: float | None = None
    analysis_quality: Literal["élevée", "partielle", "limitée"] = "limitée"


class PortfolioLookThroughHolding(BaseModel):
    symbol: str
    direct_weight_percent: float = 0
    indirect_observed_weight_percent: float = 0
    combined_observed_weight_percent: float = 0
    source_etfs: list[str] = Field(default_factory=list)
    holdings_coverage_percent: float = 0
    source: str
    as_of: datetime | None = None


class PortfolioLookThroughOverlap(BaseModel):
    kind: Literal["direct_etf", "etf_etf"]
    symbol: str
    source_etfs: list[str]
    observed_weight_percent: float


class PortfolioLookThroughSummary(BaseModel):
    holdings: list[PortfolioLookThroughHolding] = Field(default_factory=list)
    overlaps: list[PortfolioLookThroughOverlap] = Field(default_factory=list)
    etf_count: int = 0
    holdings_coverage_percent: float = 0
    status: Literal["observed", "partial", "unavailable"] = "unavailable"
    sector_exposures_observed: dict[str, float] = Field(default_factory=dict)


class PortfolioConcentrationMap(BaseModel):
    direct_top_three_percent: float | None = None
    observed_economic_top: list[PortfolioLookThroughHolding] = Field(default_factory=list)
    sector_weights: dict[str, float] = Field(default_factory=dict)
    currency_weights: dict[str, float] = Field(default_factory=dict)
    top_cluster_weight_percent: float | None = None
    factor_exposures: dict[str, float] = Field(default_factory=dict)
    coverage: dict[str, float] = Field(default_factory=dict)


class PortfolioMacroExposure(BaseModel):
    factor: Literal["tsx", "wti", "cad_usd", "canada_10y"]
    weighted_sensitivity: float | None = None
    coverage_percent: float = 0
    source_freshness: str = "unknown"
    context_only: bool = False


class PortfolioWatchtowerAggregate(BaseModel):
    timestamp: datetime
    total_market_value: float | None = None
    top_position_weight_percent: float | None = None
    top_three_percent: float | None = None
    hhi: float | None = None
    effective_positions: float | None = None
    volatility_percent: float | None = None
    beta: float | None = None
    max_drawdown_percent: float | None = None
    sharpe_ratio: float | None = None
    diversification_score: float | None = None
    sector_coverage_percent: float | None = None
    top_known_sector: str | None = None
    top_currency: str | None = None
    average_correlation: float | None = None
    top_cluster_weight_percent: float | None = None
    top_risk_contributor: str | None = None
    benchmark_gap: dict[str, float] = Field(default_factory=dict)
    coverage_fingerprints: dict[str, float] = Field(default_factory=dict)


class PortfolioWatchtowerDelta(BaseModel):
    previous_at: datetime | None = None
    current_at: datetime
    elapsed_seconds: float | None = None
    changes: dict[str, float] = Field(default_factory=dict)
    previous_available: bool = False


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
    portfolio_focus: Literal["overview", "diversification", "risk_contribution", "attribution", "correlation", "stress", "macro", "watchtower", "news", "lookthrough"] | None = None
    entities: list[str] = Field(default_factory=list)
    facts: list[EvidenceFact] = Field(default_factory=list)
    metric_groups: dict[str, list[EvidenceFact]] = Field(default_factory=dict)
    sector_metrics: list[EvidenceFact] = Field(default_factory=list)
    position_rows: list[PortfolioEvidencePosition] = Field(default_factory=list)
    portfolio_xray: PortfolioXRay | None = None
    lookthrough: PortfolioLookThroughSummary | None = None
    concentration_map: PortfolioConcentrationMap | None = None
    risk_contributions: PortfolioRiskContributionSnapshot | None = None
    attribution: list[PortfolioAttributionHorizon] = Field(default_factory=list)
    correlation_clusters: list[PortfolioCorrelationCluster] = Field(default_factory=list)
    scenarios: list[PortfolioScenarioResult] = Field(default_factory=list)
    macro_exposures: list[PortfolioMacroExposure] = Field(default_factory=list)
    watchtower: PortfolioWatchtowerDelta | None = None
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
    synthesis_provider: str | None = None
    synthesis_model: str | None = None
    synthesis_mode: Literal["internal_evidence", "deterministic"] | None = None
    synthesis_validated: bool = False
