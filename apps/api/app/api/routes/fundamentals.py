from fastapi import APIRouter, HTTPException, Query

from app.schemas.fundamentals import (
    CompositeCoverageSnapshot,
    FundamentalSnapshot,
    IssuerDocumentDiagnostics,
    YahooStatementsDiagnostics,
)
from app.schemas.fundamental_intelligence import FundamentalDiagnostic, PeerComparison
from app.schemas.fundamental_scenarios import ScenarioRequest, ScenarioSimulation
from app.services.fundamentals import fundamentals_service
from app.services.fundamental_intelligence import build_fundamental_diagnostic
from app.services.fundamental_peers import peer_comparison
from app.services.fundamental_scenarios import simulate_financial_scenarios
from app.services.issuer_documents import (
    issuer_financial_documents_service,
)
from app.services.official_financials import (
    official_financials_service,
)
from app.services.yahoo_statements import (
    yahoo_statements_service,
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
    "/{ticker}/official-documents",
    response_model=IssuerDocumentDiagnostics,
    summary=(
        "Discover and parse official financial documents "
        "from the issuer website"
    ),
)
async def official_documents(
    ticker: str,
    website: str | None = Query(
        default=None,
        description=(
            "Optional official website override. Normally the "
            "website from the issuer profile is used."
        ),
    ),
    refresh: bool = Query(
        default=False,
        description="Ignore the six-hour issuer-document cache.",
    ),
) -> IssuerDocumentDiagnostics:
    if website is None:
        snapshot = await fundamentals_service.get_snapshot(
            ticker
        )
        website = snapshot.website

    return await (
        issuer_financial_documents_service
        .diagnostics(
            ticker,
            website,
            force_refresh=refresh,
        )
    )


@router.get(
    "/{ticker}/structured-statements",
    response_model=YahooStatementsDiagnostics,
    summary=(
        "Yahoo structured annual and quarterly "
        "financial statements"
    ),
)
async def structured_statements(
    ticker: str,
    refresh: bool = Query(
        default=False,
        description=(
            "Ignore the thirty-minute structured-statements cache."
        ),
    ),
) -> YahooStatementsDiagnostics:
    return await yahoo_statements_service.diagnostics(
        ticker,
        force_refresh=refresh,
    )


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


@router.get(
    "/{ticker}/fundamental-intelligence/diagnostic",
    response_model=FundamentalDiagnostic,
    summary="Source-aware, non-advisory financial diagnostic",
)
async def fundamental_diagnostic(ticker: str) -> FundamentalDiagnostic:
    snapshot = await fundamentals_service.get_snapshot(ticker)
    return build_fundamental_diagnostic(snapshot)


@router.get(
    "/{ticker}/fundamental-intelligence/peers",
    response_model=PeerComparison,
    summary="Comparable Canadian peers with sourced fundamental measures",
)
async def fundamental_peers(ticker: str, peers: str | None = Query(default=None, max_length=160)) -> PeerComparison:
    requested = None if peers is None else [item.strip() for item in peers.split(",") if item.strip()]
    try:
        return await peer_comparison(ticker, requested)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post(
    "/{ticker}/fundamental-intelligence/scenarios",
    response_model=ScenarioSimulation,
    summary="Explicit financial sensitivities and conditional DCF valuation",
)
async def fundamental_scenarios(ticker: str, request: ScenarioRequest) -> ScenarioSimulation:
    snapshot = await fundamentals_service.get_snapshot(ticker)
    try:
        return simulate_financial_scenarios(snapshot, request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
