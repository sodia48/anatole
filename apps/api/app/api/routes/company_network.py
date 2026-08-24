from fastapi import APIRouter, Query

from app.schemas.company_network import (
    CompanyNetworkEvidenceResponse,
    CompanyNetworkSnapshot,
    CompanyRelationshipPath,
)
from app.services.company_network import company_network_service


router = APIRouter()


@router.get("/company-network/path", response_model=CompanyRelationshipPath)
async def company_relationship_path(
    from_ticker: str = Query(min_length=1, max_length=20),
    to_ticker: str = Query(min_length=1, max_length=20),
    max_depth: int = Query(default=3, ge=1, le=3),
    include_secondary: bool = True,
) -> CompanyRelationshipPath:
    return await company_network_service.path(
        from_ticker,
        to_ticker,
        max_depth=max_depth,
        include_secondary=include_secondary,
    )


@router.get("/company-network/{ticker}/evidence", response_model=CompanyNetworkEvidenceResponse)
async def company_network_evidence(
    ticker: str,
    include_secondary: bool = True,
) -> CompanyNetworkEvidenceResponse:
    return await company_network_service.evidence(
        ticker,
        include_secondary=include_secondary,
    )


@router.get("/company-network/{ticker}", response_model=CompanyNetworkSnapshot)
async def company_network(
    ticker: str,
    depth: int = Query(default=1, ge=1, le=2),
    refresh: bool = False,
    include_secondary: bool = True,
) -> CompanyNetworkSnapshot:
    return await company_network_service.get_snapshot(
        ticker,
        depth=depth,
        refresh=refresh,
        include_secondary=include_secondary,
    )
