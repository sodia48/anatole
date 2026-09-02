from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ComparisonRange = Literal[
    "1mo",
    "3mo",
    "6mo",
    "ytd",
    "1y",
    "3y",
    "5y",
]


class CompareRequest(BaseModel):
    symbols: list[str] = Field(min_length=2, max_length=5)
    range: ComparisonRange = "1y"
    benchmark: str = "^GSPTSE"

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, values: list[str]) -> list[str]:
        output: list[str] = []
        seen: set[str] = set()
        for value in values:
            symbol = value.strip().upper().removesuffix(".TO")
            if not symbol or symbol in seen:
                continue
            if len(symbol) > 15:
                raise ValueError("Chaque symbole doit contenir au plus 15 caractères.")
            seen.add(symbol)
            output.append(symbol)
        if len(output) < 2:
            raise ValueError("Sélectionne au moins deux symboles distincts.")
        return output

    @field_validator("benchmark")
    @classmethod
    def normalize_benchmark(cls, value: str) -> str:
        symbol = value.strip().upper()
        return symbol or "^GSPTSE"


class ComparisonPoint(BaseModel):
    time: int
    value: float


class ComparisonSeries(BaseModel):
    symbol: str
    name: str
    points: list[ComparisonPoint]


class ComparisonInstrument(BaseModel):
    ticker: str
    symbol: str
    name: str
    sector: str
    instrument_type: Literal["action", "etf", "indice", "autre"]
    currency: str
    price: float
    change_percent: float
    total_return_percent: float
    annualized_return_percent: float | None = None
    volatility_percent: float | None = None
    beta: float | None = None
    max_drawdown_percent: float | None = None
    sharpe_ratio: float | None = None
    momentum_20d: float
    rsi_14: float | None = None
    relative_volume: float
    trend: str
    market_cap: float | None = None
    trailing_pe: float | None = None
    forward_pe: float | None = None
    price_to_book: float | None = None
    dividend_yield_percent: float | None = None
    score: float = Field(ge=0, le=100)
    rank: int = Field(ge=1)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    source: str
    delayed: bool


class CorrelationMatrix(BaseModel):
    symbols: list[str]
    values: list[list[float | None]]


class ComparisonSnapshot(BaseModel):
    range: ComparisonRange
    range_label: str
    benchmark: str
    benchmark_name: str
    instruments: list[ComparisonInstrument]
    series: list[ComparisonSeries]
    correlation: CorrelationMatrix
    risk_free_rate_percent: float
    methodology: str
    generated_at: datetime
    refresh_after_seconds: int = 300


class TerminalComponent(BaseModel):
    key: str
    label: str
    score: float | None = Field(default=None, ge=0, le=100)
    value: str
    description: str


class TerminalSector(BaseModel):
    sector: str
    change_percent: float
    momentum_20d: float | None = None
    average_score: float | None = None
    relative_volume: float | None = None
    advancers: int
    decliners: int
    leadership_score: float | None = Field(default=None, ge=0, le=100)
    state: Literal[
        "Leadership",
        "Accumulation",
        "Neutre",
        "Distribution",
        "Faiblesse",
        "N/D",
    ]


class TerminalOpportunity(BaseModel):
    symbol: str
    name: str
    sector: str
    price: float
    change_percent: float
    momentum_20d: float
    rsi_14: float | None = None
    relative_volume: float
    score: float
    signal: str
    opportunity_type: str
    reasons: list[str]


class TerminalRadarItem(TerminalOpportunity):
    volume: int
    average_volume_20d: int
    sma_20: float | None = None
    sma_50: float | None = None
    trend: str
    source: str
    delayed: bool
    anomaly_types: list[str] = Field(default_factory=list)


class TerminalAlert(BaseModel):
    id: str
    severity: Literal["info", "watch", "high"]
    category: str
    symbol: str | None = None
    title: str
    detail: str


class TerminalDataQuality(BaseModel):
    expected_symbols: int = Field(ge=0)
    real_symbols: int = Field(ge=0)
    unavailable_symbols: list[str] = Field(default_factory=list)
    coverage_percent: float = Field(ge=0, le=100)
    history_symbols: int = Field(ge=0)
    history_coverage_percent: float = Field(ge=0, le=100)
    warnings: list[str] = Field(default_factory=list)
    source_statuses: dict[str, str] = Field(default_factory=dict)


class TerminalRegimeHorizon(BaseModel):
    key: Literal["session", "5d", "20d", "3m"]
    label: str
    regime: Literal["Haussier", "Constructif", "Neutre", "Fragile", "Baissier"] | None
    score: float | None = Field(default=None, ge=0, le=100)
    risk_level: Literal["Faible", "Modéré", "Élevé", "Critique"] | None
    change_percent: float | None = None
    breadth_percent: float | None = Field(default=None, ge=0, le=100)
    above_sma20_percent: float | None = Field(default=None, ge=0, le=100)
    above_sma50_percent: float | None = Field(default=None, ge=0, le=100)
    average_momentum_percent: float | None = None
    coverage_percent: float = Field(ge=0, le=100)
    as_of: datetime


class TerminalRegimeHistoryPoint(BaseModel):
    timestamp: int
    regime_score: float | None = Field(default=None, ge=0, le=100)
    regime: Literal["Haussier", "Constructif", "Neutre", "Fragile", "Baissier"] | None
    benchmark_value: float | None = None
    breadth_percent: float | None = Field(default=None, ge=0, le=100)
    coverage_percent: float = Field(ge=0, le=100)


class TerminalBreadthPoint(BaseModel):
    timestamp: int
    value: int


class TerminalBreadthDivergence(BaseModel):
    active: bool
    severity: Literal["info", "watch", "high"]
    title: str
    explanation: str


class TerminalBreadthPro(BaseModel):
    advancers: int | None = Field(default=None, ge=0)
    decliners: int | None = Field(default=None, ge=0)
    unchanged: int | None = Field(default=None, ge=0)
    advance_ratio: float | None = Field(default=None, ge=0, le=100)
    above_sma20_percent: float | None = Field(default=None, ge=0, le=100)
    above_sma50_percent: float | None = Field(default=None, ge=0, le=100)
    above_sma200_percent: float | None = Field(default=None, ge=0, le=100)
    new_highs_52w: int | None = Field(default=None, ge=0)
    new_lows_52w: int | None = Field(default=None, ge=0)
    high_low_52w_eligible_symbols: int = Field(default=0, ge=0)
    high_low_52w_coverage_percent: float = Field(default=0, ge=0, le=100)
    up_volume: int | None = Field(default=None, ge=0)
    down_volume: int | None = Field(default=None, ge=0)
    neutral_volume: int | None = Field(default=None, ge=0)
    up_volume_ratio_percent: float | None = Field(default=None, ge=0, le=100)
    equal_weight_change_percent: float | None = None
    cap_weight_change_percent: float | None = None
    concentration_spread_percent_points: float | None = None
    positive_sectors: int | None = Field(default=None, ge=0)
    negative_sectors: int | None = Field(default=None, ge=0)
    positive_sectors_percent: float | None = Field(default=None, ge=0, le=100)
    advance_decline_line: list[TerminalBreadthPoint] = Field(default_factory=list)
    coverage_percent: float = Field(ge=0, le=100)
    divergence: TerminalBreadthDivergence


class TerminalSectorRotation(BaseModel):
    sector: str
    momentum_20d: float | None = None
    relative_strength_20d: float | None = None
    breadth_percent: float | None = Field(default=None, ge=0, le=100)
    average_score: float | None = Field(default=None, ge=0, le=100)
    relative_volume: float | None = None
    member_count: int = Field(ge=0)
    x: float | None = None
    y: float | None = None
    previous_x: float | None = None
    previous_y: float | None = None
    quadrant: Literal["LEADERSHIP", "AMÉLIORATION", "AFFAIBLISSEMENT", "SOUS PRESSION", "N/D"]
    state: str
    leadership_score: float | None = Field(default=None, ge=0, le=100)


class TerminalAnomaly(BaseModel):
    id: str
    symbol: str | None = None
    sector: str | None = None
    type: Literal["volume_spike", "gap", "momentum_acceleration", "rsi_extreme", "sma_cross", "price_volume_divergence", "sector_dislocation", "score_shift"]
    severity: Literal["info", "watch", "high"]
    direction: Literal["positive", "negative", "neutral"]
    rarity_score: float = Field(ge=0, le=100)
    z_score: float | None = None
    observed_value: float | None = None
    baseline_value: float | None = None
    unit: str
    title: str
    detail: str
    reasons: list[str] = Field(default_factory=list)
    source: str
    generated_at: datetime


class TerminalMarketDriver(BaseModel):
    key: str
    label: str
    category: str
    value: float | None = None
    unit: str
    change_1d: float | None = None
    change_5d: float | None = None
    change_20d: float | None = None
    change_unit: str
    correlation_60d_to_tsx: float | None = Field(default=None, ge=-1, le=1)
    relationship_label: str | None = None
    status: Literal["available", "stale", "unavailable"]
    source_name: str
    source_url: str
    delayed: bool
    as_of: datetime | None = None


class TerminalMethodologySection(BaseModel):
    key: str
    title: str
    description: str


class TerminalSnapshot(BaseModel):
    universe: str
    regime: Literal[
        "Haussier",
        "Constructif",
        "Neutre",
        "Fragile",
        "Baissier",
    ] | None
    regime_score: float | None = Field(default=None, ge=0, le=100)
    risk_level: Literal["Faible", "Modéré", "Élevé", "Critique"] | None
    weighted_change_percent: float | None
    advance_ratio: float | None
    average_anatole_score: float | None
    average_momentum_20d: float | None
    above_sma20_percent: float | None
    above_sma50_percent: float | None
    high_relative_volume_count: int | None
    components: list[TerminalComponent]
    sectors: list[TerminalSector]
    opportunities: list[TerminalOpportunity]
    alerts: list[TerminalAlert]
    leaders: list[TerminalOpportunity]
    laggards: list[TerminalOpportunity]
    data_quality: TerminalDataQuality
    regime_horizons: list[TerminalRegimeHorizon] = Field(default_factory=list)
    regime_history: list[TerminalRegimeHistoryPoint] = Field(default_factory=list)
    breadth_pro: TerminalBreadthPro
    sector_rotation: list[TerminalSectorRotation] = Field(default_factory=list)
    anomalies: list[TerminalAnomaly] = Field(default_factory=list)
    market_drivers: list[TerminalMarketDriver] = Field(default_factory=list)
    radar_items: list[TerminalRadarItem] = Field(default_factory=list)
    methodology_sections: list[TerminalMethodologySection] = Field(default_factory=list)
    methodology: str
    generated_at: datetime
    refresh_after_seconds: int = 60
