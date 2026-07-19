from fastapi import APIRouter, Query

from app.schemas.stocks import FocusSnapshot, HistoryResponse, Quote, StockProfile, Technicals
from app.services.market_data import market_data_service

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


@router.get("/{ticker}/focus", response_model=FocusSnapshot)
async def focus(ticker: str, range_: str = Query("1y", alias="range"), interval: str = Query("1d")) -> FocusSnapshot:
    return await market_data_service.get_focus_snapshot(ticker, range_=range_, interval=interval)
