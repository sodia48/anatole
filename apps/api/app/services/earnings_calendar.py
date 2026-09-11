from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal
from time import monotonic
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.resilience import AsyncStaleCache
from app.schemas.discovery import (
    EarningsCalendarEvent,
    EarningsCalendarSnapshot,
    FeedStatus,
)
from app.services.session_quotes import session_quote_service
from app.services.yahoo_public import yahoo_public_service
from app.services.canadian_equity_directory import canadian_equity_directory_service
from app.services.tsx60 import TSX60, TSX60_AS_OF, TSX60_SOURCE
from app.services.tsx_composite_universe import (
    XIC_UNIVERSE_SOURCE,
    tsx_composite_universe_service,
)


Universe = Literal["canada", "composite", "tsx60"]
TORONTO = ZoneInfo("America/Toronto")


@dataclass(frozen=True, slots=True)
class EarningsConstituent:
    ticker: str
    name: str
    sector: str | None
    weight: float | None
    exchange: str | None = None


@dataclass(frozen=True, slots=True)
class EarningsConsensus:
    period: str
    end_date: date | None
    eps_estimate: float | None
    revenue_estimate: float | None
    currency: str | None
    eps_analyst_count: int | None
    revenue_analyst_count: int | None


class EarningsCalendarService:
    """Upcoming earnings windows for the Canadian equity universe.

    Yahoo's batched quote feed is used only for published earnings windows.
    Dates are always labelled as estimates because the feed does not expose a
    reliable issuer-confirmation flag. No date is inferred from prior quarters.
    """

    batch_size = 50
    refresh_after_seconds = 900
    stale_seconds = 86_400

    def __init__(self) -> None:
        self._refresh_tasks: dict[str, asyncio.Task[None]] = {}
        self._retry_after: dict[str, float] = {}
        self.directory = canadian_equity_directory_service
        self._consensus_tasks: dict[str, asyncio.Task[None]] = {}
        self.response_wait_seconds = 2.0
        self._cache: AsyncStaleCache[
            str,
            EarningsCalendarSnapshot,
        ] = AsyncStaleCache(max_entries=4)
        self._consensus_cache: AsyncStaleCache[
            str,
            tuple[EarningsConsensus, ...],
        ] = AsyncStaleCache(max_entries=512)

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
        if normalized in {"canada", "all", "ca"}:
            return "canada"
        if normalized in {"tsx60", "60", "sptsx60"}:
            return "tsx60"
        if normalized in {
            "composite",
            "tsxcomposite",
            "sptsxcomposite",
        }:
            return "composite"
        raise ValueError("Universe must be 'canada', 'composite' or 'tsx60'")

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
        return await yahoo_public_service.credentials()

    async def _fetch_batch(self, symbols: list[str], crumb: str) -> list[dict[str, Any]]:
        payload = await yahoo_public_service.request_json(
            "/v7/finance/quote", params={"symbols": ",".join(symbols)},
        )
        rows = payload.get("quoteResponse", {}).get("result") or []
        if not rows:
            raise RuntimeError("Empty Yahoo quotes response")
        return [row for row in rows if isinstance(row, dict)]


    async def _fetch_quotes(
        self,
        symbols: list[str],
    ) -> tuple[list[dict[str, Any]], int, str]:
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
        return rows, failed, crumb

    @staticmethod
    def _number(value: Any) -> float | None:
        if isinstance(value, dict):
            value = value.get("raw")
        if value is None or isinstance(value, bool):
            return None
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None
        return parsed if math.isfinite(parsed) else None

    @classmethod
    def _integer(cls, value: Any) -> int | None:
        parsed = cls._number(value)
        return int(parsed) if parsed is not None else None

    @staticmethod
    def _date(value: Any) -> date | None:
        if not isinstance(value, str):
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None

    @classmethod
    def _parse_consensus(
        cls,
        payload: dict[str, Any],
    ) -> tuple[EarningsConsensus, ...]:
        results = payload.get("quoteSummary", {}).get("result") or []
        root = results[0] if results and isinstance(results[0], dict) else {}
        rows = root.get("earningsTrend", {}).get("trend") or []
        output: list[EarningsConsensus] = []

        for row in rows:
            if not isinstance(row, dict):
                continue
            earnings = row.get("earningsEstimate") or {}
            revenue = row.get("revenueEstimate") or {}
            if not isinstance(earnings, dict) or not isinstance(revenue, dict):
                continue
            eps_estimate = cls._number(earnings.get("avg"))
            revenue_estimate = cls._number(revenue.get("avg"))
            if eps_estimate is None and revenue_estimate is None:
                continue
            output.append(
                EarningsConsensus(
                    period=str(row.get("period") or ""),
                    end_date=cls._date(row.get("endDate")),
                    eps_estimate=eps_estimate,
                    revenue_estimate=revenue_estimate,
                    currency=str(
                        earnings.get("earningsCurrency")
                        or revenue.get("revenueCurrency")
                        or ""
                    ).upper()
                    or None,
                    eps_analyst_count=cls._integer(
                        earnings.get("numberOfAnalysts")
                    ),
                    revenue_analyst_count=cls._integer(
                        revenue.get("numberOfAnalysts")
                    ),
                )
            )

        return tuple(output)

    async def _fetch_symbol_consensus(
        self,
        symbol: str,
        crumb: str,
    ) -> tuple[EarningsConsensus, ...]:
        payload = await yahoo_public_service.request_json(
            f"/v10/finance/quoteSummary/{symbol}",
            params={"modules": "earningsTrend"},
        )
        return self._parse_consensus(payload)

    async def _fetch_consensus(
        self,
        symbols: list[str],
        crumb: str,
    ) -> tuple[dict[str, tuple[EarningsConsensus, ...]], int]:
        unique_symbols = list(dict.fromkeys(symbols))

        output: dict[str, tuple[EarningsConsensus, ...]] = {}
        pending = iter(unique_symbols)

        async def worker() -> None:
            for symbol in pending:
                cached = self._consensus_cache.peek(symbol, max_age_seconds=self.refresh_after_seconds)
                if cached is not None:
                    output[symbol] = cached
                    continue
                try:
                    result = await self._fetch_symbol_consensus(symbol, crumb)
                    self._consensus_cache.store(symbol, result)
                    output[symbol] = result
                except Exception:
                    stale = self._consensus_cache.peek(symbol, max_age_seconds=self.stale_seconds)
                    if stale is not None:
                        output[symbol] = stale

        try:
            async with asyncio.timeout(60):
                await asyncio.gather(*(worker() for _ in range(4)))
        except TimeoutError:
            pass  # Dates remain usable even when consensus enrichment is slow.
        return output, len(unique_symbols) - len(output)

    @staticmethod
    def _consensus_for_event(
        event: EarningsCalendarEvent,
        rows: tuple[EarningsConsensus, ...],
    ) -> EarningsConsensus | None:
        event_date = event.starts_at.astimezone(TORONTO).date()
        eligible = [
            row
            for row in rows
            if row.end_date is not None and row.end_date <= event_date
        ]
        if eligible:
            return max(eligible, key=lambda row: row.end_date or date.min)
        return next((row for row in rows if row.period == "0q"), None)

    def _with_consensus(
        self,
        events: list[EarningsCalendarEvent],
        consensus: dict[str, tuple[EarningsConsensus, ...]],
    ) -> list[EarningsCalendarEvent]:
        output: list[EarningsCalendarEvent] = []
        for event in events:
            match = self._consensus_for_event(
                event,
                consensus.get(event.symbol, ()),
            )
            if match is None:
                output.append(event)
                continue
            output.append(
                event.model_copy(
                    update={
                        "eps_estimate": match.eps_estimate,
                        "revenue_estimate": match.revenue_estimate,
                        "estimate_currency": match.currency,
                        "eps_analyst_count": match.eps_analyst_count,
                        "revenue_analyst_count": (
                            match.revenue_analyst_count
                        ),
                    }
                )
            )
        return output

    @staticmethod
    def _datetime(value: Any) -> datetime | None:
        try:
            timestamp = int(value)
        except (TypeError, ValueError, OverflowError):
            return None
        if timestamp <= 0:
            return None
        try:
            return datetime.fromtimestamp(timestamp, UTC)
        except (ValueError, OverflowError, OSError):
            return None

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

            candidates = [self._datetime(row.get(key)) for key in
                          ("earningsTimestamp", "earningsTimestampStart")]
            starts_at = next((value for value in candidates if value is not None
                              and today <= value.astimezone(TORONTO).date() <= limit), None)
            window_start = self._datetime(
                row.get("earningsTimestampStart")
            ) or starts_at
            window_end = self._datetime(
                row.get("earningsTimestampEnd")
            ) or starts_at
            if starts_at is None or window_start is None or window_end is None:
                continue
            if not window_start <= starts_at <= window_end:
                # Inconsistent windows must not attach an old quarter to a
                # future timestamp. Retain only the timestamp actually supplied.
                window_start = window_end = starts_at

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
                    exchange=constituent.exchange,
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
        if universe == "canada":
            directory = None if demo_mode else self.directory.peek()
            if not demo_mode:
                self.directory.ensure_refresh()
            rows, failed_batches = (directory.rows, directory.failures) if directory else ([], 0)
            constituents = [EarningsConstituent(
                ticker=str(row["symbol"]).removesuffix(".TO").replace("-", ".")
                if str(row["symbol"]).endswith(".TO") else str(row["symbol"]),
                name=str(row.get("longName") or row.get("shortName") or row["symbol"]),
                sector=row.get("sector"), weight=None,
                exchange=row.get("fullExchangeName") or row.get("exchange"),
            ) for row in rows]
            universe_label = "Canada · TSX / TSXV / CSE / Cboe"
            universe_as_of = datetime.now(UTC).date().isoformat()
            universe_status = FeedStatus(source="Yahoo Finance Canadian equity directory",
                                         status="partial" if failed_batches else "ok",
                                         detail=f"{len(constituents)} listed equities; {failed_batches} failed pages")
            if not directory and not demo_mode:
                # Existing Composite coverage is usable without fetching its universe.
                composite = self._cache.peek("composite", max_age_seconds=self.stale_seconds)
                if composite and composite.events:
                    constituents = [EarningsConstituent(e.ticker, e.company, e.sector, e.weight, e.exchange)
                                    for e in composite.events]
                    universe_label = "Canada — couverture Composite temporaire"
                else:
                    constituents = self._tsx60_constituents()
                    universe_label = "Canada — couverture TSX 60 temporaire"
                universe_status = FeedStatus(source="Yahoo Finance Canadian equity directory", status="partial",
                    detail="Synchronisation du marché canadien élargi en cours.")
        elif demo_mode and universe == "composite":
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
                status="unavailable",
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
        if universe == "canada" and directory and monotonic() - directory.fetched_at < 60:
            # The just-finished scan already contains published upstream quote fields.
            # Reuse them once; a long-lived identity cache never makes quotes fresh.
            rows, quote_failures, crumb = directory.rows, 0, ""
        else:
            rows, quote_failures, crumb = await self._fetch_quotes(symbols)
        failed_batches = (failed_batches if universe == "canada" else 0) + quote_failures
        now = datetime.now(UTC)
        events = self._events(rows, constituents, now=now)
        preliminary = EarningsCalendarSnapshot(
            universe=universe_label, universe_as_of=universe_as_of,
            constituent_count=len(constituents), companies_with_dates=len(events),
            events=events, source_statuses=[universe_status], generated_at=now,
            status="partial", refresh_in_progress=True, refresh_after_seconds=5,
        )
        previous = self._cache.peek(universe, max_age_seconds=self.stale_seconds)
        if previous:
            # Keep estimates only for the same published event, never a new quarter.
            old_events = {(e.symbol, e.starts_at): e for e in previous.events}
            retained_events = []
            for event in preliminary.events:
                old_event = old_events.get((event.symbol, event.starts_at))
                updates = {} if old_event is None else {
                    field: getattr(old_event, field)
                    for field in ("eps_estimate", "revenue_estimate", "estimate_currency",
                                  "eps_analyst_count", "revenue_analyst_count")
                    if getattr(event, field) is None and getattr(old_event, field) is not None
                }
                retained_events.append(event.model_copy(update=updates))
                if updates:
                    preliminary.stale = True
            preliminary.events = retained_events
        if failed_batches and previous and previous.events:
            previous_by_symbol = {event.symbol: event for event in previous.events
                                  if event.starts_at >= now}
            previous_by_symbol.update({event.symbol: event for event in events})
            preliminary = preliminary.model_copy(update={
                "events": sorted(previous_by_symbol.values(), key=lambda event: (event.starts_at, event.ticker)),
                "companies_with_dates": len(previous_by_symbol), "stale": True,
            })
        self._cache.store(universe, preliminary)
        old_task = self._consensus_tasks.get(universe)
        if old_task and not old_task.done():
            old_task.cancel()  # Superseded enrichment owned solely by this service.
        self._consensus_tasks[universe] = asyncio.create_task(
            self._enrich_consensus(universe, preliminary, crumb, failed_batches))
        return preliminary

    async def _enrich_consensus(self, universe: Universe, snapshot: EarningsCalendarSnapshot,
                               crumb: str, failed_batches: int) -> None:
        try:
            consensus, failed = await self._fetch_consensus([e.symbol for e in snapshot.events], crumb)
            current = self._cache.peek(universe)
            if current is None or current.generated_at != snapshot.generated_at:
                return
            directory_pending = universe == "canada" and self.directory.peek() is None
            self._cache.store(universe, snapshot.model_copy(update={
                "events": self._with_consensus(snapshot.events, consensus),
                "status": "partial" if failed or failed_batches or any(s.status != "ok" for s in snapshot.source_statuses) else "available",
                "refresh_in_progress": directory_pending,
                "refresh_after_seconds": 5 if directory_pending else self.refresh_after_seconds,
                "source_statuses": [*snapshot.source_statuses, FeedStatus(
                    source="Yahoo Finance earnings consensus", status="partial" if failed else "ok",
                    detail=f"{failed} unavailable consensus requests")],
            }))
        except Exception:
            if self._cache.peek(universe) is snapshot:
                self._cache.store(universe, snapshot.model_copy(update={"refresh_in_progress": False, "stale": True}))

    def _empty(self, universe: str, *, loading: bool) -> EarningsCalendarSnapshot:
        return EarningsCalendarSnapshot(
            universe=universe, constituent_count=0, companies_with_dates=0, events=[],
            source_statuses=[], generated_at=datetime.now(UTC),
            status="loading" if loading else "unavailable",
            refresh_in_progress=loading, refresh_after_seconds=5 if loading else 60,
        )

    async def _refresh(self, universe: Universe) -> None:
        try:
            async with asyncio.timeout(150):
                snapshot = await self._load(universe)
            self._cache.store(universe, snapshot)
            # Expand the cold warm-up independently of consensus; never block dates.
            if universe == "canada" and "temporaire" in snapshot.universe:
                directory_task = self.directory.ensure_refresh()
                directory = await asyncio.shield(directory_task) if directory_task else self.directory.peek()
                if directory:
                    snapshot = await self._load(universe)
                    self._cache.store(universe, snapshot)
                else:
                    current = self._cache.peek(universe)
                    if current:
                        self._cache.store(universe, current.model_copy(update={
                            "stale": True, "refresh_in_progress": False, "refresh_after_seconds": 60}))
                    self._retry_after[universe] = monotonic() + 60
        except asyncio.CancelledError:
            previous = self._cache.peek(universe)
            if previous and previous.refresh_in_progress:
                self._cache.store(universe, previous.model_copy(update={
                    "stale": True, "refresh_in_progress": False,
                }))
            raise
        except Exception:
            previous = self._cache.peek(universe, max_age_seconds=self.stale_seconds)
            snapshot = previous.model_copy(update={
                "status": "partial", "stale": True, "refresh_in_progress": False,
                "refresh_after_seconds": 60,
            }) if previous and previous.events else self._empty(universe, loading=False)
            self._cache.store(universe, snapshot)
            self._retry_after[universe] = monotonic() + 60
        finally:
            self._refresh_tasks.pop(universe, None)

    async def get_snapshot(
        self,
        universe: str = "canada",
    ) -> EarningsCalendarSnapshot:
        normalized = self.normalize_universe(universe)
        cached = self._cache.peek(normalized, max_age_seconds=self.refresh_after_seconds)
        task = self._refresh_tasks.get(normalized)
        consensus_task = self._consensus_tasks.get(normalized)
        if cached and cached.status != "unavailable":
            refreshing = task is not None or (consensus_task is not None and not consensus_task.done())
            fresh = self._cache.peek(normalized, max_age_seconds=cached.refresh_after_seconds) is not None
            if refreshing or (fresh and not cached.refresh_in_progress):
                return cached  # Retained fields do not trigger overlapping refresh loops.
        if task is None and monotonic() >= self._retry_after.get(normalized, 0):
            task = asyncio.create_task(self._refresh(normalized))
            self._refresh_tasks[normalized] = task
        stale = self._cache.peek(normalized, max_age_seconds=self.stale_seconds)
        if stale and stale.events:
            return stale.model_copy(update={"stale": True, "refresh_in_progress": task is not None})
        if task is not None:
            try:
                await asyncio.wait_for(asyncio.shield(task), self.response_wait_seconds)
            except TimeoutError:
                pass
        snapshot = self._cache.peek(normalized, max_age_seconds=self.stale_seconds)
        if snapshot:
            return snapshot.model_copy(update={"refresh_in_progress": True}) if task and not task.done() else snapshot
        return self._empty(normalized, loading=task is not None and not task.done())


earnings_calendar_service = EarningsCalendarService()
