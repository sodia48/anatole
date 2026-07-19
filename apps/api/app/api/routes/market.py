from fastapi import APIRouter, Query

from app.schemas.market import CockpitSnapshot
from app.services.cockpit import cockpit_service

router = APIRouter()


@router.get("/cockpit", response_model=CockpitSnapshot)
async def cockpit(universe: str = Query("tsx60")) -> CockpitSnapshot:
    if universe.lower() != "tsx60":
        # The Composite endpoint is intentionally introduced in a later milestone.
        # For now the API remains explicit instead of silently returning a different universe.
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Only the tsx60 universe is available in v0.2")
    return await cockpit_service.get_tsx60()
