from fastapi import APIRouter, HTTPException, Query

from app.schemas.discovery import (
    CalendarSnapshot,
    EtfDirectorySnapshot,
    NewsSnapshot,
    PsychologySnapshot,
    ScreenerSnapshot,
)
from app.services.calendar import calendar_service
from app.services.etf import etf_service
from app.services.news import news_service
from app.services.psychology import psychology_service
from app.services.screener import screener_service

router = APIRouter()


@router.get("/screener", response_model=ScreenerSnapshot)
async def screener(universe: str = Query("tsx60")) -> ScreenerSnapshot:
    if universe.lower() != "tsx60":
        raise HTTPException(status_code=400, detail="Only the tsx60 universe is available in v0.5")
    return await screener_service.get_tsx60()


@router.get("/news", response_model=NewsSnapshot)
async def news() -> NewsSnapshot:
    return await news_service.get_snapshot()


@router.get("/calendar", response_model=CalendarSnapshot)
async def calendar() -> CalendarSnapshot:
    return await calendar_service.get_snapshot()


@router.get("/etfs", response_model=EtfDirectorySnapshot)
async def etfs() -> EtfDirectorySnapshot:
    return await etf_service.get_directory()


@router.get("/psychology", response_model=PsychologySnapshot)
async def psychology() -> PsychologySnapshot:
    return await psychology_service.get_snapshot()
