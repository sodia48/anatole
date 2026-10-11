"""Official fixed-income contracts, graceful gaps, and assistant routing."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.assistant_context import AssistantContext, UnifiedAssistantRequest
from app.schemas.fixed_income import FixedIncomeDataQuality, MunicipalDebtProfile
from app.services.anatole_assistant_orchestrator import AnatoleAssistantOrchestrator
from app.services.assistant_synthesis import validate_draft
from app.services.bank_of_canada import BankOfCanadaValetService, CURVE_SERIES, bank_of_canada_valet_service
from app.services.canada_360_assistant import canada_360_assistant_service
from app.services.canada_360_providers import provider_router
from app.services.municipal_debt_sources import MUNICIPALITIES, TORONTO_ISSUES_URL, municipal_debt_service, parse_toronto_issues
from app.services.portfolio_intelligence_v12 import scenario_request_from_question
from app.services.provincial_debt_sources import PROVINCES, parse_ontario_borrowing, provincial_profile
from app.core.resilience import shared_http_client

FIXTURES = Path(__file__).parent / "fixtures" / "debt_profiles"


@pytest.fixture(autouse=True)
def offline_debt_profiles(monkeypatch):
    from app.services import provincial_debt_sources as provincial, municipal_debt_sources as municipal
    files = {provincial.PROFILE_URLS[code]: code.lower() for code in provincial.PARSER_CODES}
    files.update({provincial.PROVINCES["NL"][2]: "nl-debt", municipal.MUNICIPALITIES["vancouver"][2]: "vancouver",
                  municipal.MUNICIPALITIES["quebec"][2]: "quebec-city", municipal.TORONTO_INVESTOR_URL: "toronto-profile"})
    async def html(url):
        text = (FIXTURES / f"{files[url]}.html").read_text(encoding="utf-8") if url in files else "<h1>Official issuer</h1>"
        if files.get(url) == "nb":
            text += (FIXTURES / "nb-issues.html").read_text(encoding="utf-8")
        return text
    async def toronto():
        return parse_toronto_issues(TORONTO_FIXTURE)
    monkeypatch.setattr(provincial, "official_html", html)
    monkeypatch.setattr(municipal, "official_html", html)
    monkeypatch.setattr(municipal_debt_service, "_toronto", toronto)


def official_payload(days_old: int = 1) -> dict:
    latest = (datetime.now(UTC) - timedelta(days=days_old)).date()
    previous = latest - timedelta(days=1)
    values = {"2Y": (3.20, 3.18), "3Y": (3.30, 3.28), "5Y": (3.50, 3.48),
              "7Y": (3.65, 3.62), "10Y": (3.90, 3.85), "Long": (4.25, 4.20),
              "Real Long": (1.9, 1.8), "1-3Y": (3.2, 3.1), "3-5Y": (3.5, 3.4),
              "5-10Y": (3.8, 3.7), ">10Y": (4.2, 4.1), "Policy": (2.25, 2.25)}
    return {"observations": [
        {"d": latest.isoformat(), **{CURVE_SERIES[key][0]: {"v": str(pair[0])} for key, pair in values.items()}},
        {"d": previous.isoformat(), **{CURVE_SERIES[key][0]: {"v": str(pair[1])} for key, pair in values.items()}},
    ]}


@pytest.mark.asyncio
async def test_official_curve_all_tenors_bps_shape_and_order(monkeypatch):
    async def get_json(*_args, **_kwargs):
        return official_payload()
    monkeypatch.setattr(shared_http_client, "get_json", get_json)
    service = BankOfCanadaValetService()
    service._curve_cache._entries.clear()
    curve = await service.curve()
    assert [point.tenor for point in curve.points] == ["2Y", "3Y", "5Y", "7Y", "10Y", "Long"]
    assert curve.points[0].latest == 3.20
    assert curve.points[0].bp_change == 2
    assert curve.spread_2s10s_bps == 70
    assert curve.curve_shape == "normal"
    assert curve.real_long_yield.latest == 1.9
    assert len(curve.marketable_averages) == 4
    assert curve.quality.status == "full"
    assert curve.signals == []


@pytest.mark.asyncio
async def test_missing_point_inversion_and_last_good_on_outage(monkeypatch):
    payload = official_payload(days_old=12)
    for row in payload["observations"]:
        row.pop(CURVE_SERIES["5Y"][0])
        row[CURVE_SERIES["10Y"][0]] = {"v": "2.8"}
    async def get_json(*_args, **_kwargs):
        return payload
    monkeypatch.setattr(shared_http_client, "get_json", get_json)
    service = BankOfCanadaValetService()
    service._curve_cache._entries.clear()
    first = await service.curve()
    assert first.curve_shape == "inverted"
    assert first.spread_2s5s_bps is None
    assert first.quality.freshness == "stale"
    service._curve_cache.store("latest", await service._load_curve(), age_seconds=901)
    async def failed():
        raise RuntimeError("Valet outage")
    monkeypatch.setattr(service, "_load_curve", failed)
    recovered = await service.curve()
    assert recovered.points[0].latest == first.points[0].latest


TORONTO_FIXTURE = """<table><tr><th>Settled Date</th><th>Coupon</th><th>Maturity Date</th><th>Currency</th><th>Issue Amount</th><th>CUSIP</th><th>Total Debenture Outstanding as of Settlement Date</th></tr>
<tr><td>April 17, 2026</td><td>4.5%</td><td>March 11, 2055 (reopening)</td><td>CAD</td><td>$450 million</td><td>891288EK4</td><td>$1.25 billion</td></tr>
<tr><td>March 11, 2026</td><td>3.5%</td><td>June 2, 2036 (reopening)</td><td>CAD</td><td>$350 million</td><td>891288DM1</td><td>$1.1 billion</td></tr></table>"""


def test_toronto_official_fixture_and_malformed_html():
    issues = parse_toronto_issues(TORONTO_FIXTURE)
    assert len(issues) == 2
    assert issues[0].coupon_percent == 4.5
    assert issues[0].maturity_date.isoformat() == "2055-03-11"
    assert issues[0].issue_amount == 450_000_000
    assert issues[0].outstanding_amount == 1_250_000_000
    assert issues[0].cusip == "891288EK4"
    assert issues[0].official_url == TORONTO_ISSUES_URL
    assert issues[0].yield_percent is None and issues[0].spread_to_canada_bps is None
    assert parse_toronto_issues("<table><tr><td>bad") == []


def test_ontario_borrowing_fixture_only_labeled_amount():
    html = "<h2>Ontario's 2026–27 Borrowing Program</h2><p>Total Long-Term Public Borrowing: $46.2B</p><p>$35.3B Total Borrowed</p>"
    assert parse_ontario_borrowing(html) == (46_200_000_000, "2026-27")
    assert parse_ontario_borrowing("<div>46.2 billion</div>") == (None, None)
    assert parse_ontario_borrowing("<div>") == (None, None)


@pytest.mark.parametrize("code", tuple(PROVINCES))
def test_each_province_has_an_official_source_without_claiming_parser_support(code):
    _, _, investor_url, borrowing_url = PROVINCES[code]
    assert investor_url or borrowing_url
    url = investor_url or borrowing_url
    assert urlparse(url).scheme == "https"
    assert urlparse(url).hostname in {
        "www.finances.gouv.qc.ca", "www.ofina.on.ca", "www2.gov.bc.ca",
        "www.alberta.ca", "www.saskatchewan.ca", "www.gov.mb.ca",
        "www.gnb.ca", "www.novascotia.ca", "www.princeedwardisland.ca",
        "investorrelations.gov.nl.ca", "yukon.ca", "www.fin.gov.nt.ca", "www.gov.nu.ca",
    }


@pytest.mark.parametrize("slug", tuple(MUNICIPALITIES))
@pytest.mark.asyncio
async def test_each_priority_city_has_verified_official_source_and_honest_coverage(slug):
    _, _, url = MUNICIPALITIES[slug]
    assert url and urlparse(url).scheme == "https"
    if slug not in {"toronto", "vancouver", "quebec"}:
        profile = await municipal_debt_service.profile(slug)
        assert profile.coverage == "limited"
        assert profile.recent_issues == []
        assert profile.debt_outstanding is None


def test_descriptive_rate_signals_have_source_and_timestamp(monkeypatch):
    from app.services.bank_of_canada import _curve_point, _curve_signals
    now = datetime.now(UTC)
    rows = {key: [(now - timedelta(days=1), previous), (now, latest)]
            for key, (latest, previous) in {"2Y": (3.2, 3.3), "10Y": (3.1, 3.4),
                                            "Policy": (2.5, 2.25)}.items()}
    points = {key: _curve_point(key, values, now) for key, values in rows.items()}
    monkeypatch.setenv("CANADA_10Y_MOVE_SIGNAL_BPS", "10")
    signals = _curve_signals(points)
    assert {row.kind for row in signals} >= {"ten_year_move", "curve_zero_cross", "policy_change"}
    assert all(row.source_url.startswith("https://www.bankofcanada.ca/") and row.observed_at for row in signals)


@pytest.mark.asyncio
async def test_province_registry_and_montreal_limited(monkeypatch):
    qc = await provincial_profile("QC")
    assert qc.coverage == "partial" and qc.borrowing_program_amount == 23_465_000_000
    assert qc.borrowing_program_url.startswith("https://www.finances.gouv.qc.ca/")
    assert qc.recent_issues == []
    montreal = await municipal_debt_service.profile("montreal")
    assert montreal.coverage == "limited" and montreal.recent_issues == []
    assert montreal.official_url == "https://montreal.ca/sujets/politiques-financieres"
    assert len([code for code in ("QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL", "YT", "NT", "NU")]) == 13


@pytest.mark.asyncio
async def test_fixed_income_http_routes_and_assistant(monkeypatch):
    async def curve():
        service = BankOfCanadaValetService()
        service._curve_cache._entries.clear()
        async def load():
            from app.services.bank_of_canada import _parse_curve_observations
            return _parse_curve_observations(official_payload(), tuple(CURVE_SERIES))
        service._load_curve = load
        return await service.curve()
    async def no_provider(**_kwargs):
        return None
    async def toronto(_slug):
        return MunicipalDebtProfile(slug="toronto", city="Toronto", province="ON", coverage="partial",
            recent_issues=parse_toronto_issues(TORONTO_FIXTURE),
            quality=FixedIncomeDataQuality(scope="municipal_issues", status="partial", source=TORONTO_ISSUES_URL,
                freshness="delayed", coverage="2 official issues"))
    monkeypatch.setattr(bank_of_canada_valet_service, "curve", curve)
    monkeypatch.setattr(municipal_debt_service, "profile", toronto)
    monkeypatch.setattr(provider_router, "generate_internal_evidence", no_provider)
    with TestClient(app) as client:
        federal = client.get("/api/v1/fixed-income/canada/curve")
        assert federal.status_code == 200 and federal.json()["curve_shape"] == "normal"
        assert client.get("/api/v1/fixed-income/provinces/ZZ").status_code == 404
        issues = client.get("/api/v1/fixed-income/issues?city=Toronto&maturity_year=2036")
        assert issues.status_code == 200 and len(issues.json()["issues"]) == 1
        assert issues.json()["issues"][0]["yield_percent"] is None
        federal_chat = client.post("/api/v1/assistant/chat", json={"message": "Quelle est la courbe des taux canadienne ?",
            "context": {"surface": "canada360", "route": "/canada", "language": "fr"}})
        assert federal_chat.status_code == 200
        assert federal_chat.json()["intent"] == "fixed_income"
        assert federal_chat.json()["actions"][0]["href"] == "/taux-obligations"
        toronto_chat = client.post("/api/v1/assistant/chat", json={"message": "Quelles sont les dernières émissions de Toronto ?",
            "context": {"surface": "canada360", "route": "/canada", "language": "fr"}})
        assert toronto_chat.status_code == 200
        assert "891288EK4" in toronto_chat.json()["answer"]
        assert toronto_chat.json()["evidence"][0]["sources"][0]["url"] == TORONTO_ISSUES_URL
    direct = await canada_360_assistant_service.answer(question="La courbe est-elle inversée ?", lang="fr", jurisdiction="CA")
    assert direct.intent == "fixed_income" and direct.links[0].agency == "Bank of Canada"


def test_portfolio_75bp_question_uses_existing_rate_factor():
    request = scenario_request_from_question("Quelle partie de mon portefeuille est sensible à une hausse de 75 pb du 10 ans canadien ?")
    assert request is not None and request.canada_10y_bps == 75


def test_synthesis_rejects_invented_cusip():
    payload = {"skill": "fixed_income", "facts": [{"id": "F1", "value": "891288EK4"}], "sources": [], "missing": []}
    draft = '{"answer_markdown":"CUSIP ABCDEFGHI", "used_fact_ids":["F1"]}'
    with pytest.raises(ValueError, match="unsupported_cusip"):
        validate_draft(draft, payload)


@pytest.mark.parametrize("code,amount,observed", [
    ("QC", 23_465_000_000, "2026-06-29"), ("ON", 46_200_000_000, None),
    ("AB", 6_882_000_000, None), ("SK", 5_335_500_000, None),
    ("NB", 3_744_000_000, "2026-09-28"), ("NL", 3_900_000_000, "2026-10-01"),
])
@pytest.mark.asyncio
async def test_official_provincial_plans_and_honest_dates(code, amount, observed):
    profile = await provincial_profile(code)
    assert profile.coverage == profile.quality.status == "partial"
    assert profile.borrowing_program_amount == amount
    assert profile.fiscal_year == "2026-27"
    evidence = profile.field_sources["borrowing_program_amount"]
    assert evidence.official_url in profile.source_urls
    assert (evidence.observed_at.date().isoformat() if evidence.observed_at else None) == observed
    assert profile.quality.freshness == ("delayed" if observed else "unavailable")
    assert profile.average_term is None  # Historical/new-borrowing terms are not current debt maturity.
    if code == "NB":
        assert len(profile.recent_issues) == 4


@pytest.mark.asyncio
async def test_newfoundland_explicit_issue_yield_and_debt():
    profile = await provincial_profile("NL")
    row, = profile.recent_issues
    assert row.issue_date.isoformat() == "2026-09-28"
    assert row.maturity_date.isoformat() == "2032-06-02"
    assert row.coupon_percent == 3.25 and row.yield_percent == 3.862
    assert row.issue_amount == 600_000_000 and row.currency == "CAD"
    assert row.yield_source == row.official_url
    assert row.spread_to_canada_bps is None
    assert profile.debt_outstanding == 25_318_000_000
    assert profile.field_sources["debt_outstanding"].observed_at.date().isoformat() == "2026-10-01"


@pytest.mark.asyncio
async def test_municipal_enrichment_keeps_independent_program_and_issue_dates():
    toronto = await municipal_debt_service.profile("toronto")
    assert len(toronto.recent_issues) == 2
    assert toronto.bond_programs == ["Green Debenture Program", "Social Debenture Program", "Sustainable Debenture Program"]
    vancouver = await municipal_debt_service.profile("vancouver")
    assert vancouver.coverage == "partial"
    assert vancouver.bond_programs == ["Green Bond Program", "General Debenture Program"]
    assert vancouver.field_sources["bond_programs"].observed_at is None
    assert vancouver.recent_issues[0].settlement_date.isoformat() == "2018-09-21"
    assert vancouver.recent_issues[0].currency is None  # '$' alone is ambiguous.
    assert vancouver.recent_issues[0].yield_percent is None
    quebec = await municipal_debt_service.profile("quebec")
    assert quebec.borrowing_program_amount == 251_000_000  # Not the approximate 280M multi-year volume.
    assert quebec.fiscal_year == "2026"
    assert quebec.coverage == "partial" and quebec.quality.observed_at is None
    assert quebec.quality.freshness == "unavailable"


@pytest.mark.parametrize("html", ["", "<div>", "<table><tr><td>bad", "9" * 1_000_001,
                                  "<script>Total borrowing requirements forecast as per 2026-27 Budget is $500 million</script>"],
                         ids=["empty", "unclosed", "malformed-table", "oversized", "script-only"])
def test_all_profile_parsers_fail_closed(html):
    from app.services import provincial_debt_sources as p, municipal_debt_sources as m
    for parser in (p.parse_quebec_borrowing, p.parse_alberta_borrowing, p.parse_saskatchewan_borrowing,
                   p.parse_new_brunswick_borrowing, p.parse_newfoundland_borrowing, p.parse_newfoundland_debt):
        assert parser(html) is None
    assert p.parse_ontario_borrowing(html) == (None, None)
    assert p.parse_newfoundland_issue(html) == []
    assert p.parse_new_brunswick_issues(html) == []
    assert m.parse_toronto_issues(html) == []
    assert m.parse_vancouver_issue(html) == []
    assert m.parse_vancouver_programs(html) == []
    assert m.parse_quebec_city_financing(html) == (None, None)


def test_invalid_numbers_and_dates_do_not_escape_parser():
    from app.services.provincial_debt_sources import parse_newfoundland_issue, parse_new_brunswick_borrowing
    assert parse_toronto_issues(TORONTO_FIXTURE.replace("$450 million", "$1,2.3.4 million"))[0].cusip == "891288DM1"
    assert parse_toronto_issues(TORONTO_FIXTURE.replace("4.5%", "nan%").replace("3.5%", "inf%")) == []
    html = (FIXTURES / "nl.html").read_text(encoding="utf-8")
    assert parse_newfoundland_issue(html.replace("September 28, 2026", "September 99, 2026")) == []
    assert parse_newfoundland_issue(html.replace("Yield: 3.862%", "Yield: unavailable")) == []
    html = (FIXTURES / "nb.html").read_text(encoding="utf-8")
    assert parse_new_brunswick_borrowing(html.replace("3,744", "3,7,44")) is None


@pytest.mark.asyncio
async def test_accessibility_and_parser_coverage_are_distinct(monkeypatch):
    from app.services import provincial_debt_sources as p, municipal_debt_sources as m
    async def offline(_url):
        return None
    monkeypatch.setattr(p, "official_html", offline)
    monkeypatch.setattr(m, "official_html", offline)
    for profile in [await p.provincial_profile("QC"), await m.municipal_debt_service.profile("vancouver")]:
        assert profile.coverage == profile.quality.status == "unavailable"
        assert profile.borrowing_program_amount is None and profile.recent_issues == []
    async def changed(_url):
        return "<h1>Official investor relations: redesigned page</h1>"
    monkeypatch.setattr(p, "official_html", changed)
    assert (await p.provincial_profile("QC")).quality.status == "limited"


def test_new_brunswick_issues_reject_invalid_source_date_without_guessing():
    from app.services.provincial_debt_sources import parse_new_brunswick_issues
    rows = parse_new_brunswick_issues((FIXTURES / "nb-issues.html").read_text(encoding="utf-8"))
    assert len(rows) == 4
    assert rows[0].settlement_date.isoformat() == "2026-09-18"
    assert rows[0].coupon_percent == 4.55
    assert rows[0].issue_amount == 400_000_000 and rows[0].currency == "CAD"
    assert all(row.yield_percent is None and row.spread_to_canada_bps is None for row in rows)


def test_enriched_profile_http_contracts():
    with TestClient(app) as client:
        provinces = client.get("/api/v1/fixed-income/provinces")
        assert provinces.status_code == 200
        rows = provinces.json()
        assert len(rows) == 13
        assert {row["code"] for row in rows if row["quality"]["status"] == "partial"} == {"QC", "ON", "AB", "SK", "NB", "NL"}
        municipalities = client.get("/api/v1/fixed-income/municipalities")
        assert municipalities.status_code == 200
        assert {row["slug"] for row in municipalities.json() if row["quality"]["status"] == "partial"} == {"toronto", "vancouver", "quebec"}


@pytest.mark.parametrize("status,body,expected", [
    (200, "<h1>Official issuer</h1>", "<h1>Official issuer</h1>"),
    (403, "Access denied", None),
    (200, "<title>Radware Page</title>Verifying your browser before proceeding...", None),
    (200, "x" * 1_000_001, ""),
], ids=["accessible", "forbidden", "browser-challenge", "oversized-source-only"])
@pytest.mark.asyncio
async def test_source_fetch_distinguishes_unavailable_from_unparsed(monkeypatch, status, body, expected):
    import httpx
    from app.services import debt_profile_parsing as parsing
    parsing._pages._entries.clear()
    async def request(_method, url, **_kwargs):
        return httpx.Response(status, text=body, request=httpx.Request("GET", url))
    monkeypatch.setattr(shared_http_client, "request", request)
    assert await parsing.official_html("https://www.ofina.on.ca/borrowing_debt/borrowing.htm") == expected
    parsing._pages._entries.clear()
