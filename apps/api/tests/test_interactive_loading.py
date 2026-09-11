import asyncio
from datetime import UTC, datetime, timedelta
from time import monotonic

import pytest

from app.core.config import settings
from app.services.canadian_equity_directory import CanadianEquityDirectoryService
from app.services.earnings_calendar import EarningsCalendarService
from app.services.fundamentals import FundamentalsService
from app.services.official_financials import OfficialFinancialsService
from app.services.yahoo_statements import YahooStatementsResult
from app.schemas.fundamentals import FinancialPeriod, EarningsEstimate


@pytest.mark.asyncio
async def test_slow_directory_and_consensus_keep_dates_usable_single_flight(monkeypatch):
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    service = EarningsCalendarService()
    service.directory = CanadianEquityDirectoryService()
    service.response_wait_seconds = .01
    release_directory, release_consensus = asyncio.Event(), asyncio.Event()
    scans = 0
    future = int((datetime.now(UTC) + timedelta(days=7)).timestamp())

    async def scan():
        nonlocal scans
        scans += 1
        await release_directory.wait()  # Arbitrarily slow, without real 20s sleep.
        return [{"symbol": "AAG.V", "quoteType": "EQUITY", "earningsTimestamp": future}], 0

    async def quotes(symbols):
        return [{"symbol": symbol, "earningsTimestamp": future} for symbol in symbols], 0, ""

    async def consensus(*args):
        await release_consensus.wait()  # Simulates 60s consensus blocking.
        return {}, 0

    monkeypatch.setattr(service.directory, "_scan", scan)
    monkeypatch.setattr(service, "_fetch_quotes", quotes)
    monkeypatch.setattr(service, "_fetch_consensus", consensus)
    first, second = await asyncio.wait_for(asyncio.gather(service.get_snapshot(), service.get_snapshot()), .3)
    assert first.events and second.events
    assert first.status == "partial" and first.refresh_in_progress
    assert "temporaire" in first.universe
    assert all(e.eps_estimate is None for e in first.events)
    assert scans == 1
    for _ in range(4):
        assert (await service.get_snapshot()).events
    assert scans == 1
    task = service._refresh_tasks["canada"]
    release_directory.set()
    await task
    full = await service.get_snapshot()
    assert [e.ticker for e in full.events] == ["AAG.V"]
    assert "temporaire" not in full.universe
    release_consensus.set()
    await service._consensus_tasks["canada"]
    assert not (await service.get_snapshot()).refresh_in_progress
    assert service.directory.ensure_refresh() is None


@pytest.mark.asyncio
async def test_earnings_refresh_retains_consensus_only_for_same_event(monkeypatch):
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    service = EarningsCalendarService()
    future = int((datetime.now(UTC) + timedelta(days=7)).timestamp())
    gate = asyncio.Event()
    async def quotes(_):
        return [{"symbol": "RY.TO", "earningsTimestamp": future}], 0, ""
    async def consensus(*args):
        await gate.wait()
        return {}, 0
    monkeypatch.setattr(service, "_fetch_quotes", quotes)
    monkeypatch.setattr(service, "_fetch_consensus", consensus)
    first = await service._load("tsx60")
    first.events[0].eps_estimate = 0
    first.events[0].revenue_estimate = 100
    refreshed = await service._load("tsx60")
    assert refreshed.events[0].eps_estimate == 0
    assert refreshed.events[0].revenue_estimate == 100 and refreshed.stale
    assert await service.get_snapshot("tsx60") is refreshed
    assert not service._refresh_tasks
    future += 90 * 86400
    next_quarter = await service._load("tsx60")
    assert next_quarter.events[0].eps_estimate is None
    assert next_quarter.events[0].revenue_estimate is None
    gate.set()
    await service._consensus_tasks["tsx60"]


@pytest.mark.asyncio
async def test_stale_directory_is_immediate_and_failed_scan_preserves_last_good(monkeypatch):
    service = CanadianEquityDirectoryService()
    async def scan():
        return [{"symbol": "RY.TO"}], 0
    monkeypatch.setattr(service, "_scan", scan)
    await service.ensure_refresh()
    old = service.peek()
    service.ttl_seconds = 0
    async def fail():
        raise RuntimeError("offline")
    monkeypatch.setattr(service, "_scan", fail)
    a, b = service.ensure_refresh(), service.ensure_refresh()
    assert a is b
    assert service.peek() is old
    await a
    assert service.peek() is old


@pytest.mark.asyncio
async def test_fundamentals_fast_deep_stale_and_last_good(monkeypatch):
    service = FundamentalsService()
    gate = asyncio.Event()
    calls = 0
    async def summary(_):
        return {"price": {"currency": "CAD", "marketCap": 100},
                "financialData": {"targetMeanPrice": 15, "numberOfAnalystOpinions": 4}}
    async def deep(snapshot, **kwargs):
        nonlocal calls
        calls += 1
        await gate.wait()
        snapshot.metrics.total_cash = 20
        snapshot.analysts.target_mean = None
        return snapshot
    monkeypatch.setattr(service, "_request_summary", summary)
    monkeypatch.setattr("app.services.fundamentals.official_financials_service.enrich", deep)
    first, second = await asyncio.wait_for(asyncio.gather(service.get_snapshot("CNQ"), service.get_snapshot("CNQ")), .3)
    assert first.metrics.market_cap == second.metrics.market_cap == 100
    assert first.analysts.target_mean == 15
    assert first.refresh_in_progress and calls == 1
    service._cache["CNQ.TO"] = (monotonic() - 1900, first)
    stale = await asyncio.wait_for(service.get_snapshot("CNQ"), .1)
    assert stale.stale and stale.metrics.market_cap == 100
    await service._fast_tasks["CNQ.TO"]
    assert calls == 1
    task = service._refresh_tasks["CNQ.TO"]
    gate.set()
    await task
    final = await service.get_snapshot("CNQ")
    assert final.metrics.total_cash == 20
    assert final.analysts.target_mean == 15 and final.stale
    assert not final.refresh_in_progress
    empty = service._unavailable("CNQ", "CNQ.TO", "offline")
    retained = service._retain_components(empty, final)
    assert retained.metrics.total_cash == 20 and retained.analysts.target_mean == 15


@pytest.mark.asyncio
async def test_independent_analyst_fallback_does_not_wait_for_deep(monkeypatch):
    service = FundamentalsService()
    gate = asyncio.Event()
    async def fail(_):
        raise RuntimeError("summary down")
    async def analysts(_):
        return {"financialData": {"targetMeanPrice": 42}}
    async def quote(_):
        # Unit tests must never depend on live Yahoo/network availability.
        return {}
    async def deep(snapshot, **kwargs):
        await gate.wait()
        return snapshot
    monkeypatch.setattr(service, "_request_summary", fail)
    monkeypatch.setattr(service, "_analyst_payload", analysts)
    monkeypatch.setattr(service, "_quote_fallback", quote)
    monkeypatch.setattr("app.services.fundamentals.official_financials_service.enrich", deep)
    fast = await asyncio.wait_for(service.get_snapshot("RY"), .2)
    assert fast.analysts.target_mean == 42
    task = service._refresh_tasks["RY.TO"]
    gate.set()
    await task


@pytest.mark.asyncio
async def test_slow_official_source_keeps_completed_structured_result(monkeypatch):
    service = OfficialFinancialsService()
    service.source_budget_seconds = .02
    async def no_constituent(_):
        return None
    async def slow(*args):
        await asyncio.Event().wait()
    period = FinancialPeriod(period_end=datetime(2026, 6, 30, tzinfo=UTC),
                             period_type="quarterly", currency="CAD", total_revenue=100)
    async def structured(*args):
        return YahooStatementsResult("XYZ", "XYZ.TO", "CAD", [], [period])
    monkeypatch.setattr("app.services.official_financials.tsx_composite_universe_service.find", no_constituent)
    monkeypatch.setattr("app.services.official_financials.sec_edgar_financials_provider.get_financials", slow)
    monkeypatch.setattr("app.services.official_financials.issuer_financial_documents_service.get_financials", slow)
    monkeypatch.setattr("app.services.official_financials.yahoo_statements_service.get_financials", structured)
    empty = FundamentalsService()._unavailable("XYZ", "XYZ.TO", "offline")
    result = await asyncio.wait_for(service.enrich(empty), .2)
    assert result.quarterly_financials[0].total_revenue == 100
    assert "indisponible" in result.official_coverage.message


def test_component_retention_keeps_estimates_events_real_zero_and_currency_boundaries():
    service = FundamentalsService()
    old = service._snapshot("RY", "RY.TO", {"price": {"currency": "CAD"},
        "financialData": {"targetMeanPrice": 20, "totalCash": 50}})
    old.earnings_estimates = [EarningsEstimate(period="0q", eps_average=2)]
    old.events.earnings_dates = [datetime(2026, 11, 1, tzinfo=UTC)]
    new = service._snapshot("RY", "RY.TO", {"price": {"currency": "CAD"}, "financialData": {"totalCash": 0}})
    result = service._retain_components(new, old)
    assert result.metrics.total_cash == 0
    assert result.analysts.target_mean == 20
    assert result.earnings_estimates[0].eps_average == 2
    assert result.events.earnings_dates == old.events.earnings_dates
    assert result.stale
    new.currency = "USD"
    assert service._retain_components(new, old).analysts.target_mean is None


@pytest.mark.asyncio
async def test_fast_budget_preserves_completed_quote_when_analysts_are_slow(monkeypatch):
    service = FundamentalsService()
    service.fast_budget_seconds = .03
    async def fail(_):
        raise RuntimeError("summary unavailable")
    async def quote(_):
        return {"price": {"marketCap": 100}}
    async def slow(_):
        await asyncio.Event().wait()
    async def deep(snapshot, **kwargs):
        return snapshot
    monkeypatch.setattr(service, "_request_summary", fail)
    monkeypatch.setattr(service, "_quote_fallback", quote)
    monkeypatch.setattr(service, "_analyst_payload", slow)
    monkeypatch.setattr("app.services.fundamentals.official_financials_service.enrich", deep)
    snapshot = await asyncio.wait_for(service.get_snapshot("RY"), .2)
    assert snapshot.metrics.market_cap == 100
    if task := service._refresh_tasks.get("RY.TO"):
        await task


@pytest.mark.asyncio
async def test_sec_client_initialization_does_not_block_event_loop(monkeypatch):
    import threading
    import httpx
    from app.services.sec_edgar import SECEdgarFinancialsProvider

    started, release = threading.Event(), threading.Event()
    class Client:
        def __init__(self, **kwargs):
            started.set()
            release.wait(.3)
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url):
            return httpx.Response(200, json={"fields": [], "data": []}, request=httpx.Request("GET", url))
    monkeypatch.setattr("app.services.sec_edgar.httpx.AsyncClient", Client)
    task = asyncio.create_task(SECEdgarFinancialsProvider()._ticker_map())
    try:
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(.001)
        assert started.is_set()
        await asyncio.sleep(.01)
        assert not task.done(), "Client setup blocked the event loop instead of running in a worker"
    finally:
        release.set()
        await task
