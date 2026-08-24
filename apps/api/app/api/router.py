from fastapi import APIRouter

from app.api.routes import (
    accounts,
    admin,
    analysis,
    backtest,
    company_network,
    discovery,
    etf_holdings,
    fundamentals,
    health,
    institutions,
    ipo_insiders,
    market,
    notifications,
    paper_trading,
    provincial_macro,
    reliability,
    search,
    stocks,
    ws,
    workspace,
)


api_router = APIRouter()

# Santé de l'API
api_router.include_router(health.router)

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

# Screener, actualités, calendrier, répertoire ETF et psychologie
api_router.include_router(
    discovery.router,
    prefix="/api/v1/discovery",
    tags=["discovery"],
)

# Calendrier et fil macro strictement provinciaux. Les routes déclarent
# seulement leur suffixe afin de ne pas doubler le préfixe discovery.
api_router.include_router(
    provincial_macro.router,
    prefix="/api/v1/discovery",
    tags=["provincial-macro"],
)

# Participations et historique détaillé des ETF
api_router.include_router(
    etf_holdings.router,
    prefix="/api/v1/discovery/etfs",
    tags=["etf-holdings"],
)

# IPO et transactions d'initiés
api_router.include_router(
    ipo_insiders.router,
    prefix="/api/v1/discovery",
    tags=["ipo-insiders"],
)

# Réseau économique sourcé des entreprises Focus
api_router.include_router(
    company_network.router,
    prefix="/api/v1/discovery",
    tags=["company-network"],
)

# Grands gestionnaires institutionnels et positions SEC Form 13F
api_router.include_router(
    institutions.router,
    prefix="/api/v1/discovery",
    tags=["institutions"],
)


# Comparateur multi-actifs et Terminal Pro
api_router.include_router(
    analysis.router,
    prefix="/api/v1/analysis",
    tags=["analysis"],
)

# Backtests Focus Pro et validation Anatole Script
api_router.include_router(
    backtest.router,
    prefix="/api/v1/backtest",
    tags=["backtest"],
)


# Portefeuille, alertes, assistant et observabilité des données
api_router.include_router(
    workspace.router,
    prefix="/api/v1/workspace",
    tags=["workspace"],
)



# Comptes et synchronisation multiappareil
api_router.include_router(
    accounts.router,
    prefix="/api/v1/account",
    tags=["account"],
)

# Console privée de pilotage de la bêta
api_router.include_router(
    admin.router,
    prefix="/api/v1/admin",
    tags=["admin"],
)

# Centre de notifications et résumés programmés
api_router.include_router(
    notifications.router,
    prefix="/api/v1/notifications",
    tags=["notifications"],
)

# Compte de simulation Focus Pro; aucun courtier réel n’est activé
api_router.include_router(
    paper_trading.router,
    prefix="/api/v1/paper",
    tags=["paper-trading"],
)

# Observabilité, incidents clients et signalements bêta
api_router.include_router(
    reliability.router,
    prefix="/api/v1/reliability",
    tags=["reliability"],
)

# Flux de cotations WebSocket
api_router.include_router(
    ws.router,
    prefix="/ws/v1",
    tags=["websocket"],
)
