from fastapi import APIRouter

from app.api.routes import (
    discovery,
    fundamentals,
    health,
    market,
    search,
    stocks,
    ws,
)


api_router = APIRouter()

# Santé de l'API
api_router.include_router(
    health.router,
)

# Cotations, historiques, Focus et profils
api_router.include_router(
    stocks.router,
    prefix="/api/v1/stocks",
    tags=["stocks"],
)

# Fondamentaux, résultats et consensus analystes
api_router.include_router(
    fundamentals.router,
    prefix="/api/v1/stocks",
    tags=["fundamentals"],
)

# Cockpit TSX 60 et watchlist
api_router.include_router(
    market.router,
    prefix="/api/v1/market",
    tags=["market"],
)

# Recherche de symboles
api_router.include_router(
    search.router,
    prefix="/api/v1/search",
    tags=["search"],
)

# Screener, actualités, calendrier, ETF et psychologie
api_router.include_router(
    discovery.router,
    prefix="/api/v1/discovery",
    tags=["discovery"],
)

# Flux de cotations WebSocket
api_router.include_router(
    ws.router,
    prefix="/ws/v1",
    tags=["websocket"],
)
