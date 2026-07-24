from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


IpoInstrumentType = Literal["company", "etf", "cdr", "fund", "other"]


class IpoItem(BaseModel):
    id: str
    event_date: datetime | None = None
    company: str
    symbol: str = ""
    symbols: list[str] = Field(default_factory=list)
    exchange: str = ""
    country: Literal["Canada", "États-Unis"]
    event_type: str
    status: Literal[
        "Cotée", "Dossier déposé", "À venir",
        "Reportée", "Retirée", "À confirmer",
    ]
    instrument_type: IpoInstrumentType
    instrument_label: str
    source_name: str
    source_url: str
    official: bool = True
    confidence_score: int = Field(ge=0, le=100)
    focus_available: bool = False


class IpoSourceStatus(BaseModel):
    source: str
    status: Literal["available", "partial", "unavailable"]
    count: int = Field(ge=0)
    detail: str | None = None
    url: str


class IpoSummary(BaseModel):
    total: int = Field(ge=0)
    canada: int = Field(ge=0)
    united_states: int = Field(ge=0)
    companies: int = Field(ge=0)
    newly_listed: int = Field(ge=0)
    regulatory_filings: int = Field(ge=0)


class IpoSnapshot(BaseModel):
    items: list[IpoItem] = Field(default_factory=list)
    summary: IpoSummary
    sources: list[IpoSourceStatus] = Field(default_factory=list)
    generated_at: datetime
    refresh_after_seconds: int = 1800
    message: str | None = None


InsiderTransactionType = Literal[
    "buy", "sell", "grant", "exercise", "tax", "other",
]


class InsiderTrade(BaseModel):
    id: str
    ticker: str
    company: str
    market: Literal["Canada", "États-Unis"]
    insider_name: str
    role: str = ""
    transaction_type: InsiderTransactionType
    transaction_label: str
    transaction_code: str = ""
    trade_date: date | None = None
    filing_date: date | None = None
    shares: float | None = None
    price: float | None = None
    value: float | None = None
    holdings_after: float | None = None
    ownership: str = ""
    unusual: bool = False
    source_name: str
    source_url: str
    official_verification_url: str
    official_source: bool = False


class InsiderSummary(BaseModel):
    transactions: int = Field(ge=0)
    companies: int = Field(ge=0)
    buys: int = Field(ge=0)
    sells: int = Field(ge=0)
    grants_and_exercises: int = Field(ge=0)
    buy_value: float = 0
    sell_value: float = 0
    net_value: float = 0
    buy_ratio_percent: float = Field(ge=0, le=100)
    unusual_transactions: int = Field(ge=0)


class InsiderSourceStatus(BaseModel):
    source: str
    status: Literal["available", "partial", "unavailable"]
    count: int = Field(ge=0)
    detail: str | None = None
    url: str


class InsiderSnapshot(BaseModel):
    trades: list[InsiderTrade] = Field(default_factory=list)
    summary: InsiderSummary
    sources: list[InsiderSourceStatus] = Field(default_factory=list)
    market: Literal["Canada", "États-Unis"]
    requested_ticker: str | None = None
    scanned_symbols: int = Field(ge=0)
    generated_at: datetime
    refresh_after_seconds: int = 900
    message: str | None = None
