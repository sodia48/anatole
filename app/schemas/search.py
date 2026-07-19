from pydantic import BaseModel, Field


class SymbolSearchItem(BaseModel):
    symbol: str
    ticker: str
    name: str
    sector: str
    exchange: str = "TSX"
    universe: str = "tsx60"


class SymbolSearchResponse(BaseModel):
    query: str
    items: list[SymbolSearchItem]
    count: int = Field(ge=0)
