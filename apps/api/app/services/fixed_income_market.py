"""Extension point for licensed secondary-market pricing providers."""

from __future__ import annotations

from typing import Protocol

from app.schemas.fixed_income import GovernmentBondIssue


class FixedIncomeMarketProvider(Protocol):
    async def get_issue_yield(self, cusip: str) -> float | None: ...
    async def get_issuer_curve(self, issuer: str) -> dict[str, float] | None: ...
    async def get_spread_to_canada(self, issue: GovernmentBondIssue) -> float | None: ...


class UnavailableFixedIncomeMarketProvider:
    async def get_issue_yield(self, cusip: str) -> None:
        return None

    async def get_issuer_curve(self, issuer: str) -> None:
        return None

    async def get_spread_to_canada(self, issue: GovernmentBondIssue) -> None:
        return None


fixed_income_market_provider: FixedIncomeMarketProvider = UnavailableFixedIncomeMarketProvider()
