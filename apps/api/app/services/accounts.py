from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    func,
    insert,
    or_,
    select,
    update,
    text,
)
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import QueuePool

from app.core.config import settings
from app.schemas.accounts import (
    AccountUser,
    SyncedWorkspaceData,
    WorkspaceSnapshot,
)


class AccountAlreadyExistsError(RuntimeError):
    pass


class InvalidCredentialsError(RuntimeError):
    pass


class InvalidInviteError(RuntimeError):
    pass


class WorkspaceConflictError(RuntimeError):
    def __init__(self, current_revision: int) -> None:
        super().__init__("Le compte a été modifié sur un autre appareil.")
        self.current_revision = current_revision


@dataclass(slots=True)
class AuthenticatedSession:
    token: str
    expires_at: datetime
    user: AccountUser
    workspace: WorkspaceSnapshot


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _from_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    n, r, p = 2**14, 8, 1
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=n,
        r=r,
        p=p,
        dklen=32,
    )
    return "scrypt${}${}${}${}${}".format(
        n,
        r,
        p,
        salt.hex(),
        digest.hex(),
    )


def _password_matches(password: str, encoded: str) -> bool:
    try:
        algorithm, raw_n, raw_r, raw_p, raw_salt, raw_digest = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        candidate = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(raw_salt),
            n=int(raw_n),
            r=int(raw_r),
            p=int(raw_p),
            dklen=len(bytes.fromhex(raw_digest)),
        )
        return hmac.compare_digest(candidate, bytes.fromhex(raw_digest))
    except (TypeError, ValueError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _invite_hash(code: str) -> str:
    normalized = code.strip().upper()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _invite_hint(code: str) -> str:
    normalized = code.strip().upper()
    return normalized[-6:] if len(normalized) > 6 else normalized


class AccountService:
    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = database_url or settings.account_database_url
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        elif self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        connect_args: dict[str, Any] = {}
        pool_args: dict[str, Any] = {}
        if self.database_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
            connect_args["timeout"] = 30
            # SQLite allows a single writer. Keeping one pooled connection
            # avoids immediate SQLITE_LOCKED failures with shared in-memory
            # databases and makes local account writes deterministic.
            pool_args.update(
                poolclass=QueuePool,
                pool_size=1,
                max_overflow=0,
                pool_timeout=30,
            )

        self.engine: Engine = create_engine(
            self.database_url,
            future=True,
            pool_pre_ping=True,
            connect_args=connect_args,
            **pool_args,
        )
        self.metadata = MetaData()
        self.users = Table(
            "account_users",
            self.metadata,
            Column("id", String(36), primary_key=True),
            Column("email", String(254), nullable=False, unique=True, index=True),
            Column("display_name", String(60), nullable=True),
            Column("password_hash", Text, nullable=False),
            Column("created_at", String(40), nullable=False),
            Column("updated_at", String(40), nullable=False),
            Column("last_login_at", String(40), nullable=True),
        )
        self.sessions = Table(
            "account_sessions",
            self.metadata,
            Column("token_hash", String(64), primary_key=True),
            Column("user_id", String(36), nullable=False, index=True),
            Column("created_at", String(40), nullable=False),
            Column("expires_at", String(40), nullable=False, index=True),
        )
        self.workspaces = Table(
            "account_workspaces",
            self.metadata,
            Column("user_id", String(36), primary_key=True),
            Column("revision", String(20), nullable=False),
            Column("payload", Text, nullable=False),
            Column("updated_at", String(40), nullable=False),
        )
        self.invites = Table(
            "account_invites",
            self.metadata,
            Column("id", String(36), primary_key=True),
            Column("code_hash", String(64), nullable=False, unique=True, index=True),
            Column("code_hint", String(16), nullable=False),
            Column("label", String(80), nullable=False),
            Column("max_uses", Integer, nullable=False),
            Column("uses", Integer, nullable=False, default=0),
            Column("disabled", Boolean, nullable=False, default=False),
            Column("created_by", String(36), nullable=False),
            Column("created_at", String(40), nullable=False),
            Column("expires_at", String(40), nullable=True),
            Column("last_used_at", String(40), nullable=True),
        )
        self.feedback_reports = Table(
            "beta_feedback_reports",
            self.metadata,
            Column("report_id", String(24), primary_key=True),
            Column("category", String(30), nullable=False),
            Column("message", Text, nullable=False),
            Column("route", String(300), nullable=False),
            Column("section", String(80), nullable=True),
            Column("universe", String(40), nullable=True),
            Column("request_id", String(100), nullable=True),
            Column("viewport", String(40), nullable=True),
            Column("app_version", String(40), nullable=True),
            Column("user_agent", String(500), nullable=True),
            Column("diagnostics_included", Boolean, nullable=False, default=True),
            Column("status", String(20), nullable=False, default="new"),
            Column("created_at", String(40), nullable=False),
            Column("updated_at", String(40), nullable=False),
        )
        self._schema_lock = threading.Lock()
        self._started = False

    async def start(self) -> None:
        await asyncio.to_thread(self._ensure_schema)

    async def close(self) -> None:
        await asyncio.to_thread(self.engine.dispose)

    async def readiness(self) -> dict[str, object]:
        await self.start()
        return await asyncio.to_thread(self._readiness_sync)

    def _readiness_sync(self) -> dict[str, object]:
        with self.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        mode = "postgresql" if self.database_url.startswith("postgresql+") else "sqlite"
        durable = mode == "postgresql" or self.database_url.startswith("sqlite:////")
        return {"status": "ready", "mode": mode, "durable": durable}

    def _ensure_schema(self) -> None:
        if self._started:
            return
        with self._schema_lock:
            if self._started:
                return
            self.metadata.create_all(self.engine)
            self._started = True

    def _workspace_from_row(self, row: Any | None) -> WorkspaceSnapshot:
        if row is None:
            return WorkspaceSnapshot(
                revision=0,
                data=SyncedWorkspaceData(),
                updated_at=None,
            )
        return WorkspaceSnapshot(
            revision=int(row.revision),
            data=SyncedWorkspaceData.model_validate_json(row.payload),
            updated_at=_from_iso(row.updated_at),
        )

    def _user_from_row(self, row: Any) -> AccountUser:
        return AccountUser(
            id=row.id,
            email=row.email,
            display_name=row.display_name,
            created_at=_from_iso(row.created_at) or _utc_now(),
            last_login_at=_from_iso(row.last_login_at),
            is_admin=row.email.lower() in settings.account_admin_email_set,
        )

    def _workspace_for_user_sync(self, connection: Any, user_id: str) -> WorkspaceSnapshot:
        row = connection.execute(
            select(self.workspaces).where(self.workspaces.c.user_id == user_id)
        ).mappings().first()
        return self._workspace_from_row(row)

    def _create_session_sync(self, connection: Any, user_row: Any) -> AuthenticatedSession:
        now = _utc_now()
        expires_at = now + timedelta(days=settings.account_session_days)
        token = secrets.token_urlsafe(48)
        connection.execute(
            insert(self.sessions).values(
                token_hash=_token_hash(token),
                user_id=user_row.id,
                created_at=_to_iso(now),
                expires_at=_to_iso(expires_at),
            )
        )
        workspace = self._workspace_for_user_sync(connection, user_row.id)
        return AuthenticatedSession(
            token=token,
            expires_at=expires_at,
            user=self._user_from_row(user_row),
            workspace=workspace,
        )

    async def register(
        self,
        *,
        email: str,
        password: str,
        display_name: str | None,
        invite_code: str | None = None,
        invite_required: bool = False,
        invite_already_valid: bool = False,
    ) -> AuthenticatedSession:
        await self.start()
        return await asyncio.to_thread(
            self._register_sync,
            email,
            password,
            display_name,
            invite_code,
            invite_required,
            invite_already_valid,
        )

    def _register_sync(
        self,
        email: str,
        password: str,
        display_name: str | None,
        invite_code: str | None,
        invite_required: bool,
        invite_already_valid: bool,
    ) -> AuthenticatedSession:
        now = _utc_now()
        user_id = str(uuid.uuid4())
        try:
            with self.engine.begin() as connection:
                if invite_required and not invite_already_valid:
                    if not self._consume_invite_sync(connection, invite_code or ""):
                        raise InvalidInviteError
                connection.execute(
                    insert(self.users).values(
                        id=user_id,
                        email=email,
                        display_name=display_name,
                        password_hash=_password_hash(password),
                        created_at=_to_iso(now),
                        updated_at=_to_iso(now),
                        last_login_at=_to_iso(now),
                    )
                )
                empty = SyncedWorkspaceData()
                connection.execute(
                    insert(self.workspaces).values(
                        user_id=user_id,
                        revision="0",
                        payload=empty.model_dump_json(),
                        updated_at=_to_iso(now),
                    )
                )
                row = connection.execute(
                    select(self.users).where(self.users.c.id == user_id)
                ).mappings().one()
                return self._create_session_sync(connection, row)
        except IntegrityError as error:
            raise AccountAlreadyExistsError from error

    async def login(self, *, email: str, password: str) -> AuthenticatedSession:
        await self.start()
        return await asyncio.to_thread(self._login_sync, email, password)

    def _login_sync(self, email: str, password: str) -> AuthenticatedSession:
        with self.engine.begin() as connection:
            row = connection.execute(
                select(self.users).where(self.users.c.email == email)
            ).mappings().first()
            if row is None or not _password_matches(password, row.password_hash):
                raise InvalidCredentialsError

            now = _utc_now()
            connection.execute(
                update(self.users)
                .where(self.users.c.id == row.id)
                .values(last_login_at=_to_iso(now), updated_at=_to_iso(now))
            )
            refreshed = dict(row)
            refreshed["last_login_at"] = _to_iso(now)
            return self._create_session_sync(connection, type("Row", (), refreshed)())

    async def authenticate(self, token: str) -> AccountUser | None:
        await self.start()
        return await asyncio.to_thread(self._authenticate_sync, token)

    def _authenticate_sync(self, token: str) -> AccountUser | None:
        now = _utc_now()
        with self.engine.begin() as connection:
            session = connection.execute(
                select(self.sessions).where(
                    self.sessions.c.token_hash == _token_hash(token)
                )
            ).mappings().first()
            if session is None:
                return None
            expires_at = _from_iso(session.expires_at)
            if expires_at is None or expires_at <= now:
                connection.execute(
                    delete(self.sessions).where(
                        self.sessions.c.token_hash == session.token_hash
                    )
                )
                return None
            row = connection.execute(
                select(self.users).where(self.users.c.id == session.user_id)
            ).mappings().first()
            return self._user_from_row(row) if row is not None else None

    async def logout(self, token: str) -> None:
        await self.start()
        await asyncio.to_thread(self._logout_sync, token)

    def _logout_sync(self, token: str) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                delete(self.sessions).where(
                    self.sessions.c.token_hash == _token_hash(token)
                )
            )

    async def logout_all(self, user_id: str) -> None:
        await self.start()
        await asyncio.to_thread(self._logout_all_sync, user_id)

    def _logout_all_sync(self, user_id: str) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                delete(self.sessions).where(self.sessions.c.user_id == user_id)
            )

    async def get_workspace(self, user_id: str) -> WorkspaceSnapshot:
        await self.start()
        return await asyncio.to_thread(self._get_workspace_sync, user_id)

    def _get_workspace_sync(self, user_id: str) -> WorkspaceSnapshot:
        with self.engine.connect() as connection:
            return self._workspace_for_user_sync(connection, user_id)

    async def update_workspace(
        self,
        *,
        user_id: str,
        expected_revision: int,
        data: SyncedWorkspaceData,
    ) -> WorkspaceSnapshot:
        await self.start()
        return await asyncio.to_thread(
            self._update_workspace_sync,
            user_id,
            expected_revision,
            data,
        )

    def _update_workspace_sync(
        self,
        user_id: str,
        expected_revision: int,
        data: SyncedWorkspaceData,
    ) -> WorkspaceSnapshot:
        now = _utc_now()
        with self.engine.begin() as connection:
            row = connection.execute(
                select(self.workspaces).where(self.workspaces.c.user_id == user_id)
            ).mappings().first()
            current_revision = int(row.revision) if row is not None else 0
            if current_revision != expected_revision:
                raise WorkspaceConflictError(current_revision)

            next_revision = current_revision + 1
            values = {
                "revision": str(next_revision),
                "payload": data.model_dump_json(),
                "updated_at": _to_iso(now),
            }
            if row is None:
                connection.execute(
                    insert(self.workspaces).values(user_id=user_id, **values)
                )
            else:
                connection.execute(
                    update(self.workspaces)
                    .where(self.workspaces.c.user_id == user_id)
                    .values(**values)
                )

            return WorkspaceSnapshot(
                revision=next_revision,
                data=data,
                updated_at=now,
            )

    async def account_status(self, user_id: str) -> tuple[AccountUser, WorkspaceSnapshot] | None:
        await self.start()
        return await asyncio.to_thread(self._account_status_sync, user_id)

    def _account_status_sync(self, user_id: str) -> tuple[AccountUser, WorkspaceSnapshot] | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                select(self.users).where(self.users.c.id == user_id)
            ).mappings().first()
            if row is None:
                return None
            return self._user_from_row(row), self._workspace_for_user_sync(connection, user_id)


    async def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None,
    ) -> AccountUser | None:
        await self.start()
        return await asyncio.to_thread(
            self._update_profile_sync,
            user_id,
            display_name,
        )

    def _update_profile_sync(
        self,
        user_id: str,
        display_name: str | None,
    ) -> AccountUser | None:
        now = _utc_now()
        with self.engine.begin() as connection:
            result = connection.execute(
                update(self.users)
                .where(self.users.c.id == user_id)
                .values(display_name=display_name, updated_at=_to_iso(now))
            )
            if result.rowcount == 0:
                return None
            row = connection.execute(
                select(self.users).where(self.users.c.id == user_id)
            ).mappings().first()
            return self._user_from_row(row) if row is not None else None

    async def change_password(
        self,
        *,
        user_id: str,
        current_password: str,
        new_password: str,
        current_token: str,
    ) -> None:
        await self.start()
        await asyncio.to_thread(
            self._change_password_sync,
            user_id,
            current_password,
            new_password,
            current_token,
        )

    def _change_password_sync(
        self,
        user_id: str,
        current_password: str,
        new_password: str,
        current_token: str,
    ) -> None:
        now = _utc_now()
        current_token_hash = _token_hash(current_token)
        with self.engine.begin() as connection:
            row = connection.execute(
                select(self.users).where(self.users.c.id == user_id)
            ).mappings().first()
            if row is None or not _password_matches(
                current_password,
                row.password_hash,
            ):
                raise InvalidCredentialsError
            connection.execute(
                update(self.users)
                .where(self.users.c.id == user_id)
                .values(
                    password_hash=_password_hash(new_password),
                    updated_at=_to_iso(now),
                )
            )
            connection.execute(
                delete(self.sessions).where(
                    (self.sessions.c.user_id == user_id)
                    & (self.sessions.c.token_hash != current_token_hash)
                )
            )

    async def export_account(
        self,
        user_id: str,
    ) -> tuple[AccountUser, WorkspaceSnapshot] | None:
        return await self.account_status(user_id)

    async def delete_account(
        self,
        *,
        user_id: str,
        password: str,
    ) -> None:
        await self.start()
        await asyncio.to_thread(
            self._delete_account_sync,
            user_id,
            password,
        )

    def _delete_account_sync(
        self,
        user_id: str,
        password: str,
    ) -> None:
        with self.engine.begin() as connection:
            row = connection.execute(
                select(self.users).where(self.users.c.id == user_id)
            ).mappings().first()
            if row is None or not _password_matches(password, row.password_hash):
                raise InvalidCredentialsError
            connection.execute(
                delete(self.workspaces).where(self.workspaces.c.user_id == user_id)
            )
            connection.execute(
                delete(self.sessions).where(self.sessions.c.user_id == user_id)
            )
            connection.execute(
                delete(self.users).where(self.users.c.id == user_id)
            )


    def _invite_active(self, row: Any, now: datetime | None = None) -> bool:
        current = now or _utc_now()
        expires_at = _from_iso(row.expires_at)
        return (
            not bool(row.disabled)
            and int(row.uses) < int(row.max_uses)
            and (expires_at is None or expires_at > current)
        )

    def _consume_invite_sync(self, connection: Any, code: str) -> bool:
        clean = code.strip().upper()
        if not clean:
            return False
        row = connection.execute(
            select(self.invites).where(self.invites.c.code_hash == _invite_hash(clean))
        ).mappings().first()
        now = _utc_now()
        if row is None or not self._invite_active(row, now):
            return False
        result = connection.execute(
            update(self.invites)
            .where(
                (self.invites.c.id == row.id)
                & (self.invites.c.uses == row.uses)
                & (self.invites.c.disabled.is_(False))
            )
            .values(uses=int(row.uses) + 1, last_used_at=_to_iso(now))
        )
        return result.rowcount == 1

    async def has_active_invites(self) -> bool:
        await self.start()
        return await asyncio.to_thread(self._has_active_invites_sync)

    def _has_active_invites_sync(self) -> bool:
        # Dès qu'une invitation administrée existe, la bêta reste fermée.
        # Une invitation épuisée ou révoquée ne doit jamais rouvrir les
        # inscriptions publiques par accident.
        with self.engine.connect() as connection:
            total = connection.execute(
                select(func.count()).select_from(self.invites)
            ).scalar_one()
        return int(total) > 0

    async def create_invite(
        self,
        *,
        created_by: str,
        label: str,
        max_uses: int,
        expires_at: datetime | None,
    ) -> dict[str, Any]:
        await self.start()
        return await asyncio.to_thread(
            self._create_invite_sync,
            created_by,
            label,
            max_uses,
            expires_at,
        )

    def _create_invite_sync(
        self,
        created_by: str,
        label: str,
        max_uses: int,
        expires_at: datetime | None,
    ) -> dict[str, Any]:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        now = _utc_now()
        for _ in range(8):
            suffix = "".join(secrets.choice(alphabet) for _ in range(12))
            code = f"ANATOLE-{suffix}"
            invite_id = str(uuid.uuid4())
            try:
                with self.engine.begin() as connection:
                    connection.execute(
                        insert(self.invites).values(
                            id=invite_id,
                            code_hash=_invite_hash(code),
                            code_hint=_invite_hint(code),
                            label=label,
                            max_uses=max_uses,
                            uses=0,
                            disabled=False,
                            created_by=created_by,
                            created_at=_to_iso(now),
                            expires_at=_to_iso(expires_at),
                            last_used_at=None,
                        )
                    )
                return {
                    "id": invite_id,
                    "code": code,
                    "label": label,
                    "code_hint": _invite_hint(code),
                    "max_uses": max_uses,
                    "uses": 0,
                    "disabled": False,
                    "created_at": now,
                    "expires_at": expires_at,
                    "last_used_at": None,
                    "active": True,
                }
            except IntegrityError:
                continue
        raise RuntimeError("Impossible de générer un code d’invitation unique.")

    async def list_invites(self) -> list[dict[str, Any]]:
        await self.start()
        return await asyncio.to_thread(self._list_invites_sync)

    def _list_invites_sync(self) -> list[dict[str, Any]]:
        now = _utc_now()
        with self.engine.connect() as connection:
            rows = connection.execute(
                select(self.invites).order_by(self.invites.c.created_at.desc()).limit(200)
            ).mappings().all()
        return [
            {
                "id": row.id,
                "label": row.label,
                "code_hint": row.code_hint,
                "max_uses": int(row.max_uses),
                "uses": int(row.uses),
                "disabled": bool(row.disabled),
                "created_at": _from_iso(row.created_at) or now,
                "expires_at": _from_iso(row.expires_at),
                "last_used_at": _from_iso(row.last_used_at),
                "active": self._invite_active(row, now),
            }
            for row in rows
        ]

    async def revoke_invite(self, invite_id: str) -> bool:
        await self.start()
        return await asyncio.to_thread(self._revoke_invite_sync, invite_id)

    def _revoke_invite_sync(self, invite_id: str) -> bool:
        with self.engine.begin() as connection:
            result = connection.execute(
                update(self.invites)
                .where(self.invites.c.id == invite_id)
                .values(disabled=True)
            )
        return result.rowcount > 0

    async def admin_overview(self) -> dict[str, int]:
        await self.start()
        return await asyncio.to_thread(self._admin_overview_sync)

    def _admin_overview_sync(self) -> dict[str, int]:
        now = _utc_now()
        cutoff = now - timedelta(days=7)
        with self.engine.connect() as connection:
            total_users = int(connection.execute(select(func.count()).select_from(self.users)).scalar_one())
            new_users_7d = int(connection.execute(
                select(func.count()).select_from(self.users).where(self.users.c.created_at >= _to_iso(cutoff))
            ).scalar_one())
            active_users_7d = int(connection.execute(
                select(func.count()).select_from(self.users).where(self.users.c.last_login_at >= _to_iso(cutoff))
            ).scalar_one())
            active_sessions = int(connection.execute(
                select(func.count()).select_from(self.sessions).where(self.sessions.c.expires_at > _to_iso(now))
            ).scalar_one())
            workspace_rows = connection.execute(select(self.workspaces)).mappings().all()
            synced_accounts = sum(1 for row in workspace_rows if int(row.revision) > 0)
            total_workspace_revisions = sum(int(row.revision) for row in workspace_rows)
            invite_rows = connection.execute(select(self.invites)).mappings().all()
            active_invites = sum(1 for row in invite_rows if self._invite_active(row, now))
            open_reports = int(connection.execute(
                select(func.count()).select_from(self.feedback_reports).where(self.feedback_reports.c.status != "resolved")
            ).scalar_one())
        return {
            "total_users": total_users,
            "new_users_7d": new_users_7d,
            "active_users_7d": active_users_7d,
            "active_sessions": active_sessions,
            "synced_accounts": synced_accounts,
            "total_workspace_revisions": total_workspace_revisions,
            "active_invites": active_invites,
            "open_reports": open_reports,
        }

    async def list_admin_users(
        self,
        *,
        query: str | None,
        limit: int,
        offset: int,
    ) -> tuple[int, list[dict[str, Any]]]:
        await self.start()
        return await asyncio.to_thread(self._list_admin_users_sync, query, limit, offset)

    def _list_admin_users_sync(
        self,
        query: str | None,
        limit: int,
        offset: int,
    ) -> tuple[int, list[dict[str, Any]]]:
        now = _utc_now()
        with self.engine.connect() as connection:
            condition = None
            if query:
                pattern = f"%{query.strip().lower()}%"
                condition = or_(
                    func.lower(self.users.c.email).like(pattern),
                    func.lower(func.coalesce(self.users.c.display_name, "")).like(pattern),
                )
            count_statement = select(func.count()).select_from(self.users)
            statement = select(self.users).order_by(self.users.c.created_at.desc()).limit(limit).offset(offset)
            if condition is not None:
                count_statement = count_statement.where(condition)
                statement = statement.where(condition)
            total = int(connection.execute(count_statement).scalar_one())
            rows = connection.execute(statement).mappings().all()
            output: list[dict[str, Any]] = []
            for row in rows:
                active_sessions = int(connection.execute(
                    select(func.count()).select_from(self.sessions).where(
                        (self.sessions.c.user_id == row.id)
                        & (self.sessions.c.expires_at > _to_iso(now))
                    )
                ).scalar_one())
                workspace_row = connection.execute(
                    select(self.workspaces).where(self.workspaces.c.user_id == row.id)
                ).mappings().first()
                workspace = self._workspace_from_row(workspace_row)
                output.append({
                    "id": row.id,
                    "email": row.email,
                    "display_name": row.display_name,
                    "is_admin": row.email.lower() in settings.account_admin_email_set,
                    "created_at": _from_iso(row.created_at) or now,
                    "last_login_at": _from_iso(row.last_login_at),
                    "active_sessions": active_sessions,
                    "workspace_revision": workspace.revision,
                    "workspace_updated_at": workspace.updated_at,
                    "watchlist_count": len(workspace.data.watchlist),
                    "portfolio_count": len(workspace.data.portfolio),
                    "alert_count": len(workspace.data.alerts),
                    "comparator_count": len(workspace.data.comparator_symbols),
                })
        return total, output

    async def store_feedback_report(self, payload: dict[str, Any]) -> None:
        await self.start()
        await asyncio.to_thread(self._store_feedback_report_sync, payload)

    def _store_feedback_report_sync(self, payload: dict[str, Any]) -> None:
        now = _utc_now()
        with self.engine.begin() as connection:
            connection.execute(
                insert(self.feedback_reports).values(
                    report_id=payload["report_id"],
                    category=payload["category"],
                    message=payload["message"],
                    route=payload.get("route") or "/",
                    section=payload.get("section"),
                    universe=payload.get("universe"),
                    request_id=payload.get("request_id"),
                    viewport=payload.get("viewport"),
                    app_version=payload.get("app_version"),
                    user_agent=payload.get("user_agent"),
                    diagnostics_included=bool(payload.get("diagnostics_included", True)),
                    status="new",
                    created_at=_to_iso(now),
                    updated_at=_to_iso(now),
                )
            )

    async def list_feedback_reports(self, limit: int = 100) -> list[dict[str, Any]]:
        await self.start()
        return await asyncio.to_thread(self._list_feedback_reports_sync, limit)

    def _list_feedback_reports_sync(self, limit: int) -> list[dict[str, Any]]:
        now = _utc_now()
        with self.engine.connect() as connection:
            rows = connection.execute(
                select(self.feedback_reports)
                .order_by(self.feedback_reports.c.created_at.desc())
                .limit(limit)
            ).mappings().all()
        return [
            {
                "report_id": row.report_id,
                "category": row.category,
                "message": row.message,
                "route": row.route,
                "section": row.section,
                "universe": row.universe,
                "request_id": row.request_id,
                "viewport": row.viewport,
                "app_version": row.app_version,
                "user_agent": row.user_agent,
                "diagnostics_included": bool(row.diagnostics_included),
                "status": row.status,
                "created_at": _from_iso(row.created_at) or now,
                "updated_at": _from_iso(row.updated_at) or now,
            }
            for row in rows
        ]

    async def update_feedback_status(self, report_id: str, status: str) -> bool:
        await self.start()
        return await asyncio.to_thread(self._update_feedback_status_sync, report_id, status)

    def _update_feedback_status_sync(self, report_id: str, status: str) -> bool:
        with self.engine.begin() as connection:
            result = connection.execute(
                update(self.feedback_reports)
                .where(self.feedback_reports.c.report_id == report_id)
                .values(status=status, updated_at=_to_iso(_utc_now()))
            )
        return result.rowcount > 0


account_service = AccountService()

