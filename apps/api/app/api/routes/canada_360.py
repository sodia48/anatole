from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.canada_360 import Canada360Snapshot
from app.schemas.province_series import ProvinceSeriesSnapshot
from app.services.canada_360 import canada_360_service
from app.services.province_series import province_series_service

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


@router.get("/provinces/{region}/series/{metric_key}",response_model=ProvinceSeriesSnapshot,summary="Historique provincial 5 ans et projections")
async def canada_province_series(region:str,metric_key:str,lang:str=Query("fr",pattern="^(fr|en)$")) -> ProvinceSeriesSnapshot:
    try:
        return await province_series_service.get(region,metric_key,lang)
    except ValueError as exc:
        if str(exc) in {"unknown_province","unknown_metric"}: raise HTTPException(status_code=404,detail=str(exc)) from exc
        raise HTTPException(status_code=503,detail=str(exc)) from exc
