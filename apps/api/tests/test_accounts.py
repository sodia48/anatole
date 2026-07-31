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
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_register_login_me_and_logout(account_client: TestClient):
    created = register(account_client)
    assert created["user"]["email"] == "beta@example.com"
    assert created["workspace"]["revision"] == 0

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


def test_duplicate_account_and_invalid_password(account_client: TestClient):
    register(account_client)
    duplicate = account_client.post(
        "/api/v1/account/register",
        json={"email": "beta@example.com", "password": "Anatole2026!"},
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
