from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.discovery import (
    EarningsCalendarEvent,
    EarningsCalendarSnapshot,
    FeedStatus,
)
from app.services.session_quotes import session_quote_service
from app.services.tsx60 import TSX60, TSX60_AS_OF, TSX60_SOURCE
from app.services.tsx_composite_universe import (
    XIC_UNIVERSE_SOURCE,
    tsx_composite_universe_service,
)


Universe = Literal["composite", "tsx60"]
TORONTO = ZoneInfo("America/Toronto")
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
YAHOO_CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
YAHOO_COOKIE_URL = "https://fc.yahoo.com"


@dataclass(frozen=True, slots=True)
class EarningsConstituent:
    ticker: str
    name: str
    sector: str | None
    weight: float | None


class EarningsCalendarService:
    """Upcoming earnings windows for the Canadian equity universe.

    Yahoo's batched quote feed is used only for published earnings windows.
    Dates are always labelled as estimates because the feed does not expose a
    reliable issuer-confirmation flag. No date is inferred from prior quarters.
    """

    batch_size = 50
    refresh_after_seconds = 10_800
    stale_seconds = 86_400

    def __init__(self) -> None:
        self._cache: AsyncStaleCache[
            str,
            EarningsCalendarSnapshot,
        ] = AsyncStaleCache(max_entries=4)

    @staticmethod
    def _tsx60_constituents() -> list[EarningsConstituent]:
        return [
            EarningsConstituent(
                ticker=item.symbol,
                name=item.name,
                sector=item.sector,
                weight=item.weight,
            )
            for item in TSX60
        ]

    @staticmethod
    def normalize_universe(value: str) -> Universe:
        normalized = value.strip().lower().replace("-", "")
        if normalized in {"tsx60", "60", "sptsx60"}:
            return "tsx60"
        if normalized in {
            "composite",
            "tsxcomposite",
            "sptsxcomposite",
        }:
            return "composite"
        raise ValueError("Universe must be 'composite' or 'tsx60'")

    async def _constituents(
        self,
        universe: Universe,
    ) -> tuple[
        list[EarningsConstituent],
        str,
        str | None,
        FeedStatus,
    ]:
        if universe == "tsx60":
            return (
                self._tsx60_constituents(),
                "S&P/TSX 60",
                TSX60_AS_OF,
                FeedStatus(
                    source=TSX60_SOURCE,
                    status="ok",
                    detail=f"{len(TSX60)} constituents",
                ),
            )

        try:
            rows = await tsx_composite_universe_service.get_constituents()
            return (
                [
                    EarningsConstituent(
                        ticker=item.ticker,
                        name=item.name,
                        sector=item.sector,
                        weight=item.weight,
                    )
                    for item in rows
                ],
                "S&P/TSX Composite",
                tsx_composite_universe_service.as_of,
                FeedStatus(
                    source=XIC_UNIVERSE_SOURCE,
                    status="ok",
                    detail=f"{len(rows)} constituents",
                ),
            )
        except Exception as exc:  # noqa: BLE001
            return (
                self._tsx60_constituents(),
                "S&P/TSX Composite — TSX 60 fallback",
                TSX60_AS_OF,
                FeedStatus(
                    source=XIC_UNIVERSE_SOURCE,
                    status="partial",
                    detail=(
                        "Composite universe unavailable; honest TSX 60 "
                        f"fallback ({type(exc).__name__})"
                    ),
                ),
            )

    async def _credentials(self) -> str:
        try:
            await shared_http_client.request(
                "GET",
                YAHOO_COOKIE_URL,
                attempts=1,
            )
        except httpx.HTTPError:
            pass

        response = await shared_http_client.request(
            "GET",
            YAHOO_CRUMB_URL,
            attempts=2,
        )
        crumb = response.text.strip()
        if not crumb or "<" in crumb:
            raise RuntimeError("Yahoo public quote credential unavailable")
        return crumb

    async def _fetch_batch(
        self,
        symbols: list[str],
        crumb: str,
    ) -> list[dict[str, Any]]:
        response = await shared_http_client.request(
            "GET",
            YAHOO_QUOTE_URL,
            params={
                "symbols": ",".join(symbols),
                "crumb": crumb,
                "formatted": "false",
                "lang": "en-CA",
                "region": "CA",
            },
            attempts=2,
        )
        payload = response.json()
        rows = payload.get("quoteResponse", {}).get("result") or []
        return [row for row in rows if isinstance(row, dict)]

    async def _fetch_quotes(
        self,
        symbols: list[str],
    ) -> tuple[list[dict[str, Any]], int]:
        crumb = await self._credentials()
        batches = [
            symbols[index : index + self.batch_size]
            for index in range(0, len(symbols), self.batch_size)
        ]
        results = await asyncio.gather(
            *(self._fetch_batch(batch, crumb) for batch in batches),
            return_exceptions=True,
        )
        rows: list[dict[str, Any]] = []
        failed = 0
        for result in results:
            if isinstance(result, Exception):
                failed += 1
            else:
                rows.extend(result)
        if not rows and failed:
            raise RuntimeError("Yahoo earnings batches unavailable")
        return rows, failed

    @staticmethod
    def _datetime(value: Any) -> datetime | None:
        try:
            timestamp = int(value)
        except (TypeError, ValueError):
            return None
        if timestamp <= 0:
            return None
        return datetime.fromtimestamp(timestamp, UTC)

    def _events(
        self,
        rows: list[dict[str, Any]],
        constituents: list[EarningsConstituent],
        *,
        now: datetime,
    ) -> list[EarningsCalendarEvent]:
        by_symbol = {
            session_quote_service.normalize_ticker(item.ticker): item
            for item in constituents
        }
        today = now.astimezone(TORONTO).date()
        limit = today + timedelta(days=180)
        events: list[EarningsCalendarEvent] = []

        for row in rows:
            yahoo_symbol = str(row.get("symbol") or "").upper()
            constituent = by_symbol.get(yahoo_symbol)
            if constituent is None:
                continue

            starts_at = self._datetime(
                row.get("earningsTimestamp")
                or row.get("earningsTimestampStart")
            )
            window_start = self._datetime(
                row.get("earningsTimestampStart")
            ) or starts_at
            window_end = self._datetime(
                row.get("earningsTimestampEnd")
            ) or starts_at
            if starts_at is None or window_start is None or window_end is None:
                continue

            local_date = starts_at.astimezone(TORONTO).date()
            if local_date < today or local_date > limit:
                continue

            ticker = constituent.ticker.upper()
            events.append(
                EarningsCalendarEvent(
                    ticker=ticker,
                    symbol=yahoo_symbol,
                    company=constituent.name,
                    sector=constituent.sector,
                    weight=constituent.weight,
                    starts_at=starts_at,
                    window_start=window_start,
                    window_end=window_end,
                    time_is_estimated=True,
                    source="Yahoo Finance public quote calendar",
                    url=(
                        "https://finance.yahoo.com/quote/"
                        f"{yahoo_symbol}/calendar/"
                    ),
                )
            )

        return sorted(
            events,
            key=lambda item: (item.starts_at, item.ticker),
        )

    async def _load(self, universe: Universe) -> EarningsCalendarSnapshot:
        demo_mode = settings.market_data_provider.strip().lower() == "demo"
        if demo_mode and universe == "composite":
            constituents = self._tsx60_constituents()
            universe_label = "S&P/TSX Composite — TSX 60 fallback"
            universe_as_of = TSX60_AS_OF
            universe_status = FeedStatus(
                source=XIC_UNIVERSE_SOURCE,
                status="partial",
                detail=(
                    "Composite universe synchronization is disabled in "
                    "explicit demo mode; TSX 60 coverage only"
                ),
            )
        else:
            (
                constituents,
                universe_label,
                universe_as_of,
                universe_status,
            ) = await self._constituents(universe)

        if demo_mode:
            return EarningsCalendarSnapshot(
                universe=universe_label,
                universe_as_of=universe_as_of,
                constituent_count=len(constituents),
                companies_with_dates=0,
                events=[],
                source_statuses=[
                    universe_status,
                    FeedStatus(
                        source="Yahoo Finance public quote calendar",
                        status="unavailable",
                        detail=(
                            "Live earnings dates are disabled in explicit "
                            "demo mode; no dates were fabricated"
                        ),
                    ),
                ],
                generated_at=datetime.now(UTC),
                refresh_after_seconds=self.refresh_after_seconds,
            )

        symbols = [
            session_quote_service.normalize_ticker(item.ticker)
            for item in constituents
        ]
        rows, failed_batches = await self._fetch_quotes(symbols)
        now = datetime.now(UTC)
        events = self._events(rows, constituents, now=now)
        quote_status = "partial" if failed_batches else "ok"

        return EarningsCalendarSnapshot(
            universe=universe_label,
            universe_as_of=universe_as_of,
            constituent_count=len(constituents),
            companies_with_dates=len({item.ticker for item in events}),
            events=events,
            source_statuses=[
                universe_status,
                FeedStatus(
                    source="Yahoo Finance public quote calendar",
                    status=quote_status,
                    detail=(
                        f"{len(events)} upcoming earnings dates; "
                        f"{failed_batches} failed batches"
                    ),
                ),
            ],
            generated_at=now,
            refresh_after_seconds=self.refresh_after_seconds,
        )

    async def get_snapshot(
        self,
        universe: str = "composite",
    ) -> EarningsCalendarSnapshot:
        normalized = self.normalize_universe(universe)
        return await self._cache.get_or_load(
            normalized,
            lambda: self._load(normalized),
            fresh_seconds=float(self.refresh_after_seconds),
            stale_seconds=float(self.stale_seconds),
        )


earnings_calendar_service = EarningsCalendarService()
