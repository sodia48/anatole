from datetime import datetime

from pydantic import BaseModel


class MarketTile(BaseModel):
    ticker: str
    symbol: str
    name: str
    sector: str
    weight: float
    price: float
    change: float
    change_percent: float
    volume: int
    timestamp: datetime
    source: str
    delayed: bool


class SectorSnapshot(BaseModel):
    sector: str
    weight: float
    change_percent: float
    advancers: int
    decliners: int
    unchanged: int


class MarketBreadth(BaseModel):
    advancers: int
    decliners: int
    unchanged: int
    advance_ratio: float


class CockpitSnapshot(BaseModel):
    universe: str
    universe_as_of: str
    universe_source: str
    weighted_change_percent: float
    breadth: MarketBreadth
    sectors: list[SectorSnapshot]
    constituents: list[MarketTile]
    top_gainers: list[MarketTile]
    top_losers: list[MarketTile]
    generated_at: datetime
    refresh_after_seconds: int = 15
