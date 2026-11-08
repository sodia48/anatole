from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from uuid import UUID, NAMESPACE_URL, uuid5
from sqlalchemy.exc import IntegrityError

from app.api.routes.accounts import current_user
from app.schemas.accounts import AccountUser
from app.schemas.notifications import (
    NotificationDigest,
    NotificationFeed,
    NotificationPreferences,
    NotificationPreferencesEnvelope,
    OptionExpiryReminder,
    OptionExpiryReminderInput,
    OptionExpiryReminderCreate,
    OptionExpiryReminderCreated,
)
from app.services.notifications import notification_service

router = APIRouter()


@router.get("/option-reminders", response_model=list[OptionExpiryReminder])
async def option_reminders(user: AccountUser = Depends(current_user)) -> list[OptionExpiryReminder]:
    return await notification_service.list_option_reminders(user.id)


@router.get("/option-reminders/account", response_model=list[OptionExpiryReminder])
async def account_option_reminders(account_id: UUID = Header(alias="X-Anatole-Account"), user: AccountUser = Depends(current_user)) -> list[OptionExpiryReminder]:
    if str(account_id) != user.id:
        raise HTTPException(status_code=409, detail="Le compte actif a changé.")
    return await notification_service.list_option_reminders(user.id)


@router.post("/option-reminders", status_code=status.HTTP_204_NO_CONTENT)
async def save_option_reminder(payload: OptionExpiryReminderInput, user: AccountUser = Depends(current_user)) -> None:
    if str(payload.expected_account_id) != user.id:
        raise HTTPException(status_code=409, detail="Le compte actif a changé.")
    try:
        await notification_service.save_option_reminder(user.id, payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/option-reminders/create", status_code=status.HTTP_201_CREATED, response_model=OptionExpiryReminderCreated)
async def create_option_reminder(payload: OptionExpiryReminderCreate, user: AccountUser = Depends(current_user)) -> OptionExpiryReminderCreated:
    if str(payload.expected_account_id) != user.id:
        raise HTTPException(status_code=409, detail="Le compte actif a changé.")
    # Same account, underlying and instant map to one reminder; retries are safe.
    position_id = uuid5(NAMESPACE_URL, f"anatole-option-reminder:{user.id}:{payload.underlying}:{payload.expires_at.isoformat()}")
    reminder = OptionExpiryReminderInput(**payload.model_dump(), position_id=position_id)
    try:
        try:
            await notification_service.save_option_reminder(user.id, reminder)
        except IntegrityError:
            # Another identical request may have inserted this key after the
            # initial read. Retry once in a fresh transaction.
            await notification_service.save_option_reminder(user.id, reminder)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return OptionExpiryReminderCreated(position_id=position_id)


@router.delete("/option-reminders/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_option_reminder(position_id: UUID, account_id: UUID = Header(alias="X-Anatole-Account"), user: AccountUser = Depends(current_user)) -> None:
    if str(account_id) != user.id:
        raise HTTPException(status_code=409, detail="Le compte actif a changé.")
    if not await notification_service.delete_option_reminder(user.id, str(position_id)):
        raise HTTPException(status_code=404, detail="Rappel introuvable.")


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
