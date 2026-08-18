from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.institutions import (
    InstitutionDetail,
    InstitutionFlow,
    InstitutionHolding,
    InstitutionSourceStatus,
    InstitutionSummary,
    InstitutionsSnapshot,
)
from app.services import institutions as institutions_module
from app.services.institutions import (
    CacheEntry,
    InstitutionService,
    InstitutionsUnavailable,
    MissingInformationTable,
    compare_holdings,
    find_latest_13f,
    find_previous_13f,
    parse_13f_information_table,
)


@pytest.fixture(autouse=True)
def no_sec_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        institutions_module,
        "SEC_REQUEST_INTERVAL_SECONDS",
        0,
    )


def information_xml(rows: list[dict[str, Any]]) -> str:
    body = "".join(
        f"""
        <infoTable>
          <nameOfIssuer>{row.get('issuer', 'Example Inc.')}</nameOfIssuer>
          <titleOfClass>{row.get('security_class', 'COM')}</titleOfClass>
          <cusip>{row['cusip']}</cusip>
          <value>{row.get('value', 1000)}</value>
          <shrsOrPrnAmt>
            <sshPrnamt>{row.get('shares', 100)}</sshPrnamt>
            <sshPrnamtType>{row.get('amount_type', 'SH')}</sshPrnamtType>
          </shrsOrPrnAmt>
          {f"<putCall>{row['put_call']}</putCall>" if row.get('put_call') else ''}
          <investmentDiscretion>SOLE</investmentDiscretion>
          <votingAuthority><Sole>0</Sole><Shared>0</Shared><None>0</None></votingAuthority>
        </infoTable>
        """
        for row in rows
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">'
        f"{body}</informationTable>"
    )


def holding(
    cusip: str,
    *,
    shares: float,
    value: float,
    ticker: str | None = None,
    issuer: str = "Example Inc.",
    put_call: str | None = None,
) -> InstitutionHolding:
    return InstitutionHolding(
        cusip=cusip,
        ticker=ticker,
        issuer=issuer,
        security_class="COM",
        shares=shares,
        previous_shares=0,
        share_change=0,
        share_change_percent=None,
        value=value,
        portfolio_weight_percent=0,
        previous_value=0,
        put_call=put_call,
        status="unchanged",
    )


def summary(
    cik: str,
    *,
    name: str = "Example Manager",
    value: float = 1000,
) -> InstitutionSummary:
    return InstitutionSummary(
        cik=cik.zfill(10),
        name=name,
        country="États-Unis",
        report_period=date(2026, 3, 31),
        filed_at=date(2026, 5, 15),
        filing_url="https://www.sec.gov/example",
        total_13f_value=value,
        holdings_count=1,
        previous_total_13f_value=900,
        top10_concentration_percent=100,
        new_positions_count=0,
        increased_positions_count=1,
        reduced_positions_count=0,
        closed_positions_count=0,
    )


def detail_for(
    institution: InstitutionSummary,
    holdings: list[InstitutionHolding],
) -> InstitutionDetail:
    return InstitutionDetail(
        institution=institution,
        holdings=holdings,
        previous_report_period=date(2025, 12, 31),
        source_statuses=[InstitutionSourceStatus(
            source="SEC EDGAR — Form 13F-HR",
            status="available",
            detail="Official",
            url=institution.filing_url,
        )],
        generated_at=datetime.now(UTC),
    )


def write_universe(path: Path, institutions: list[InstitutionSummary]) -> None:
    payload = {
        "generated_at": "2026-06-01T00:00:00+00:00",
        "source_url": "https://www.sec.gov/official.zip",
        "report_period": "2026-03-31",
        "previous_report_period": "2025-12-31",
        "institutions": [item.model_dump(mode="json") for item in institutions],
        "top_increased": [],
        "top_new": [],
        "top_reduced": [],
        "top_closed": [],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def submissions_payload() -> dict[str, Any]:
    return {
        "cik": "1",
        "name": "Official Manager LLC",
        "addresses": {
            "business": {
                "stateOrCountry": "NY",
                "stateOrCountryDescription": "NEW YORK",
            }
        },
        "filings": {
            "recent": {
                "form": ["13F-HR", "13F-HR", "10-K"],
                "accessionNumber": [
                    "0000000001-26-000002",
                    "0000000001-26-000001",
                    "0000000001-26-000000",
                ],
                "filingDate": ["2026-05-15", "2026-02-14", "2026-01-01"],
                "reportDate": ["2026-03-31", "2025-12-31", "2025-12-31"],
                "primaryDocument": ["primary.xml", "primary.xml", "report.htm"],
            }
        },
    }


def test_parse_current_13f_xml_and_put_call() -> None:
    parsed = parse_13f_information_table(
        information_xml([{
            "cusip": "037833100",
            "issuer": "APPLE INC",
            "shares": 250,
            "value": 55_000,
            "put_call": "CALL",
        }])
    )

    assert len(parsed) == 1
    assert parsed[0].cusip == "037833100"
    assert parsed[0].shares == 250
    assert parsed[0].value == 55_000
    assert parsed[0].put_call == "CALL"
    assert parsed[0].ticker is None


def test_parse_legacy_13f_value_in_thousands() -> None:
    parsed = parse_13f_information_table(
        information_xml([{
            "cusip": "594918104",
            "value": 125,
        }]),
        value_multiplier=1000,
    )

    assert parsed[0].value == 125_000


def test_parse_invalid_or_missing_information_table() -> None:
    with pytest.raises(ValueError, match="Invalid"):
        parse_13f_information_table("<broken")
    with pytest.raises(MissingInformationTable, match="Missing"):
        parse_13f_information_table("<document><value>10</value></document>")


def test_latest_and_previous_support_13f_amendments() -> None:
    payload = submissions_payload()
    payload["filings"]["recent"]["form"][0] = "13F-HR/A"

    latest = find_latest_13f(payload)
    previous = find_previous_13f(payload)

    assert latest is not None
    assert latest.form == "13F-HR/A"
    assert latest.report_period == date(2026, 3, 31)
    assert previous is not None
    assert previous.report_period == date(2025, 12, 31)


def test_compare_holdings_covers_every_status() -> None:
    current = [
        holding("000000001", shares=100, value=1000),
        holding("000000002", shares=150, value=1500),
        holding("000000003", shares=50, value=500),
        holding("000000004", shares=80, value=800),
    ]
    previous = [
        holding("000000001", shares=100, value=900),
        holding("000000002", shares=100, value=1000),
        holding("000000003", shares=90, value=900),
        holding("000000005", shares=20, value=200),
    ]

    compared = compare_holdings(current, previous)
    by_cusip = {item.cusip: item for item in compared}

    assert by_cusip["000000001"].status == "unchanged"
    assert by_cusip["000000002"].status == "increased"
    assert by_cusip["000000002"].share_change_percent == 50
    assert by_cusip["000000003"].status == "reduced"
    assert by_cusip["000000004"].status == "new"
    assert by_cusip["000000005"].status == "closed"


@pytest.mark.asyncio
async def test_snapshot_sorts_and_limits_top_50(tmp_path: Path) -> None:
    universe = tmp_path / "universe.json"
    institutions = [
        summary(str(index + 1), value=float(index + 1))
        for index in range(55)
    ]
    write_universe(universe, institutions)
    service = InstitutionService(universe_path=universe)

    snapshot = await service.institutions_snapshot(limit=50)

    assert len(snapshot.institutions) == 50
    assert snapshot.institutions[0].total_13f_value == 55
    assert snapshot.institutions[-1].total_13f_value == 6
    assert snapshot.sources[0].status == "available"


@pytest.mark.asyncio
async def test_force_refresh_revalidates_official_candidate_universe(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    universe = tmp_path / "universe.json"
    institutions = [
        summary(str(index + 1), value=float(index + 1))
        for index in range(6)
    ]
    write_universe(universe, institutions)
    service = InstitutionService(universe_path=universe)

    async def fake_live_summary(
        cik: str,
        *,
        force_refresh: bool,
    ) -> tuple[InstitutionSummary, list[InstitutionHolding], bool]:
        assert force_refresh is True
        value = float(100 - int(cik))
        live_summary = summary(
            cik,
            name=f"Official Manager {cik}",
            value=value,
        )
        live_holding = holding(
            f"{int(cik):09d}",
            shares=value,
            value=value,
        ).model_copy(update={
            "previous_shares": value - 1,
            "share_change": 1,
            "status": "increased",
        })
        return live_summary, [live_holding], False

    monkeypatch.setattr(service, "_live_summary", fake_live_summary)

    snapshot = await service.institutions_snapshot(
        limit=3,
        force_refresh=True,
    )

    assert [item.cik for item in snapshot.institutions] == [
        "0000000001",
        "0000000002",
        "0000000003",
    ]
    assert snapshot.top_increased[0].institutions_increased == 1
    assert snapshot.sources[0].status == "available"


@pytest.mark.asyncio
async def test_institution_detail_uses_two_official_filings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "")
    current_xml = information_xml([
        {"cusip": "037833100", "issuer": "APPLE INC", "shares": 150, "value": 3000},
        {"cusip": "594918104", "issuer": "MICROSOFT CORP", "shares": 50, "value": 2000},
    ])
    previous_xml = information_xml([
        {"cusip": "037833100", "issuer": "APPLE INC", "shares": 100, "value": 1800},
        {"cusip": "02079K305", "issuer": "ALPHABET INC", "shares": 20, "value": 500},
    ])
    requested_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        requested_urls.append(url)
        if "submissions" in url:
            return httpx.Response(200, json=submissions_payload())
        if url.endswith("/index.json"):
            name = "current_info.xml" if "000000000126000002" in url else "previous_info.xml"
            return httpx.Response(200, json={
                "directory": {"item": [{"name": name}]}
            })
        if url.endswith("current_info.xml"):
            return httpx.Response(200, text=current_xml)
        if url.endswith("previous_info.xml"):
            return httpx.Response(200, text=previous_xml)
        return httpx.Response(404)

    service = InstitutionService(
        sec_transport=httpx.MockTransport(handler)
    )
    detail = await service.institution_detail("1")

    assert detail.institution.name == "Official Manager LLC"
    assert detail.institution.country == "États-Unis"
    assert detail.institution.total_13f_value == 5000
    assert detail.institution.previous_total_13f_value == 2300
    assert detail.institution.holdings_count == 2
    assert detail.institution.increased_positions_count == 1
    assert detail.institution.new_positions_count == 1
    assert detail.institution.closed_positions_count == 1
    assert detail.source_statuses[0].status == "available"
    assert all("sec.gov" in url for url in requested_urls)


@pytest.mark.asyncio
async def test_timeout_keeps_last_good_detail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "")
    failing = False
    xml = information_xml([{
        "cusip": "037833100",
        "issuer": "APPLE INC",
        "shares": 100,
        "value": 1000,
    }])

    def handler(request: httpx.Request) -> httpx.Response:
        if failing:
            raise httpx.ReadTimeout("timeout", request=request)
        url = str(request.url)
        if "submissions" in url:
            return httpx.Response(200, json=submissions_payload())
        if url.endswith("index.json"):
            return httpx.Response(200, json={
                "directory": {"item": [{"name": "info.xml"}]}
            })
        return httpx.Response(200, text=xml)

    service = InstitutionService(
        sec_transport=httpx.MockTransport(handler)
    )
    first = await service.institution_detail("1")
    failing = True
    stale = await service.institution_detail("1", force_refresh=True)

    assert first.institution.total_13f_value == stale.institution.total_13f_value
    assert stale.stale is True
    assert stale.source_statuses[0].status == "stale"


@pytest.mark.asyncio
async def test_sec_429_is_not_retried() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429)

    service = InstitutionService(
        sec_transport=httpx.MockTransport(handler)
    )
    with pytest.raises(InstitutionsUnavailable):
        await service.institution_detail("1")

    assert calls == 1


@pytest.mark.asyncio
async def test_missing_finnhub_key_never_invents_or_requests_ticker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "")
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"result": [{"symbol": "FAKE"}]})

    service = InstitutionService(
        finnhub_transport=httpx.MockTransport(handler)
    )

    assert await service.resolve_ticker("037833100") is None
    assert calls == 0


@pytest.mark.asyncio
async def test_verified_ticker_resolution_is_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "finnhub_api_key", "test-key")
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.url.params["q"] == "037833100"
        return httpx.Response(200, json={
            "result": [{"symbol": "AAPL", "description": "APPLE INC"}]
        })

    service = InstitutionService(
        finnhub_transport=httpx.MockTransport(handler)
    )

    assert await service.resolve_ticker("037833100") == "AAPL"
    assert await service.resolve_ticker("037833100") == "AAPL"
    assert calls == 1


@pytest.mark.asyncio
async def test_security_activity_aggregates_cached_details(
    tmp_path: Path,
) -> None:
    first_summary = summary("1", name="First Manager", value=2000)
    second_summary = summary("2", name="Second Manager", value=1000)
    universe = tmp_path / "universe.json"
    write_universe(universe, [first_summary, second_summary])
    service = InstitutionService(universe_path=universe)
    first_holding = holding(
        "037833100",
        shares=150,
        value=1500,
        ticker="AAPL",
        issuer="APPLE INC",
    ).model_copy(update={
        "previous_shares": 100,
        "share_change": 50,
        "status": "increased",
    })
    second_holding = holding(
        "037833100",
        shares=25,
        value=250,
        ticker="AAPL",
        issuer="APPLE INC",
    ).model_copy(update={
        "previous_shares": 0,
        "share_change": 25,
        "status": "new",
    })
    service._detail_cache[first_summary.cik] = CacheEntry(
        detail_for(first_summary, [first_holding]),
        institutions_module.monotonic(),
    )
    service._detail_cache[second_summary.cik] = CacheEntry(
        detail_for(second_summary, [second_holding]),
        institutions_module.monotonic(),
    )

    activity = await service.ticker_institution_activity("AAPL")

    assert activity.ticker == "AAPL"
    assert activity.institutions_holding == 2
    assert activity.institutions_increased == 1
    assert activity.institutions_new == 1
    assert activity.aggregate_share_change == 75
    assert activity.institution_names == ["First Manager", "Second Manager"]


def test_institution_routes_and_static_path_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sample_summary = summary("1")
    sample_snapshot = InstitutionsSnapshot(
        institutions=[sample_summary],
        report_period=date(2026, 3, 31),
        previous_report_period=date(2025, 12, 31),
        generated_at=datetime.now(UTC),
    )
    sample_detail = detail_for(sample_summary, [])
    sample_activity = InstitutionFlow(
        ticker="AAPL",
        cusip="037833100",
        issuer="APPLE INC",
        institutions_holding=1,
        institutions_increased=1,
        institutions_reduced=0,
        institutions_new=0,
        institutions_closed=0,
        aggregate_share_change=10,
        current_reported_value=1000,
        institution_names=["Example Manager"],
    )

    async def fake_snapshot(**kwargs: Any) -> InstitutionsSnapshot:
        return sample_snapshot

    async def fake_detail(*args: Any, **kwargs: Any) -> InstitutionDetail:
        return sample_detail

    async def fake_activity(query: str) -> InstitutionFlow:
        assert query == "AAPL"
        return sample_activity

    monkeypatch.setattr(
        institutions_module.institution_service,
        "institutions_snapshot",
        fake_snapshot,
    )
    monkeypatch.setattr(
        institutions_module.institution_service,
        "institution_detail",
        fake_detail,
    )
    monkeypatch.setattr(
        institutions_module.institution_service,
        "ticker_institution_activity",
        fake_activity,
    )
    client = TestClient(app)

    assert client.get("/api/v1/discovery/institutions").status_code == 200
    activity_response = client.get(
        "/api/v1/discovery/institutions/security/activity?q=AAPL"
    )
    assert activity_response.status_code == 200
    assert activity_response.json()["ticker"] == "AAPL"
    assert client.get("/api/v1/discovery/institutions/1").status_code == 200
