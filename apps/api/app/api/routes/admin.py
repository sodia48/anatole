from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.schemas.accounts import AccountUser
from app.schemas.admin import (
    AdminInviteCreateRequest,
    AdminInviteCreated,
    AdminInviteList,
    AdminOverview,
    AdminReportList,
    AdminReportUpdateRequest,
    AdminUserList,
)
from app.services.accounts import account_service

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


async def current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> AccountUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Connexion administrateur requise.")
    user = await account_service.authenticate(credentials.credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Session expirée ou invalide.")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé à l’administration Anatole.")
    return user


@router.get("/overview", response_model=AdminOverview)
async def overview(_: AccountUser = Depends(current_admin)) -> AdminOverview:
    counts = await account_service.admin_overview()
    return AdminOverview(
        generated_at=datetime.now(UTC),
        **counts,
        reliability=reliability_monitor.snapshot(),
        upstream_metrics=shared_http_client.metrics.as_dict(),
    )


@router.get("/users", response_model=AdminUserList)
async def users(
    query: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: AccountUser = Depends(current_admin),
) -> AdminUserList:
    total, items = await account_service.list_admin_users(
        query=query,
        limit=limit,
        offset=offset,
    )
    return AdminUserList(total=total, users=items)


@router.get("/invites", response_model=AdminInviteList)
async def invites(_: AccountUser = Depends(current_admin)) -> AdminInviteList:
    return AdminInviteList(invites=await account_service.list_invites())


@router.post(
    "/invites",
    response_model=AdminInviteCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    payload: AdminInviteCreateRequest,
    admin: AccountUser = Depends(current_admin),
) -> AdminInviteCreated:
    expires_at = (
        datetime.now(UTC) + timedelta(days=payload.expires_in_days)
        if payload.expires_in_days is not None
        else None
    )
    created = await account_service.create_invite(
        created_by=admin.id,
        label=payload.label,
        max_uses=payload.max_uses,
        expires_at=expires_at,
    )
    return AdminInviteCreated(**created)


@router.post("/invites/{invite_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    invite_id: str,
    _: AccountUser = Depends(current_admin),
) -> None:
    if not await account_service.revoke_invite(invite_id):
        raise HTTPException(status_code=404, detail="Invitation introuvable.")


@router.get("/reports", response_model=AdminReportList)
async def reports(
    limit: int = Query(default=100, ge=1, le=200),
    _: AccountUser = Depends(current_admin),
) -> AdminReportList:
    return AdminReportList(reports=await account_service.list_feedback_reports(limit))


@router.patch("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_report(
    report_id: str,
    payload: AdminReportUpdateRequest,
    _: AccountUser = Depends(current_admin),
) -> None:
    if not await account_service.update_feedback_status(report_id, payload.status):
        raise HTTPException(status_code=404, detail="Signalement introuvable.")

