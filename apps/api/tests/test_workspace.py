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
    cockpit_service._cached = None
    cockpit_service._cached_at = 0
    screener_service._cached = None
    screener_service._cached_at = 0


def test_portfolio_analysis_demo() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    _reset()
    try:
        response = client.post(
            "/api/v1/workspace/portfolio",
            json={
                "positions": [
                    {"symbol": "RY", "quantity": 12, "average_cost": 122},
                    {"symbol": "TD", "quantity": 18, "average_cost": 78},
                    {"symbol": "XIC", "quantity": 25, "average_cost": 33},
                ],
                "base_currency": "CAD",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["positions"]) == 3
        assert payload["total_market_value"] > 0
        assert 0 <= payload["portfolio_score"] <= 100
        assert abs(sum(item["weight_percent"] for item in payload["positions"]) - 100) < 0.2
        assert payload["risk"]["risk_level"] in {"Faible", "Modéré", "Élevé", "Très élevé"}
    finally:
        settings.market_data_provider = original
        _reset()


def test_alert_evaluation_demo() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    try:
        response = client.post(
            "/api/v1/workspace/alerts/evaluate",
            json={
                "rules": [
                    {
                        "id": "price-ry",
                        "symbol": "RY",
                        "metric": "price",
                        "operator": "above",
                        "threshold": 1,
                        "enabled": True,
                    },
                    {
                        "id": "rsi-td",
                        "symbol": "TD",
                        "metric": "rsi_14",
                        "operator": "below",
                        "threshold": 100,
                        "enabled": True,
                    },
                ]
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["items"]) == 2
        assert payload["triggered_count"] == 2
    finally:
        settings.market_data_provider = original


def test_assistant_ticker_demo() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    try:
        response = client.post(
            "/api/v1/workspace/assistant",
            json={"message": "Analyse RY"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["intent"] == "ticker"
        assert payload["facts"]
        assert payload["links"]
    finally:
        settings.market_data_provider = original


def test_data_quality_route() -> None:
    response = client.get("/api/v1/workspace/data-quality")
    assert response.status_code == 200
    payload = response.json()
    assert 0 <= payload["overall_score"] <= 100
    assert len(payload["sources"]) >= 8
    assert any(item["path"] == "/health" for item in payload["endpoints"])


def test_assistant_market_and_portfolio_demo() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    _reset()
    try:
        market = client.post(
            "/api/v1/workspace/assistant",
            json={"message": "Quel est le régime du marché canadien ?"},
        )
        assert market.status_code == 200
        assert market.json()["intent"] == "market"

        portfolio = client.post(
            "/api/v1/workspace/assistant",
            json={
                "message": "Analyse mon portefeuille",
                "portfolio_positions": [
                    {"symbol": "RY", "quantity": 8, "average_cost": 110},
                    {"symbol": "XIC", "quantity": 20, "average_cost": 30},
                ],
            },
        )
        assert portfolio.status_code == 200
        assert portfolio.json()["intent"] == "portfolio"
        assert portfolio.json()["facts"]
    finally:
        settings.market_data_provider = original
        _reset()


def test_portfolio_rejects_duplicate_positions() -> None:
    response = client.post(
        "/api/v1/workspace/portfolio",
        json={
            "positions": [
                {"symbol": "RY", "quantity": 1, "average_cost": 100},
                {"symbol": "RY", "quantity": 2, "average_cost": 110},
            ]
        },
    )
    assert response.status_code == 422


def test_disabled_alert_is_not_evaluated() -> None:
    response = client.post(
        "/api/v1/workspace/alerts/evaluate",
        json={
            "rules": [
                {
                    "id": "disabled",
                    "symbol": "RY",
                    "metric": "price",
                    "operator": "above",
                    "threshold": 1,
                    "enabled": False,
                }
            ]
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["status"] == "disabled"
    assert payload["triggered_count"] == 0
