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


QUOTE_REFRESH_SECONDS = 300
CLIENT_REFRESH_SECONDS = 60
QUOTE_BATCH_SIZE = 20
QUOTE_TIMEOUT_SECONDS = 18


def _chunks(
    values: list[str],
    size: int,
) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


class EtfDirectoryService:
    """Fast ETF directory backed by an editorial catalog.

    The endpoint always returns the complete catalog immediately. Quotes are
    refreshed in the background so a slow public market-data provider can
    never make `/api/v1/discovery/etfs` return 0 items or time out.
    """

    def __init__(self) -> None:
        self._quote_cache: dict[str, Any] = {}
        self._last_full_refresh = 0.0
        self._refresh_task: asyncio.Task[None] | None = None

    async def _refresh_batch(
        self,
        tickers: list[str],
    ) -> None:
        if not tickers:
            return

        try:
            quotes = await asyncio.wait_for(
                market_data_service.get_quotes(tickers),
                timeout=QUOTE_TIMEOUT_SECONDS,
            )
        except Exception:  # noqa: BLE001
            return

        for requested_ticker, quote in zip(
            tickers,
            quotes,
            strict=False,
        ):
            source = str(
                getattr(quote, "source", "")
            ).lower()

            # Never expose synthetic demo values as market quotations.
            if source == "demo-fallback":
                continue

            self._quote_cache[requested_ticker] = quote

    async def _refresh_quotes(
        self,
        tickers: list[str],
    ) -> None:
        for batch in _chunks(tickers, QUOTE_BATCH_SIZE):
            await self._refresh_batch(batch)

    async def _refresh_all(self) -> None:
        try:
            priority = list(PRIORITY_ETF_TICKERS)
            remaining = [
                item["ticker"]
                for item in ETF_CATALOG
                if item["ticker"] not in PRIORITY_ETF_TICKERS
            ]

            # Popular Canadian ETFs first, then the rest of the directory.
            await self._refresh_quotes(priority)
            await self._refresh_quotes(remaining)
            self._last_full_refresh = monotonic()
        finally:
            self._refresh_task = None

    def _ensure_background_refresh(self) -> None:
        stale = (
            monotonic() - self._last_full_refresh
            >= QUOTE_REFRESH_SECONDS
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

        # `categories` is mandatory in the current Pydantic response model.
        return EtfDirectorySnapshot(
            items=items,
            categories=categories,
            generated_at=datetime.now(UTC),
            refresh_after_seconds=CLIENT_REFRESH_SECONDS,
        )

    async def snapshot(
        self,
    ) -> EtfDirectorySnapshot:
        # Important: do not await Yahoo/public quotes here.
        # The complete 172-item catalog is returned immediately.
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
