from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import monotonic

import pytest

from app.services.screener import (
    ScreenerService,
    build_rows_from_quotes_and_histories,
)
from app.schemas.discovery import ScreenerSnapshot
from app.schemas.stocks import Quote
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    tsx_composite_universe_service,
)


def test_universe_normalization() -> None:
    service = ScreenerService()

    assert (
        service._normalize_universe(
            "composite"
        )
        == "composite"
    )
    assert (
        service._normalize_universe(
            "TSX Composite"
        )
        == "composite"
    )
    assert (
        service._normalize_universe(
            "tsx60"
        )
        == "tsx60"
    )

    with pytest.raises(ValueError):
        service._normalize_universe(
            "sp500"
        )


def test_composite_cache_is_longer() -> None:
    service = ScreenerService()

    assert (
        service._ttl("composite")
        > service._ttl("tsx60")
    )


def test_tsx60_constituents_are_available() -> None:
    service = ScreenerService()
    universe, constituents = asyncio.run(
        service._constituents("tsx60")
    )

    assert universe == "S&P/TSX 60"
    assert len(constituents) == 60
    assert all(
        item.ticker
        for item in constituents
    )


def test_quote_only_row_keeps_history_metrics_unavailable() -> None:
    constituent = CompositeConstituent(ticker="RY", name="Royal Bank", sector="Financials")
    quote = Quote(
        ticker="RY.TO",
        symbol="RY",
        name="Royal Bank",
        exchange="TSX",
        currency="CAD",
        price=140,
        previous_close=138,
        change=2,
        change_percent=1.4493,
        day_high=141,
        day_low=137,
        volume=1_000_000,
        timestamp=datetime.now(UTC),
        source="yahoo-public",
        delayed=True,
    )
    rows = build_rows_from_quotes_and_histories([constituent], [quote], {})
    assert len(rows) == 1
    assert rows[0].price == 140
    assert rows[0].average_volume_20d is None
    assert rows[0].relative_volume is None
    assert rows[0].momentum_20d is None
    assert rows[0].score is None
    assert rows[0].signal is None


def test_composite_constituents_use_honest_tsx60_bootstrap(monkeypatch) -> None:
    async def unavailable_constituents():
        raise RuntimeError("BlackRock unavailable")

    monkeypatch.setattr(
        tsx_composite_universe_service,
        "get_constituents",
        unavailable_constituents,
    )
    service = ScreenerService()
    universe, constituents = asyncio.run(
        service._constituents("composite")
    )

    assert universe == "S&P/TSX Composite — repli TSX 60"
    assert len(constituents) == 60


@pytest.mark.asyncio
async def test_composite_stale_snapshot_returns_immediately_during_single_refresh(monkeypatch) -> None:
    service = ScreenerService()
    stale = ScreenerSnapshot(
        universe="S&P/TSX Composite",
        items=[],
        sectors=[],
        generated_at=datetime.now(UTC),
        refresh_after_seconds=180,
    )
    service._cache["composite"] = (monotonic() - service.composite_cache_ttl_seconds - 1, stale)
    refresh_started = asyncio.Event()
    release_refresh = asyncio.Event()
    calls = 0

    async def slow_refresh(_normalized: str) -> ScreenerSnapshot:
        nonlocal calls
        calls += 1
        refresh_started.set()
        await release_refresh.wait()
        return stale.model_copy(update={"generated_at": datetime.now(UTC)})

    monkeypatch.setattr(service, "_build_snapshot", slow_refresh)
    first, second = await asyncio.gather(
        service.get_snapshot("composite"),
        service.get_snapshot("composite"),
    )
    assert first is stale
    assert second is stale
    await refresh_started.wait()
    assert calls == 1
    release_refresh.set()
    await service._refresh_tasks["composite"]
