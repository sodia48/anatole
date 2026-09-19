from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from time import monotonic
from typing import Any

from app.services.canadian_equity_directory import (
    canadian_equity_directory_service,
)
from app.services.tsx_composite_universe import CompositeConstituent


TSXV_MAX_CONSTITUENTS = 300
TSXV_UNIVERSE_SOURCE = (
    "Yahoo Finance Canadian equity directory - "
    "300 largest TSX Venture market capitalizations"
)


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


class TSXVentureUniverseService:
    cache_ttl_seconds = 21_600
    minimum_directory_size = 100

    def __init__(self) -> None:
        self._cache: tuple[float, list[CompositeConstituent]] | None = None
        self._lock = asyncio.Lock()
        self.as_of: str | None = None

    @staticmethod
    def _constituents(
        rows: list[dict[str, Any]],
        *,
        limit: int | None = TSXV_MAX_CONSTITUENTS,
    ) -> list[CompositeConstituent]:
        listings: list[tuple[float, CompositeConstituent]] = []
        seen: set[str] = set()

        for row in rows:
            ticker = str(row.get("symbol") or "").strip().upper()
            if not ticker.endswith(".V") or ticker in seen:
                continue
            market_cap = _number(row.get("marketCap"))
            if market_cap is None:
                continue
            name = str(
                row.get("longName")
                or row.get("shortName")
                or ticker.removesuffix(".V")
            ).strip()
            sector = str(
                row.get("sector") or row.get("industry") or "Other"
            ).strip()
            seen.add(ticker)
            listings.append((
                market_cap,
                CompositeConstituent(
                    ticker=ticker,
                    name=name,
                    sector=sector,
                    exchange="TSXV",
                    currency=str(row.get("currency") or "CAD"),
                ),
            ))

        listings.sort(key=lambda item: item[0], reverse=True)
        selected = listings[:limit] if limit is not None else listings
        total_market_cap = sum(market_cap for market_cap, _ in selected) or 1.0
        return [
            replace(
                constituent,
                weight=market_cap / total_market_cap * 100,
            )
            for market_cap, constituent in selected
        ]

    async def get_constituents(
        self,
        *,
        limit: int | None = TSXV_MAX_CONSTITUENTS,
    ) -> list[CompositeConstituent]:
        now = monotonic()
        if self._cache and now - self._cache[0] < self.cache_ttl_seconds:
            return self._cache[1] if limit == TSXV_MAX_CONSTITUENTS else self._cache[1][:limit]

        async with self._lock:
            directory = canadian_equity_directory_service.peek()
            if directory is None:
                task = canadian_equity_directory_service.ensure_refresh()
                if task is not None:
                    directory = await asyncio.shield(task)
            if directory is None:
                if self._cache:
                    return self._cache[1]
                raise RuntimeError("TSX Venture directory unavailable")

            constituents = self._constituents(directory.rows)
            if len(constituents) < self.minimum_directory_size:
                if self._cache:
                    return self._cache[1]
                raise RuntimeError("TSX Venture directory is incomplete")

            self.as_of = datetime.now(UTC).date().isoformat()
            self._cache = (monotonic(), constituents)
            return constituents if limit == TSXV_MAX_CONSTITUENTS else constituents[:limit]

    async def get_all_listings(self) -> list[CompositeConstituent]:
        directory = canadian_equity_directory_service.peek()
        if directory is None:
            task = canadian_equity_directory_service.ensure_refresh()
            if task is not None:
                directory = await asyncio.shield(task)
        if directory is None:
            return await self.get_constituents()
        return self._constituents(directory.rows, limit=None)


tsx_venture_universe_service = TSXVentureUniverseService()
