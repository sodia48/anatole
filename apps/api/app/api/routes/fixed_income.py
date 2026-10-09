"""Official Canadian fixed-income data with explicit market-data gaps."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.schemas.fixed_income import (
    CanadaYieldCurveSnapshot, CanadaYieldHistory, FixedIncomeDataQuality,
    FixedIncomeIssuesResponse, MunicipalDebtProfile, ProvincialDebtProfile,
)
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.municipal_debt_sources import MUNICIPALITIES, municipal_debt_service
from app.services.provincial_debt_sources import PROVINCES, provincial_profile


router = APIRouter()


@router.get("/canada/curve", response_model=CanadaYieldCurveSnapshot)
async def canada_curve() -> CanadaYieldCurveSnapshot:
    return await bank_of_canada_valet_service.curve()


@router.get("/canada/history", response_model=CanadaYieldHistory)
async def canada_history(period: Literal["1D", "1W", "1M", "3M", "1Y", "5Y", "10Y"] = "1M") -> CanadaYieldHistory:
    return await bank_of_canada_valet_service.history(period)


@router.get("/provinces", response_model=list[ProvincialDebtProfile])
async def provinces() -> list[ProvincialDebtProfile]:
    return [row for row in await asyncio.gather(*(provincial_profile(code) for code in PROVINCES)) if row]


@router.get("/provinces/{code}", response_model=ProvincialDebtProfile)
async def province(code: str) -> ProvincialDebtProfile:
    result = await provincial_profile(code)
    if result is None:
        raise HTTPException(404, "Unknown province or territory")
    return result


@router.get("/municipalities", response_model=list[MunicipalDebtProfile])
async def municipalities() -> list[MunicipalDebtProfile]:
    return [row for row in await asyncio.gather(*(municipal_debt_service.profile(slug) for slug in MUNICIPALITIES)) if row]


@router.get("/municipalities/{slug}", response_model=MunicipalDebtProfile)
async def municipality(slug: str) -> MunicipalDebtProfile:
    result = await municipal_debt_service.profile(slug.lower())
    if result is None:
        raise HTTPException(404, "Unknown municipality")
    return result


@router.get("/issues", response_model=FixedIncomeIssuesResponse)
async def issues(
    province: str | None = Query(default=None, max_length=2),
    city: str | None = Query(default=None, max_length=40),
    maturity_year: int | None = Query(default=None, ge=1900, le=2200),
    currency: str | None = Query(default=None, max_length=3),
    bond_type: str | None = Query(default=None, max_length=30, alias="type"),
    query: str | None = Query(default=None, max_length=80),
) -> FixedIncomeIssuesResponse:
    toronto = await municipal_debt_service.profile("toronto")
    rows = toronto.recent_issues if toronto else []
    rows = [row for row in rows if
            (not province or row.jurisdiction == province.upper()) and
            (not city or row.city and city.casefold() in row.city.casefold()) and
            (not maturity_year or row.maturity_date and row.maturity_date.year == maturity_year) and
            (not currency or row.currency == currency.upper()) and
            (not bond_type or row.bond_type == bond_type) and
            (not query or query.casefold() in " ".join(filter(None, [row.city, str(row.maturity_date.year) if row.maturity_date else None, row.cusip])).casefold())]
    now = datetime.now(UTC)
    return FixedIncomeIssuesResponse(
        issues=rows,
        quality=FixedIncomeDataQuality(
            scope="municipal_issues", status="partial" if toronto and toronto.recent_issues else "unavailable",
            source=toronto.quality.source if toronto else None,
            observed_at=toronto.quality.observed_at if toronto else None,
            freshness="delayed" if toronto and toronto.recent_issues else "unavailable",
            coverage=f"{len(rows)} matched of {len(toronto.recent_issues) if toronto else 0} official Toronto issues; secondary yields unavailable as of {now.date()}",
        ),
    )
