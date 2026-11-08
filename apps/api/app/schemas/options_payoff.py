"""Explicit inputs and outputs for the experimental single-expiry payoff."""
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt

FinitePrice = Annotated[Decimal, Field(allow_inf_nan=False, max_digits=18, decimal_places=6)]
PositiveCount = Annotated[StrictInt, Field(ge=1, le=10_000)]


class PayoffLegInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str = Field(min_length=1, max_length=80)
    market: Literal["equity", "futures"]
    underlying: str = Field(min_length=1, max_length=80)
    currency: str = Field(min_length=3, max_length=3)
    expiry: datetime
    side: Literal["call", "put"]
    direction: Literal["long", "short"]
    strike: FinitePrice
    premium: FinitePrice
    quantity: PositiveCount
    multiplier: FinitePrice
    price_source: str = Field(min_length=1, max_length=120)
    premium_style: Literal["upfront", "futures_style"]


class PayoffUnderlyingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    market: Literal["equity", "futures"]
    underlying: str = Field(min_length=1, max_length=80)
    currency: str = Field(min_length=3, max_length=3)
    units: FinitePrice
    entry_price: FinitePrice
    price_source: str = Field(min_length=1, max_length=120)


class PayoffRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    legs: list[PayoffLegInput] = Field(min_length=1, max_length=20)
    underlying: PayoffUnderlyingInput | None = None
    domain_min: FinitePrice | None
    domain_max: FinitePrice | None
    prices: list[FinitePrice] = Field(min_length=1, max_length=201)


class PayoffPoint(BaseModel):
    price: Decimal
    profit_loss: Decimal


class BreakEvenResult(BaseModel):
    lower: Decimal | None
    upper: Decimal | None


class PayoffResponse(BaseModel):
    currency: str
    expiry: datetime
    domain_min: Decimal | None
    domain_max: Decimal | None
    points: list[PayoffPoint]
    theoretical_debit: Decimal | None
    minimum_profit_loss: Decimal | None
    maximum_profit_loss: Decimal | None
    loss_unbounded: bool
    gain_unbounded: bool
    break_evens: list[BreakEvenResult]
    limitations: list[str]
