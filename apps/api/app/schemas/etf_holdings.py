from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class EtfHoldingDriver(BaseModel):
    rank: int = Field(ge=1)
    symbol: str
    display_symbol: str
    name: str
    instrument_type: Literal["equity", "etf", "other"] = "equity"
    weight_percent: float = Field(ge=0)
    price: float | None = None
    currency: str | None = None
    change_percent: float | None = None
    contribution_percent_points: float | None = None
    source: str = "Yahoo Finance public fund data"
    delayed: bool = True


class EtfSectorAllocation(BaseModel):
    key: str
    label: str
    weight_percent: float = Field(ge=0)


class EtfAssetAllocation(BaseModel):
    key: str
    label: str
    weight_percent: float = Field(ge=0)


class EtfHoldingsSnapshot(BaseModel):
    ticker: str
    normalized_symbol: str
    name: str
    provider: str
    category: str
    exposure: str
    description: str | None = None
    currency: str = "CAD"
    price: float | None = None
    change_percent: float | None = None
    holdings: list[EtfHoldingDriver] = Field(default_factory=list)
    sectors: list[EtfSectorAllocation] = Field(default_factory=list)
    asset_classes: list[EtfAssetAllocation] = Field(default_factory=list)
    top_holdings_weight_percent: float = 0
    net_driver_contribution_percent_points: float | None = None
    positive_driver_contribution_percent_points: float | None = None
    negative_driver_contribution_percent_points: float | None = None
    quoted_holdings: int = 0
    total_holdings_returned: int = 0
    status: Literal["available", "partial", "unavailable"]
    message: str | None = None
    source_name: str
    source_url: str | None = None
    generated_at: datetime
    refresh_after_seconds: int = 30
