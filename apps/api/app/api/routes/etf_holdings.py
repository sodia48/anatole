from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.etf_history import (
    EtfHistoryRange,
    EtfHistorySnapshot,
)
from app.schemas.etf_holdings import (
    EtfHoldingsSnapshot,
)
from app.services.etf_history import (
    etf_history_service,
)
from app.services.etf_holdings import (
    DEFAULT_HOLDING_LIMIT,
    MAX_HOLDING_LIMIT,
    etf_holdings_service,
)


router = APIRouter()


@router.get(
    "/{ticker}/holdings",
    response_model=EtfHoldingsSnapshot,
    summary=(
        "Principales positions, poids et contribution "
        "de séance d'un ETF"
    ),
)
async def etf_holdings(
    ticker: str,
    limit: int = Query(
        default=DEFAULT_HOLDING_LIMIT,
        ge=1,
        le=MAX_HOLDING_LIMIT,
    ),
    refresh: bool = Query(
        default=False,
        description=(
            "Ignore le cache de composition et de cotations."
        ),
    ),
) -> EtfHoldingsSnapshot:
    return await etf_holdings_service.snapshot(
        ticker,
        limit=limit,
        force_refresh=refresh,
    )


@router.get(
    "/{ticker}/history",
    response_model=EtfHistorySnapshot,
    summary=(
        "Progression historique d'un ETF pour une période sélectionnée"
    ),
)
async def etf_history(
    ticker: str,
    range: EtfHistoryRange = Query(  # noqa: A002
        default="1y",
        description=(
            "Période : 5d, 1mo, ytd, 6mo, 1y, 5y ou 10y."
        ),
    ),
    refresh: bool = Query(
        default=False,
        description="Ignore le cache de l'historique.",
    ),
) -> EtfHistorySnapshot:
    return await etf_history_service.snapshot(
        ticker,
        range,
        force_refresh=refresh,
    )
