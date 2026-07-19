from fastapi import APIRouter, Query

from app.schemas.search import SymbolSearchResponse
from app.services.search import symbol_search_service

router = APIRouter()


@router.get("/symbols", response_model=SymbolSearchResponse)
async def search_symbols(
    q: str = Query("", max_length=80),
    limit: int = Query(8, ge=1, le=20),
) -> SymbolSearchResponse:
    return symbol_search_service.search(q, limit)
