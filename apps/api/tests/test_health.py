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
    assert payload["admin_console"]["status"] == "ready"
    assert payload["admin_console"]["routes_enabled"] is True
    assert payload["admin_console"]["missing_routes"] == []


def test_admin_routes_are_mounted_and_protected() -> None:
    client = TestClient(app)
    for path in (
        "/api/v1/admin/overview",
        "/api/v1/admin/users",
        "/api/v1/admin/invites",
        "/api/v1/admin/reports",
    ):
        response = client.get(path)
        assert response.status_code in {401, 403}, path
