from __future__ import annotations

import asyncio
from dataclasses import dataclass
from time import monotonic
from typing import Any

from app.services.yahoo_public import yahoo_public_service


@dataclass(frozen=True)
class CanadianDirectory:
    rows: list[dict[str, Any]]
    failures: int
    fetched_at: float


class CanadianEquityDirectoryService:
    """Long-lived listing identity cache, independent of quote/event freshness."""

    ttl_seconds = 21_600
    stale_seconds = 86_400
    refresh_budget_seconds = 90

    def __init__(self) -> None:
        self._last_good: CanadianDirectory | None = None
        self._task: asyncio.Task[CanadianDirectory | None] | None = None
        self._retry_after = 0.0

    async def _page(self, offset: int) -> dict[str, Any]:
        payload = await yahoo_public_service.request_json(
            "/v1/finance/screener", method="POST", body={
                "size": 250, "offset": offset, "sortField": "ticker", "sortType": "ASC",
                "quoteType": "EQUITY", "userId": "", "userIdType": "guid",
                "query": {"operator": "EQ", "operands": ["region", "ca"]},
            },
        )
        rows = payload.get("finance", {}).get("result") or []
        if not rows or not isinstance(rows[0], dict):
            raise RuntimeError("Canadian equity directory unavailable")
        return rows[0]

    async def _scan(self) -> tuple[list[dict[str, Any]], int]:
        first = await self._page(0)
        total = int(first.get("total") or 0)
        if total <= 0 or not first.get("quotes"):
            raise RuntimeError("Empty Canadian equity directory")
        semaphore = asyncio.Semaphore(3)

        async def page(offset: int) -> dict[str, Any]:
            async with semaphore:
                return await self._page(offset)

        pages = await asyncio.gather(
            *(page(offset) for offset in range(250, min(total, 25_000), 250)),
            return_exceptions=True,
        )
        quotes = list(first["quotes"])
        failures = int(total > 25_000)
        for result in pages:
            if isinstance(result, BaseException) or not result.get("quotes"):
                failures += 1
            else:
                quotes.extend(result["quotes"])
        by_symbol = {}
        for row in quotes:
            symbol = str(row.get("symbol") or "").upper()
            if row.get("quoteType") == "EQUITY" and symbol.endswith((".TO", ".V", ".CN", ".NE")):
                by_symbol[symbol] = row
        if not by_symbol:
            raise RuntimeError("No Canadian listings in directory")
        return list(by_symbol.values()), failures

    def peek(self) -> CanadianDirectory | None:
        value = self._last_good
        return value if value and monotonic() - value.fetched_at < self.stale_seconds else None

    def ensure_refresh(self) -> asyncio.Task[CanadianDirectory | None] | None:
        if self._task and not self._task.done():
            return self._task
        cached = self.peek()
        if cached and not cached.failures and monotonic() - cached.fetched_at < self.ttl_seconds:
            return None
        if monotonic() < self._retry_after:
            return None
        self._task = asyncio.create_task(self._refresh())
        return self._task

    async def _refresh(self) -> CanadianDirectory | None:
        try:
            async with asyncio.timeout(self.refresh_budget_seconds):
                rows, failures = await self._scan()
            old = self.peek()
            # Failed pages must not silently truncate a previously complete directory.
            if failures and old:
                self._retry_after = monotonic() + 300
                return old
            self._last_good = CanadianDirectory(rows, failures, monotonic())
            if failures:
                self._retry_after = monotonic() + 300
            return self._last_good
        except Exception:
            self._retry_after = monotonic() + 60
            return self.peek()


canadian_equity_directory_service = CanadianEquityDirectoryService()
