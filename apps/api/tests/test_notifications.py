from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.routes import accounts as account_routes
from app.api.routes import notifications as notification_routes
from app.main import app
from app.services.accounts import AccountService
from app.services.notifications import NotificationService


@pytest.fixture()
def notification_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    account_service = AccountService(f"sqlite:///{tmp_path / 'notifications.db'}")
    service = NotificationService(account_service)
    monkeypatch.setattr(account_routes, "account_service", account_service)
    monkeypatch.setattr(account_routes, "notification_service", service)
    monkeypatch.setattr(notification_routes, "notification_service", service)
    with TestClient(app) as client:
        yield client, service
    account_service.engine.dispose()


def register(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/account/register",
        json={
            "email": "notify@example.com",
            "password": "Anatole2026!",
            "display_name": "Notify Test",
            "accepted_terms": True,
            "accepted_privacy": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_notification_preferences_and_feed(notification_client):
    client, service = notification_client
    session = register(client)
    headers = auth(session["token"])

    preferences = client.get("/api/v1/notifications/preferences", headers=headers)
    assert preferences.status_code == 200, preferences.text
    assert preferences.json()["preferences"]["digest_frequency"] == "off"

    saved = client.put(
        "/api/v1/notifications/preferences",
        headers=headers,
        json={
            "in_app_enabled": True,
            "email_enabled": True,
            "digest_frequency": "weekdays",
            "digest_time": "08:15",
            "timezone": "America/Toronto",
            "weekly_day": 0,
            "include_watchlist": True,
            "include_portfolio": True,
            "include_alerts": True,
            "include_calendar": False,
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["preferences"]["digest_time"] == "08:15"

    created = client.app.state if False else None
    assert created is None

    import asyncio
    asyncio.run(
        service.create_event(
            user_id=session["user"]["id"],
            kind="system",
            title="Bienvenue",
            message="Le centre de notifications est prêt.",
            dedupe_key="welcome",
        )
    )

    feed = client.get("/api/v1/notifications/feed", headers=headers)
    assert feed.status_code == 200, feed.text
    body = feed.json()
    assert body["unread_count"] == 1
    notification_id = body["items"][0]["id"]

    marked = client.post(
        f"/api/v1/notifications/feed/{notification_id}/read",
        headers=headers,
    )
    assert marked.status_code == 204, marked.text
    refreshed = client.get("/api/v1/notifications/feed", headers=headers)
    assert refreshed.json()["unread_count"] == 0


def test_invalid_timezone_is_rejected(notification_client):
    client, _ = notification_client
    session = register(client)
    response = client.put(
        "/api/v1/notifications/preferences",
        headers=auth(session["token"]),
        json={
            "digest_frequency": "daily",
            "digest_time": "07:30",
            "timezone": "Mars/Olympus",
        },
    )
    assert response.status_code == 422


def test_send_test_requires_email_configuration(notification_client):
    client, _ = notification_client
    session = register(client)
    response = client.post(
        "/api/v1/notifications/send-test",
        headers=auth(session["token"]),
    )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_due_digest_is_sent_once_per_local_day(notification_client, monkeypatch):
    from datetime import UTC, datetime

    from app.schemas.accounts import AccountUser
    from app.schemas.notifications import NotificationDigest

    client, service = notification_client
    session = register(client)
    headers = auth(session["token"])
    saved = client.put(
        "/api/v1/notifications/preferences",
        headers=headers,
        json={
            "in_app_enabled": True,
            "email_enabled": True,
            "digest_frequency": "daily",
            "digest_time": "08:30",
            "timezone": "America/Toronto",
            "weekly_day": 0,
            "include_watchlist": False,
            "include_portfolio": False,
            "include_alerts": False,
            "include_calendar": False,
        },
    )
    assert saved.status_code == 200, saved.text

    deliveries: list[str] = []

    class FakeSender:
        configured = True

        async def send(self, *, recipient, subject, text_body, html_body):
            deliveries.append(recipient)

    async def fake_digest(user, preferences=None):
        return NotificationDigest(
            subject="Anatole Aujourd’hui · test",
            greeting="Bonjour,",
            summary="Résumé de test.",
            sections=[],
            generated_at=datetime.now(UTC),
        )

    service.email_sender = FakeSender()
    monkeypatch.setattr(service, "build_digest", fake_digest)
    user = AccountUser.model_validate(session["user"])
    assert user.email == "notify@example.com"

    now = datetime(2026, 8, 3, 12, 30, tzinfo=UTC)
    first = await service.run_due_digests(now)
    assert first.processed == 1
    assert first.sent == 1
    assert deliveries == ["notify@example.com"]

    second = await service.run_due_digests(now)
    assert second.processed == 0
    assert second.sent == 0
    assert deliveries == ["notify@example.com"]


@pytest.mark.asyncio
async def test_export_and_delete_include_notification_data(notification_client):
    client, service = notification_client
    session = register(client)
    headers = auth(session["token"])
    user_id = session["user"]["id"]

    await service.create_event(
        user_id=user_id,
        kind="system",
        title="Export test",
        message="Cette notification doit apparaître dans l’export.",
        dedupe_key="export-test",
    )

    exported = client.get("/api/v1/account/export", headers=headers)
    assert exported.status_code == 200, exported.text
    body = exported.json()
    assert body["notification_preferences"]["in_app_enabled"] is True
    assert body["notifications"][0]["title"] == "Export test"

    deleted = client.request(
        "DELETE",
        "/api/v1/account/delete",
        headers=headers,
        json={"password": "Anatole2026!", "confirmation": "SUPPRIMER"},
    )
    assert deleted.status_code == 204, deleted.text

    feed = await service.list_feed(user_id)
    assert feed.items == []
    assert feed.unread_count == 0
