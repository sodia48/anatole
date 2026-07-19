from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.stocks import Quote


class WatchlistRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=30)


class WatchlistSummary(BaseModel):
    advancers: int
    decliners: int
    unchanged: int
    average_change_percent: float


class WatchlistSnapshot(BaseModel):
    tickers: list[str]
    items: list[Quote]
    summary: WatchlistSummary
    generated_at: datetime
    refresh_after_seconds: int = 20
