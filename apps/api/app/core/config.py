from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"
    cors_origin_regex: str = r"^https://anatole(?:-[a-z0-9-]+)*\.vercel\.app$"
    market_data_provider: str = "yahoo"
    yahoo_timeout_seconds: float = 8.0
    account_database_url: str = Field(
        default="sqlite:///./anatole_accounts.db",
        validation_alias=AliasChoices("ACCOUNT_DATABASE_URL", "DATABASE_URL"),
    )
    account_session_days: int = 30
    account_registration_enabled: bool = True
    account_invite_codes: str = ""
    account_terms_version: str = "2026-08-01"
    account_privacy_version: str = "2026-08-01"
    account_admin_emails: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


    @property
    def account_admin_email_set(self) -> tuple[str, ...]:
        values = [
            item.strip().lower()
            for item in self.account_admin_emails.split(",")
            if item.strip()
        ]
        return tuple(dict.fromkeys(values))

    @property
    def account_invite_code_set(self) -> tuple[str, ...]:
        values = [
            item.strip()
            for item in self.account_invite_codes.split(",")
            if item.strip()
        ]
        return tuple(dict.fromkeys(values))

    @property
    def cors_origin_list(self) -> list[str]:
        values = [item.strip() for item in self.cors_origins.split(",") if item.strip()]
        return values or ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

