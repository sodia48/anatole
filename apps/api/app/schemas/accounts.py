from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    SecretStr,
    ValidationInfo,
    field_validator,
    model_validator,
)

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
    language: Literal["fr", "en"] = "fr"


class FocusDrawingAnchor(BaseModel):
    time: int = Field(ge=0)
    price: float


class FocusDrawing(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    tool: Literal[
        "trendline",
        "horizontal_line",
        "vertical_line",
        "ray",
        "rectangle",
        "parallel_channel",
        "fib_retracement",
        "fib_extension",
        "price_range",
        "date_range",
        "text",
    ]
    anchors: list[FocusDrawingAnchor] = Field(min_length=1, max_length=4)
    text: str | None = Field(default=None, max_length=200)
    color: str = Field(default="#2c9cff", max_length=32)
    line_width: int = Field(default=2, ge=1, le=5)
    locked: bool = False
    hidden: bool = False
    fib_levels: list[float] = Field(default_factory=list, max_length=16)
    timeframe: Literal[
        "1m", "2m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"
    ] | None = None


class FocusIndicatorConfig(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    definition_id: Literal[
        "sma",
        "ema",
        "wma",
        "vwap",
        "rsi",
        "macd",
        "bollinger",
        "atr",
        "stochastic",
        "stoch_rsi",
        "adx",
        "cci",
        "roc",
        "momentum",
        "obv",
        "mfi",
        "donchian",
        "ichimoku",
        "supertrend",
        "parabolic_sar",
    ]
    inputs: dict[str, float | int | str | bool] = Field(default_factory=dict)
    colors: list[str] = Field(default_factory=list, max_length=6)
    line_width: int = Field(default=2, ge=1, le=5)
    visible: bool = True

    @field_validator("inputs")
    @classmethod
    def limit_inputs(
        cls,
        values: dict[str, float | int | str | bool],
    ) -> dict[str, float | int | str | bool]:
        if len(values) > 12:
            raise ValueError("Un indicateur accepte au plus 12 paramètres.")
        output: dict[str, float | int | str | bool] = {}
        for key, value in values.items():
            clean_key = key.strip()
            if not clean_key or len(clean_key) > 40:
                raise ValueError("Nom de paramètre d’indicateur invalide.")
            if isinstance(value, str) and len(value) > 60:
                raise ValueError("Valeur de paramètre d’indicateur trop longue.")
            output[clean_key] = value
        return output


class FocusComparisonConfig(BaseModel):
    symbol: str = Field(min_length=1, max_length=15)
    mode: Literal["price", "normalized_percent"] = "normalized_percent"
    color: str = Field(default="#f6b94a", max_length=32)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.strip().upper().removesuffix(".TO")


class FocusPaneConfig(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    height_percent: float = Field(default=20, ge=8, le=60)
    collapsed: bool = False


class FocusLayout(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    ticker: str = Field(min_length=1, max_length=15)
    chart_type: Literal[
        "candles",
        "bars",
        "line",
        "area",
        "heikin_ashi",
    ] = "candles"
    timeframe: Literal[
        "1m",
        "2m",
        "5m",
        "15m",
        "30m",
        "1h",
        "4h",
        "1D",
        "1W",
        "1M",
    ] = "1D"
    indicators: list[FocusIndicatorConfig] = Field(
        default_factory=list,
        max_length=20,
    )
    drawings: list[FocusDrawing] = Field(default_factory=list, max_length=50)
    comparisons: list[FocusComparisonConfig] = Field(
        default_factory=list,
        max_length=5,
    )
    panes: list[FocusPaneConfig] = Field(default_factory=list, max_length=6)
    fundamentals_visible: bool = False
    updated_at: datetime | None = None

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        return value.strip().upper().removesuffix(".TO")


class FocusScript(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    source: str = Field(min_length=1, max_length=8_000)
    updated_at: datetime | None = None


class TerminalRadarFilters(BaseModel):
    score_min: float | None = Field(default=None, ge=0, le=100)
    score_max: float | None = Field(default=None, ge=0, le=100)
    momentum_20d_min: float | None = Field(default=None, ge=-1000, le=1000)
    momentum_20d_max: float | None = Field(default=None, ge=-1000, le=1000)
    relative_volume_min: float | None = Field(default=None, ge=0, le=100)
    rsi_min: float | None = Field(default=None, ge=0, le=100)
    rsi_max: float | None = Field(default=None, ge=0, le=100)
    change_percent_min: float | None = Field(default=None, ge=-100, le=1000)
    change_percent_max: float | None = Field(default=None, ge=-100, le=1000)
    sector: str | None = Field(default=None, max_length=80)
    trend: str | None = Field(default=None, max_length=40)
    signal: str | None = Field(default=None, max_length=60)
    anomaly_types: list[Literal[
        "volume_spike", "gap", "momentum_acceleration", "rsi_extreme",
        "sma_cross", "price_volume_divergence", "sector_dislocation", "score_shift",
    ]] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def valid_ranges(self) -> "TerminalRadarFilters":
        for minimum, maximum, label in (
            (self.score_min, self.score_max, "score"),
            (self.momentum_20d_min, self.momentum_20d_max, "momentum"),
            (self.rsi_min, self.rsi_max, "RSI"),
            (self.change_percent_min, self.change_percent_max, "variation"),
        ):
            if minimum is not None and maximum is not None and minimum > maximum:
                raise ValueError(f"La borne minimale {label} dépasse la borne maximale.")
        return self


class TerminalRadarPreset(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    filters: TerminalRadarFilters = Field(default_factory=TerminalRadarFilters)
    sort: Literal["score_desc", "score_asc", "volume_desc", "momentum_desc", "change_desc", "change_asc"] = "score_desc"
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SyncedWorkspaceData(BaseModel):
    watchlist: list[str] = Field(default_factory=list, max_length=30)
    portfolio: list[PortfolioPositionInput] = Field(default_factory=list, max_length=30)
    alerts: list[AlertRule] = Field(default_factory=list, max_length=50)
    preferences: SyncedPreferences = Field(default_factory=SyncedPreferences)
    advisor_profile: AdvisorProfile | None = None
    cockpit_universe: Literal["tsx60", "composite"] = "tsx60"
    comparator_symbols: list[str] = Field(default_factory=list, max_length=5)
    focus_layouts: list[FocusLayout] = Field(default_factory=list, max_length=10)
    focus_scripts: list[FocusScript] = Field(default_factory=list, max_length=10)
    terminal_presets: list[TerminalRadarPreset] = Field(default_factory=list, max_length=10)

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

    @field_validator("focus_layouts")
    @classmethod
    def unique_layouts(cls, values: list[FocusLayout]) -> list[FocusLayout]:
        seen: set[str] = set()
        output: list[FocusLayout] = []
        for item in values:
            if item.id in seen:
                continue
            seen.add(item.id)
            output.append(item)
        return output

    @field_validator("focus_scripts")
    @classmethod
    def unique_scripts(cls, values: list[FocusScript]) -> list[FocusScript]:
        seen: set[str] = set()
        output: list[FocusScript] = []
        for item in values:
            if item.id in seen:
                continue
            seen.add(item.id)
            output.append(item)
        return output

    @field_validator("terminal_presets")
    @classmethod
    def unique_terminal_presets(cls, values: list[TerminalRadarPreset]) -> list[TerminalRadarPreset]:
        seen: set[str] = set()
        output: list[TerminalRadarPreset] = []
        for item in values:
            if item.id in seen:
                continue
            seen.add(item.id)
            output.append(item)
        return output

    @model_validator(mode="after")
    def enforce_workspace_size(self) -> "SyncedWorkspaceData":
        if len(self.model_dump_json().encode("utf-8")) > 500_000:
            raise ValueError("L’espace synchronisé dépasse la limite de 500 Ko.")
        return self


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

