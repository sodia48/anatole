from fastapi.testclient import TestClient

from app.main import app


def test_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready_includes_account_storage() -> None:
    response = TestClient(app).get("/ready")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["account_storage"]["status"] == "ready"
    assert payload["account_storage"]["mode"] in {"sqlite", "postgresql"}
