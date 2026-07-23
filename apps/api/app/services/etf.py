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
from app.schemas.discovery import (
    EtfDirectoryItem,
    EtfDirectorySnapshot,
)
from app.services.market_data import market_data_service


CLIENT_REFRESH_SECONDS = 15
FULL_REFRESH_SECONDS = 45
QUOTE_BATCH_SIZE = 28
QUOTE_TIMEOUT_SECONDS = 14
COLD_START_TIMEOUT_SECONDS = 5


def _chunks(
    values: list[str],
    size: int,
) -> Iterable[list[str]]:
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
    """ETF directory with cached, automatically refreshed market quotes.

    The complete editorial catalog is always returned. A small priority batch
    is allowed a short cold-start window so the heatmap can display useful
    market colours immediately. The rest of the quotations refresh in the
    background and can never make the endpoint fail or return an empty list.
    """

    def __init__(self) -> None:
        self._quote_cache: dict[str, Any] = {}
        self._last_full_refresh = 0.0
        self._refresh_task: asyncio.Task[None] | None = None
        self._cold_start_attempted = False
        self._cold_start_lock = asyncio.Lock()

    async def _fetch_quotes(
        self,
        tickers: list[str],
    ) -> list[Any]:
        if not tickers:
            return []

        try:
            return await asyncio.wait_for(
                market_data_service.get_quotes(tickers),
                timeout=QUOTE_TIMEOUT_SECONDS,
            )
        except Exception:  # noqa: BLE001
            return []

    async def _refresh_batch(
        self,
        tickers: list[str],
    ) -> None:
        quotes = await self._fetch_quotes(tickers)
        if not quotes:
            return

        requested = {
            _base_symbol(ticker): ticker
            for ticker in tickers
        }
        assigned: set[str] = set()

        # Prefer matching by the symbol returned by the market-data service.
        for quote in quotes:
            quote_symbol = _base_symbol(
                getattr(
                    quote,
                    "ticker",
                    getattr(quote, "symbol", ""),
                )
            )
            requested_ticker = requested.get(quote_symbol)

            if requested_ticker is None:
                continue

            source = str(
                getattr(quote, "source", "")
            ).lower()

            if source == "demo-fallback":
                continue

            self._quote_cache[requested_ticker] = quote
            assigned.add(requested_ticker)

        # Compatibility fallback for providers preserving request order but
        # omitting a ticker field in their response model.
        unassigned_tickers = [
            ticker
            for ticker in tickers
            if ticker not in assigned
        ]
        unassigned_quotes = [
            quote
            for quote in quotes
            if _base_symbol(
                getattr(
                    quote,
                    "ticker",
                    getattr(quote, "symbol", ""),
                )
            )
            not in requested
        ]

        for requested_ticker, quote in zip(
            unassigned_tickers,
            unassigned_quotes,
            strict=False,
        ):
            source = str(
                getattr(quote, "source", "")
            ).lower()
            if source != "demo-fallback":
                self._quote_cache[requested_ticker] = quote

    async def _prime_cold_start(self) -> None:
        if self._quote_cache or self._cold_start_attempted:
            return

        async with self._cold_start_lock:
            if self._quote_cache or self._cold_start_attempted:
                return

            self._cold_start_attempted = True
            priority = list(PRIORITY_ETF_TICKERS)[:36]

            try:
                await asyncio.wait_for(
                    self._refresh_batch(priority),
                    timeout=COLD_START_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                # The full catalog still returns immediately.
                pass

    async def _refresh_all(self) -> None:
        try:
            priority = list(PRIORITY_ETF_TICKERS)
            remaining = [
                entry["ticker"]
                for entry in ETF_CATALOG
                if entry["ticker"] not in PRIORITY_ETF_TICKERS
            ]

            await self._refresh_batch(priority)

            for batch in _chunks(
                remaining,
                QUOTE_BATCH_SIZE,
            ):
                await self._refresh_batch(batch)
                # A tiny pause prevents a burst of public-data requests.
                await asyncio.sleep(0.35)

            self._last_full_refresh = monotonic()
        finally:
            self._refresh_task = None

    def _ensure_background_refresh(self) -> None:
        stale = (
            monotonic() - self._last_full_refresh
            >= FULL_REFRESH_SECONDS
        )

        if not stale:
            return

        if (
            self._refresh_task is not None
            and not self._refresh_task.done()
        ):
            return

        self._refresh_task = asyncio.create_task(
            self._refresh_all()
        )

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
            currency=str(
                getattr(quote, "currency", "CAD")
                or "CAD"
            ),
            price=(
                float(
                    getattr(quote, "price", 0.0)
                    or 0.0
                )
                if available
                else 0.0
            ),
            change_percent=(
                float(
                    getattr(
                        quote,
                        "change_percent",
                        0.0,
                    )
                    or 0.0
                )
                if available
                else 0.0
            ),
            volume=(
                int(
                    getattr(quote, "volume", 0)
                    or 0
                )
                if available
                else 0
            ),
            source=(
                str(
                    getattr(
                        quote,
                        "source",
                        "yahoo-public",
                    )
                )
                if available
                else "unavailable"
            ),
            delayed=bool(
                getattr(quote, "delayed", True)
            ),
        )

    def _make_snapshot(
        self,
    ) -> EtfDirectorySnapshot:
        items = [
            self._make_item(
                entry,
                self._quote_cache.get(
                    entry["ticker"]
                ),
            )
            for entry in ETF_CATALOG
        ]
        categories = list(
            dict.fromkeys(
                entry["category"]
                for entry in ETF_CATALOG
            )
        )

        return EtfDirectorySnapshot(
            items=items,
            categories=categories,
            generated_at=datetime.now(UTC),
            refresh_after_seconds=CLIENT_REFRESH_SECONDS,
        )

    async def snapshot(
        self,
    ) -> EtfDirectorySnapshot:
        await self._prime_cold_start()
        snapshot = self._make_snapshot()
        self._ensure_background_refresh()
        return snapshot

    async def get_snapshot(
        self,
    ) -> EtfDirectorySnapshot:
        return await self.snapshot()

    async def directory(
        self,
    ) -> EtfDirectorySnapshot:
        return await self.snapshot()

    async def get_directory(
        self,
    ) -> EtfDirectorySnapshot:
        return await self.snapshot()

    async def build(
        self,
    ) -> EtfDirectorySnapshot:
        return await self.snapshot()


etf_service = EtfDirectoryService()
etf_directory_service = etf_service


async def get_etf_directory(
) -> EtfDirectorySnapshot:
    return await etf_service.snapshot()


async def build_etf_directory(
) -> EtfDirectorySnapshot:
    return await etf_service.snapshot()


async def build_etf_snapshot(
) -> EtfDirectorySnapshot:
    return await etf_service.snapshot()


async def etf_directory(
) -> EtfDirectorySnapshot:
    return await etf_service.snapshot()
