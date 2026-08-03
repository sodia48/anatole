from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class AdminOverview(BaseModel):
    generated_at: datetime
    total_users: int = Field(ge=0)
    new_users_7d: int = Field(ge=0)
    active_users_7d: int = Field(ge=0)
    active_sessions: int = Field(ge=0)
    synced_accounts: int = Field(ge=0)
    total_workspace_revisions: int = Field(ge=0)
    active_invites: int = Field(ge=0)
    open_reports: int = Field(ge=0)
    reliability: dict[str, Any]
    upstream_metrics: dict[str, Any]


class AdminUserSummary(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    is_admin: bool = False
    created_at: datetime
    last_login_at: datetime | None = None
    active_sessions: int = Field(ge=0)
    workspace_revision: int = Field(ge=0)
    workspace_updated_at: datetime | None = None
    watchlist_count: int = Field(ge=0)
    portfolio_count: int = Field(ge=0)
    alert_count: int = Field(ge=0)
    comparator_count: int = Field(ge=0)


class AdminUserList(BaseModel):
    total: int = Field(ge=0)
    users: list[AdminUserSummary]


class AdminInviteCreateRequest(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_in_days: int | None = Field(default=14, ge=1, le=365)

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        return " ".join(value.strip().split())


class AdminInviteSummary(BaseModel):
    id: str
    label: str
    code_hint: str
    max_uses: int = Field(ge=1)
    uses: int = Field(ge=0)
    disabled: bool
    created_at: datetime
    expires_at: datetime | None = None
    last_used_at: datetime | None = None
    active: bool


class AdminInviteCreated(AdminInviteSummary):
    code: str


class AdminInviteList(BaseModel):
    invites: list[AdminInviteSummary]


class AdminReportSummary(BaseModel):
    report_id: str
    category: str
    message: str
    route: str
    section: str | None = None
    universe: str | None = None
    request_id: str | None = None
    viewport: str | None = None
    app_version: str | None = None
    user_agent: str | None = None
    diagnostics_included: bool
    status: Literal["new", "reviewing", "resolved"]
    created_at: datetime
    updated_at: datetime


class AdminReportList(BaseModel):
    reports: list[AdminReportSummary]


class AdminReportUpdateRequest(BaseModel):
    status: Literal["new", "reviewing", "resolved"]

