from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.institutions import (
    InstitutionDetail,
    InstitutionFlow,
    InstitutionSecuritySearch,
    InstitutionsSnapshot,
)
from app.services.institutions import (
    InstitutionsUnavailable,
    institution_service,
)


router = APIRouter()


@router.get(
    "/institutions",
    response_model=InstitutionsSnapshot,
    summary="Principaux gestionnaires institutionnels suivis via Form 13F",
)
async def institutions_directory(
    limit: int = Query(default=50, ge=1, le=50),
    refresh: bool = Query(default=False),
) -> InstitutionsSnapshot:
    try:
        return await institution_service.institutions_snapshot(
            limit=limit,
            force_refresh=refresh,
        )
    except InstitutionsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/institutions/security/holdings",
    response_model=InstitutionSecuritySearch,
    summary="Positions 13F indexées par CUSIP ou symbole vérifié",
)
async def institution_security_holdings(
    q: str = Query(min_length=1, max_length=80),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> InstitutionSecuritySearch:
    try:
        return await institution_service.search_holdings(q, limit=limit, offset=offset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InstitutionsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/institutions/security/activity",
    response_model=InstitutionFlow,
    summary="Activité 13F agrégée pour un titre ou un CUSIP",
)
async def institution_security_activity(
    q: str = Query(min_length=1, max_length=80),
) -> InstitutionFlow:
    try:
        return await institution_service.ticker_institution_activity(q)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InstitutionsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/institutions/{cik}",
    response_model=InstitutionDetail,
    summary="Positions détaillées d’un gestionnaire selon deux Form 13F",
)
async def institution_detail(
    cik: str,
    refresh: bool = Query(default=False),
) -> InstitutionDetail:
    try:
        return await institution_service.institution_detail(
            cik,
            force_refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InstitutionsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
