from fastapi import APIRouter

from app.schemas.analysis import CompareRequest, ComparisonSnapshot, TerminalSnapshot
from app.services.analysis import analysis_service


router = APIRouter()


@router.post(
    "/compare",
    response_model=ComparisonSnapshot,
    summary="Compare two to five stocks or ETFs",
)
async def compare(request: CompareRequest) -> ComparisonSnapshot:
    return await analysis_service.compare(request)


@router.get(
    "/terminal",
    response_model=TerminalSnapshot,
    summary="TSX 60 professional market regime and opportunity radar",
)
async def terminal() -> TerminalSnapshot:
    return await analysis_service.terminal()
