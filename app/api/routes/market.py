from fastapi import APIRouter, HTTPException, Query

from app.schemas.market import CockpitSnapshot
from app.schemas.watchlist import WatchlistRequest, WatchlistSnapshot
from app.services.cockpit import cockpit_service
from app.services.watchlist import watchlist_service

router = APIRouter()


@router.get("/cockpit", response_model=CockpitSnapshot)
async def cockpit(universe: str = Query("tsx60")) -> CockpitSnapshot:
    if universe.lower() != "tsx60":
        raise HTTPException(status_code=400, detail="Only the tsx60 universe is available in v0.3")
    return await cockpit_service.get_tsx60()


@router.post("/watchlist", response_model=WatchlistSnapshot)
async def watchlist(request: WatchlistRequest) -> WatchlistSnapshot:
    return await watchlist_service.get_snapshot(request.tickers)
