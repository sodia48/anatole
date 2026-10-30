from __future__ import annotations

from pathlib import Path
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
import asyncio
from uuid import uuid4

from sqlalchemy import event, update

import pytest
from fastapi.testclient import TestClient

from app.api.routes import accounts as account_routes
from app.api.routes import notifications as notification_routes
from app.main import app
from app.services.accounts import AccountService
from app.services.notifications import NotificationService
from app.schemas.workspace import AlertEvaluation, AlertRule


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


def test_option_reminders_are_account_scoped_durable_and_idempotent(notification_client):
    client, service = notification_client
    first = register(client)
    second = client.post("/api/v1/account/register", json={"email": "other@example.com", "password": "Anatole2026!",
        "display_name": "Other", "accepted_terms": True, "accepted_privacy": True}).json()
    headers, other = auth(first["token"]), auth(second["token"])
    position_id = str(uuid4())
    now = datetime.now(UTC)
    payload = {"expected_account_id": first["user"]["id"], "position_id": position_id, "underlying": "RY", "expires_at": (now + timedelta(days=8)).isoformat(), "reminder_days": 7}
    url = "/api/v1/notifications/option-reminders"
    assert client.post(url, json=payload).status_code == 401
    assert client.post(url, headers=headers, json={**payload, "quantity": 2}).status_code == 422
    assert client.post(url, headers=headers, json={**payload, "expires_at": "2027-11-25T16:00:00"}).status_code == 422
    assert client.post(url, headers=headers, json={**payload, "expires_at": (now - timedelta(days=1)).isoformat()}).status_code == 422
    assert client.post(url, headers=headers, json=payload).status_code == 204
    assert client.get(url, headers=other).json() == []
    assert client.post(url, headers=other, json=payload).status_code == 409
    assert client.delete(f"{url}/{position_id}", headers={**other, "X-Anatole-Account": first['user']['id']}).status_code == 409
    assert client.delete(f"{url}/{position_id}", headers={**other, "X-Anatole-Account": second['user']['id']}).status_code == 404
    assert len(client.get("/api/v1/account/export", headers=headers).json()["option_expiry_reminders"]) == 1
    assert asyncio.run(service.generate_option_reminders(now)) == 0
    assert asyncio.run(service.generate_option_reminders(now + timedelta(days=2))) == 1
    assert asyncio.run(service.generate_option_reminders(now + timedelta(days=2))) == 0
    feed = client.get("/api/v1/notifications/feed", headers=headers).json()["items"]
    assert len(feed) == 1 and "Échéance saisie à venir" in feed[0]["message"]
    assert client.get("/api/v1/notifications/feed", headers=other).json()["items"] == []
    assert client.post(url, headers=headers, json=payload).status_code == 204
    assert asyncio.run(service.generate_option_reminders(now + timedelta(days=2))) == 0
    assert client.delete(f"{url}/{position_id}", headers={**headers, "X-Anatole-Account": first['user']['id']}).status_code == 204
    assert client.get(url, headers=headers).json() == []


def test_option_reminder_respects_notification_preferences_and_account_deletion(notification_client):
    client, service = notification_client
    session = register(client)
    headers = auth(session["token"])
    now = datetime.now(UTC)
    payload = {"expected_account_id": session["user"]["id"], "position_id": str(uuid4()), "underlying": "TD", "expires_at": (now + timedelta(days=1)).isoformat(), "reminder_days": 7}
    assert client.post("/api/v1/notifications/option-reminders", headers=headers, json=payload).status_code == 204
    preferences = client.get("/api/v1/notifications/preferences", headers=headers).json()["preferences"]
    preferences["include_alerts"] = False
    assert client.put("/api/v1/notifications/preferences", headers=headers, json=preferences).status_code == 200
    assert asyncio.run(service.generate_option_reminders(now)) == 0
    preferences["include_alerts"] = True
    assert client.put("/api/v1/notifications/preferences", headers=headers, json=preferences).status_code == 200
    assert asyncio.run(service.generate_option_reminders(now + timedelta(days=2))) == 1
    assert "Échéance saisie passée" in client.get("/api/v1/notifications/feed", headers=headers).json()["items"][0]["message"]
    assert client.request("DELETE", "/api/v1/account/delete", headers=headers, json={"password": "Anatole2026!", "confirmation": "SUPPRIMER"}).status_code == 204
    assert asyncio.run(service.list_option_reminders(session["user"]["id"])) == []


def test_option_reminder_workers_do_not_duplicate_events(notification_client):
    client, service = notification_client
    session = register(client)
    now = datetime.now(UTC)
    payload = {"expected_account_id": session["user"]["id"], "position_id": str(uuid4()), "underlying": "RY", "expires_at": (now + timedelta(days=1)).isoformat(), "reminder_days": 7}
    assert client.post("/api/v1/notifications/option-reminders", headers=auth(session["token"]), json=payload).status_code == 204
    async def workers():
        return await asyncio.gather(*(service.generate_option_reminders(now) for _ in range(4)))
    assert sum(asyncio.run(workers())) == 1
    assert len(client.get("/api/v1/notifications/feed", headers=auth(session["token"])).json()["items"]) == 1


def test_option_reminder_worker_processes_due_rows(notification_client, monkeypatch):
    client, service = notification_client
    session = register(client)
    payload = {"expected_account_id": session["user"]["id"], "position_id": str(uuid4()), "underlying": "RY",
        "expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(), "reminder_days": 7}
    assert client.post("/api/v1/notifications/option-reminders", headers=auth(session["token"]), json=payload).status_code == 204
    async def run_worker():
        processed = asyncio.Event()
        generate = service.generate_option_reminders
        async def observed(*args, **kwargs):
            result = await generate(*args, **kwargs)
            processed.set()
            return result
        monkeypatch.setattr(service, "generate_option_reminders", observed)
        task = asyncio.create_task(service.run_option_reminder_worker())
        try:
            await asyncio.wait_for(processed.wait(), timeout=5)
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    asyncio.run(run_worker())
    assert len(client.get("/api/v1/notifications/feed", headers=auth(session["token"])).json()["items"]) == 1


def test_account_delete_rolls_back_if_reminders_cannot_be_removed(notification_client):
    client, service = notification_client
    session = register(client)
    headers = auth(session["token"])
    payload = {"expected_account_id": session["user"]["id"], "position_id": str(uuid4()), "underlying": "RY",
        "expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(), "reminder_days": 7}
    assert client.post("/api/v1/notifications/option-reminders", headers=headers, json=payload).status_code == 204
    def fail_reminder_delete(_connection, _cursor, statement, _parameters, _context, _executemany):
        if statement.startswith("DELETE FROM option_expiry_reminders"):
            raise RuntimeError("synthetic database failure")
    event.listen(service.account_service.engine, "before_cursor_execute", fail_reminder_delete)
    try:
        response = client.request("DELETE", "/api/v1/account/delete", headers=headers,
                                  json={"password": "Anatole2026!", "confirmation": "SUPPRIMER"})
        assert response.status_code == 500
    finally:
        event.remove(service.account_service.engine, "before_cursor_execute", fail_reminder_delete)
    assert client.get("/api/v1/account/me", headers=headers).status_code == 200
    assert len(client.get("/api/v1/notifications/option-reminders", headers=headers).json()) == 1


def test_fundamental_feed_deduplicates_filing_and_honors_cooldown(notification_client, monkeypatch):
    client, service = notification_client
    user_id = register(client)["user"]["id"]
    rule = AlertRule(id="filing-rule", symbol="RY", kind="event", event_type="fundamental_results", cooldown_minutes=60)
    workspace = SimpleNamespace(data=SimpleNamespace(alerts=[rule]))
    fingerprint = "RY:results:annual:2025:report-1"

    async def evaluate(_request):
        return SimpleNamespace(items=[AlertEvaluation(
            id=rule.id, symbol="RY", name="Royal Bank", event_type="fundamental_results",
            metric_label="Publication de résultats", unit="", triggered=True, status="triggered",
            message="Rapport officiel daté.", event_fingerprint=fingerprint,
            evaluated_at=datetime.now(UTC),
        )])

    monkeypatch.setattr("app.services.notifications.alert_service.evaluate", evaluate)
    asyncio.run(service._generate_alert_events(user_id, workspace, "2026-01-01"))
    assert len(asyncio.run(service.list_feed(user_id)).items) == 1
    fingerprint = "RY:results:quarterly:2026:report-2"
    asyncio.run(service._generate_alert_events(user_id, workspace, "2026-01-02"))
    assert len(asyncio.run(service.list_feed(user_id)).items) == 1
    with service.account_service.engine.begin() as connection:
        connection.execute(update(service.events).values(created_at=(datetime.now(UTC) - timedelta(hours=2)).isoformat()))
    asyncio.run(service._generate_alert_events(user_id, workspace, "2026-01-03"))
    assert len(asyncio.run(service.list_feed(user_id)).items) == 2
    asyncio.run(service._generate_alert_events(user_id, workspace, "2026-01-04"))
    assert len(asyncio.run(service.list_feed(user_id)).items) == 2


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
