from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.stocks import Quote
from app.services.cockpit import cockpit_service
from app.services.market_data import market_data_service
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    tsx_composite_universe_service,
)


def reset_cockpit_caches() -> None:
    cockpit_service._cached = None
    cockpit_service._cached_at = 0
    cockpit_service._composite_cached = None
    cockpit_service._composite_cached_at = 0


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


def test_composite_cockpit_returns_all_constituents(monkeypatch) -> None:
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

    async def fake_get_quotes(symbols: list[str]):
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
        assert len(payload["constituents"]) == 180
        assert payload["refresh_after_seconds"] == 90
        assert len(payload["sectors"]) == 3
        assert len(payload["top_gainers"]) == 5
        assert payload["breadth"]["advancers"] == 175
        assert sum(
            item["source"] == "unavailable"
            for item in payload["constituents"]
        ) == 5
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
