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


def test_consensus_is_parsed_and_matched_to_reporting_period() -> None:
    service = EarningsCalendarService()
    payload = {
        "quoteSummary": {
            "result": [{
                "earningsTrend": {
                    "trend": [
                        {
                            "period": "0q",
                            "endDate": "2026-07-31",
                            "earningsEstimate": {
                                "avg": {"raw": 4.07478},
                                "numberOfAnalysts": {"raw": 12},
                                "earningsCurrency": "CAD",
                            },
                            "revenueEstimate": {
                                "avg": {"raw": 18_179_364_940},
                                "numberOfAnalysts": {"raw": 9},
                                "revenueCurrency": "CAD",
                            },
                        },
                        {
                            "period": "+1q",
                            "endDate": "2026-10-31",
                            "earningsEstimate": {"avg": {"raw": 4.08}},
                            "revenueEstimate": {
                                "avg": {"raw": 18_279_526_620}
                            },
                        },
                    ]
                }
            }]
        }
    }
    rows = service._parse_consensus(payload)
    event = service._events(
        [{
            "symbol": "RY.TO",
            "earningsTimestamp": int(
                datetime(2026, 11, 25, tzinfo=UTC).timestamp()
            ),
        }],
        [EarningsConstituent("RY", "Royal Bank", "Financials", 10.0)],
        now=datetime(2026, 8, 29, tzinfo=UTC),
    )[0]

    enriched = service._with_consensus([event], {"RY.TO": rows})[0]

    assert len(rows) == 2
    assert enriched.eps_estimate == 4.08
    assert enriched.revenue_estimate == 18_279_526_620


def test_missing_consensus_does_not_remove_earnings_event() -> None:
    service = EarningsCalendarService()
    event = service._events(
        [{
            "symbol": "RY.TO",
            "earningsTimestamp": int(
                datetime(2026, 9, 10, tzinfo=UTC).timestamp()
            ),
        }],
        [EarningsConstituent("RY", "Royal Bank", "Financials", 10.0)],
        now=datetime(2026, 8, 29, tzinfo=UTC),
    )[0]

    enriched = service._with_consensus([event], {})

    assert enriched == [event]
    assert enriched[0].eps_estimate is None
    assert enriched[0].revenue_estimate is None


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
