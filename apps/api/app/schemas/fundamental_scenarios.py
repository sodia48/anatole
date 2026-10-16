"""Explicit assumptions and outputs for illustrative, non-advisory sensitivities."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ScenarioAssumptions(BaseModel):
    key: Literal["prudent", "central", "optimistic"]
    revenue_change_percent: float = Field(ge=-80, le=200)
    operating_margin_change_points: float = Field(default=0, ge=-20, le=20)
    financing_cost_change_percent: float = Field(default=0, ge=-100, le=300)
    incremental_cost_inflation_percent: float = Field(default=0, ge=0, le=20)
    capex_change_percent: float = Field(default=0, ge=-80, le=300)
    working_capital_use_percent_revenue: float = Field(default=0, ge=-20, le=20)
    commodity_price_change_percent: float | None = Field(default=None, ge=-80, le=200)
    commodity_revenue_exposure_percent: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def commodity_inputs_are_paired(self) -> ScenarioAssumptions:
        if (self.commodity_price_change_percent is None) != (self.commodity_revenue_exposure_percent is None):
            raise ValueError("Commodity price and revenue exposure must be provided together")
        return self


class DCFSettings(BaseModel):
    discount_rate_percent: float = Field(gt=0, le=30)
    terminal_growth_percent: float = Field(ge=-5, le=8)
    forecast_fcf_growth_percent: float = Field(ge=-20, le=25)

    @model_validator(mode="after")
    def discount_exceeds_growth(self) -> DCFSettings:
        if self.discount_rate_percent - self.terminal_growth_percent < 2:
            raise ValueError("Discount rate must exceed terminal growth by at least two points")
        return self


class ScenarioRequest(BaseModel):
    scenarios: list[ScenarioAssumptions] = Field(min_length=3, max_length=3)
    dcf: DCFSettings | None = None

    @model_validator(mode="after")
    def exact_three_scenarios(self) -> ScenarioRequest:
        if {item.key for item in self.scenarios} != {"prudent", "central", "optimistic"}:
            raise ValueError("Provide prudent, central and optimistic scenarios exactly once")
        return self


class ScenarioValue(BaseModel):
    value: float | None = None
    unit: Literal["money", "percent", "ratio"]
    status: Literal["calculated", "unavailable"]
    formula: str
    missing_inputs: list[str] = Field(default_factory=list)


class DCFSensitivity(BaseModel):
    discount_rate_percent: float
    terminal_growth_percent: float
    per_share: float


class DCFResult(BaseModel):
    status: Literal["calculated", "unavailable"]
    reason: str | None = None
    settings: DCFSettings | None = None
    projected_fcf: list[float] = Field(default_factory=list)
    enterprise_value: float | None = None
    net_debt: float | None = None
    equity_value: float | None = None
    shares_outstanding: float | None = None
    per_share: float | None = None
    sensitivity: list[DCFSensitivity] = Field(default_factory=list)
    formula: str = "Five-year FCF discounted at r; terminal = FCF5 × (1+g)/(r-g); equity = enterprise value − net debt."


class ScenarioOutcome(BaseModel):
    key: Literal["prudent", "central", "optimistic"]
    assumptions: ScenarioAssumptions
    revenue: ScenarioValue
    operating_income: ScenarioValue
    net_income: ScenarioValue
    operating_cash_flow: ScenarioValue
    free_cash_flow: ScenarioValue
    operating_margin: ScenarioValue
    free_cash_flow_margin: ScenarioValue
    dcf: DCFResult


class ScenarioSimulation(BaseModel):
    ticker: str
    sector_family: str
    baseline_period_end: datetime | None = None
    currency: str | None = None
    baseline_source: str | None = None
    baseline_source_url: str | None = None
    baseline_filed_at: datetime | None = None
    baseline_stale: bool = False
    status: Literal["available", "partial", "unavailable"]
    outcomes: list[ScenarioOutcome]
    limitations_fr: list[str]
    limitations_en: list[str]
