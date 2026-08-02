from __future__ import annotations

import hmac
import threading
import time
from datetime import UTC, datetime
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.schemas.accounts import (
    AccountDeleteRequest,
    AccountExport,
    AccountLoginRequest,
    AccountPasswordChangeRequest,
    AccountProfileUpdateRequest,
    AccountRegisterRequest,
    AccountRegistrationPolicy,
    AccountSession,
    AccountStatus,
    AccountUser,
    WorkspaceSnapshot,
    WorkspaceUpdateRequest,
)
from app.services.accounts import (
    AccountAlreadyExistsError,
    InvalidCredentialsError,
    InvalidInviteError,
    WorkspaceConflictError,
    account_service,
)

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


class _AuthThrottle:
    def __init__(self, *, limit: int = 8, window_seconds: int = 900) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _key(self, request: Request, email: str) -> str:
        host = request.client.host if request.client else "unknown"
        return f"{host}:{email}"

    def check(self, request: Request, email: str) -> None:
        key = self._key(request, email)
        now = time.monotonic()
        with self._lock:
            attempts = self._attempts[key]
            while attempts and now - attempts[0] > self.window_seconds:
                attempts.popleft()
            if len(attempts) >= self.limit:
                raise HTTPException(
                    status_code=429,
                    detail="Trop de tentatives. Réessaie dans quelques minutes.",
                    headers={"Retry-After": "900"},
                )

    def failure(self, request: Request, email: str) -> None:
        with self._lock:
            self._attempts[self._key(request, email)].append(time.monotonic())

    def success(self, request: Request, email: str) -> None:
        with self._lock:
            self._attempts.pop(self._key(request, email), None)


auth_throttle = _AuthThrottle()


async def _credentials(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Connexion requise.")
    return credentials.credentials


async def current_user(token: str = Depends(_credentials)) -> AccountUser:
    user = await account_service.authenticate(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Session expirée ou invalide.")
    return user



@router.get(
    "/registration",
    response_model=AccountRegistrationPolicy,
    summary="Retourne la politique d'inscription de la bêta",
)
async def registration_policy() -> AccountRegistrationPolicy:
    return AccountRegistrationPolicy(
        enabled=settings.account_registration_enabled,
        invite_required=(
            bool(settings.account_invite_code_set)
            or await account_service.has_active_invites()
        ),
        terms_version=settings.account_terms_version,
        privacy_version=settings.account_privacy_version,
    )


@router.post(
    "/register",
    response_model=AccountSession,
    status_code=status.HTTP_201_CREATED,
    summary="Crée un compte Anatole et une session",
)
async def register(payload: AccountRegisterRequest, request: Request) -> AccountSession:
    auth_throttle.check(request, payload.email)
    if not settings.account_registration_enabled:
        raise HTTPException(status_code=403, detail="Les inscriptions sont temporairement fermées.")
    if not payload.accepted_terms or not payload.accepted_privacy:
        raise HTTPException(
            status_code=422,
            detail="Les Conditions d’utilisation et la Politique de confidentialité doivent être acceptées.",
        )

    invite_codes = settings.account_invite_code_set
    supplied = payload.invite_code or ""
    static_invite_valid = any(
        hmac.compare_digest(supplied, code)
        for code in invite_codes
    )
    invite_required = (
        bool(invite_codes)
        or await account_service.has_active_invites()
    )

    try:
        session = await account_service.register(
            email=payload.email,
            password=payload.password.get_secret_value(),
            display_name=payload.display_name,
            invite_code=supplied,
            invite_required=invite_required,
            invite_already_valid=static_invite_valid,
        )
    except InvalidInviteError as error:
        auth_throttle.failure(request, payload.email)
        raise HTTPException(status_code=403, detail="Code d’invitation invalide ou expiré.") from error
    except AccountAlreadyExistsError as error:
        auth_throttle.failure(request, payload.email)
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec ce courriel.") from error
    auth_throttle.success(request, payload.email)
    return AccountSession(
        token=session.token,
        expires_at=session.expires_at,
        user=session.user,
        workspace=session.workspace,
    )


@router.post(
    "/login",
    response_model=AccountSession,
    summary="Ouvre une session Anatole",
)
async def login(payload: AccountLoginRequest, request: Request) -> AccountSession:
    auth_throttle.check(request, payload.email)
    try:
        session = await account_service.login(
            email=payload.email,
            password=payload.password.get_secret_value(),
        )
    except InvalidCredentialsError as error:
        auth_throttle.failure(request, payload.email)
        raise HTTPException(status_code=401, detail="Courriel ou mot de passe incorrect.") from error
    auth_throttle.success(request, payload.email)
    return AccountSession(
        token=session.token,
        expires_at=session.expires_at,
        user=session.user,
        workspace=session.workspace,
    )


@router.get(
    "/me",
    response_model=AccountStatus,
    summary="Retourne le compte et l'état de synchronisation",
)
async def me(user: AccountUser = Depends(current_user)) -> AccountStatus:
    status_snapshot = await account_service.account_status(user.id)
    if status_snapshot is None:
        raise HTTPException(status_code=404, detail="Compte introuvable.")
    fresh_user, workspace = status_snapshot
    return AccountStatus(
        user=fresh_user,
        workspace_revision=workspace.revision,
        workspace_updated_at=workspace.updated_at,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Ferme la session courante",
)
async def logout(token: str = Depends(_credentials)) -> None:
    await account_service.logout(token)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Ferme toutes les sessions du compte",
)
async def logout_all(user: AccountUser = Depends(current_user)) -> None:
    await account_service.logout_all(user.id)


@router.get(
    "/workspace",
    response_model=WorkspaceSnapshot,
    summary="Récupère l'espace synchronisé du compte",
)
async def workspace(user: AccountUser = Depends(current_user)) -> WorkspaceSnapshot:
    return await account_service.get_workspace(user.id)


@router.put(
    "/workspace",
    response_model=WorkspaceSnapshot,
    summary="Synchronise Watchlist, Portefeuille, Alertes et préférences",
)
async def update_workspace(
    payload: WorkspaceUpdateRequest,
    request: Request,
    user: AccountUser = Depends(current_user),
) -> WorkspaceSnapshot:
    try:
        return await account_service.update_workspace(
            user_id=user.id,
            expected_revision=payload.expected_revision,
            data=payload.data,
        )
    except WorkspaceConflictError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Une version plus récente existe sur un autre appareil.",
                "current_revision": error.current_revision,
                "request_id": getattr(request.state, "request_id", None),
            },
        ) from error

@router.put(
    "/profile",
    response_model=AccountUser,
    summary="Met à jour le nom affiché du compte",
)
async def update_profile(
    payload: AccountProfileUpdateRequest,
    user: AccountUser = Depends(current_user),
) -> AccountUser:
    updated = await account_service.update_profile(
        user_id=user.id,
        display_name=payload.display_name,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Compte introuvable.")
    return updated


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change le mot de passe et ferme les autres sessions",
)
async def change_password(
    payload: AccountPasswordChangeRequest,
    token: str = Depends(_credentials),
    user: AccountUser = Depends(current_user),
) -> None:
    try:
        await account_service.change_password(
            user_id=user.id,
            current_password=payload.current_password.get_secret_value(),
            new_password=payload.new_password.get_secret_value(),
            current_token=token,
        )
    except InvalidCredentialsError as error:
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect.") from error


@router.get(
    "/export",
    response_model=AccountExport,
    summary="Exporte les données du compte Anatole",
)
async def export_account(
    user: AccountUser = Depends(current_user),
) -> AccountExport:
    snapshot = await account_service.export_account(user.id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Compte introuvable.")
    fresh_user, workspace = snapshot
    return AccountExport(
        exported_at=datetime.now(UTC),
        user=fresh_user,
        workspace=workspace,
    )


@router.delete(
    "/delete",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprime définitivement le compte et ses données synchronisées",
)
async def delete_account(
    payload: AccountDeleteRequest,
    user: AccountUser = Depends(current_user),
) -> None:
    try:
        await account_service.delete_account(
            user_id=user.id,
            password=payload.password.get_secret_value(),
        )
    except InvalidCredentialsError as error:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect.") from error

