from __future__ import annotations

import asyncio
from datetime import datetime

from pydantic import BaseModel

import app.services.etf as etf_module
from app.services.etf import (
    COLD_START_RETRY_SECONDS,
    EtfDirectoryService,
    etf_service,
)


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



def test_failed_cold_start_can_retry(
    monkeypatch,
) -> None:
    clock = [0.0]
    monkeypatch.setattr(
        etf_module,
        "monotonic",
        lambda: clock[0],
    )
    service = EtfDirectoryService()
    calls = 0

    async def no_quotes(
        tickers: list[str],
    ) -> None:
        nonlocal calls
        calls += 1

    monkeypatch.setattr(
        service,
        "_refresh_batch",
        no_quotes,
    )

    asyncio.run(
        service._prime_cold_start()
    )
    assert calls == 1

    asyncio.run(
        service._prime_cold_start()
    )
    assert calls == 1

    clock[0] += COLD_START_RETRY_SECONDS

    asyncio.run(
        service._prime_cold_start()
    )
    assert calls == 2
