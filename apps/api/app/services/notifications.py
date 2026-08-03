from __future__ import annotations

import asyncio
import hashlib
import html
import json
import logging
import smtplib
import uuid
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import (
    Column,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    func,
    insert,
    select,
    update,
)

from app.core.config import settings
from app.schemas.accounts import AccountUser, WorkspaceSnapshot
from app.schemas.notifications import (
    DigestRunResult,
    DigestSection,
    NotificationDigest,
    NotificationFeed,
    NotificationItem,
    NotificationPreferences,
)
from app.schemas.workspace import AlertEvaluateRequest
from app.services.accounts import AccountService, account_service
from app.services.alerts import alert_service
from app.services.calendar import calendar_service
from app.services.cockpit import cockpit_service
from app.services.watchlist import watchlist_service

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _from_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _format_percent(value: float) -> str:
    return f"{value:+.2f} %"


class EmailSender:
    @property
    def configured(self) -> bool:
        return bool(
            settings.notification_email_enabled
            and settings.smtp_host
            and settings.smtp_from_email
        )

    async def send(
        self,
        *,
        recipient: str,
        subject: str,
        text_body: str,
        html_body: str,
    ) -> None:
        if not self.configured:
            raise RuntimeError("La livraison par courriel n’est pas configurée.")
        await asyncio.to_thread(
            self._send_sync,
            recipient,
            subject,
            text_body,
            html_body,
        )

    def _send_sync(
        self,
        recipient: str,
        subject: str,
        text_body: str,
        html_body: str,
    ) -> None:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = (
            f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
            if settings.smtp_from_name
            else settings.smtp_from_email
        )
        message["To"] = recipient
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")

        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=20,
            ) as client:
                if settings.smtp_username:
                    client.login(
                        settings.smtp_username,
                        settings.smtp_password,
                    )
                client.send_message(message)
            return

        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=20,
        ) as client:
            if settings.smtp_use_tls:
                client.starttls()
            if settings.smtp_username:
                client.login(
                    settings.smtp_username,
                    settings.smtp_password,
                )
            client.send_message(message)


class NotificationService:
    def __init__(self, accounts: AccountService = account_service) -> None:
        self.account_service = accounts
        self.metadata = MetaData()
        self.preferences = Table(
            "notification_preferences",
            self.metadata,
            Column("user_id", String(36), primary_key=True),
            Column("payload", Text, nullable=False),
            Column("last_digest_at", String(40), nullable=True),
            Column("updated_at", String(40), nullable=False),
        )
        self.events = Table(
            "notification_events",
            self.metadata,
            Column("id", String(36), primary_key=True),
            Column("user_id", String(36), nullable=False, index=True),
            Column("kind", String(30), nullable=False),
            Column("title", String(180), nullable=False),
            Column("message", Text, nullable=False),
            Column("severity", String(20), nullable=False),
            Column("symbol", String(20), nullable=True),
            Column("route", String(300), nullable=True),
            Column("dedupe_key", String(160), nullable=False, index=True),
            Column("created_at", String(40), nullable=False, index=True),
            Column("read_at", String(40), nullable=True),
        )
        self.email_sender = EmailSender()
        self._schema_ready_for: str | None = None

    @property
    def email_available(self) -> bool:
        return self.email_sender.configured

    async def start(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    def _ensure_schema(self) -> None:
        engine_key = str(self.account_service.engine.url)
        if self._schema_ready_for == engine_key:
            return
        self.metadata.create_all(self.account_service.engine)
        self._schema_ready_for = engine_key

    async def get_preferences(self, user_id: str) -> NotificationPreferences:
        await self.start()
        return await asyncio.to_thread(self._get_preferences_sync, user_id)

    def _get_preferences_sync(self, user_id: str) -> NotificationPreferences:
        with self.account_service.engine.connect() as connection:
            row = connection.execute(
                select(self.preferences).where(
                    self.preferences.c.user_id == user_id
                )
            ).first()
        if row is None:
            return NotificationPreferences()
        try:
            return NotificationPreferences.model_validate_json(row.payload)
        except (ValueError, TypeError):
            return NotificationPreferences()

    async def save_preferences(
        self,
        user_id: str,
        preferences: NotificationPreferences,
    ) -> NotificationPreferences:
        await self.start()
        clean = preferences.model_copy(update={"updated_at": _utc_now()})
        await asyncio.to_thread(self._save_preferences_sync, user_id, clean)
        return clean

    def _save_preferences_sync(
        self,
        user_id: str,
        preferences: NotificationPreferences,
    ) -> None:
        now = _utc_now().isoformat()
        payload = preferences.model_dump_json()
        with self.account_service.engine.begin() as connection:
            existing = connection.execute(
                select(self.preferences.c.user_id).where(
                    self.preferences.c.user_id == user_id
                )
            ).first()
            if existing:
                connection.execute(
                    update(self.preferences)
                    .where(self.preferences.c.user_id == user_id)
                    .values(payload=payload, updated_at=now)
                )
            else:
                connection.execute(
                    insert(self.preferences).values(
                        user_id=user_id,
                        payload=payload,
                        last_digest_at=None,
                        updated_at=now,
                    )
                )

    async def list_feed(
        self,
        user_id: str,
        *,
        limit: int = 80,
    ) -> NotificationFeed:
        await self.start()
        return await asyncio.to_thread(self._list_feed_sync, user_id, limit)

    def _list_feed_sync(self, user_id: str, limit: int) -> NotificationFeed:
        with self.account_service.engine.connect() as connection:
            rows = connection.execute(
                select(self.events)
                .where(self.events.c.user_id == user_id)
                .order_by(self.events.c.created_at.desc())
                .limit(max(1, min(limit, 200)))
            ).all()
            unread = connection.execute(
                select(func.count())
                .select_from(self.events)
                .where(
                    self.events.c.user_id == user_id,
                    self.events.c.read_at.is_(None),
                )
            ).scalar_one()

        items = [
            NotificationItem(
                id=row.id,
                kind=row.kind,
                title=row.title,
                message=row.message,
                severity=row.severity,
                symbol=row.symbol,
                route=row.route,
                created_at=_from_iso(row.created_at) or _utc_now(),
                read_at=_from_iso(row.read_at),
            )
            for row in rows
        ]
        return NotificationFeed(
            items=items,
            unread_count=int(unread or 0),
            generated_at=_utc_now(),
        )

    async def create_event(
        self,
        *,
        user_id: str,
        kind: str,
        title: str,
        message: str,
        severity: str = "info",
        symbol: str | None = None,
        route: str | None = None,
        dedupe_key: str,
    ) -> bool:
        await self.start()
        return await asyncio.to_thread(
            self._create_event_sync,
            user_id,
            kind,
            title,
            message,
            severity,
            symbol,
            route,
            dedupe_key,
        )

    def _create_event_sync(
        self,
        user_id: str,
        kind: str,
        title: str,
        message: str,
        severity: str,
        symbol: str | None,
        route: str | None,
        dedupe_key: str,
    ) -> bool:
        normalized_key = hashlib.sha256(
            f"{user_id}|{dedupe_key}".encode("utf-8")
        ).hexdigest()
        with self.account_service.engine.begin() as connection:
            exists = connection.execute(
                select(self.events.c.id).where(
                    self.events.c.user_id == user_id,
                    self.events.c.dedupe_key == normalized_key,
                )
            ).first()
            if exists:
                return False
            connection.execute(
                insert(self.events).values(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    kind=kind,
                    title=title[:180],
                    message=message,
                    severity=severity,
                    symbol=symbol,
                    route=route,
                    dedupe_key=normalized_key,
                    created_at=_utc_now().isoformat(),
                    read_at=None,
                )
            )
        return True

    async def mark_read(self, user_id: str, notification_id: str) -> bool:
        await self.start()
        return await asyncio.to_thread(
            self._mark_read_sync,
            user_id,
            notification_id,
        )

    def _mark_read_sync(self, user_id: str, notification_id: str) -> bool:
        with self.account_service.engine.begin() as connection:
            result = connection.execute(
                update(self.events)
                .where(
                    self.events.c.id == notification_id,
                    self.events.c.user_id == user_id,
                )
                .values(read_at=_utc_now().isoformat())
            )
        return bool(result.rowcount)

    async def mark_all_read(self, user_id: str) -> None:
        await self.start()
        await asyncio.to_thread(self._mark_all_read_sync, user_id)

    def _mark_all_read_sync(self, user_id: str) -> None:
        with self.account_service.engine.begin() as connection:
            connection.execute(
                update(self.events)
                .where(
                    self.events.c.user_id == user_id,
                    self.events.c.read_at.is_(None),
                )
                .values(read_at=_utc_now().isoformat())
            )

    async def delete_user_data(self, user_id: str) -> None:
        await self.start()
        await asyncio.to_thread(self._delete_user_data_sync, user_id)

    def _delete_user_data_sync(self, user_id: str) -> None:
        with self.account_service.engine.begin() as connection:
            connection.execute(
                delete(self.events).where(self.events.c.user_id == user_id)
            )
            connection.execute(
                delete(self.preferences).where(
                    self.preferences.c.user_id == user_id
                )
            )

    async def refresh_user(self, user: AccountUser) -> NotificationFeed:
        preferences = await self.get_preferences(user.id)
        if not preferences.in_app_enabled:
            return await self.list_feed(user.id)
        workspace = await self.account_service.get_workspace(user.id)
        await self._generate_workspace_events(user, workspace, preferences)
        return await self.list_feed(user.id)

    async def _generate_workspace_events(
        self,
        user: AccountUser,
        workspace: WorkspaceSnapshot,
        preferences: NotificationPreferences,
    ) -> None:
        date_key = _utc_now().date().isoformat()
        tasks: list[asyncio.Task[Any]] = []

        if preferences.include_alerts and workspace.data.alerts:
            tasks.append(
                asyncio.create_task(
                    self._generate_alert_events(user.id, workspace, date_key)
                )
            )
        if preferences.include_watchlist and workspace.data.watchlist:
            tasks.append(
                asyncio.create_task(
                    self._generate_watchlist_events(user.id, workspace, date_key)
                )
            )
        if preferences.include_calendar:
            tasks.append(
                asyncio.create_task(
                    self._generate_calendar_events(user.id, date_key)
                )
            )

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    logger.warning("notification_refresh_partial_failure error=%s", result)

    async def _generate_alert_events(
        self,
        user_id: str,
        workspace: WorkspaceSnapshot,
        date_key: str,
    ) -> None:
        snapshot = await alert_service.evaluate(
            AlertEvaluateRequest(rules=workspace.data.alerts)
        )
        for item in snapshot.items:
            if not item.triggered:
                continue
            await self.create_event(
                user_id=user_id,
                kind="alert",
                title=f"Alerte déclenchée · {item.symbol}",
                message=item.message,
                severity="important",
                symbol=item.symbol,
                route=f"/focus/{item.symbol}",
                dedupe_key=f"alert:{item.id}:{date_key}",
            )

    async def _generate_watchlist_events(
        self,
        user_id: str,
        workspace: WorkspaceSnapshot,
        date_key: str,
    ) -> None:
        snapshot = await watchlist_service.get_snapshot(workspace.data.watchlist)
        movers = sorted(
            (
                item
                for item in snapshot.items
                if abs(item.change_percent) >= 2.0
            ),
            key=lambda item: abs(item.change_percent),
            reverse=True,
        )[:5]
        for item in movers:
            symbol = item.symbol.removesuffix(".TO")
            await self.create_event(
                user_id=user_id,
                kind="watchlist",
                title=f"Mouvement inhabituel · {symbol}",
                message=(
                    f"{item.name or symbol} varie de "
                    f"{_format_percent(item.change_percent)} aujourd’hui."
                ),
                severity="attention",
                symbol=symbol,
                route=f"/focus/{symbol}",
                dedupe_key=f"watchlist:{symbol}:{date_key}",
            )

    async def _generate_calendar_events(self, user_id: str, date_key: str) -> None:
        snapshot = await calendar_service.get_snapshot()
        now = _utc_now()
        horizon = now + timedelta(hours=48)
        events = [
            item
            for item in snapshot.events
            if item.importance == "Élevée" and now <= item.starts_at <= horizon
        ][:4]
        for item in events:
            await self.create_event(
                user_id=user_id,
                kind="calendar",
                title="Événement de marché à venir",
                message=(
                    f"{item.title} · "
                    f"{item.starts_at.astimezone(ZoneInfo('America/Toronto')).strftime('%d %b, %H h %M')}"
                ),
                severity="info",
                route="/calendrier",
                dedupe_key=f"calendar:{item.id}:{date_key}",
            )

    async def build_digest(
        self,
        user: AccountUser,
        preferences: NotificationPreferences | None = None,
    ) -> NotificationDigest:
        prefs = preferences or await self.get_preferences(user.id)
        workspace = await self.account_service.get_workspace(user.id)
        market_task = (
            cockpit_service.get_composite()
            if workspace.data.cockpit_universe == "composite"
            else cockpit_service.get_tsx60()
        )
        optional_tasks: dict[str, Any] = {"market": market_task}
        if prefs.include_watchlist and workspace.data.watchlist:
            optional_tasks["watchlist"] = watchlist_service.get_snapshot(
                workspace.data.watchlist
            )
        if prefs.include_alerts and workspace.data.alerts:
            optional_tasks["alerts"] = alert_service.evaluate(
                AlertEvaluateRequest(rules=workspace.data.alerts)
            )
        if prefs.include_calendar:
            optional_tasks["calendar"] = calendar_service.get_snapshot()

        keys = list(optional_tasks)
        values = await asyncio.gather(
            *(optional_tasks[key] for key in keys),
            return_exceptions=True,
        )
        data = dict(zip(keys, values, strict=True))
        sections: list[DigestSection] = []

        market = data.get("market")
        if not isinstance(market, Exception) and market is not None:
            strongest = sorted(
                market.sectors,
                key=lambda item: item.change_percent,
                reverse=True,
            )[:2]
            weakest = sorted(
                market.sectors,
                key=lambda item: item.change_percent,
            )[:2]
            sections.append(
                DigestSection(
                    key="market",
                    title="Marché canadien",
                    items=[
                        f"Variation pondérée : {_format_percent(market.weighted_change_percent)}",
                        f"Largeur : {market.breadth.advancers} hausses, {market.breadth.decliners} baisses",
                        "Secteurs les plus solides : " + ", ".join(item.sector for item in strongest),
                        "Secteurs sous pression : " + ", ".join(item.sector for item in weakest),
                    ],
                )
            )

        watchlist = data.get("watchlist")
        if not isinstance(watchlist, Exception) and watchlist is not None:
            movers = sorted(
                watchlist.items,
                key=lambda item: abs(item.change_percent),
                reverse=True,
            )[:5]
            sections.append(
                DigestSection(
                    key="watchlist",
                    title="Watchlist",
                    items=[
                        f"{item.symbol.removesuffix('.TO')} : {_format_percent(item.change_percent)}"
                        for item in movers
                    ],
                )
            )

        alerts = data.get("alerts")
        if not isinstance(alerts, Exception) and alerts is not None:
            triggered = [item for item in alerts.items if item.triggered]
            sections.append(
                DigestSection(
                    key="alerts",
                    title="Alertes",
                    items=(
                        [item.message for item in triggered[:5]]
                        if triggered
                        else ["Aucune alerte déclenchée lors de cette vérification."]
                    ),
                )
            )

        calendar = data.get("calendar")
        if not isinstance(calendar, Exception) and calendar is not None:
            now = _utc_now()
            upcoming = [item for item in calendar.events if item.starts_at >= now][:5]
            sections.append(
                DigestSection(
                    key="calendar",
                    title="Prochains événements",
                    items=[
                        f"{item.title} · {item.starts_at.astimezone(ZoneInfo(prefs.timezone)).strftime('%d %b, %H h %M')}"
                        for item in upcoming
                    ] or ["Aucun événement majeur prochainement."],
                )
            )

        if prefs.include_portfolio and workspace.data.portfolio:
            sections.append(
                DigestSection(
                    key="portfolio",
                    title="Portefeuille de suivi",
                    items=[
                        f"{len(workspace.data.portfolio)} position(s) suivie(s). Consulte Anatole pour la valorisation actualisée.",
                    ],
                )
            )

        first_name = (
            user.display_name.split()[0]
            if user.display_name and user.display_name.strip()
            else ""
        )
        greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"
        subject = f"Anatole Aujourd’hui · {_utc_now().astimezone(ZoneInfo(prefs.timezone)).strftime('%d %B %Y')}"
        return NotificationDigest(
            subject=subject,
            greeting=greeting,
            summary=(
                "Voici les principaux éléments observés dans ton espace Anatole. "
                "Chaque point est descriptif et peut être approfondi dans l’application."
            ),
            sections=sections,
            generated_at=_utc_now(),
        )

    def render_digest(self, digest: NotificationDigest) -> tuple[str, str]:
        text_parts = [digest.greeting, "", digest.summary, ""]
        html_sections: list[str] = []
        for section in digest.sections:
            text_parts.append(section.title.upper())
            text_parts.extend(f"• {item}" for item in section.items)
            text_parts.append("")
            html_sections.append(
                "<section style='margin:18px 0;padding:18px;border:1px solid #1c4a62;border-radius:14px;background:#082333'>"
                f"<h2 style='margin:0 0 10px;font-size:18px;color:#f3f8fb'>{html.escape(section.title)}</h2>"
                "<ul style='margin:0;padding-left:20px;color:#b7d1df'>"
                + "".join(f"<li style='margin:7px 0'>{html.escape(item)}</li>" for item in section.items)
                + "</ul></section>"
            )
        text_parts.extend([digest.disclaimer, "", settings.notification_app_url])
        text_body = "\n".join(text_parts)
        html_body = (
            "<!doctype html><html><body style='margin:0;background:#03111a;color:#eef7fb;font-family:Arial,sans-serif'>"
            "<main style='max-width:680px;margin:0 auto;padding:28px'>"
            "<div style='font-size:12px;letter-spacing:2px;color:#6ca5ff;font-weight:700'>ANATOLE AUJOURD’HUI</div>"
            f"<h1 style='font-size:34px;margin:10px 0 6px'>{html.escape(digest.greeting)}</h1>"
            f"<p style='color:#91b2c4;line-height:1.6'>{html.escape(digest.summary)}</p>"
            + "".join(html_sections)
            + f"<p style='color:#7898aa;font-size:12px;line-height:1.5'>{html.escape(digest.disclaimer)}</p>"
            + f"<a href='{html.escape(settings.notification_app_url)}' style='display:inline-block;margin-top:12px;padding:12px 18px;border-radius:10px;background:#347ded;color:white;text-decoration:none;font-weight:700'>Ouvrir Anatole</a>"
            + "</main></body></html>"
        )
        return text_body, html_body

    async def send_test(self, user: AccountUser) -> NotificationDigest:
        digest = await self.build_digest(user)
        text_body, html_body = self.render_digest(digest)
        await self.email_sender.send(
            recipient=user.email,
            subject=f"TEST · {digest.subject}",
            text_body=text_body,
            html_body=html_body,
        )
        return digest

    async def run_due_digests(self, now: datetime | None = None) -> DigestRunResult:
        await self.start()
        current = now or _utc_now()
        due = await asyncio.to_thread(self._due_users_sync, current)
        result = DigestRunResult(processed=len(due))
        for user, preferences in due:
            if not self.email_sender.configured:
                result.skipped += 1
                continue
            try:
                digest = await self.build_digest(user, preferences)
                text_body, html_body = self.render_digest(digest)
                await self.email_sender.send(
                    recipient=user.email,
                    subject=digest.subject,
                    text_body=text_body,
                    html_body=html_body,
                )
                await asyncio.to_thread(
                    self._mark_digest_sent_sync,
                    user.id,
                    current,
                )
                await self.create_event(
                    user_id=user.id,
                    kind="digest",
                    title="Résumé Anatole envoyé",
                    message=f"Le résumé « {digest.subject} » a été envoyé à {user.email}.",
                    route="/notifications",
                    dedupe_key=f"digest:{current.date().isoformat()}",
                )
                result.sent += 1
            except Exception:
                logger.exception("notification_digest_failed user_id=%s", user.id)
                result.failed += 1
        return result

    def _due_users_sync(
        self,
        current: datetime,
    ) -> list[tuple[AccountUser, NotificationPreferences]]:
        due: list[tuple[AccountUser, NotificationPreferences]] = []
        with self.account_service.engine.connect() as connection:
            rows = connection.execute(
                select(
                    self.account_service.users,
                    self.preferences.c.payload,
                    self.preferences.c.last_digest_at,
                ).join(
                    self.preferences,
                    self.preferences.c.user_id == self.account_service.users.c.id,
                )
            ).all()

        for row in rows:
            try:
                preferences = NotificationPreferences.model_validate_json(row.payload)
            except (ValueError, TypeError):
                continue
            if not preferences.email_enabled or preferences.digest_frequency == "off":
                continue
            local_now = current.astimezone(ZoneInfo(preferences.timezone))
            hour, minute = (int(part) for part in preferences.digest_time.split(":"))
            scheduled = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if not (scheduled <= local_now < scheduled + timedelta(minutes=15)):
                continue
            if preferences.digest_frequency == "weekdays" and local_now.weekday() >= 5:
                continue
            if preferences.digest_frequency == "weekly" and local_now.weekday() != preferences.weekly_day:
                continue
            last_digest = _from_iso(row.last_digest_at)
            if last_digest and last_digest.astimezone(ZoneInfo(preferences.timezone)).date() == local_now.date():
                continue
            user = self.account_service._user_from_row(row)
            due.append((user, preferences))
        return due

    def _mark_digest_sent_sync(self, user_id: str, sent_at: datetime) -> None:
        with self.account_service.engine.begin() as connection:
            connection.execute(
                update(self.preferences)
                .where(self.preferences.c.user_id == user_id)
                .values(last_digest_at=sent_at.isoformat())
            )


notification_service = NotificationService()
