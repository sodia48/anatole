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
    Column,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    insert,
    select,
    update,
    text,
)
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

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


class AccountService:
    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = database_url or settings.account_database_url
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        elif self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        connect_args: dict[str, Any] = {}
        if self.database_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False

        self.engine: Engine = create_engine(
            self.database_url,
            future=True,
            pool_pre_ping=True,
            connect_args=connect_args,
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
    ) -> AuthenticatedSession:
        await self.start()
        return await asyncio.to_thread(
            self._register_sync,
            email,
            password,
            display_name,
        )

    def _register_sync(
        self,
        email: str,
        password: str,
        display_name: str | None,
    ) -> AuthenticatedSession:
        now = _utc_now()
        user_id = str(uuid.uuid4())
        try:
            with self.engine.begin() as connection:
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


account_service = AccountService()
