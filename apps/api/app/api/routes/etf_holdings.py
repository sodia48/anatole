from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.etf_holdings import (
    EtfHoldingsSnapshot,
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
