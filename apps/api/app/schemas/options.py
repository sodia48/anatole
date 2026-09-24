from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


OptionMarket = Literal["tsx", "commodities"]
OptionSide = Literal["call", "put"]


class OptionSourceStatus(BaseModel):
    source: str
    status: Literal["available", "partial", "unavailable"]
    detail: str | None = None


class OptionUniverseItem(BaseModel):
    symbol: str
    name: str
    market: OptionMarket
    category: str
    exchange: str
    provider_symbol: str
    source_url: str | None = None


class OptionUniverseSnapshot(BaseModel):
    market: Literal["tsx", "commodities", "all"]
    items: list[OptionUniverseItem]
    source_statuses: list[OptionSourceStatus]
    generated_at: datetime
    refresh_after_seconds: int = 21_600


class OptionContract(BaseModel):
    symbol: str
    underlying: str
    market: OptionMarket
    contract: str | None = None
    side: OptionSide
    strike: float
    expiration: str
    exchange: str
    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    change: float | None = None
    percent_change: float | None = None
    volume: int | None = None
    open_interest: int | None = None
    implied_volatility: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None
    in_the_money: bool | None = None
    source: str
    delayed: bool = True


class OptionAnalytics(BaseModel):
    contract_count: int = 0
    call_count: int = 0
    put_count: int = 0
    call_volume: int = 0
    put_volume: int = 0
    call_open_interest: int = 0
    put_open_interest: int = 0
    put_call_volume_ratio: float | None = None
    put_call_open_interest_ratio: float | None = None
    atm_implied_volatility: float | None = None
    max_pain_estimate: float | None = None


class OptionChainSnapshot(BaseModel):
    market: OptionMarket
    symbol: str
    provider_symbol: str
    name: str
    category: str
    exchange: str
    underlying_price: float | None = None
    requested_expiration: str | None = None
    expirations: list[str] = Field(default_factory=list)
    contracts: list[OptionContract] = Field(default_factory=list)
    analytics: OptionAnalytics = Field(default_factory=OptionAnalytics)
    source_statuses: list[OptionSourceStatus] = Field(default_factory=list)
    generated_at: datetime
    refresh_after_seconds: int = 30
    stale: bool = False