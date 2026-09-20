from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.resilience import shared_http_client
from app.main import app
from app.schemas.market import CockpitSnapshot, MarketBreadth
from app.services.cockpit import cockpit_service
from app.services.screener import ScreenerService
from app.services.search import symbol_search_service
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    tsx_composite_universe_service,
)
from app.services.tsx_venture_universe import (
    TSXVentureUniverseService,
    tsx_venture_universe_service,
)


def venture_rows(count: int = 140) -> list[dict]:
    return [
        {
            "symbol": f"V{i:03}.V",
            "longName": f"Venture Company {i}",
            "sector": "Materials" if i % 2 else "Energy",
            "marketCap": (count - i) * 1_000_000,
            "currency": "CAD",
        }
        for i in range(count)
    ]


def test_venture_universe_uses_market_cap_weights() -> None:
    constituents = TSXVentureUniverseService._constituents(
        venture_rows(),
        limit=100,
    )

    assert len(constituents) == 100
    assert constituents[0].ticker == "V000.V"
    assert constituents[-1].ticker == "V099.V"
    assert sum(item.weight or 0 for item in constituents) == pytest.approx(100)
    assert constituents[0].weight > constituents[-1].weight


def test_venture_universe_excludes_non_venture_and_missing_caps() -> None:
    rows = venture_rows(120)
    rows.extend([
        {"symbol": "RY.TO", "marketCap": 200_000_000_000},
        {"symbol": "EMPTY.V", "marketCap": None},
    ])

    constituents = TSXVentureUniverseService._constituents(rows)

    assert all(item.ticker.endswith(".V") for item in constituents)
    assert all(item.ticker != "EMPTY.V" for item in constituents)


@pytest.mark.asyncio
async def test_venture_sectors_are_enriched_in_one_batch(monkeypatch) -> None:
    service = TSXVentureUniverseService()
    constituents = service._constituents([
        {
            "symbol": "TOI.V",
            "longName": "Topicus.com",
            "marketCap": 2_000_000_000,
        },
        {
            "symbol": "ARTG.V",
            "longName": "Artemis Gold",
            "marketCap": 1_000_000_000,
        },
    ])
    calls = 0

    async def request(method: str, url: str, **kwargs):
        nonlocal calls
        calls += 1
        assert method == "POST"
        assert "TOI" in kwargs["json"]["query"]
        assert "ARTG" in kwargs["json"]["query"]
        return SimpleNamespace(
            json=lambda: {
                "data": {
                    "q0": {
                        "symbol": "TOI",
                        "sector": "Technology",
                        "exchangeCode": "CDX",
                    },
                    "q1": {
                        "symbol": "ARTG",
                        "sector": "Basic Materials",
                        "exchangeCode": "CDX",
                    },
                }
            }
        )

    monkeypatch.setattr(shared_http_client, "request", request)

    enriched = await service._enrich_sectors(constituents)
    cached = await service._enrich_sectors(constituents)

    assert calls == 1
    assert [item.sector for item in enriched] == [
        "Information Technology",
        "Materials",
    ]
    assert [item.sector for item in cached] == [
        "Information Technology",
        "Materials",
    ]


@pytest.mark.asyncio
async def test_venture_sector_failure_keeps_other(monkeypatch) -> None:
    service = TSXVentureUniverseService()
    constituents = service._constituents([
        {
            "symbol": "TOI.V",
            "longName": "Topicus.com",
            "marketCap": 2_000_000_000,
        }
    ])

    async def request(*args, **kwargs):
        raise RuntimeError("TMX unavailable")

    monkeypatch.setattr(shared_http_client, "request", request)

    enriched = await service._enrich_sectors(constituents)

    assert enriched[0].sector == "Other"


def test_screener_accepts_venture_aliases() -> None:
    assert ScreenerService._normalize_universe("tsxv") == "tsxv"
    assert ScreenerService._normalize_universe("TSX Venture") == "tsxv"
    assert ScreenerService._normalize_universe("venture") == "tsxv"


@pytest.mark.asyncio
async def test_search_keeps_venture_when_composite_is_unavailable(
    monkeypatch,
) -> None:
    async def unavailable() -> list[CompositeConstituent]:
        raise RuntimeError("composite unavailable")

    async def venture() -> list[CompositeConstituent]:
        return [
            CompositeConstituent(
                ticker="V001.V",
                name="Venture Company",
                sector="Materials",
                exchange="TSXV",
            )
        ]

    monkeypatch.setattr(
        tsx_composite_universe_service,
        "get_constituents",
        unavailable,
    )
    monkeypatch.setattr(
        tsx_venture_universe_service,
        "get_all_listings",
        venture,
    )

    result = await symbol_search_service.search("V001.V")

    assert result.count == 1
    assert result.items[0].symbol == "V001.V"
    assert result.items[0].universe == "tsxv"


@pytest.mark.asyncio
async def test_cockpit_route_dispatches_venture(monkeypatch) -> None:
    snapshot = CockpitSnapshot(
        universe="TSX Venture - 300 largest market caps",
        universe_as_of="2026-09-19",
        universe_source="test",
        weighted_change_percent=0,
        breadth=MarketBreadth(
            advancers=0,
            decliners=0,
            unchanged=0,
            advance_ratio=0,
        ),
        sectors=[],
        constituents=[],
        top_gainers=[],
        top_losers=[],
        generated_at=datetime.now(UTC),
        refresh_after_seconds=180,
    )

    async def get_venture() -> CockpitSnapshot:
        return snapshot

    monkeypatch.setattr(cockpit_service, "get_venture", get_venture)
    response = TestClient(app).get("/api/v1/market/cockpit?universe=tsxv")

    assert response.status_code == 200
    assert response.json()["universe"].startswith("TSX Venture")
