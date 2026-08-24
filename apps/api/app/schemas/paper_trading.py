from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


PaperOrderType = Literal["market", "limit", "stop", "stop_limit"]
PaperOrderSide = Literal["buy", "sell"]
PaperOrderStatus = Literal["pending", "filled", "cancelled", "rejected"]


class PaperOrderRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=15)
    order_type: PaperOrderType = "market"
    side: PaperOrderSide
    quantity: float = Field(gt=0, le=1_000_000)
    limit_price: float | None = Field(default=None, gt=0, le=10_000_000)
    stop_price: float | None = Field(default=None, gt=0, le=10_000_000)

    @model_validator(mode="after")
    def validate_prices(self) -> "PaperOrderRequest":
        self.ticker = self.ticker.strip().upper().removesuffix(".TO")
        if self.order_type in {"limit", "stop_limit"} and self.limit_price is None:
            raise ValueError("Un prix limite est requis.")
        if self.order_type in {"stop", "stop_limit"} and self.stop_price is None:
            raise ValueError("Un prix stop est requis.")
        return self


class PaperOrderPreview(BaseModel):
    ticker: str
    side: PaperOrderSide
    order_type: PaperOrderType
    quantity: float
    estimated_price: float
    estimated_notional: float
    estimated_commission: float
    available_cash: float
    existing_position: float
    sufficient_cash: bool
    message: str


class PaperOrder(BaseModel):
    id: str
    ticker: str
    order_type: PaperOrderType
    side: PaperOrderSide
    quantity: float
    limit_price: float | None = None
    stop_price: float | None = None
    status: PaperOrderStatus
    submitted_market_time: datetime
    created_at: datetime
    activated_at: datetime | None = None
    filled_at: datetime | None = None
    filled_price: float | None = None
    cancelled_at: datetime | None = None
    rejection_reason: str | None = None


class PaperPosition(BaseModel):
    ticker: str
    quantity: float
    average_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float
    realized_pnl: float


class PaperTrade(BaseModel):
    id: str
    order_id: str
    ticker: str
    side: PaperOrderSide
    quantity: float
    price: float
    notional: float
    commission: float
    realized_pnl: float
    executed_at: datetime


class PaperAccount(BaseModel):
    currency: Literal["CAD"] = "CAD"
    initial_capital: float
    cash: float
    equity: float
    buying_power: float
    market_value: float
    total_return: float
    total_return_percent: float
    commission: float
    positions: list[PaperPosition] = Field(default_factory=list)
    orders: list[PaperOrder] = Field(default_factory=list)
    trades: list[PaperTrade] = Field(default_factory=list)
    updated_at: datetime
    paper: Literal[True] = True


class PaperResetRequest(BaseModel):
    confirmation: Literal["RESET PAPER"]
    initial_capital: float = Field(default=100_000, ge=1_000, le=100_000_000)
    commission: float = Field(default=0, ge=0, le=1_000)


class PaperAuditEvent(BaseModel):
    id: str
    action: str
    entity_id: str | None = None
    detail: str
    created_at: datetime
