from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.routes import accounts as account_routes
from app.main import app
from app.services.accounts import AccountService


@pytest.fixture()
def mobile_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    service = AccountService(f"sqlite:///{tmp_path / 'mobile.db'}")
    monkeypatch.setattr(account_routes, "account_service", service)
    with TestClient(app) as client:
        yield client, service
    service.engine.dispose()


def register(client: TestClient, email: str) -> dict:
    response = client.post(
        "/api/v1/account/register",
        json={
            "email": email,
            "password": "Anatole2026!",
            "accepted_terms": True,
            "accepted_privacy": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_mobile_device_routes_require_authentication(mobile_client):
    client, _ = mobile_client
    assert client.get("/api/v1/account/devices").status_code == 401
    assert client.post(
        "/api/v1/account/devices",
        json={"token": "ExponentPushToken[anonymous]", "platform": "ios"},
    ).status_code == 401


def test_register_update_list_isolate_and_delete_mobile_device(mobile_client):
    client, _ = mobile_client
    first = register(client, "mobile-first@example.com")
    second = register(client, "mobile-second@example.com")
    token = "ExponentPushToken[first-device-123456]"

    created = client.post(
        "/api/v1/account/devices",
        headers=auth(first["token"]),
        json={
            "token": token,
            "platform": "ios",
            "device_name": "iPhone test",
            "app_version": "1.0.0",
        },
    )
    assert created.status_code == 201, created.text
    device_id = created.json()["id"]

    updated = client.post(
        "/api/v1/account/devices",
        headers=auth(first["token"]),
        json={
            "token": token,
            "platform": "ios",
            "device_name": "iPhone actualisé",
            "app_version": "1.0.1",
        },
    )
    assert updated.status_code == 201, updated.text
    assert updated.json()["id"] == device_id
    assert updated.json()["device_name"] == "iPhone actualisé"

    first_devices = client.get(
        "/api/v1/account/devices", headers=auth(first["token"])
    )
    assert first_devices.status_code == 200
    assert len(first_devices.json()) == 1
    assert client.get(
        "/api/v1/account/devices", headers=auth(second["token"])
    ).json() == []

    # A device id is never sufficient to delete another user's registration.
    assert client.delete(
        f"/api/v1/account/devices/{device_id}", headers=auth(second["token"])
    ).status_code == 204
    assert len(client.get(
        "/api/v1/account/devices", headers=auth(first["token"])
    ).json()) == 1

    deleted = client.delete(
        f"/api/v1/account/devices/{device_id}", headers=auth(first["token"])
    )
    assert deleted.status_code == 204, deleted.text
    assert client.get(
        "/api/v1/account/devices", headers=auth(first["token"])
    ).json() == []


def test_invalid_mobile_device_payload_is_rejected(mobile_client):
    client, _ = mobile_client
    session = register(client, "invalid-device@example.com")
    response = client.post(
        "/api/v1/account/devices",
        headers=auth(session["token"]),
        json={"token": "has whitespace token", "platform": "windows"},
    )
    assert response.status_code == 422


def test_push_token_belongs_to_only_one_active_account(mobile_client):
    client, _ = mobile_client
    first = register(client, "token-owner-one@example.com")
    second = register(client, "token-owner-two@example.com")
    payload = {"token": "ExponentPushToken[unique-owner-123456]", "platform": "android"}

    assert client.post("/api/v1/account/devices", headers=auth(first["token"]), json=payload).status_code == 201
    moved = client.post("/api/v1/account/devices", headers=auth(second["token"]), json=payload)

    assert moved.status_code == 201
    assert client.get("/api/v1/account/devices", headers=auth(first["token"])).json() == []
    assert len(client.get("/api/v1/account/devices", headers=auth(second["token"])).json()) == 1
