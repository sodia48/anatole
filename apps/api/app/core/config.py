from functools import lru_cache
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"
    cors_origin_regex: str = r"^https://anatole(?:-[a-z0-9-]+)*\.vercel\.app$"
    market_data_provider: str = "yahoo"
    yahoo_timeout_seconds: float = 8.0
    redis_url: str = ""
    redis_cache_prefix: str = "anatole:cache:v1"
    redis_cache_timeout_seconds: float = Field(default=0.08, ge=0.02, le=1.0)
    redis_singleflight_lease_seconds: float = Field(default=30.0, ge=2.0, le=120.0)
    redis_singleflight_wait_seconds: float = Field(default=1.5, ge=0.0, le=10.0)
    redis_singleflight_poll_seconds: float = Field(default=0.05, ge=0.01, le=1.0)
    finnhub_api_key: str = ""
    barchart_api_key: str = ""
    openai_api_key: str = Field(
        default="",
        validation_alias="OPENAI_API_KEY",
    )
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    canada360_provider_order: Annotated[tuple[str, ...], NoDecode] = Field(
        default=("anthropic", "gemini", "openai"),
        validation_alias="CANADA360_PROVIDER_ORDER",
    )
    anatole_assistant_provider_order: Annotated[tuple[str, ...], NoDecode] = Field(
        default=("anthropic", "gemini", "openai"),
        validation_alias="ANATOLE_ASSISTANT_PROVIDER_ORDER",
    )
    anatole_assistant_anthropic_model: str = Field(
        default="claude-sonnet-5-5", validation_alias="ANATOLE_ASSISTANT_ANTHROPIC_MODEL",
    )
    anatole_assistant_synthesis_timeout_seconds: float = Field(
        default=18.0, validation_alias="ANATOLE_ASSISTANT_SYNTHESIS_TIMEOUT_SECONDS",
        ge=3.0, le=45.0,
    )
    canada360_anthropic_model: str = Field(
        default="claude-sonnet-5-5", validation_alias="CANADA360_ANTHROPIC_MODEL",
    )
    canada360_gemini_model: str = Field(
        default="gemini-3.8-flash", validation_alias="CANADA360_GEMINI_MODEL",
    )
    canada360_openai_model: str = Field(
        default="gpt-6.1-sol", validation_alias="CANADA360_OPENAI_MODEL",
    )
    canada360_openai_fallback_model: str = Field(
        default="gpt-6-luna", validation_alias="CANADA360_OPENAI_FALLBACK_MODEL",
    )
    canada360_provider_retries: int = Field(
        default=1,
        validation_alias="CANADA360_PROVIDER_RETRIES",
        ge=0,
        le=1,
    )
    canada360_provider_timeout_seconds: float = Field(
        default=15.0,
        validation_alias="CANADA360_PROVIDER_TIMEOUT_SECONDS",
        ge=10.0,
        le=90.0,
    )
    canada360_total_response_deadline_seconds: float = Field(
        default=38.0,
        validation_alias="CANADA360_TOTAL_RESPONSE_DEADLINE_SECONDS",
        ge=10.0,
        le=120.0,
    )
    canada360_provider_circuit_breaker_seconds: float = Field(
        default=30.0,
        validation_alias="CANADA360_PROVIDER_CIRCUIT_BREAKER_SECONDS",
        ge=5.0,
        le=600.0,
    )
    sec_user_agent: str = "Anatole contact@anatole.app"
    company_network_build_concurrency: int = Field(
        default=1,
        validation_alias="COMPANY_NETWORK_BUILD_CONCURRENCY",
        ge=1,
        le=4,
    )
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

    notification_email_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Anatole"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    notification_app_url: str = "https://anatole-mu.vercel.app/aujourdhui"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("canada360_provider_order", "anatole_assistant_provider_order", mode="before")
    @classmethod
    def normalize_provider_order(cls, value: object) -> tuple[str, ...]:
        names = value.split(",") if isinstance(value, str) else value
        if not isinstance(names, (tuple, list)):
            return ("anthropic", "gemini", "openai")
        valid = {"anthropic", "gemini", "openai"}
        order = tuple(dict.fromkeys(
            name.strip().lower() for name in names
            if isinstance(name, str) and name.strip().lower() in valid
        ))
        return order or ("anthropic", "gemini", "openai")


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
