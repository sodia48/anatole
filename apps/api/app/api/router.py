from fastapi import APIRouter

from app.api.routes import health, market, stocks, ws

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(stocks.router, prefix="/api/v1/stocks", tags=["stocks"])
api_router.include_router(market.router, prefix="/api/v1/market", tags=["market"])
api_router.include_router(ws.router, prefix="/ws/v1", tags=["websocket"])
