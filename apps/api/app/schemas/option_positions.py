from __future__ import annotations

from datetime import date, datetime
from math import isfinite
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AccountOptionPosition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    symbol: str = Field(min_length=1, max_length=160)
    underlying: str = Field(min_length=1, max_length=80)
    market: Literal["tsx", "commodities"]
    contract: str | None = Field(max_length=80)
    side: Literal["call", "put"]
    strike: float
    expiration: date
    expiry_at: datetime
    direction: Literal["long", "short"]
    quantity: int = Field(strict=True, ge=1, le=10000)
    multiplier: float = Field(gt=0, le=1000000)
    premium: float = Field(ge=0, le=1000000)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    reminder_days: int = Field(strict=True, ge=0, le=30)

    @field_validator("strike", "multiplier", "premium")
    @classmethod
    def finite_numbers(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("Valeur numérique non finie.")
        return value

    @model_validator(mode="after")
    def check_contract(self) -> AccountOptionPosition:
        if self.expiry_at.tzinfo is None or self.expiry_at.utcoffset() is None or self.expiry_at.date() != self.expiration:
            raise ValueError("L'échéance avec fuseau doit correspondre à la date du contrat.")
        if self.market == "commodities" and not self.contract:
            raise ValueError("Le contrat de matières premières est requis.")
        if self.currency == "XXX":
            raise ValueError("Devise invalide.")
        return self


class AccountOptionPositions(BaseModel):
    revision: int = Field(ge=0)
    positions: list[AccountOptionPosition] = Field(default_factory=list, max_length=100)


class AccountOptionPositionsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_account_id: UUID
    expected_revision: int = Field(strict=True, ge=0)
    positions: list[AccountOptionPosition] = Field(max_length=100)

    @field_validator("positions")
    @classmethod
    def unique_ids(cls, positions: list[AccountOptionPosition]) -> list[AccountOptionPosition]:
        if len({item.id for item in positions}) != len(positions):
            raise ValueError("Identifiants de positions dupliqués.")
        return positions
