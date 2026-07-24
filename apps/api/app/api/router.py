from fastapi import APIRouter

from app.api.routes import (
    discovery,
    etf_holdings,
    fundamentals,
    health,
    ipo_insiders,
    market,
    search,
    stocks,
    ws,
)


api_router = APIRouter()

api_router.include_router(
    health.router,
)

api_router.include_router(
    stocks.router,
    prefix="/api/v1/stocks",
    tags=["stocks"],
)

api_router.include_router(
    fundamentals.router,
    prefix="/api/v1/stocks",
    tags=["fundamentals"],
)

api_router.include_router(
    market.router,
    prefix="/api/v1/market",
    tags=["market"],
)

api_router.include_router(
    search.router,
    prefix="/api/v1/search",
    tags=["search"],
)

api_router.include_router(
    discovery.router,
    prefix="/api/v1/discovery",
    tags=["discovery"],
)

api_router.include_router(
    etf_holdings.router,
    prefix="/api/v1/discovery/etfs",
    tags=["ETF holdings"],
)

api_router.include_router(
    ipo_insiders.router,
    prefix="/api/v1/discovery",
    tags=["IPO & insiders"],
)

api_router.include_router(
    ws.router,
    prefix="/ws/v1",
    tags=["websocket"],
)
