from typing import Literal

from fastapi import APIRouter, Query

from app.schemas.stocks import (
    FocusSnapshot,
    HistoryResponse,
    Quote,
    StockNewsSnapshot,
    StockProfile,
    Technicals,
)
from app.services.market_data import market_data_service
from app.services.stock_news import stock_news_service

router = APIRouter()


@router.get("/{ticker}/quote", response_model=Quote)
async def quote(ticker: str) -> Quote:
    return await market_data_service.get_quote(ticker)


@router.get("/{ticker}/history", response_model=HistoryResponse)
async def history(
    ticker: str,
    range_: str = Query("1y", alias="range"),
    interval: str = Query("1d"),
) -> HistoryResponse:
    candles = await market_data_service.get_history(ticker, range_=range_, interval=interval)
    return HistoryResponse(ticker=market_data_service.normalize_ticker(ticker), range=range_, interval=interval, candles=candles)


@router.get("/{ticker}/technicals", response_model=Technicals)
async def technicals(ticker: str, range_: str = Query("1y", alias="range"), interval: str = Query("1d")) -> Technicals:
    candles = await market_data_service.get_history(ticker, range_=range_, interval=interval)
    return market_data_service.calculate_technicals(candles)


@router.get("/{ticker}/profile", response_model=StockProfile)
async def profile(ticker: str) -> StockProfile:
    return await market_data_service.get_profile(ticker)


@router.get("/{ticker}/news", response_model=StockNewsSnapshot)
async def stock_news(
    ticker: str,
    company: str | None = Query(None, min_length=1, max_length=160),
    lang: str = Query("fr", pattern="^(fr|en)$"),
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(72, ge=1, le=72),
    relevance: Literal["all", "direct", "sector", "market", "official"] = Query("all"),
) -> StockNewsSnapshot:
    snapshot = await stock_news_service.get_snapshot(
        ticker,
        company=company,
        language=lang,
    )
    items = [item for item in snapshot.items if relevance == "all" or
             (item.origin == "company_release" if relevance == "official" else item.relevance == relevance)]
    start = (page - 1) * page_size
    return snapshot.model_copy(update={
        "items": items[start:start + page_size],
        "total_items": len(items),
        "page": page,
        "page_size": page_size,
        "has_more": start + page_size < len(items),
    })


@router.get("/{ticker}/focus", response_model=FocusSnapshot)
async def focus(ticker: str, range_: str = Query("1y", alias="range"), interval: str = Query("1d")) -> FocusSnapshot:
    return await market_data_service.get_focus_snapshot(ticker, range_=range_, interval=interval)
