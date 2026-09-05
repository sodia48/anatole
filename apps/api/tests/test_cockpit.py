import asyncio
from datetime import UTC, datetime
from time import monotonic

from fastapi.testclient import TestClient
import pytest

from app.core.config import settings
from app.main import app
from app.schemas.market import CockpitSnapshot, MarketBreadth, MarketTile
from app.schemas.stocks import Quote
from app.services.cockpit import CockpitService, cockpit_service
from app.services.market_data import market_data_service
from app.services.session_quotes import SessionQuoteService
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    tsx_composite_universe_service,
)


def reset_cockpit_caches() -> None:
    cockpit_service._cached = None
    cockpit_service._cached_at = 0
    cockpit_service._composite_cached = None
    cockpit_service._composite_cached_at = 0


def quote_for(symbol: str, *, change_percent: float = 1.0) -> Quote:
    return Quote(
        ticker=f"{symbol}.TO",
        symbol=symbol,
        name=symbol,
        exchange="TSX",
        currency="CAD",
        price=20.0,
        previous_close=19.8,
        change=0.2,
        change_percent=change_percent,
        day_high=20.5,
        day_low=19.5,
        volume=100_000,
        timestamp=datetime.now(UTC),
        source="test",
        delayed=True,
    )


def cockpit_snapshot(symbol: str) -> CockpitSnapshot:
    quote = quote_for(symbol)
    tile = MarketTile(
        ticker=quote.ticker,
        symbol=quote.symbol,
        name=quote.name,
        sector="Financials",
        weight=1.0,
        price=quote.price,
        change=quote.change,
        change_percent=quote.change_percent,
        volume=quote.volume,
        timestamp=quote.timestamp,
        source=quote.source,
        delayed=quote.delayed,
    )
    return CockpitSnapshot(
        universe="S&P/TSX 60",
        universe_as_of="2026-09-05",
        universe_source="test",
        weighted_change_percent=quote.change_percent,
        breadth=MarketBreadth(
            advancers=1,
            decliners=0,
            unchanged=0,
            advance_ratio=100,
        ),
        sectors=[],
        constituents=[tile],
        top_gainers=[tile],
        top_losers=[tile],
        generated_at=datetime.now(UTC),
        refresh_after_seconds=15,
    )


def test_tsx60_cockpit_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    reset_cockpit_caches()
    try:
        response = TestClient(app).get(
            "/api/v1/market/cockpit?universe=tsx60"
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["universe"] == "S&P/TSX 60"
        assert len(payload["constituents"]) == 60
        assert payload["refresh_after_seconds"] == 15
        assert (
            payload["breadth"]["advancers"]
            + payload["breadth"]["decliners"]
            + payload["breadth"]["unchanged"]
            == 60
        )
        assert len(payload["top_gainers"]) == 5
        assert len(payload["sectors"]) >= 9
    finally:
        settings.market_data_provider = original
        reset_cockpit_caches()


def test_composite_cockpit_returns_completed_quotes_without_fake_zeros(
    monkeypatch,
) -> None:
    fake_constituents = [
        CompositeConstituent(
            ticker=f"T{i:03d}",
            name=f"Composite Company {i}",
            sector=(
                "Financials"
                if i % 3 == 0
                else "Energy"
                if i % 3 == 1
                else "Industrials"
            ),
            weight=round(max(2.5 - i * 0.01, 0.05), 4),
            exchange="Toronto Stock Exchange",
            currency="CAD",
        )
        for i in range(180)
    ]

    async def fake_get_constituents():
        tsx_composite_universe_service.as_of = "2026-07-28"
        return fake_constituents

    quote_deadlines: list[float | None] = []

    async def fake_get_quotes(
        symbols: list[str],
        *,
        deadline_seconds: float | None = None,
    ):
        quote_deadlines.append(deadline_seconds)
        now = datetime.now(UTC)
        return [
            Quote(
                ticker=f"{symbol}.TO",
                symbol=symbol,
                name=f"Composite Company {index}",
                exchange="TSX",
                currency="CAD",
                price=20.0 + index,
                previous_close=20.0 + index - 0.5,
                change=0.5,
                change_percent=round(0.5 / (19.5 + index) * 100, 6),
                day_high=20.5 + index,
                day_low=19.5 + index,
                volume=100_000 + index,
                timestamp=now,
                source="test-composite",
                delayed=True,
            )
            for index, symbol in enumerate(symbols[:-5])
        ]

    monkeypatch.setattr(
        tsx_composite_universe_service,
        "get_constituents",
        fake_get_constituents,
    )
    monkeypatch.setattr(
        market_data_service,
        "get_quotes",
        fake_get_quotes,
    )

    reset_cockpit_caches()
    try:
        response = TestClient(app).get(
            "/api/v1/market/cockpit?universe=composite"
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["universe"] == "S&P/TSX Composite"
        assert payload["universe_as_of"] == "2026-07-28"
        assert len(payload["constituents"]) == 175
        assert payload["refresh_after_seconds"] == 90
        assert len(payload["sectors"]) == 3
        assert len(payload["top_gainers"]) == 5
        assert payload["breadth"]["advancers"] == 175
        assert all(
            item["source"] != "unavailable"
            for item in payload["constituents"]
        )
        assert quote_deadlines == [
            cockpit_service.composite_quote_deadline_seconds
        ]
    finally:
        reset_cockpit_caches()


def test_composite_cockpit_uses_honest_tsx60_bootstrap(monkeypatch) -> None:
    async def unavailable_constituents():
        raise RuntimeError("BlackRock unavailable")

    monkeypatch.setattr(
        tsx_composite_universe_service,
        "get_constituents",
        unavailable_constituents,
    )
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    reset_cockpit_caches()
    try:
        response = TestClient(app).get(
            "/api/v1/market/cockpit?universe=composite"
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["universe"] == "S&P/TSX Composite — repli TSX 60"
        assert "repli temporaire" in payload["universe_source"]
        assert len(payload["constituents"]) == 60
    finally:
        settings.market_data_provider = original
        reset_cockpit_caches()


def test_cockpit_rejects_unknown_universe() -> None:
    response = TestClient(app).get(
        "/api/v1/market/cockpit?universe=unknown"
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_quote_deadline_keeps_fast_quotes_without_waiting_for_slow_one(
    monkeypatch,
) -> None:
    service = SessionQuoteService()
    slow_started = asyncio.Event()
    release_slow = asyncio.Event()
    slow_completed = asyncio.Event()

    async def fake_get_quote(ticker: str) -> Quote:
        if ticker == "SLOW":
            slow_started.set()
            await release_slow.wait()
            slow_completed.set()
        return quote_for(ticker)

    monkeypatch.setattr(service, "get_quote", fake_get_quote)
    started_at = monotonic()
    quotes = await service.get_quotes(
        ["FAST", "SLOW"],
        deadline_seconds=0.02,
    )

    assert await asyncio.wait_for(slow_started.wait(), timeout=0.1)
    assert [quote.symbol for quote in quotes] == ["FAST"]
    assert monotonic() - started_at < 0.15
    release_slow.set()
    await asyncio.wait_for(slow_completed.wait(), timeout=0.1)


@pytest.mark.asyncio
async def test_stale_cockpit_returns_immediately_and_refreshes_in_background(
    monkeypatch,
) -> None:
    service = CockpitService()
    stale = cockpit_snapshot("OLD")
    refreshed = cockpit_snapshot("NEW")
    service._cached = stale
    service._cached_at = monotonic() - service.cache_ttl_seconds - 1
    refresh_started = asyncio.Event()
    release_refresh = asyncio.Event()

    async def slow_refresh(**_kwargs) -> CockpitSnapshot:
        refresh_started.set()
        await release_refresh.wait()
        return refreshed

    monkeypatch.setattr(service, "_build_snapshot", slow_refresh)
    result = await service.get_tsx60()

    assert result is stale
    await asyncio.wait_for(refresh_started.wait(), timeout=0.1)
    assert service._cached is stale
    release_refresh.set()
    assert service._tsx60_refresh_task is not None
    await asyncio.wait_for(service._tsx60_refresh_task, timeout=0.1)
    assert service._cached is refreshed
