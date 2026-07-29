from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PortfolioPositionInput(BaseModel):
    symbol: str
    quantity: float = Field(gt=0, le=1_000_000_000)
    average_cost: float = Field(ge=0, le=10_000_000)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        symbol = value.strip().upper().removesuffix(".TO")
        if not symbol or len(symbol) > 15:
            raise ValueError("Le symbole doit contenir de 1 à 15 caractères.")
        return symbol


class PortfolioAnalyzeRequest(BaseModel):
    positions: list[PortfolioPositionInput] = Field(min_length=1, max_length=30)
    base_currency: Literal["CAD", "USD"] = "CAD"
    benchmark: str = "^GSPTSE"

    @field_validator("positions")
    @classmethod
    def unique_positions(
        cls,
        values: list[PortfolioPositionInput],
    ) -> list[PortfolioPositionInput]:
        seen: set[str] = set()
        output: list[PortfolioPositionInput] = []
        for item in values:
            if item.symbol in seen:
                raise ValueError(
                    f"Le symbole {item.symbol} apparaît plusieurs fois."
                )
            seen.add(item.symbol)
            output.append(item)
        return output

    @field_validator("benchmark")
    @classmethod
    def normalize_benchmark(cls, value: str) -> str:
        return value.strip().upper() or "^GSPTSE"


class PortfolioPositionSnapshot(BaseModel):
    symbol: str
    ticker: str
    name: str
    sector: str
    currency: str
    quantity: float
    average_cost: float
    price: float
    fx_rate: float
    cost_basis: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float
    day_pnl: float
    day_change_percent: float
    weight_percent: float
    momentum_20d: float
    rsi_14: float | None = None
    trend: str
    score: float = Field(ge=0, le=100)
    source: str
    delayed: bool


class PortfolioAllocation(BaseModel):
    key: str
    label: str
    value: float
    weight_percent: float


class PortfolioPerformancePoint(BaseModel):
    time: int
    portfolio: float
    benchmark: float | None = None


class PortfolioContributor(BaseModel):
    symbol: str
    name: str
    value: float
    value_percent: float
    kind: Literal["day", "unrealized"]


class PortfolioRisk(BaseModel):
    volatility_percent: float | None = None
    beta: float | None = None
    max_drawdown_percent: float | None = None
    sharpe_ratio: float | None = None
    concentration_hhi: float
    top_position_percent: float
    top_three_percent: float
    diversification_score: float = Field(ge=0, le=100)
    risk_level: Literal["Faible", "Modéré", "Élevé", "Très élevé"]


class PortfolioSnapshot(BaseModel):
    base_currency: str
    benchmark: str
    benchmark_name: str
    total_market_value: float
    total_cost_basis: float
    total_unrealized_pnl: float
    total_unrealized_pnl_percent: float
    total_day_pnl: float
    total_day_change_percent: float
    portfolio_score: float = Field(ge=0, le=100)
    positions: list[PortfolioPositionSnapshot]
    sector_allocation: list[PortfolioAllocation]
    currency_allocation: list[PortfolioAllocation]
    performance: list[PortfolioPerformancePoint]
    risk: PortfolioRisk
    contributors: list[PortfolioContributor]
    detractors: list[PortfolioContributor]
    notes: list[str]
    generated_at: datetime
    refresh_after_seconds: int = 30


AlertMetric = Literal[
    "price",
    "change_percent",
    "rsi_14",
    "momentum_20d",
    "relative_volume",
    "score",
]
AlertOperator = Literal["above", "below"]


class AlertRule(BaseModel):
    id: str
    symbol: str
    metric: AlertMetric
    operator: AlertOperator
    threshold: float
    enabled: bool = True
    label: str | None = None

    @field_validator("id", "symbol")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("La valeur ne peut pas être vide.")
        return value.upper() if value != value.lower() else value


class AlertEvaluateRequest(BaseModel):
    rules: list[AlertRule] = Field(min_length=1, max_length=50)


class AlertEvaluation(BaseModel):
    id: str
    symbol: str
    name: str
    metric: AlertMetric
    metric_label: str
    operator: AlertOperator
    threshold: float
    current_value: float | None = None
    unit: str
    triggered: bool
    status: Literal["triggered", "monitoring", "unavailable", "disabled"]
    message: str
    source: str | None = None
    evaluated_at: datetime


class AlertSnapshot(BaseModel):
    items: list[AlertEvaluation]
    triggered_count: int
    monitored_count: int
    unavailable_count: int
    generated_at: datetime
    refresh_after_seconds: int = 30


GoalType = Literal["retirement", "home", "education", "reserve", "wealth", "flexible"]
AdvisorLevel = Literal["low", "medium", "high"]


class AdvisorProfile(BaseModel):
    currency: Literal["CAD", "USD"] = "CAD"
    goal_type: GoalType | None = None
    goal_name: str | None = Field(default=None, max_length=80)
    horizon_years: int | None = Field(default=None, ge=1, le=50)
    target_amount: float | None = Field(default=None, ge=0, le=1_000_000_000)
    current_savings: float | None = Field(default=None, ge=0, le=1_000_000_000)
    monthly_contribution: float | None = Field(default=None, ge=0, le=10_000_000)
    essential_monthly_expenses: float | None = Field(default=None, ge=0, le=10_000_000)
    liquid_reserve: float | None = Field(default=None, ge=0, le=1_000_000_000)
    high_interest_debt: bool | None = None
    income_stability: AdvisorLevel | None = None
    liquidity_need: AdvisorLevel | None = None
    loss_comfort: AdvisorLevel | None = None
    experience: Literal["beginner", "intermediate", "advanced"] | None = None

    @field_validator("goal_name")
    @classmethod
    def clean_goal_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = value.strip()
        return clean or None


class AdvisorProjection(BaseModel):
    key: str
    label: str
    annual_return_percent: float
    projected_value: float
    gap_to_target: float | None = None
    progress_percent: float | None = None


class AdvisorPriority(BaseModel):
    key: str
    level: Literal["low", "medium", "high"]
    title: str
    detail: str
    action: str


class AdvisorRiskDimension(BaseModel):
    key: str
    label: str
    value: str
    status: Literal["favorable", "balanced", "caution", "incomplete"]
    detail: str


class AdvisorStressTest(BaseModel):
    label: str
    shock_percent: float
    estimated_loss: float
    estimated_value: float
    detail: str


class AdvisorPlanRequest(BaseModel):
    profile: AdvisorProfile
    portfolio_positions: list[PortfolioPositionInput] = Field(default_factory=list, max_length=30)

    def to_portfolio_request(self) -> PortfolioAnalyzeRequest:
        return PortfolioAnalyzeRequest(
            positions=self.portfolio_positions,
            base_currency=self.profile.currency,
        )


class AdvisorPlan(BaseModel):
    title: str
    summary: str
    currency: str
    profile_completeness: int = Field(ge=0, le=100)
    readiness_score: float = Field(ge=0, le=100)
    capacity_profile: Literal["Prudente", "Équilibrée", "Dynamique"]
    capacity_score: int
    reserve_months: float | None = None
    portfolio_score: float | None = None
    portfolio_risk_level: str | None = None
    top_position_percent: float | None = None
    projections: list[AdvisorProjection] = Field(default_factory=list)
    priorities: list[AdvisorPriority] = Field(default_factory=list)
    risk_dimensions: list[AdvisorRiskDimension] = Field(default_factory=list)
    stress_tests: list[AdvisorStressTest] = Field(default_factory=list)
    boundaries: list[str] = Field(default_factory=list)
    generated_at: datetime


class AssistantFact(BaseModel):
    label: str
    value: str
    tone: Literal["positive", "negative", "neutral", "info"] = "neutral"


class AssistantLink(BaseModel):
    label: str
    href: str


class AssistantSource(BaseModel):
    label: str
    detail: str
    status: Literal["live", "delayed", "fallback", "internal"]


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1200)
    context_symbol: str | None = None
    portfolio_positions: list[PortfolioPositionInput] = Field(
        default_factory=list,
        max_length=30,
    )
    advisor_profile: AdvisorProfile | None = None


class AssistantResponse(BaseModel):
    intent: str
    title: str
    answer: str
    facts: list[AssistantFact] = Field(default_factory=list)
    links: list[AssistantLink] = Field(default_factory=list)
    sources: list[AssistantSource] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    confidence: Literal["élevée", "moyenne", "limitée"]
    disclaimer: str
    guardrail_triggered: bool = False
    plan: AdvisorPlan | None = None
    generated_at: datetime


class DataQualitySource(BaseModel):
    key: str
    label: str
    category: str
    status: Literal["healthy", "degraded", "stale", "unavailable", "idle"]
    coverage_percent: float = Field(ge=0, le=100)
    freshness_seconds: float | None = None
    item_count: int | None = None
    source: str
    detail: str


class DataQualityMetric(BaseModel):
    key: str
    label: str
    value: str
    status: Literal["healthy", "degraded", "critical", "neutral"]
    detail: str


class DataQualityEndpoint(BaseModel):
    path: str
    label: str
    status: Literal["available", "degraded", "not_warmed"]
    detail: str


class DataQualitySnapshot(BaseModel):
    overall_score: float = Field(ge=0, le=100)
    overall_status: Literal["Excellent", "Bon", "Dégradé", "Critique"]
    provider_mode: str
    uptime_seconds: float
    metrics: list[DataQualityMetric]
    sources: list[DataQualitySource]
    endpoints: list[DataQualityEndpoint]
    recommendations: list[str]
    generated_at: datetime
    refresh_after_seconds: int = 60
