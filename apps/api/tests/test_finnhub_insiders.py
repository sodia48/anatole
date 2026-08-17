from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

import httpx
import pytest

from app.core.config import settings
from app.schemas.ipo_insiders import InsiderTrade
from app.services import insiders as insiders_module
from app.services.insiders import (
    FINNHUB_SOURCE_URL,
    FINNHUB_URL,
    RECENT_CACHE_GUARD_SECONDS,
    SEDI_URL,
    InsiderService,
    parse_finnhub_insider_payload,
)


def finnhub_row(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "name": "Jane Doe",
        "share": 1200,
        "change": 200,
        "transactionDate": date.today().isoformat(),
        "filingDate": date.today().isoformat(),
        "transactionPrice": 50,
        "transactionCode": "",
    }
    row.update(overrides)
    return row


def yahoo_trade() -> InsiderTrade:
    return InsiderTrade(
        id="yahoo-ry-jane",
        ticker="RY",
        company="Royal Bank of Canada",
        market="Canada",
        insider_name="Jane Doe",
        transaction_type="buy",
        transaction_label="Achat",
        trade_date=date.today(),
        filing_date=date.today(),
        shares=200,
        price=50,
        value=10_000,
        holdings_after=1200,
        source_name="Yahoo Finance — source secondaire",
        source_url="https://finance.yahoo.com/quote/RY.TO/",
        official_verification_url=SEDI_URL,
        official_source=False,
    )


def source(snapshot: Any, name: str) -> Any:
    return next(item for item in snapshot.sources if item.source == name)


def test_finnhub_normalizes_buy_price_value_and_source() -> None:
    trades = parse_finnhub_insider_payload(
        {"data": [finnhub_row()]},
        ticker="RY.TO",
        company="Royal Bank of Canada",
    )

    assert len(trades) == 1
    trade = trades[0]
    assert trade.ticker == "RY"
    assert trade.insider_name == "Jane Doe"
    assert trade.transaction_type == "buy"
    assert trade.shares == 200
    assert trade.holdings_after == 1200
    assert trade.price == 50
    assert trade.value == 10_000
    assert trade.source_name == "Finnhub — données d’initiés canadiennes"
    assert trade.source_url == FINNHUB_SOURCE_URL
    assert trade.official_verification_url == SEDI_URL
    assert trade.official_source is False


def test_finnhub_normalizes_sell_from_negative_change() -> None:
    trades = parse_finnhub_insider_payload(
        {"data": [finnhub_row(change=-75)]},
        ticker="RY",
        company="Royal Bank of Canada",
    )

    assert trades[0].transaction_type == "sell"
    assert trades[0].shares == 75
    assert trades[0].value == 3750


def test_finnhub_keeps_missing_price_and_value_unknown() -> None:
    trades = parse_finnhub_insider_payload(
        {"data": [finnhub_row(transactionPrice=None)]},
        ticker="RY",
        company="Royal Bank of Canada",
    )

    assert trades[0].price is None
    assert trades[0].value is None


def test_finnhub_does_not_invent_invalid_dates() -> None:
    trades = parse_finnhub_insider_payload(
        {
            "data": [
                finnhub_row(
                    transactionDate="not-a-date",
                    filingDate="also-invalid",
                )
            ]
        },
        ticker="RY",
        company="Royal Bank of Canada",
    )

    assert trades[0].trade_date is None
    assert trades[0].filing_date is None


@pytest.mark.asyncio
async def test_successful_empty_response_is_zero_not_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    monkeypatch.setattr(
        insiders_module,
        "tsx60_directory",
        lambda: [("RY", "Royal Bank of Canada")],
    )
    monkeypatch.setattr(
        insiders_module,
        "fetch_yahoo_sync",
        lambda ticker, company: [],
    )
    service = InsiderService(
        finnhub_transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"data": []})
        )
    )

    snapshot = await service.snapshot(
        market="canada",
        ticker=None,
        days=30,
        scan_limit=1,
        result_limit=20,
        force_refresh=True,
    )

    assert snapshot.summary.transactions == 0
    assert snapshot.message == (
        "Aucune transaction observée pour les critères sélectionnés."
    )
    assert source(snapshot, "Finnhub").status == "partial"
    assert source(snapshot, "Yahoo Finance").status == "partial"


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [401, 403])
async def test_finnhub_auth_failure_uses_yahoo_fallback(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "bad-key")
    monkeypatch.setattr(
        insiders_module,
        "fetch_yahoo_sync",
        lambda ticker, company: [yahoo_trade()],
    )
    service = InsiderService(
        finnhub_transport=httpx.MockTransport(
            lambda request: httpx.Response(status_code)
        )
    )

    trades = await service.canadian_ticker(
        "RY",
        "Royal Bank of Canada",
        days=30,
        force_refresh=True,
    )

    assert trades == [yahoo_trade()]
    attempt = service._finnhub_attempts[("RY", 30)]
    assert attempt.succeeded is False
    assert f"HTTP {status_code}" in (attempt.detail or "")


@pytest.mark.asyncio
async def test_finnhub_429_is_not_retried_and_status_is_explicit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    monkeypatch.setattr(
        insiders_module,
        "tsx60_directory",
        lambda: [("RY", "Royal Bank of Canada")],
    )
    monkeypatch.setattr(
        insiders_module,
        "fetch_yahoo_sync",
        lambda ticker, company: [],
    )
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429)

    service = InsiderService(
        finnhub_transport=httpx.MockTransport(handler)
    )
    snapshot = await service.snapshot(
        market="canada",
        ticker="RY",
        days=30,
        scan_limit=1,
        result_limit=20,
        force_refresh=True,
    )
    await service.canadian_ticker(
        "RY",
        "Royal Bank of Canada",
        days=30,
        force_refresh=True,
    )

    assert calls == 1
    finnhub = source(snapshot, "Finnhub")
    assert finnhub.status == "unavailable"
    assert "HTTP 429" in (finnhub.detail or "")


@pytest.mark.asyncio
async def test_timeout_uses_fallback_and_retains_previous_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    monkeypatch.setattr(
        insiders_module,
        "fetch_yahoo_sync",
        lambda ticker, company: [],
    )
    should_timeout = False

    def handler(request: httpx.Request) -> httpx.Response:
        if should_timeout:
            raise httpx.ReadTimeout("timeout", request=request)
        return httpx.Response(200, json={"data": [finnhub_row()]})

    service = InsiderService(
        finnhub_transport=httpx.MockTransport(handler)
    )
    first = await service.canadian_ticker(
        "RY",
        "Royal Bank of Canada",
        days=30,
        force_refresh=True,
    )
    cache_key = ("finnhub", "RY", 30)
    cached = service._ticker_cache[cache_key]
    service._ticker_cache[cache_key] = (
        insiders_module.monotonic() - RECENT_CACHE_GUARD_SECONDS - 1,
        cached[1],
    )
    cached_before_failure = service._ticker_cache[cache_key]
    should_timeout = True

    second = await service.canadian_ticker(
        "RY",
        "Royal Bank of Canada",
        days=30,
        force_refresh=True,
    )

    assert first == second
    assert service._ticker_cache[cache_key] == cached_before_failure
    attempt = service._finnhub_attempts[("RY", 30)]
    assert attempt.succeeded is False
    assert attempt.stale is True
    assert attempt.detail == "Délai d’attente Finnhub dépassé."


@pytest.mark.asyncio
async def test_finnhub_and_yahoo_duplicates_are_merged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    monkeypatch.setattr(
        insiders_module,
        "fetch_yahoo_sync",
        lambda ticker, company: [yahoo_trade()],
    )
    should_timeout = False

    def handler(request: httpx.Request) -> httpx.Response:
        if should_timeout:
            raise httpx.ReadTimeout("timeout", request=request)
        return httpx.Response(200, json={"data": [finnhub_row()]})

    service = InsiderService(
        finnhub_transport=httpx.MockTransport(handler)
    )
    await service.canadian_ticker(
        "RY",
        "Royal Bank of Canada",
        days=30,
        force_refresh=True,
    )
    cache_key = ("finnhub", "RY", 30)
    service._ticker_cache[cache_key] = (
        insiders_module.monotonic() - RECENT_CACHE_GUARD_SECONDS - 1,
        service._ticker_cache[cache_key][1],
    )
    should_timeout = True

    trades = await service.canadian_ticker(
        "RY",
        "Royal Bank of Canada",
        days=30,
        force_refresh=True,
    )

    assert len(trades) == 1
    assert trades[0].source_name == (
        "Finnhub — données d’initiés canadiennes"
    )


@pytest.mark.asyncio
async def test_missing_key_never_calls_finnhub(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "")
    monkeypatch.setattr(
        insiders_module,
        "fetch_yahoo_sync",
        lambda ticker, company: [],
    )
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise AssertionError("Finnhub must not be called without a key")

    service = InsiderService(
        finnhub_transport=httpx.MockTransport(handler)
    )
    await service.canadian_ticker(
        "RY",
        "Royal Bank of Canada",
        days=30,
        force_refresh=True,
    )

    assert calls == 0
    attempt = service._finnhub_attempts[("RY", 30)]
    assert attempt.detail == "FINNHUB_API_KEY non configurée."


@pytest.mark.asyncio
async def test_snapshot_never_requests_sedi_and_skips_yahoo_on_valid_finnhub(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    monkeypatch.setattr(
        insiders_module,
        "tsx60_directory",
        lambda: [("RY", "Royal Bank of Canada")],
    )
    yahoo_calls = 0

    def yahoo(ticker: str, company: str) -> list[InsiderTrade]:
        nonlocal yahoo_calls
        yahoo_calls += 1
        return []

    monkeypatch.setattr(insiders_module, "fetch_yahoo_sync", yahoo)
    urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        urls.append(str(request.url))
        assert request.headers["X-Finnhub-Token"] == "test-key"
        assert request.url.params["symbol"] == "RY.TO"
        return httpx.Response(200, json={"data": [finnhub_row()]})

    service = InsiderService(
        finnhub_transport=httpx.MockTransport(handler)
    )
    snapshot = await service.snapshot(
        market="canada",
        ticker="RY",
        days=30,
        scan_limit=1,
        result_limit=20,
        force_refresh=True,
    )

    assert snapshot.summary.transactions == 1
    assert len(urls) == 1
    assert urls[0].startswith(FINNHUB_URL)
    assert all("sedi.ca" not in url.lower() for url in urls)
    assert yahoo_calls == 0
    assert source(snapshot, "SEDI — vérification officielle").count == 0


@pytest.mark.asyncio
async def test_recent_finnhub_cache_prevents_preview_enrichment_repeat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"data": [finnhub_row()]})

    service = InsiderService(
        finnhub_transport=httpx.MockTransport(handler)
    )
    for _ in range(2):
        await service.canadian_ticker(
            "RY",
            "Royal Bank of Canada",
            days=30,
            force_refresh=True,
        )

    assert calls == 1


@pytest.mark.asyncio
async def test_canadian_scan_limits_concurrency_to_five(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = InsiderService()
    active = 0
    peak = 0

    async def tracked_ticker(
        ticker: str,
        company: str,
        *,
        days: int,
        force_refresh: bool,
    ) -> list[InsiderTrade]:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return []

    monkeypatch.setattr(service, "canadian_ticker", tracked_ticker)
    await service.snapshot(
        market="canada",
        ticker=None,
        days=30,
        scan_limit=8,
        result_limit=20,
        force_refresh=True,
    )

    assert peak == 5


@pytest.mark.asyncio
async def test_all_automated_failures_are_reported_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    monkeypatch.setattr(
        insiders_module,
        "tsx60_directory",
        lambda: [("RY", "Royal Bank of Canada")],
    )

    def yahoo_failure(ticker: str, company: str) -> list[InsiderTrade]:
        raise RuntimeError("Yahoo unavailable")

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    monkeypatch.setattr(
        insiders_module,
        "fetch_yahoo_sync",
        yahoo_failure,
    )
    service = InsiderService(
        finnhub_transport=httpx.MockTransport(timeout)
    )
    snapshot = await service.snapshot(
        market="canada",
        ticker="RY",
        days=30,
        scan_limit=1,
        result_limit=20,
        force_refresh=True,
    )

    assert snapshot.summary.transactions == 0
    assert snapshot.message == (
        "La couverture automatisée est indisponible. "
        "Consultez la source officielle de vérification."
    )
    assert source(snapshot, "Finnhub").status == "unavailable"
    assert source(snapshot, "Yahoo Finance").status == "unavailable"
