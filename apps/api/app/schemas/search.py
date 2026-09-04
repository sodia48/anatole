from pydantic import BaseModel, Field


class SymbolSearchItem(BaseModel):
    symbol: str
    ticker: str
    name: str
    sector: str
    exchange: str = "TSX"
    universe: str = "tsx60"
    instrument_type: str = "stock"
    provider: str | None = None
    exposure: str | None = None


class SymbolSearchResponse(BaseModel):
    query: str
    items: list[SymbolSearchItem]
    count: int = Field(ge=0)
