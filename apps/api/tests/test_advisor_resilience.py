from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.portfolio import portfolio_service


client = TestClient(app)


def test_advisor_plan_survives_portfolio_enrichment_failure(monkeypatch) -> None:
    async def fail_analysis(_request):
        raise RuntimeError("portfolio enrichment unavailable")

    monkeypatch.setattr(portfolio_service, "analyze", fail_analysis)

    response = client.post(
        "/api/v1/workspace/advisor-plan",
        json={
            "profile": {
                "currency": "CAD",
                "goal_type": "education",
                "goal_name": "Études",
                "horizon_years": 3,
                "target_amount": 30000,
                "current_savings": 8000,
                "monthly_contribution": 500,
                "essential_monthly_expenses": 2500,
                "liquid_reserve": 10000,
                "high_interest_debt": False,
                "income_stability": "high",
                "liquidity_need": "medium",
                "loss_comfort": "medium",
                "experience": "intermediate",
            },
            "portfolio_positions": [
                {"symbol": "RY", "quantity": 12, "average_cost": 122},
                {"symbol": "TD", "quantity": 18, "average_cost": 78},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile_completeness"] == 100
    assert payload["title"]
    assert payload["summary"]
    assert len(payload["projections"]) == 3
    assert payload["portfolio_score"] is None
    assert payload["portfolio_risk_level"] is None