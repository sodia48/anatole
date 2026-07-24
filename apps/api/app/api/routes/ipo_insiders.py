from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from app.schemas.ipo_insiders import (
    InsiderSnapshot,
    IpoSnapshot,
)
from app.services.insiders import insider_service
from app.services.ipo import ipo_service, summarize_ipo


router = APIRouter()


@router.get(
    "/ipo",
    response_model=IpoSnapshot,
    summary="Nouvelles inscriptions canadiennes et dépôts IPO américains",
)
async def ipo_directory(
    country: Literal["all", "canada", "us"] = Query(default="all"),
    instrument: Literal[
        "all", "company", "etf", "cdr", "fund", "other",
    ] = Query(default="all"),
    limit: int = Query(default=180, ge=1, le=300),
    refresh: bool = Query(default=False),
) -> IpoSnapshot:
    snapshot = await ipo_service.snapshot(force_refresh=refresh)
    items = snapshot.items
    if country == "canada":
        items = [item for item in items if item.country == "Canada"]
    elif country == "us":
        items = [item for item in items if item.country == "États-Unis"]
    if instrument != "all":
        items = [
            item for item in items
            if item.instrument_type == instrument
        ]
    items = items[:limit]
    return snapshot.model_copy(
        update={
            "items": items,
            "summary": summarize_ipo(items),
        }
    )


@router.get(
    "/insiders",
    response_model=InsiderSnapshot,
    summary="Radar des transactions d’initiés canadiennes et américaines",
)
async def insider_directory(
    market: Literal["canada", "us"] = Query(default="canada"),
    ticker: str | None = Query(default=None),
    days: int = Query(default=180, ge=7, le=730),
    scan_limit: int = Query(default=16, ge=1, le=40),
    limit: int = Query(default=160, ge=1, le=300),
    refresh: bool = Query(default=False),
) -> InsiderSnapshot:
    return await insider_service.snapshot(
        market=market,
        ticker=ticker,
        days=days,
        scan_limit=scan_limit,
        result_limit=limit,
        force_refresh=refresh,
    )
