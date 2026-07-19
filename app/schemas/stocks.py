from datetime import datetime

from pydantic import BaseModel, Field


class Quote(BaseModel):
    ticker: str
    symbol: str
    name: str
    exchange: str
    currency: str
    price: float
    previous_close: float
    change: float
    change_percent: float
    day_high: float
    day_low: float
    volume: int
    timestamp: datetime
    source: str
    delayed: bool = True


class Candle(BaseModel):
    time: int = Field(description="Unix timestamp in seconds")
    open: float
    high: float
    low: float
    close: float
    volume: int


class HistoryResponse(BaseModel):
    ticker: str
    range: str
    interval: str
    candles: list[Candle]


class Technicals(BaseModel):
    rsi_14: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    sma_20: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    support: float | None = None
    resistance: float | None = None
    trend: str = "Indéterminée"


class StockProfile(BaseModel):
    ticker: str
    name: str
    exchange: str
    currency: str
    sector: str | None = None
    industry: str | None = None
    market_cap: int | None = None
    website: str | None = None
    description: str | None = None


class FocusSnapshot(BaseModel):
    quote: Quote
    history: list[Candle]
    technicals: Technicals
    profile: StockProfile
    generated_at: datetime
