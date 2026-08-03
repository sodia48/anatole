from __future__ import annotations

from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator


NotificationFrequency = Literal["off", "daily", "weekdays", "weekly"]
NotificationSeverity = Literal["info", "attention", "important"]
NotificationKind = Literal[
    "alert",
    "watchlist",
    "calendar",
    "digest",
    "system",
]


class NotificationPreferences(BaseModel):
    in_app_enabled: bool = True
    email_enabled: bool = False
    digest_frequency: NotificationFrequency = "off"
    digest_time: str = "07:30"
    timezone: str = "America/Toronto"
    weekly_day: int = Field(default=0, ge=0, le=6)
    include_watchlist: bool = True
    include_portfolio: bool = True
    include_alerts: bool = True
    include_calendar: bool = True
    updated_at: datetime | None = None

    @field_validator("digest_time")
    @classmethod
    def validate_digest_time(cls, value: str) -> str:
        clean = value.strip()
        parts = clean.split(":")
        if len(parts) != 2:
            raise ValueError("L’heure doit utiliser le format HH:MM.")
        try:
            hour, minute = (int(part) for part in parts)
        except ValueError as error:
            raise ValueError("L’heure doit utiliser le format HH:MM.") from error
        if hour not in range(24) or minute not in range(60):
            raise ValueError("Heure de résumé invalide.")
        return f"{hour:02d}:{minute:02d}"

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        clean = value.strip()
        try:
            ZoneInfo(clean)
        except ZoneInfoNotFoundError as error:
            raise ValueError("Fuseau horaire invalide.") from error
        return clean


class NotificationPreferencesEnvelope(BaseModel):
    preferences: NotificationPreferences
    account_email: str
    email_delivery_available: bool


class NotificationItem(BaseModel):
    id: str
    kind: NotificationKind
    title: str
    message: str
    severity: NotificationSeverity = "info"
    symbol: str | None = None
    route: str | None = None
    created_at: datetime
    read_at: datetime | None = None


class NotificationFeed(BaseModel):
    items: list[NotificationItem]
    unread_count: int = Field(ge=0)
    generated_at: datetime


class DigestSection(BaseModel):
    key: str
    title: str
    items: list[str] = Field(default_factory=list)


class NotificationDigest(BaseModel):
    subject: str
    greeting: str
    summary: str
    sections: list[DigestSection]
    generated_at: datetime
    disclaimer: str = (
        "Information générale seulement. Anatole ne formule aucune "
        "recommandation de placement."
    )


class DigestRunResult(BaseModel):
    processed: int = 0
    sent: int = 0
    skipped: int = 0
    failed: int = 0
