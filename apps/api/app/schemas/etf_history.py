from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


EtfHistoryRange = Literal[
    "5d",
    "1mo",
    "ytd",
    "6mo",
    "1y",
    "5y",
    "10y",
]


class EtfHistoryPoint(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int = Field(ge=0)


class EtfHistorySnapshot(BaseModel):
    ticker: str
    normalized_symbol: str
    range: EtfHistoryRange
    range_label: str
    currency: str = "CAD"
    interval: str
    points: list[EtfHistoryPoint] = Field(default_factory=list)
    first_close: float | None = None
    last_close: float | None = None
    change: float | None = None
    change_percent: float | None = None
    period_high: float | None = None
    period_low: float | None = None
    status: Literal["available", "unavailable"]
    message: str | None = None
    delayed: bool = True
    source_name: str
    source_url: str | None = None
    generated_at: datetime
    refresh_after_seconds: int
