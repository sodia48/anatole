from fastapi import APIRouter, HTTPException, Query

from app.schemas.options import OptionChainSnapshot, OptionUniverseSnapshot
from app.services.options import options_service


router = APIRouter()


@router.get("/universe", response_model=OptionUniverseSnapshot)
async def option_universe(
    market: str = Query("tsx"),
) -> OptionUniverseSnapshot:
    try:
        return await options_service.universe(market)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/chain", response_model=OptionChainSnapshot)
async def option_chain(
    market: str = Query("tsx"),
    symbol: str = Query(..., min_length=1, max_length=16),
    expiration: str | None = Query(None),
    contract: str | None = Query(None),
) -> OptionChainSnapshot:
    try:
        return await options_service.chain(
            market=market,
            symbol=symbol,
            expiration=expiration,
            contract=contract,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error