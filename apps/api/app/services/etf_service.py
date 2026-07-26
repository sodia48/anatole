from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Iterable

from app.data.etf_catalog import (
    ETF_CATALOG,
    PRIORITY_ETF_TICKERS,
    EtfCatalogEntry,
)
from app.schemas.discovery import EtfDirectoryItem, EtfDirectorySnapshot
from app.services.market_data import market_data_service


CLIENT_REFRESH_SECONDS = 60
FULL_REFRESH_SECONDS = 300
QUOTE_BATCH_SIZE = 8
QUOTE_TIMEOUT_SECONDS = 12
COLD_START_TIMEOUT_SECONDS = 2.5
BATCH_PAUSE_SECONDS = 0.8


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def _base_symbol(value: Any) -> str:
    symbol = str(value or "").strip().upper()
    for suffix in (".TO", ".V", ".NE", ".CN"):
        if symbol.endswith(suffix):
            symbol = symbol[: -len(suffix)]
            break
    return symbol.replace("-", ".")


class EtfDirectoryService:
    """Répertoire complet immédiat, cotations en arrière-plan sans rafale."""

    def __init__(self) -> None:
        self._quote_cache: dict[str, Any] = {}
        self._last_full_refresh = 0.0
        self._refresh_task: asyncio.Task[None] | None = None
        self._cold_start_attempted = False
        self._cold_start_lock = asyncio.Lock()

    async def _fetch_quotes(self, tickers: list[str]) -> list[Any]:
        if not tickers:
            return []
        try:
            return await asyncio.wait_for(
                market_data_service.get_quotes(tickers),
                timeout=QUOTE_TIMEOUT_SECONDS,
            )
        except (TimeoutError, Exception):
            return []

    async def _refresh_batch(self, tickers: list[str]) -> None:
        quotes = await self._fetch_quotes(tickers)
        requested = {_base_symbol(ticker): ticker for ticker in tickers}

        for quote in quotes:
            symbol = _base_symbol(
                getattr(quote, "ticker", getattr(quote, "symbol", ""))
            )
            requested_ticker = requested.get(symbol)
            if requested_ticker is None:
                continue
            source = str(getattr(quote, "source", "")).lower()
            if source not in {"demo-fallback", "demo-explicit"}:
                self._quote_cache[requested_ticker] = quote

    async def _prime_cold_start(self) -> None:
        if self._quote_cache or self._cold_start_attempted:
            return
        async with self._cold_start_lock:
            if self._quote_cache or self._cold_start_attempted:
                return
            self._cold_start_attempted = True
            # Seulement huit ETF prioritaires. La page n'attend jamais plus de 2,5 s.
            try:
                await asyncio.wait_for(
                    self._refresh_batch(
                        list(PRIORITY_ETF_TICKERS)[:QUOTE_BATCH_SIZE]
                    ),
                    timeout=COLD_START_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                pass

    async def _refresh_all(self) -> None:
        try:
            ordered = list(
                dict.fromkeys(
                    list(PRIORITY_ETF_TICKERS)
                    + [entry["ticker"] for entry in ETF_CATALOG]
                )
            )
            for batch in _chunks(ordered, QUOTE_BATCH_SIZE):
                await self._refresh_batch(batch)
                await asyncio.sleep(BATCH_PAUSE_SECONDS)
            self._last_full_refresh = monotonic()
        finally:
            self._refresh_task = None

    def _ensure_background_refresh(self) -> None:
        if monotonic() - self._last_full_refresh < FULL_REFRESH_SECONDS:
            return
        if self._refresh_task is not None and not self._refresh_task.done():
            return
        self._refresh_task = asyncio.create_task(self._refresh_all())

    @staticmethod
    def _make_item(
        entry: EtfCatalogEntry,
        quote: Any | None,
    ) -> EtfDirectoryItem:
        available = quote is not None
        return EtfDirectoryItem(
            ticker=entry["ticker"],
            symbol=entry["ticker"],
            name=entry["name"],
            provider=entry["provider"],
            category=entry["category"],
            exposure=entry["exposure"],
            currency=str(getattr(quote, "currency", "CAD") or "CAD"),
            price=float(getattr(quote, "price", 0.0) or 0.0) if available else 0.0,
            change_percent=(
                float(getattr(quote, "change_percent", 0.0) or 0.0)
                if available
                else 0.0
            ),
            volume=int(getattr(quote, "volume", 0) or 0) if available else 0,
            source=(
                str(getattr(quote, "source", "yahoo-public"))
                if available
                else "unavailable"
            ),
            delayed=bool(getattr(quote, "delayed", True)),
        )

    def _make_snapshot(self) -> EtfDirectorySnapshot:
        items = [
            self._make_item(entry, self._quote_cache.get(entry["ticker"]))
            for entry in ETF_CATALOG
        ]
        categories = list(dict.fromkeys(entry["category"] for entry in ETF_CATALOG))
        return EtfDirectorySnapshot(
            items=items,
            categories=categories,
            generated_at=datetime.now(UTC),
            refresh_after_seconds=CLIENT_REFRESH_SECONDS,
        )

    async def snapshot(self) -> EtfDirectorySnapshot:
        await self._prime_cold_start()
        snapshot = self._make_snapshot()
        self._ensure_background_refresh()
        return snapshot

    async def get_snapshot(self) -> EtfDirectorySnapshot:
        return await self.snapshot()

    async def directory(self) -> EtfDirectorySnapshot:
        return await self.snapshot()

    async def get_directory(self) -> EtfDirectorySnapshot:
        return await self.snapshot()

    async def build(self) -> EtfDirectorySnapshot:
        return await self.snapshot()


etf_service = EtfDirectoryService()
etf_directory_service = etf_service


async def get_etf_directory() -> EtfDirectorySnapshot:
    return await etf_service.snapshot()


async def build_etf_directory() -> EtfDirectorySnapshot:
    return await etf_service.snapshot()


async def build_etf_snapshot() -> EtfDirectorySnapshot:
    return await etf_service.snapshot()


async def etf_directory() -> EtfDirectorySnapshot:
    return await etf_service.snapshot()
