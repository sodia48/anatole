from fastapi import APIRouter

from app.schemas.fundamentals import (
    CompositeCoverageSnapshot,
    FundamentalSnapshot,
)
from app.services.fundamentals import fundamentals_service
from app.services.official_financials import (
    official_financials_service,
)


router = APIRouter()


@router.get(
    "/official-financials/coverage",
    response_model=CompositeCoverageSnapshot,
    summary=(
        "Official financial-data coverage for the "
        "S&P/TSX Composite operating universe"
    ),
)
async def official_financials_coverage(
) -> CompositeCoverageSnapshot:
    return await official_financials_service.coverage()


@router.get(
    "/{ticker}/fundamentals",
    response_model=FundamentalSnapshot,
    summary=(
        "Fundamentals, official financial statements "
        "and analyst consensus"
    ),
)
async def fundamentals(
    ticker: str,
) -> FundamentalSnapshot:
    return await fundamentals_service.get_snapshot(ticker)
