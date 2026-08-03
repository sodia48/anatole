from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, ValidationInfo, field_validator

from app.schemas.notifications import NotificationItem, NotificationPreferences
from app.schemas.workspace import AdvisorProfile, AlertRule, PortfolioPositionInput


class AccountCredentials(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: SecretStr = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if email.count("@") != 1:
            raise ValueError("Adresse courriel invalide.")
        local, domain = email.split("@", 1)
        if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
            raise ValueError("Adresse courriel invalide.")
        return email

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: SecretStr) -> SecretStr:
        password = value.get_secret_value()
        if not any(character.isalpha() for character in password):
            raise ValueError("Le mot de passe doit contenir une lettre.")
        if not any(character.isdigit() for character in password):
            raise ValueError("Le mot de passe doit contenir un chiffre.")
        return value


class AccountRegisterRequest(AccountCredentials):
    display_name: str | None = Field(default=None, max_length=60)
    invite_code: str | None = Field(default=None, max_length=80)
    accepted_terms: bool = False
    accepted_privacy: bool = False

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = " ".join(value.strip().split())
        return clean or None

    @field_validator("invite_code")
    @classmethod
    def clean_invite_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = value.strip()
        return clean or None


class AccountRegistrationPolicy(BaseModel):
    enabled: bool
    invite_required: bool
    terms_version: str
    privacy_version: str


class AccountLoginRequest(AccountCredentials):
    pass


class AccountUser(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    created_at: datetime
    last_login_at: datetime | None = None
    is_admin: bool = False


class SyncedPreferences(BaseModel):
    theme: Literal["dark", "blue"] = "dark"
    density: Literal["comfortable", "compact"] = "comfortable"
    decimals: Literal[2, 3] = 2
    default_range: Literal["1m", "3m", "6m", "1y", "5y"] = "1y"
    default_universe: Literal["tsx60", "composite"] = "tsx60"


class SyncedWorkspaceData(BaseModel):
    watchlist: list[str] = Field(default_factory=list, max_length=30)
    portfolio: list[PortfolioPositionInput] = Field(default_factory=list, max_length=30)
    alerts: list[AlertRule] = Field(default_factory=list, max_length=50)
    preferences: SyncedPreferences = Field(default_factory=SyncedPreferences)
    advisor_profile: AdvisorProfile | None = None
    cockpit_universe: Literal["tsx60", "composite"] = "tsx60"
    comparator_symbols: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("watchlist", "comparator_symbols")
    @classmethod
    def normalize_symbols(cls, values: list[str], info: ValidationInfo) -> list[str]:
        limit = 30 if info.field_name == "watchlist" else 5
        output: list[str] = []
        for value in values:
            symbol = value.strip().upper().removesuffix(".TO")
            if not symbol or len(symbol) > 15:
                continue
            if symbol not in output:
                output.append(symbol)
        return output[:limit]


class WorkspaceSnapshot(BaseModel):
    revision: int = Field(ge=0)
    data: SyncedWorkspaceData
    updated_at: datetime | None = None


class WorkspaceUpdateRequest(BaseModel):
    expected_revision: int = Field(ge=0)
    data: SyncedWorkspaceData
    client_updated_at: datetime | None = None


class AccountSession(BaseModel):
    token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    user: AccountUser
    workspace: WorkspaceSnapshot


class AccountStatus(BaseModel):
    user: AccountUser
    workspace_revision: int = Field(ge=0)
    workspace_updated_at: datetime | None = None

class AccountProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=60)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = " ".join(value.strip().split())
        return clean or None


class AccountPasswordChangeRequest(BaseModel):
    current_password: SecretStr = Field(min_length=10, max_length=128)
    new_password: SecretStr = Field(min_length=10, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: SecretStr) -> SecretStr:
        password = value.get_secret_value()
        if not any(character.isalpha() for character in password):
            raise ValueError("Le nouveau mot de passe doit contenir une lettre.")
        if not any(character.isdigit() for character in password):
            raise ValueError("Le nouveau mot de passe doit contenir un chiffre.")
        return value


class AccountDeleteRequest(BaseModel):
    password: SecretStr = Field(min_length=10, max_length=128)
    confirmation: Literal["SUPPRIMER"]


class AccountExport(BaseModel):
    exported_at: datetime
    user: AccountUser
    workspace: WorkspaceSnapshot
    notification_preferences: NotificationPreferences | None = None
    notifications: list[NotificationItem] = Field(default_factory=list)

