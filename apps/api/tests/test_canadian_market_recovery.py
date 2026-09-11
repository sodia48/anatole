import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.schemas.fundamentals import FinancialPeriod
from app.services.earnings_calendar import EarningsCalendarService, EarningsConstituent
from app.services.fundamentals import FundamentalsService
from app.services.canadian_equity_directory import CanadianEquityDirectoryService
from app.services.yahoo_public import YahooPublicService


def test_only_earnings_default_changes_to_canada():
    from fastapi.testclient import TestClient
    from app.main import app

    schema = TestClient(app).get("/openapi.json").json()

    def default(path):
        params = schema["paths"][f"/api/v1/discovery/{path}"]["get"]["parameters"]
        return next(item["schema"]["default"] for item in params if item["name"] == "universe")

    assert default("earnings-calendar") == "canada"
    assert default("screener") == "composite"


@pytest.mark.asyncio
async def test_canadian_directory_paginates_all_exchanges_and_reports_failed_pages(monkeypatch):
    service = CanadianEquityDirectoryService()
    calls = []

    async def page(offset):
        calls.append(offset)
        if offset == 500:
            raise RuntimeError("one page unavailable")
        symbols = ["RY.TO", "AAG.V"] if offset == 0 else ["AAG.V", "AA.CN", "AAG.NE", "MSFT"]
        return {"total": 600, "quotes": [{"symbol": symbol, "quoteType": "EQUITY"} for symbol in symbols]}

    monkeypatch.setattr(service, "_page", page)
    rows, failed = await service._scan()
    assert set(calls) == {0, 250, 500}
    assert {row["symbol"] for row in rows} == {"RY.TO", "AAG.V", "AA.CN", "AAG.NE"}
    assert failed == 1


def test_non_index_dates_preserve_exchange_and_ignore_invalid_or_old_dates():
    service = EarningsCalendarService()
    now = datetime.now(UTC)
    future = int((now + timedelta(days=7)).timestamp())
    past = int((now - timedelta(days=7)).timestamp())
    rows = [
        {"symbol": "AAG.V", "earningsTimestamp": past, "earningsTimestampStart": future},
        {"symbol": "AA.CN", "earningsTimestamp": future},
        {"symbol": "AAG.NE", "earningsTimestamp": future},
        {"symbol": "OLD.TO", "earningsTimestamp": past},
        {"symbol": "BAD.TO", "earningsTimestamp": 10**100},
    ]
    constituents = [EarningsConstituent(row["symbol"], row["symbol"], None, None) for row in rows]
    events = service._events(rows, constituents, now=now)
    assert {event.ticker for event in events} == {"AAG.V", "AA.CN", "AAG.NE"}
    assert all(event.starts_at == datetime.fromtimestamp(future, UTC) for event in events)
    assert all(event.eps_estimate is None for event in events)


@pytest.mark.asyncio
async def test_cold_calendar_returns_loading_and_refresh_survives_request_cancellation(monkeypatch):
    service = EarningsCalendarService()
    service.response_wait_seconds = 0.001
    release = asyncio.Event()
    calls = 0

    async def load(universe):
        nonlocal calls
        calls += 1
        await release.wait()
        return service._empty(universe, loading=False).model_copy(update={"status": "available"})

    monkeypatch.setattr(service, "_load", load)
    first = await service.get_snapshot()
    assert first.status == "loading" and first.refresh_in_progress
    service.response_wait_seconds = 10
    request = asyncio.create_task(service.get_snapshot())
    await asyncio.sleep(0)
    request.cancel()
    with pytest.raises(asyncio.CancelledError):
        await request
    task = service._refresh_tasks["canada"]
    assert not task.cancelled()
    release.set()
    await task
    assert (await service.get_snapshot()).status == "available"
    assert calls == 1


@pytest.mark.asyncio
async def test_failed_refresh_keeps_last_dates_and_reports_stale(monkeypatch):
    service = EarningsCalendarService()
    now = datetime.now(UTC)
    events = service._events([
        {"symbol": "RY.TO", "earningsTimestamp": int((now + timedelta(days=7)).timestamp())},
    ], [EarningsConstituent("RY", "Royal Bank", None, None)], now=now)
    previous = service._empty("canada", loading=False).model_copy(update={"events": events, "status": "available"})
    service._cache.store("canada", previous)

    async def fail(_):
        raise RuntimeError("upstream unavailable")

    monkeypatch.setattr(service, "_load", fail)
    await service._refresh("canada")
    snapshot = await service.get_snapshot()
    assert snapshot.events == events
    assert snapshot.stale and snapshot.status == "partial"
    assert not snapshot.refresh_in_progress


def quarters():
    end = datetime.now(UTC) - timedelta(days=20)
    return [FinancialPeriod(
        period_end=end - timedelta(days=91 * index), period_type="quarterly", currency="CAD",
        total_revenue=100, net_income=10, diluted_eps=0.5, operating_cash_flow=20,
        free_cash_flow=15, total_cash=30, total_debt=60, current_assets=50,
        current_liabilities=25, stockholder_equity=120,
    ) for index in range(4)]


def test_complete_metrics_uses_full_statements_and_preserves_real_zero():
    service = FundamentalsService()
    snapshot = service._unavailable("CNQ", "CNQ.TO", "")
    snapshot.financial_currency = snapshot.currency = "CAD"
    snapshot.quarterly_financials = quarters()
    snapshot.ttm = service._ttm(snapshot.quarterly_financials, "CAD")
    snapshot.metrics.total_cash = 0
    service._complete_metrics(snapshot)
    assert snapshot.metrics.total_revenue == 400
    assert snapshot.metrics.net_income_to_common == 40
    assert snapshot.metrics.trailing_eps == 2
    assert snapshot.metrics.total_cash == 0
    assert snapshot.metrics.total_debt == 60
    assert snapshot.metrics.debt_to_equity == 50
    assert snapshot.metrics.current_ratio == 2
    assert snapshot.metrics.market_cap is None


@pytest.mark.parametrize("case", ["missing_quarter", "missing_value", "currency", "gap", "unknown_currency"])
def test_incomplete_ttm_never_fabricates_an_annual_total(case):
    rows = quarters()
    currency = "CAD"
    if case == "missing_quarter":
        rows.pop()
    elif case == "missing_value":
        rows[1].total_revenue = None
    elif case == "currency":
        rows[1].currency = "USD"
    elif case == "gap":
        rows[-1].period_end -= timedelta(days=100)
    else:
        currency = None
    assert FundamentalsService()._ttm(rows, currency).total_revenue is None


def test_cross_currency_valuation_is_not_fabricated():
    service = FundamentalsService()
    snapshot = service._unavailable("SHOP", "SHOP.TO", "")
    snapshot.currency, snapshot.financial_currency = "CAD", "USD"
    snapshot.metrics.market_cap = 1000
    snapshot.metrics.total_revenue = 100
    snapshot.metrics.trailing_eps = 1
    snapshot.analysts.current_price = 10
    service._complete_metrics(snapshot)
    assert snapshot.metrics.price_to_sales is None
    assert snapshot.metrics.trailing_pe is None


@pytest.mark.asyncio
@pytest.mark.parametrize("empty_response", [False, True])
async def test_primary_failure_or_empty_response_fills_cards_from_other_sources(monkeypatch, empty_response):
    service = FundamentalsService()

    async def summary(_):
        if empty_response:
            return {"price": {"longName": "Example Canadian issuer"}}
        raise RuntimeError("provider down")

    async def quote(_):
        return {"price": {"longName": "Example Canadian issuer", "currency": "CAD", "marketCap": 1000},
                "financialData": {"financialCurrency": "CAD", "currentPrice": 5}}

    async def enrich(snapshot, *, upstream_failed):
        assert upstream_failed
        snapshot.quarterly_financials = quarters()
        return snapshot

    monkeypatch.setattr(service, "_request_summary", summary)
    monkeypatch.setattr(service, "_quote_fallback", quote)
    monkeypatch.setattr("app.services.fundamentals.official_financials_service.enrich", enrich)
    snapshot = await service.get_snapshot("XYZ.V")
    assert snapshot.ticker == "XYZ.V"
    assert snapshot.name == "Example Canadian issuer"
    assert snapshot.metrics.market_cap == 1000
    if task := service._refresh_tasks.get("XYZ.V"):
        await task
    snapshot = await service.get_snapshot("XYZ.V")
    assert snapshot.metrics.total_revenue == 400
    assert snapshot.metrics.price_to_sales == 2.5
    assert snapshot.refresh_after_seconds == service.unavailable_ttl_seconds


@pytest.mark.asyncio
async def test_shared_yahoo_credentials_refresh_on_401_not_on_429(monkeypatch):
    service = YahooPublicService()
    crumbs = 0
    requests = 0
    status = 401

    async def request(method, url, **kwargs):
        nonlocal crumbs, requests
        if "getcrumb" in url:
            crumbs += 1
            return httpx.Response(200, text=f"crumb{crumbs}")
        if "fc.yahoo" in url:
            return httpx.Response(200)
        requests += 1
        if requests == 1 or status == 429:
            response = httpx.Response(status, request=httpx.Request(method, url))
            response.raise_for_status()
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr("app.services.yahoo_public.shared_http_client.request", request)
    assert await service.request_json("/test") == {"ok": True}
    assert crumbs == requests == 2
    status = 429
    with pytest.raises(httpx.HTTPStatusError):
        await service.request_json("/test")
    assert crumbs == 2 and requests == 3


@pytest.mark.asyncio
async def test_yahoo_retains_second_host_fallback(monkeypatch):
    service = YahooPublicService()
    hosts = []

    async def credentials():
        return "test-credential"

    async def request(method, url, **kwargs):
        hosts.append(url)
        if "query1" in url:
            raise httpx.ConnectTimeout("provider temporarily unreachable")
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(service, "credentials", credentials)
    monkeypatch.setattr("app.services.yahoo_public.shared_http_client.request", request)
    assert await service.request_json("/test") == {"ok": True}
    assert hosts == ["https://query1.finance.yahoo.com/test", "https://query2.finance.yahoo.com/test"]
