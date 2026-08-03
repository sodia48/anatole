from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.routes.accounts import current_user
from app.schemas.accounts import AccountUser
from app.schemas.notifications import (
    NotificationDigest,
    NotificationFeed,
    NotificationPreferences,
    NotificationPreferencesEnvelope,
)
from app.services.notifications import notification_service

router = APIRouter()


@router.get(
    "/preferences",
    response_model=NotificationPreferencesEnvelope,
    summary="Retourne les préférences de notifications",
)
async def preferences(
    user: AccountUser = Depends(current_user),
) -> NotificationPreferencesEnvelope:
    current = await notification_service.get_preferences(user.id)
    return NotificationPreferencesEnvelope(
        preferences=current,
        account_email=user.email,
        email_delivery_available=notification_service.email_available,
    )


@router.put(
    "/preferences",
    response_model=NotificationPreferencesEnvelope,
    summary="Enregistre les préférences de notifications",
)
async def update_preferences(
    payload: NotificationPreferences,
    user: AccountUser = Depends(current_user),
) -> NotificationPreferencesEnvelope:
    saved = await notification_service.save_preferences(user.id, payload)
    return NotificationPreferencesEnvelope(
        preferences=saved,
        account_email=user.email,
        email_delivery_available=notification_service.email_available,
    )


@router.get(
    "/feed",
    response_model=NotificationFeed,
    summary="Retourne le centre de notifications",
)
async def feed(
    limit: int = Query(default=80, ge=1, le=200),
    user: AccountUser = Depends(current_user),
) -> NotificationFeed:
    return await notification_service.list_feed(user.id, limit=limit)


@router.post(
    "/refresh",
    response_model=NotificationFeed,
    summary="Actualise les signaux du compte",
)
async def refresh(
    user: AccountUser = Depends(current_user),
) -> NotificationFeed:
    return await notification_service.refresh_user(user)


@router.post(
    "/feed/{notification_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marque une notification comme lue",
)
async def mark_read(
    notification_id: str,
    user: AccountUser = Depends(current_user),
) -> None:
    updated = await notification_service.mark_read(user.id, notification_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Notification introuvable.")


@router.post(
    "/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marque toutes les notifications comme lues",
)
async def mark_all_read(
    user: AccountUser = Depends(current_user),
) -> None:
    await notification_service.mark_all_read(user.id)


@router.get(
    "/preview",
    response_model=NotificationDigest,
    summary="Prévisualise le prochain résumé Anatole",
)
async def preview(
    user: AccountUser = Depends(current_user),
) -> NotificationDigest:
    return await notification_service.build_digest(user)


@router.post(
    "/send-test",
    response_model=NotificationDigest,
    summary="Envoie un résumé de test au courriel du compte",
)
async def send_test(
    user: AccountUser = Depends(current_user),
) -> NotificationDigest:
    if not notification_service.email_available:
        raise HTTPException(
            status_code=503,
            detail="La livraison par courriel n’est pas encore configurée.",
        )
    return await notification_service.send_test(user)
