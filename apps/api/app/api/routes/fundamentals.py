from fastapi import APIRouter, Query

from app.schemas.fundamentals import (
    CompositeCoverageSnapshot,
    FundamentalSnapshot,
    IssuerDocumentDiagnostics,
    YahooStatementsDiagnostics,
)
from app.services.fundamentals import fundamentals_service
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
