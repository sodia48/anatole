from fastapi import APIRouter, HTTPException, Query

from app.schemas.market import CockpitSnapshot
from app.schemas.watchlist import WatchlistRequest, WatchlistSnapshot
from app.services.cockpit import cockpit_service
from app.services.watchlist import watchlist_service

router = APIRouter()


@router.get("/cockpit", response_model=CockpitSnapshot)
async def cockpit(universe: str = Query("tsx60")) -> CockpitSnapshot:
    normalized = universe.strip().lower().replace("_", "-")

    if normalized in {"tsx60", "tsx-60", "60"}:
        return await cockpit_service.get_tsx60()

    if normalized in {
        "composite",
        "tsx-composite",
        "tsxcomposite",
    }:
        return await cockpit_service.get_composite()

    raise HTTPException(
        status_code=400,
        detail="universe doit être 'tsx60' ou 'composite'",
    )


@router.post("/watchlist", response_model=WatchlistSnapshot)
async def watchlist(request: WatchlistRequest) -> WatchlistSnapshot:
    return await watchlist_service.get_snapshot(request.tickers)
