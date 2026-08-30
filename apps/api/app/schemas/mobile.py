from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class MobileDeviceRegisterRequest(BaseModel):
    token: str = Field(min_length=12, max_length=500)
    platform: Literal["ios", "android"]
    device_name: str | None = Field(default=None, max_length=120)
    app_version: str | None = Field(default=None, max_length=40)

    @field_validator("token")
    @classmethod
    def clean_token(cls, value: str) -> str:
        clean = value.strip()
        if any(character.isspace() for character in clean):
            raise ValueError("Le jeton push ne peut pas contenir d’espace.")
        return clean


class MobileDevice(BaseModel):
    id: str
    platform: Literal["ios", "android"]
    device_name: str | None = None
    app_version: str | None = None
    push_enabled: bool = True
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime
