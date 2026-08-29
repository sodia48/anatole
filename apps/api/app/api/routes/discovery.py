from fastapi import APIRouter, HTTPException, Query

from app.schemas.discovery import (
    CalendarSnapshot,
    EarningsCalendarSnapshot,
    EtfDirectorySnapshot,
    NewsSnapshot,
    PsychologySnapshot,
    ScreenerSnapshot,
)
from app.services.calendar import calendar_service
from app.services.earnings_calendar import earnings_calendar_service
from app.services.etf import etf_service
from app.services.news import news_service
from app.services.psychology import psychology_service
from app.services.screener import screener_service

router = APIRouter()


@router.get("/screener", response_model=ScreenerSnapshot)
async def screener(
    universe: str = Query("composite"),
) -> ScreenerSnapshot:
    try:
        return await screener_service.get_snapshot(
            universe
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Univers invalide. Utilise "
                "'composite' ou 'tsx60'."
            ),
        ) from exc


@router.get("/news", response_model=NewsSnapshot)
async def news(
    lang: str = Query(
        "fr",
        pattern="^(fr|en)$",
    ),
) -> NewsSnapshot:
    return await news_service.get_snapshot(
        lang
    )


@router.get("/calendar", response_model=CalendarSnapshot)
async def calendar(
    lang: str = Query(
        "fr",
        pattern="^(fr|en)$",
    ),
) -> CalendarSnapshot:
    return await calendar_service.get_snapshot(
        lang
    )


@router.get(
    "/earnings-calendar",
    response_model=EarningsCalendarSnapshot,
)
async def earnings_calendar(
    universe: str = Query("composite"),
) -> EarningsCalendarSnapshot:
    try:
        return await earnings_calendar_service.get_snapshot(universe)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Univers invalide. Utilise 'composite' ou 'tsx60'."
            ),
        ) from exc


@router.get("/etfs", response_model=EtfDirectorySnapshot)
async def etfs() -> EtfDirectorySnapshot:
    return await etf_service.get_directory()


@router.get("/psychology", response_model=PsychologySnapshot)
async def psychology() -> PsychologySnapshot:
    return await psychology_service.get_snapshot()
