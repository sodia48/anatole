from fastapi import APIRouter

from app.api.routes import discovery, health, market, search, stocks, ws

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(stocks.router, prefix="/api/v1/stocks", tags=["stocks"])
api_router.include_router(market.router, prefix="/api/v1/market", tags=["market"])
api_router.include_router(search.router, prefix="/api/v1/search", tags=["search"])
api_router.include_router(discovery.router, prefix="/api/v1/discovery", tags=["discovery"])
api_router.include_router(ws.router, prefix="/ws/v1", tags=["websocket"])
