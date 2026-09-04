from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.routes import accounts as account_routes
from app.main import app
from app.services.accounts import AccountService


@pytest.fixture()
def account_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    service = AccountService(f"sqlite:///{tmp_path / 'accounts.db'}")
    monkeypatch.setattr(account_routes, "account_service", service)
    with TestClient(app) as client:
        yield client
    service.engine.dispose()


def register(client: TestClient, email: str = "beta@example.com") -> dict:
    response = client.post(
        "/api/v1/account/register",
        json={
            "email": email,
            "password": "Anatole2026!",
            "display_name": "Beta Test",
            "accepted_terms": True,
            "accepted_privacy": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_sqlite_account_store_waits_for_concurrent_writes(tmp_path: Path):
    service = AccountService(f"sqlite:///{tmp_path / 'concurrent.db'}")
    try:
        with service.engine.connect() as connection:
            busy_timeout = connection.exec_driver_sql(
                "PRAGMA busy_timeout"
            ).scalar_one()
        assert busy_timeout == 30_000
        assert service.engine.pool.size() == 1
    finally:
        service.engine.dispose()


def test_register_login_me_and_logout(account_client: TestClient):
    created = register(account_client)
    assert created["user"]["email"] == "beta@example.com"
    assert created["workspace"]["revision"] == 0
    assert created["workspace"]["data"]["preferences"]["preferred_regions"] == []
    assert created["workspace"]["data"]["preferences"]["preferred_sectors"] == []
    assert created["workspace"]["data"]["preferences"]["onboarding_version"] == 0

    me = account_client.get(
        "/api/v1/account/me",
        headers=auth(created["token"]),
    )
    assert me.status_code == 200
    assert me.json()["workspace_revision"] == 0

    logout = account_client.post(
        "/api/v1/account/logout",
        headers=auth(created["token"]),
    )
    assert logout.status_code == 204
    assert account_client.get(
        "/api/v1/account/me",
        headers=auth(created["token"]),
    ).status_code == 401

    login = account_client.post(
        "/api/v1/account/login",
        json={"email": "BETA@example.com", "password": "Anatole2026!"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["email"] == "beta@example.com"


def test_logout_all_invalidates_every_session(account_client: TestClient):
    created = register(account_client, "sessions@example.com")
    second_response = account_client.post(
        "/api/v1/account/login",
        json={"email": "sessions@example.com", "password": "Anatole2026!"},
    )
    assert second_response.status_code == 200
    second = second_response.json()

    response = account_client.post(
        "/api/v1/account/logout-all",
        headers=auth(created["token"]),
    )
    assert response.status_code == 204
    assert account_client.get(
        "/api/v1/account/me", headers=auth(created["token"])
    ).status_code == 401
    assert account_client.get(
        "/api/v1/account/me", headers=auth(second["token"])
    ).status_code == 401


def test_expired_session_is_rejected(
    account_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(account_routes.settings, "account_session_days", -1)
    created = register(account_client, "expired@example.com")
    response = account_client.get(
        "/api/v1/account/me",
        headers=auth(created["token"]),
    )
    assert response.status_code == 401


def test_duplicate_account_and_invalid_password(account_client: TestClient):
    register(account_client)
    duplicate = account_client.post(
        "/api/v1/account/register",
        json={"email": "beta@example.com", "password": "Anatole2026!", "accepted_terms": True, "accepted_privacy": True},
    )
    assert duplicate.status_code == 409

    invalid = account_client.post(
        "/api/v1/account/login",
        json={"email": "beta@example.com", "password": "Incorrect2026"},
    )
    assert invalid.status_code == 401


def test_workspace_sync_revision_conflict_and_isolation(account_client: TestClient):
    first = register(account_client, "first@example.com")
    second = register(account_client, "second@example.com")

    payload = {
        "expected_revision": 0,
        "data": {
            "watchlist": ["RY", "TD", "RY"],
            "portfolio": [
                {"symbol": "RY", "quantity": 10, "average_cost": 120}
            ],
            "alerts": [
                {
                    "id": "ry-price",
                    "symbol": "RY",
                    "metric": "price",
                    "operator": "above",
                    "threshold": 150,
                    "enabled": True,
                }
            ],
            "preferences": {
                "theme": "dark",
                "density": "compact",
                "decimals": 2,
                "default_range": "1y",
                "default_universe": "composite",
                "preferred_regions": ["QC", "QC", "CA"],
                "preferred_sectors": ["Financials", "Energy", "Financials"],
                "onboarding_version": 2,
            },
            "advisor_profile": None,
            "cockpit_universe": "composite",
            "comparator_symbols": ["RY", "TD"],
        },
    }

    saved = account_client.put(
        "/api/v1/account/workspace",
        headers=auth(first["token"]),
        json=payload,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    assert saved.json()["data"]["watchlist"] == ["RY", "TD"]
    assert saved.json()["data"]["preferences"]["preferred_regions"] == ["QC", "CA"]
    assert saved.json()["data"]["preferences"]["preferred_sectors"] == ["Financials", "Energy"]
    assert saved.json()["data"]["preferences"]["onboarding_version"] == 2

    conflict = account_client.put(
        "/api/v1/account/workspace",
        headers=auth(first["token"]),
        json=payload,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["current_revision"] == 1

    restored = account_client.get(
        "/api/v1/account/workspace",
        headers=auth(first["token"]),
    )
    assert restored.status_code == 200
    assert restored.json()["data"]["cockpit_universe"] == "composite"

    isolated = account_client.get(
        "/api/v1/account/workspace",
        headers=auth(second["token"]),
    )
    assert isolated.status_code == 200
    assert isolated.json()["revision"] == 0
    assert isolated.json()["data"]["watchlist"] == []


def test_profile_password_export_and_delete(account_client: TestClient):
    created = register(account_client, "control@example.com")
    token = created["token"]

    profile = account_client.put(
        "/api/v1/account/profile",
        headers=auth(token),
        json={"display_name": "  Souleyman   Anatole  "},
    )
    assert profile.status_code == 200, profile.text
    assert profile.json()["display_name"] == "Souleyman Anatole"

    second_login = account_client.post(
        "/api/v1/account/login",
        json={"email": "control@example.com", "password": "Anatole2026!"},
    )
    assert second_login.status_code == 200
    second_token = second_login.json()["token"]

    changed = account_client.post(
        "/api/v1/account/change-password",
        headers=auth(token),
        json={
            "current_password": "Anatole2026!",
            "new_password": "Nouveau2027!",
        },
    )
    assert changed.status_code == 204, changed.text
    assert account_client.get(
        "/api/v1/account/me",
        headers=auth(token),
    ).status_code == 200
    assert account_client.get(
        "/api/v1/account/me",
        headers=auth(second_token),
    ).status_code == 401

    old_login = account_client.post(
        "/api/v1/account/login",
        json={"email": "control@example.com", "password": "Anatole2026!"},
    )
    assert old_login.status_code == 401
    new_login = account_client.post(
        "/api/v1/account/login",
        json={"email": "control@example.com", "password": "Nouveau2027!"},
    )
    assert new_login.status_code == 200

    exported = account_client.get(
        "/api/v1/account/export",
        headers=auth(token),
    )
    assert exported.status_code == 200, exported.text
    assert exported.json()["user"]["email"] == "control@example.com"
    assert exported.json()["workspace"]["revision"] == 0

    wrong_delete = account_client.request(
        "DELETE",
        "/api/v1/account/delete",
        headers=auth(token),
        json={"password": "Incorrect2026", "confirmation": "SUPPRIMER"},
    )
    assert wrong_delete.status_code == 401

    deleted = account_client.request(
        "DELETE",
        "/api/v1/account/delete",
        headers=auth(token),
        json={"password": "Nouveau2027!", "confirmation": "SUPPRIMER"},
    )
    assert deleted.status_code == 204, deleted.text
    assert account_client.get(
        "/api/v1/account/me",
        headers=auth(token),
    ).status_code == 401
    assert account_client.post(
        "/api/v1/account/login",
        json={"email": "control@example.com", "password": "Nouveau2027!"},
    ).status_code == 401



def test_registration_policy_and_invite_code(account_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(account_routes.settings, "account_invite_codes", "BETA-ALPHA,BETA-BRAVO")
    monkeypatch.setattr(account_routes.settings, "account_terms_version", "2026-08-01")
    monkeypatch.setattr(account_routes.settings, "account_privacy_version", "2026-08-01")

    policy = account_client.get("/api/v1/account/registration")
    assert policy.status_code == 200
    assert policy.json() == {
        "enabled": True,
        "invite_required": True,
        "terms_version": "2026-08-01",
        "privacy_version": "2026-08-01",
    }

    missing_consent = account_client.post(
        "/api/v1/account/register",
        json={
            "email": "consent@example.com",
            "password": "Anatole2026!",
            "invite_code": "BETA-ALPHA",
        },
    )
    assert missing_consent.status_code == 422

    invalid = account_client.post(
        "/api/v1/account/register",
        json={
            "email": "invalid-code@example.com",
            "password": "Anatole2026!",
            "invite_code": "INCORRECT",
            "accepted_terms": True,
            "accepted_privacy": True,
        },
    )
    assert invalid.status_code == 403

    valid = account_client.post(
        "/api/v1/account/register",
        json={
            "email": "invited@example.com",
            "password": "Anatole2026!",
            "display_name": "Invité",
            "invite_code": "BETA-BRAVO",
            "accepted_terms": True,
            "accepted_privacy": True,
        },
    )
    assert valid.status_code == 201, valid.text
