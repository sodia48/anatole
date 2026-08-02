from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.routes import accounts as account_routes
from app.api.routes import admin as admin_routes
from app.api.routes import reliability as reliability_routes
from app.core.config import settings
from app.main import app
from app.services.accounts import AccountService


@pytest.fixture()
def admin_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    service = AccountService(f"sqlite:///{tmp_path / 'admin.db'}")
    monkeypatch.setattr(account_routes, "account_service", service)
    monkeypatch.setattr(admin_routes, "account_service", service)
    monkeypatch.setattr(reliability_routes, "account_service", service)
    monkeypatch.setattr(settings, "account_admin_emails", "owner@example.com")
    monkeypatch.setattr(settings, "account_invite_codes", "")
    with TestClient(app) as client:
        yield client
    service.engine.dispose()


def register(client: TestClient, email: str, invite_code: str | None = None) -> dict:
    payload = {
        "email": email,
        "password": "Anatole2026!",
        "display_name": email.split("@", 1)[0],
        "accepted_terms": True,
        "accepted_privacy": True,
    }
    if invite_code:
        payload["invite_code"] = invite_code
    response = client.post("/api/v1/account/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_admin_access_overview_and_users(admin_client: TestClient):
    admin = register(admin_client, "owner@example.com")
    regular = register(admin_client, "reader@example.com")

    denied = admin_client.get(
        "/api/v1/admin/overview",
        headers=auth(regular["token"]),
    )
    assert denied.status_code == 403

    overview = admin_client.get(
        "/api/v1/admin/overview",
        headers=auth(admin["token"]),
    )
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["total_users"] == 2
    assert body["active_sessions"] == 2
    assert body["reliability"]["status"] in {"healthy", "degraded", "critical"}

    users = admin_client.get(
        "/api/v1/admin/users?query=reader",
        headers=auth(admin["token"]),
    )
    assert users.status_code == 200, users.text
    assert users.json()["total"] == 1
    assert users.json()["users"][0]["email"] == "reader@example.com"
    assert users.json()["users"][0]["is_admin"] is False


def test_dynamic_invite_single_use(admin_client: TestClient):
    admin = register(admin_client, "owner@example.com")

    created = admin_client.post(
        "/api/v1/admin/invites",
        headers=auth(admin["token"]),
        json={"label": "Testeur Québec", "max_uses": 1, "expires_in_days": 14},
    )
    assert created.status_code == 201, created.text
    invite = created.json()
    assert invite["code"].startswith("ANATOLE-")
    assert invite["active"] is True

    policy = admin_client.get("/api/v1/account/registration")
    assert policy.status_code == 200
    assert policy.json()["invite_required"] is True

    invited = register(admin_client, "invited@example.com", invite["code"])
    assert invited["user"]["email"] == "invited@example.com"

    reused = admin_client.post(
        "/api/v1/account/register",
        json={
            "email": "second@example.com",
            "password": "Anatole2026!",
            "invite_code": invite["code"],
            "accepted_terms": True,
            "accepted_privacy": True,
        },
    )
    assert reused.status_code == 403

    listed = admin_client.get(
        "/api/v1/admin/invites",
        headers=auth(admin["token"]),
    )
    assert listed.status_code == 200
    assert listed.json()["invites"][0]["uses"] == 1
    assert listed.json()["invites"][0]["active"] is False


def test_feedback_is_persisted_and_reviewable(admin_client: TestClient):
    admin = register(admin_client, "owner@example.com")

    feedback = admin_client.post(
        "/api/v1/reliability/feedback",
        json={
            "category": "interface",
            "message": "Le bouton est difficile à trouver sur mobile.",
            "route": "/cockpit",
            "section": "cockpit",
            "viewport_width": 390,
            "viewport_height": 844,
            "app_version": "1.1.0",
            "consent_diagnostics": True,
        },
    )
    assert feedback.status_code == 202, feedback.text
    report_id = feedback.json()["report_id"]

    reports = admin_client.get(
        "/api/v1/admin/reports",
        headers=auth(admin["token"]),
    )
    assert reports.status_code == 200, reports.text
    assert reports.json()["reports"][0]["report_id"] == report_id
    assert reports.json()["reports"][0]["status"] == "new"

    updated = admin_client.patch(
        f"/api/v1/admin/reports/{report_id}",
        headers=auth(admin["token"]),
        json={"status": "resolved"},
    )
    assert updated.status_code == 204, updated.text

    refreshed = admin_client.get(
        "/api/v1/admin/reports",
        headers=auth(admin["token"]),
    )
    assert refreshed.json()["reports"][0]["status"] == "resolved"
