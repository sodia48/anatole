from fastapi import APIRouter

from app.api.routes import fundamentals, health, stocks, ws


api_router = APIRouter()

api_router.include_router(health.router)
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
    ws.router,
    prefix="/ws/v1",
    tags=["websocket"],
)
