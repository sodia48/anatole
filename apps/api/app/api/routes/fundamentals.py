from fastapi import APIRouter

from app.schemas.fundamentals import FundamentalSnapshot
from app.services.fundamentals import fundamentals_service


router = APIRouter()


@router.get(
    "/{ticker}/fundamentals",
    response_model=FundamentalSnapshot,
    summary="Fundamentals, annual results and analyst consensus",
)
async def fundamentals(ticker: str) -> FundamentalSnapshot:
    return await fundamentals_service.get_snapshot(ticker)
