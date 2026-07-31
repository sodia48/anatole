from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_reliability_status_is_available() -> None:
    response = client.get("/api/v1/reliability/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"healthy", "degraded", "critical"}
    assert payload["total_requests"] >= 0
    assert "p95_duration_ms" in payload
    assert "upstream_metrics" in payload


def test_feedback_is_accepted_without_personal_portfolio_data() -> None:
    response = client.post(
        "/api/v1/reliability/feedback",
        json={
            "category": "interface",
            "message": "Le bouton de filtre est difficile à lire sur mobile.",
            "route": "/cockpit",
            "section": "cockpit",
            "viewport_width": 390,
            "viewport_height": 844,
            "app_version": "0.8.0",
            "consent_diagnostics": True,
        },
    )
    assert response.status_code == 202
    payload = response.json()
    assert payload["accepted"] is True
    assert payload["report_id"].startswith("AN-")


def test_feedback_rejects_too_short_message() -> None:
    response = client.post(
        "/api/v1/reliability/feedback",
        json={
            "category": "bug",
            "message": "Non",
            "route": "/terminal",
        },
    )
    assert response.status_code == 422


def test_client_event_is_accepted() -> None:
    response = client.post(
        "/api/v1/reliability/client-event",
        json={
            "kind": "javascript_error",
            "message": "Synthetic test error",
            "route": "/cockpit",
            "viewport_width": 390,
            "viewport_height": 844,
        },
    )
    assert response.status_code == 202
    assert response.json() == {"accepted": True}
