from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime
from time import monotonic
from typing import Any

from app.core.resilience import shared_http_client
from app.services.canadian_equity_directory import (
    canadian_equity_directory_service,
)
from app.services.tsx_composite_universe import CompositeConstituent


TSXV_MAX_CONSTITUENTS = 300
TSXV_UNIVERSE_SOURCE = (
    "Yahoo Finance Canadian equity directory and TMX Money sectors - "
    "300 largest TSX Venture market capitalizations"
)
TMX_MONEY_GRAPHQL_URL = "https://app-money.tmx.com/graphql"
TMX_SECTOR_BATCH_SIZE = 100

TMX_SECTOR_NAMES = {
    "basic materials": "Materials",
    "communication services": "Communication Services",
    "consumer cyclical": "Consumer Discretionary",
    "consumer defensive": "Consumer Staples",
    "energy": "Energy",
    "finance": "Financials",
    "financial services": "Financials",
    "healthcare": "Health Care",
    "industrials": "Industrials",
    "real estate": "Real Estate",
    "technology": "Information Technology",
    "utilities": "Utilities",
}


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


class TSXVentureUniverseService:
    cache_ttl_seconds = 21_600
    sector_cache_ttl_seconds = 604_800
    minimum_directory_size = 100

    def __init__(self) -> None:
        self._cache: tuple[float, list[CompositeConstituent]] | None = None
        self._sector_cache: dict[str, tuple[float, str]] = {}
        self._lock = asyncio.Lock()
        self.as_of: str | None = None

    @staticmethod
    def _normalize_sector(value: Any) -> str | None:
        sector = str(value or "").strip()
        if not sector or sector.casefold() in {"other", "n/a", "unknown"}:
            return None
        return TMX_SECTOR_NAMES.get(sector.casefold(), sector)

    async def _fetch_sector_batch(
        self,
        tickers: list[str],
    ) -> dict[str, str]:
        selections = []
        for index, ticker in enumerate(tickers):
            symbol = json.dumps(ticker.removesuffix(".V"))
            selections.append(
                f"q{index}: getQuoteBySymbol(symbol: {symbol}, locale: \"en\") "
                "{ symbol sector exchangeCode }"
            )

        response = await shared_http_client.request(
            "POST",
            TMX_MONEY_GRAPHQL_URL,
            json={"query": "query { " + " ".join(selections) + " }"},
            headers={"Content-Type": "application/json"},
            attempts=2,
        )
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            raise RuntimeError("TMX Money sector response is incomplete")

        sectors: dict[str, str] = {}
        for index, ticker in enumerate(tickers):
            quote = data.get(f"q{index}")
            if not isinstance(quote, dict):
                continue
            if str(quote.get("exchangeCode") or "").upper() != "CDX":
                continue
            sector = self._normalize_sector(quote.get("sector"))
            if sector:
                sectors[ticker] = sector
        return sectors

    async def _enrich_sectors(
        self,
        constituents: list[CompositeConstituent],
    ) -> list[CompositeConstituent]:
        now = monotonic()
        sectors = {
            ticker: sector
            for ticker, (_, sector) in self._sector_cache.items()
        }
        fresh_tickers = {
            ticker: sector
            for ticker, (stored_at, sector) in self._sector_cache.items()
            if now - stored_at < self.sector_cache_ttl_seconds
        }
        missing = [
            item.ticker
            for item in constituents
            if self._normalize_sector(item.sector) is None
            and item.ticker not in fresh_tickers
        ]
        batches = [
            missing[index : index + TMX_SECTOR_BATCH_SIZE]
            for index in range(0, len(missing), TMX_SECTOR_BATCH_SIZE)
        ]
        concurrency = asyncio.Semaphore(3)

        async def load(batch: list[str]) -> dict[str, str]:
            async with concurrency:
                return await self._fetch_sector_batch(batch)

        results = await asyncio.gather(
            *(load(batch) for batch in batches),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, dict):
                sectors.update(result)
                stored_at = monotonic()
                self._sector_cache.update(
                    {
                        ticker: (stored_at, sector)
                        for ticker, sector in result.items()
                    }
                )

        return [
            replace(
                item,
                sector=(
                    self._normalize_sector(item.sector)
                    or sectors.get(item.ticker)
                    or "Other"
                ),
            )
            for item in constituents
        ]

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
            now = monotonic()
            if self._cache and now - self._cache[0] < self.cache_ttl_seconds:
                return (
                    self._cache[1]
                    if limit == TSXV_MAX_CONSTITUENTS
                    else self._cache[1][:limit]
                )

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

            constituents = await self._enrich_sectors(constituents)

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
