from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _profile() -> dict[str, object]:
    return {
        "currency": "CAD",
        "goal_type": "home",
        "goal_name": "Mise de fonds",
        "horizon_years": 8,
        "target_amount": 100_000,
        "current_savings": 25_000,
        "monthly_contribution": 500,
        "essential_monthly_expenses": 2_400,
        "liquid_reserve": 12_000,
        "high_interest_debt": False,
        "income_stability": "high",
        "liquidity_need": "medium",
        "loss_comfort": "medium",
        "experience": "beginner",
    }


def test_advisor_uses_plain_scenario_labels() -> None:
    response = client.post(
        "/api/v1/workspace/advisor-plan",
        json={"profile": _profile(), "portfolio_positions": []},
    )
    assert response.status_code == 200
    payload = response.json()
    assert [item["label"] for item in payload["projections"]] == [
        "Sans croissance",
        "Croissance modérée",
        "Croissance soutenue",
    ]
    assert "ne recommandent aucun placement" in payload["summary"]


def test_advisor_still_refuses_to_choose_a_security() -> None:
    response = client.post(
        "/api/v1/workspace/assistant",
        json={
            "message": "Dis-moi simplement quelle action acheter.",
            "advisor_profile": _profile(),
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "guardrail"
    assert payload["guardrail_triggered"] is True
