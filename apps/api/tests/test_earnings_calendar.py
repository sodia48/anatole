import asyncio
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.earnings_calendar import (
    EarningsCalendarService,
    EarningsConstituent,
)


def test_events_only_keep_future_constituent_dates() -> None:
    service = EarningsCalendarService()
    now = datetime(2026, 8, 29, 14, tzinfo=UTC)
    future = int((now + timedelta(days=12)).timestamp())
    past = int((now - timedelta(days=2)).timestamp())
    constituents = [
        EarningsConstituent(
            ticker="RY",
            name="Royal Bank of Canada",
            sector="Financials",
            weight=10.0,
        )
    ]

    events = service._events(
        [
            {"symbol": "RY.TO", "earningsTimestamp": future},
            {"symbol": "TD.TO", "earningsTimestamp": future},
            {"symbol": "RY.TO", "earningsTimestamp": past},
        ],
        constituents,
        now=now,
    )

    assert len(events) == 1
    assert events[0].ticker == "RY"
    assert events[0].symbol == "RY.TO"
    assert events[0].time_is_estimated is True
    assert events[0].starts_at == datetime.fromtimestamp(future, UTC)


def test_snapshot_cache_is_single_flight(monkeypatch) -> None:
    service = EarningsCalendarService()
    calls = 0

    async def load(universe):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0)
        return await EarningsCalendarService()._load(universe)

    monkeypatch.setattr(settings, "market_data_provider", "demo")
    monkeypatch.setattr(service, "_load", load)

    async def load_twice():
        return await asyncio.gather(
            service.get_snapshot("tsx60"),
            service.get_snapshot("tsx60"),
        )

    first, second = asyncio.run(load_twice())

    assert calls == 1
    assert first == second


def test_demo_mode_does_not_fetch_or_fabricate_dates(monkeypatch) -> None:
    service = EarningsCalendarService()

    async def unexpected_fetch(_universe):
        raise AssertionError("demo mode must not fetch the Composite universe")

    monkeypatch.setattr(settings, "market_data_provider", "demo")
    monkeypatch.setattr(service, "_constituents", unexpected_fetch)

    snapshot = asyncio.run(service._load("composite"))

    assert snapshot.events == []
    assert snapshot.companies_with_dates == 0
    assert snapshot.constituent_count == 60
    assert snapshot.source_statuses[-1].status == "unavailable"
    assert "no dates were fabricated" in (
        snapshot.source_statuses[-1].detail or ""
    )


def test_earnings_calendar_route_validates_universe() -> None:
    response = TestClient(app).get(
        "/api/v1/discovery/earnings-calendar",
        params={"universe": "invalid"},
    )

    assert response.status_code == 400


def test_earnings_calendar_route_returns_honest_demo_snapshot(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "demo")
    response = TestClient(app).get(
        "/api/v1/discovery/earnings-calendar",
        params={"universe": "tsx60"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["universe"] == "S&P/TSX 60"
    assert payload["constituent_count"] == 60
    assert payload["events"] == []
