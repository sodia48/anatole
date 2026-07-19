from datetime import datetime
from pydantic import BaseModel, Field


class ScreenerRow(BaseModel):
    ticker: str
    symbol: str
    name: str
    sector: str
    price: float
    change_percent: float
    volume: int
    average_volume_20d: int
    relative_volume: float
    momentum_20d: float
    rsi_14: float | None = None
    sma_20: float | None = None
    sma_50: float | None = None
    trend: str
    score: float = Field(ge=0, le=100)
    signal: str
    source: str
    delayed: bool


class ScreenerSnapshot(BaseModel):
    universe: str
    items: list[ScreenerRow]
    sectors: list[str]
    generated_at: datetime
    refresh_after_seconds: int = 45
    live_items: int = 0
    fallback_items: int = 0


class FeedStatus(BaseModel):
    source: str
    status: str
    detail: str | None = None


class NewsItem(BaseModel):
    id: str
    title: str
    summary: str
    url: str
    source: str
    category: str
    published_at: datetime
    sentiment: str
    sentiment_score: float = Field(ge=-100, le=100)


class NewsSnapshot(BaseModel):
    items: list[NewsItem]
    source_statuses: list[FeedStatus]
    generated_at: datetime
    refresh_after_seconds: int = 900


class EconomicEvent(BaseModel):
    id: str
    title: str
    country: str = "Canada"
    currency: str = "CAD"
    category: str
    importance: str
    starts_at: datetime
    source: str
    url: str | None = None
    description: str | None = None


class CalendarSnapshot(BaseModel):
    events: list[EconomicEvent]
    source_statuses: list[FeedStatus]
    generated_at: datetime
    refresh_after_seconds: int = 1800


class EtfDirectoryItem(BaseModel):
    ticker: str
    symbol: str
    name: str
    provider: str
    category: str
    exposure: str
    currency: str = "CAD"
    price: float
    change_percent: float
    volume: int
    source: str
    delayed: bool


class EtfDirectorySnapshot(BaseModel):
    items: list[EtfDirectoryItem]
    categories: list[str]
    generated_at: datetime
    refresh_after_seconds: int = 45


class PsychologyComponent(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0, le=100)
    description: str


class PsychologySnapshot(BaseModel):
    score: float = Field(ge=0, le=100)
    label: str
    change_20d: float
    change_50d: float
    volatility_20d: float
    advance_ratio: float
    components: list[PsychologyComponent]
    generated_at: datetime
    refresh_after_seconds: int = 45
    source: str
