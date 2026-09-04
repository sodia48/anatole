from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.analysis import analysis_service
from app.services.cockpit import cockpit_service
from app.services.screener import screener_service


client = TestClient(app)


def _reset() -> None:
    analysis_service._cache._values.clear()
    screener_service._cached = None
    screener_service._cached_at = 0
    cockpit_service._cached = None
    cockpit_service._cached_at = 0


def test_compare_route_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    _reset()
    try:
        response = client.post(
            "/api/v1/analysis/compare",
            json={
                "symbols": ["RY", "TD", "SHOP"],
                "range": "1y",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["range"] == "1y"
        assert len(payload["instruments"]) == 3
        assert len(payload["series"]) == 3
        assert len({tuple(point["time"] for point in series["points"]) for series in payload["series"]}) == 1
        assert payload["correlation"]["symbols"]
        assert all(
            0 <= item["score"] <= 100
            for item in payload["instruments"]
        )
        assert sorted(item["rank"] for item in payload["instruments"]) == [1, 2, 3]
    finally:
        settings.market_data_provider = original
        _reset()


def test_compare_rejects_duplicate_or_single_symbol() -> None:
    response = client.post(
        "/api/v1/analysis/compare",
        json={"symbols": ["RY", "RY"], "range": "1y"},
    )
    assert response.status_code == 422


def test_terminal_route_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    _reset()
    try:
        response = client.get("/api/v1/analysis/terminal")
        assert response.status_code == 200
        payload = response.json()
        assert payload["schema_version"] == 2
        assert payload["universe"] == "S&P/TSX 60"
        assert 0 <= payload["regime_score"] <= 100
        assert len(payload["components"]) == 4
        assert len(payload["sectors"]) >= 8
        assert len(payload["leaders"]) == 8
        assert len(payload["laggards"]) == 8
        assert [item["key"] for item in payload["regime_horizons"]] == ["session", "5d", "20d", "3m"]
        assert payload["regime_history"] == sorted(payload["regime_history"], key=lambda item: item["timestamp"])
        radar_symbols = [item["symbol"] for item in payload["radar_items"]]
        assert len(radar_symbols) == payload["data_quality"]["real_symbols"]
        assert len(radar_symbols) == len(set(radar_symbols))
        assert payload["breadth_pro"]["coverage_percent"] >= 70
        assert payload["methodology_sections"]
        assert payload["data_quality"]["quotes_as_of"] is not None
        assert payload["data_quality"]["history_as_of"] is not None
    finally:
        settings.market_data_provider = original
        _reset()
