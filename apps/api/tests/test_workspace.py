from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.analysis import analysis_service
from app.services.cockpit import cockpit_service
from app.services.calendar import calendar_service
from app.services.news import news_service
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
    sources = {item["key"]: item for item in payload["sources"]}
    assert sources["screener-tsx60"]["status"] in {
        "idle", "healthy", "degraded", "stale"
    }
    assert sources["screener-composite"]["status"] in {
        "idle", "healthy", "degraded", "stale"
    }
    assert sources["tsx-composite-universe"]["status"] in {
        "idle", "healthy", "degraded", "stale"
    }
    assert sources["news"]["status"] in {"idle", "healthy", "degraded", "stale"}
    assert sources["calendar"]["status"] in {"idle", "healthy", "degraded", "stale"}
    assert isinstance(news_service._cached, dict)
    assert isinstance(calendar_service._cached, dict)


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


def _advisor_profile() -> dict[str, object]:
    return {
        "currency": "CAD",
        "goal_type": "home",
        "goal_name": "Mise de fonds",
        "horizon_years": 7,
        "target_amount": 120000,
        "current_savings": 32000,
        "monthly_contribution": 850,
        "essential_monthly_expenses": 2600,
        "liquid_reserve": 10400,
        "high_interest_debt": False,
        "income_stability": "high",
        "liquidity_need": "medium",
        "loss_comfort": "medium",
        "experience": "intermediate",
    }


def test_advisor_plan_builds_scenarios_without_recommendations() -> None:
    response = client.post(
        "/api/v1/workspace/advisor-plan",
        json={"profile": _advisor_profile(), "portfolio_positions": []},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["profile_completeness"] == 100
    assert len(payload["projections"]) == 3
    assert payload["capacity_profile"] in {"Prudente", "Équilibrée", "Dynamique"}
    assert any("n’indique jamais quel titre acheter" in item for item in payload["boundaries"])
    serialized = str(payload).casefold()
    assert "achète" not in serialized
    assert "vends" not in serialized


def test_advisor_plan_uses_local_portfolio_demo() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    _reset()
    try:
        response = client.post(
            "/api/v1/workspace/advisor-plan",
            json={
                "profile": _advisor_profile(),
                "portfolio_positions": [
                    {"symbol": "RY", "quantity": 10, "average_cost": 120},
                    {"symbol": "XIC", "quantity": 30, "average_cost": 32},
                ],
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["portfolio_score"] is not None
        assert payload["portfolio_risk_level"] is not None
        assert len(payload["stress_tests"]) == 3
    finally:
        settings.market_data_provider = original
        _reset()


def test_assistant_blocks_personalized_buy_sell_request() -> None:
    response = client.post(
        "/api/v1/workspace/assistant",
        json={
            "message": "Quelle action devrais-je acheter maintenant ?",
            "advisor_profile": _advisor_profile(),
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "guardrail"
    assert payload["guardrail_triggered"] is True
    assert "ne peux pas choisir un placement" in payload["answer"]


def test_assistant_returns_structured_advisor_plan() -> None:
    response = client.post(
        "/api/v1/workspace/assistant",
        json={
            "message": "Construis mon plan selon mon objectif",
            "advisor_profile": _advisor_profile(),
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "advisor"
    assert payload["plan"] is not None
    assert payload["plan"]["projections"]
    assert payload["guardrail_triggered"] is False
