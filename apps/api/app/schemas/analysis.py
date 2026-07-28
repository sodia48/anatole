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
    score: float = Field(ge=0, le=100)
    value: str
    description: str


class TerminalSector(BaseModel):
    sector: str
    change_percent: float
    momentum_20d: float
    average_score: float
    relative_volume: float
    advancers: int
    decliners: int
    leadership_score: float = Field(ge=0, le=100)
    state: Literal[
        "Leadership",
        "Accumulation",
        "Neutre",
        "Distribution",
        "Faiblesse",
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


class TerminalAlert(BaseModel):
    id: str
    severity: Literal["info", "watch", "high"]
    category: str
    symbol: str | None = None
    title: str
    detail: str


class TerminalSnapshot(BaseModel):
    universe: str
    regime: Literal[
        "Haussier",
        "Constructif",
        "Neutre",
        "Fragile",
        "Baissier",
    ]
    regime_score: float = Field(ge=0, le=100)
    risk_level: Literal["Faible", "Modéré", "Élevé", "Critique"]
    weighted_change_percent: float
    advance_ratio: float
    average_anatole_score: float
    average_momentum_20d: float
    above_sma20_percent: float
    above_sma50_percent: float
    high_relative_volume_count: int
    components: list[TerminalComponent]
    sectors: list[TerminalSector]
    opportunities: list[TerminalOpportunity]
    alerts: list[TerminalAlert]
    leaders: list[TerminalOpportunity]
    laggards: list[TerminalOpportunity]
    methodology: str
    generated_at: datetime
    refresh_after_seconds: int = 60
