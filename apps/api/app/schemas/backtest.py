from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


StrategyId = Literal[
    "sma_crossover",
    "ema_crossover",
    "rsi_mean_reversion",
    "macd_crossover",
    "bollinger_breakout",
    "donchian_breakout",
    "anatole_script",
]


class BacktestRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=15)
    range: Literal[
        "1d", "5d", "1mo", "3mo", "6mo", "ytd", "1y", "2y", "5y", "10y"
    ] = "1y"
    interval: Literal[
        "1m", "2m", "5m", "15m", "30m", "1h", "4h", "1d", "1wk", "1mo"
    ] = "1d"
    strategy: StrategyId = "sma_crossover"
    strategy_parameters: dict[str, float | int | str] = Field(default_factory=dict)
    script: str | None = Field(default=None, max_length=8_000)
    initial_capital: float = Field(default=100_000, ge=100, le=100_000_000)
    position_size: float = Field(default=100, gt=0, le=100)
    commission: float = Field(default=0, ge=0, le=1_000)
    slippage: float = Field(
        default=0,
        ge=0,
        le=10,
        description="Slippage en pourcentage appliqué à chaque exécution.",
    )
    direction: Literal["long", "short", "both"] = "long"

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        return value.strip().upper().removesuffix(".TO")

    @field_validator("strategy_parameters")
    @classmethod
    def limit_parameters(
        cls,
        values: dict[str, float | int | str],
    ) -> dict[str, float | int | str]:
        if len(values) > 20:
            raise ValueError("Une stratégie accepte au plus 20 paramètres.")
        for key, value in values.items():
            if not key.strip() or len(key) > 40:
                raise ValueError("Nom de paramètre invalide.")
            if isinstance(value, str) and len(value) > 80:
                raise ValueError("Valeur de paramètre trop longue.")
        return values


class BacktestEquityPoint(BaseModel):
    time: int
    equity: float
    drawdown: float
    drawdown_percent: float


class BacktestTrade(BaseModel):
    side: Literal["long", "short"]
    entry_time: int
    entry_price: float
    exit_time: int
    exit_price: float
    quantity: float
    pnl: float
    pnl_percent: float
    commission: float
    slippage: float
    reason: str


class BacktestResult(BaseModel):
    ticker: str
    strategy: StrategyId
    interval: str
    initial_capital: float
    final_equity: float
    net_profit: float
    net_profit_percent: float
    cagr: float | None = None
    max_drawdown: float
    max_drawdown_percent: float
    win_rate: float
    trades_count: int
    winning_trades: int
    losing_trades: int
    profit_factor: float | None = None
    average_trade: float
    sharpe: float | None = None
    sortino: float | None = None
    exposure_percent: float
    equity_curve: list[BacktestEquityPoint]
    trades: list[BacktestTrade]
    execution_convention: str = (
        "Un signal fondé sur close[t] est exécuté au plus tôt à open[t+1]."
    )
    disclaimer: str = (
        "Outil d’analyse et de simulation; aucun résultat ne constitue une recommandation."
    )


class AnatoleScriptValidationRequest(BaseModel):
    source: str = Field(min_length=1, max_length=8_000)


class AnatoleScriptDiagnostic(BaseModel):
    line: int = Field(ge=1)
    column: int = Field(ge=1)
    message: str


class AnatoleScriptValidation(BaseModel):
    valid: bool
    name: str | None = None
    kind: Literal["indicator", "strategy"] | None = None
    statements_count: int = 0
    indicators_count: int = 0
    plots: list[str] = Field(default_factory=list)
    diagnostics: list[AnatoleScriptDiagnostic] = Field(default_factory=list)
