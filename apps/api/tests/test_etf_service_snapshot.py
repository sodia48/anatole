from __future__ import annotations

import asyncio
from datetime import datetime

from pydantic import BaseModel

from app.services.etf import etf_service


class EtfDirectoryItem(BaseModel):
    ticker: str
    symbol: str
    name: str
    provider: str
    category: str
    exposure: str
    currency: str = "CAD"
    price: float
    change_percent: float
    volume: int
    source: str
    delayed: bool


class EtfDirectorySnapshot(BaseModel):
    items: list[EtfDirectoryItem]
    categories: list[str]
    generated_at: datetime
    refresh_after_seconds: int = 45


def test_snapshot_returns_catalog_immediately() -> None:
    snapshot = asyncio.run(etf_service.snapshot())

    assert len(snapshot.items) >= 100
    assert len(snapshot.categories) >= 10
    assert "Marché canadien" in snapshot.categories
    assert snapshot.refresh_after_seconds >= 45


def test_snapshot_is_valid_against_current_schema() -> None:
    snapshot = asyncio.run(etf_service.snapshot())

    validated = EtfDirectorySnapshot.model_validate(
        snapshot.model_dump()
    )

    assert len(validated.items) == 172
    assert validated.categories
