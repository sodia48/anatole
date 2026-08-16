from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.provincial_statistics import ProvincialStatisticsSnapshot
from app.services.provincial_statistics import provincial_statistics_service


router = APIRouter()


@router.get(
    "/provincial-statistics",
    response_model=ProvincialStatisticsSnapshot,
)
async def provincial_statistics(
    region: str = Query(
        "all",
        description="Code ou nom d'une province; 'all' retourne les 10 provinces.",
    ),
    lang: str = Query(
        "fr",
        pattern="^(fr|en)$",
    ),
    refresh: bool = Query(
        False,
        description="Ignore le cache de 30 minutes pour un diagnostic manuel.",
    ),
) -> ProvincialStatisticsSnapshot:
    return await provincial_statistics_service.get_snapshot(
        region=region,
        lang=lang,
        force=refresh,
    )
