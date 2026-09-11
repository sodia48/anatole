from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.canada_360 import Canada360Snapshot
from app.services.canada_360 import canada_360_service

router = APIRouter()


@router.get(
    "/overview",
    response_model=Canada360Snapshot,
    summary="Vue Canada 360 — économie et marchés",
)
async def canada_overview(
    lang: str = Query("fr", pattern="^(fr|en)$"),
    refresh: bool = Query(False),
) -> Canada360Snapshot:
    return await canada_360_service.get_snapshot(lang=lang, force=refresh)
