from __future__ import annotations

from datetime import UTC, date, datetime
import gzip
import json
import os
from pathlib import Path
import subprocess
import sys

import httpx
import pytest
from sqlalchemy import create_engine
from fastapi.testclient import TestClient

from app.schemas.institutions import (
    InstitutionDetail, InstitutionHolding, InstitutionSourceStatus,
    InstitutionSummary, InstitutionsSnapshot,
)
from app.services.institution_store import InstitutionStore
from app.services.institution_collector import discover_recent_13f
from app.services.institutions import InstitutionService
from app.api.routes import institutions as routes
from app.main import app


def test_migration_up_preserves_existing_account_rows(tmp_path: Path) -> None:
    database = tmp_path / "accounts.db"
    database_url = f"sqlite:///{database.as_posix()}"
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE account_users (id TEXT PRIMARY KEY, password_hash TEXT NOT NULL)"
        )
        connection.exec_driver_sql(
            "INSERT INTO account_users (id, password_hash) VALUES (?, ?)",
            ("account-sentinel", "unchanged-hash"),
        )
    with engine.connect() as connection:
        before_schema = list(connection.exec_driver_sql("PRAGMA table_info(account_users)"))
    root = Path(__file__).resolve().parents[3]
    environment = os.environ.copy()
    environment["ACCOUNT_DATABASE_URL"] = database_url
    environment.pop("DATABASE_URL", None)
    for _ in range(2):
        subprocess.run(
            [sys.executable, str(root / "scripts" / "migrate_institutions.py"), "up"],
            cwd=root, env=environment, check=True, capture_output=True, text=True,
            timeout=30,
        )
    with engine.connect() as connection:
        after_schema = list(connection.exec_driver_sql("PRAGMA table_info(account_users)"))
        rows = list(connection.exec_driver_sql("SELECT id, password_hash FROM account_users"))
        institution_tables = {
            row[0] for row in connection.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'institution_%'"
            )
        }
    assert before_schema == after_schema
    assert rows == [("account-sentinel", "unchanged-hash")]
    assert institution_tables == set(InstitutionStore(engine).metadata.tables)


def fixture_data() -> tuple[InstitutionsSnapshot, list[InstitutionDetail]]:
    period = date(2026, 6, 30)
    summaries = [
        InstitutionSummary(
            cik=str(index).zfill(10), name=f"Manager {index}", country="États-Unis",
            report_period=period, filed_at=date(2026, 8, 10),
            filing_url=f"https://www.sec.gov/Archives/{index}",
            total_13f_value=1000 * index, holdings_count=1,
            previous_total_13f_value=500 * index,
            top10_concentration_percent=100, new_positions_count=0,
            increased_positions_count=1, reduced_positions_count=0,
            closed_positions_count=0,
        ) for index in (1, 2)
    ]
    details = [
        InstitutionDetail(
            institution=summary,
            holdings=[InstitutionHolding(
                cusip="67066G104", ticker="NVDA", issuer="NVIDIA CORP",
                security_class="COM", shares=100 * index,
                previous_shares=50 * index, share_change=50 * index,
                share_change_percent=100, value=1000 * index,
                portfolio_weight_percent=100, previous_value=500 * index,
                status="increased",
            )],
            previous_report_period=date(2026, 3, 31),
            source_statuses=[InstitutionSourceStatus(
                source="SEC", status="available", detail="official",
                url=summary.filing_url,
            )],
            generated_at=datetime.now(UTC),
        ) for index, summary in enumerate(summaries, start=1)
    ]
    snapshot = InstitutionsSnapshot(
        institutions=summaries, report_period=period,
        previous_report_period=date(2026, 3, 31),
        generated_at=datetime.now(UTC), period_status="published_dataset",
    )
    return snapshot, details


def seed_nvda(store: InstitutionStore, tmp_path: Path) -> None:
    symbols = tmp_path / "symbols.json"
    symbols.write_text(json.dumps([{
        "cusip": "67066G104", "ticker": "NVDA",
        "source_url": "https://www.sec.gov/Archives/example.xml",
        "verified_at": "2026-11-09T00:00:00+00:00",
    }]), encoding="utf-8")
    store.seed_symbols(symbols)


def test_store_persists_across_instances_and_indexes_search(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'institutions.db'}")
    store = InstitutionStore(engine)
    snapshot, details = fixture_data()
    store.publish(snapshot, details)
    restarted = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))

    assert restarted.latest_snapshot().report_period == date(2026, 6, 30)
    assert restarted.detail("0000000001").holdings[0].cusip == "67066G104"
    by_ticker = restarted.activity("NVDA", date(2026, 6, 30))
    by_cusip = restarted.activity("67066G104", date(2026, 6, 30))
    assert by_ticker == by_cusip
    assert by_ticker.institutions_holding == 2
    assert by_ticker.institutions_increased == 2
    assert by_ticker.aggregate_share_change == 150
    page, total = restarted.holdings_page("NVDA", date(2026, 6, 30), limit=1, offset=0)
    assert total == 2
    assert len(page) == 1
    assert page[0]["cik"] == "0000000002"


def test_store_rejects_mixed_period_without_replacing_last_good(tmp_path: Path) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    snapshot, details = fixture_data()
    store.publish(snapshot, details)
    mixed = snapshot.model_copy(update={
        "institutions": [
            snapshot.institutions[0],
            snapshot.institutions[1].model_copy(update={"report_period": date(2026, 3, 31)}),
        ]
    })
    with pytest.raises(ValueError, match="Mixed"):
        store.publish(mixed, details)
    assert store.latest_snapshot().institutions == snapshot.institutions


def test_store_rejects_incomplete_manager_detail_coverage(tmp_path: Path) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    snapshot, details = fixture_data()
    with pytest.raises(ValueError, match="Incomplete"):
        store.publish(snapshot, details[:1])
    store.create_schema()
    assert store.latest_snapshot() is None


@pytest.mark.asyncio
async def test_reads_never_call_sec_even_when_refresh_requested(tmp_path: Path) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    snapshot, details = fixture_data()
    store.publish(snapshot, details)
    seed_nvda(store, tmp_path)
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise AssertionError(f"SEC request from read route: {request.url}")

    service = InstitutionService(
        store=store, sec_transport=httpx.MockTransport(handler),
        universe_path=tmp_path / "does-not-exist.json",
    )
    assert (await service.institutions_snapshot(force_refresh=True)).report_period == date(2026, 6, 30)
    assert (await service.institution_detail("1", force_refresh=True)).institution.cik == "0000000001"
    assert (await service.ticker_institution_activity("NVDA")).institutions_holding == 2
    with pytest.raises(ValueError, match="non vérifié"):
        await service.ticker_institution_activity("RY")
    assert calls == 0


def test_run_lease_excludes_concurrent_collectors(tmp_path: Path) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    assert store.start_run("first", "https://www.sec.gov/first.zip")
    assert not store.start_run("second", "https://www.sec.gov/second.zip")
    store.finish_run("first", period=date(2026, 6, 30), institutions_count=2)
    assert store.start_run("second", "https://www.sec.gov/second.zip")


def test_streamed_bootstrap_preserves_newer_period_and_verifies_symbols(tmp_path: Path) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    snapshot, details = fixture_data()
    bundle = tmp_path / "bundle.json.gz"
    with gzip.open(bundle, "wt", encoding="utf-8") as output:
        for row in [
            {"kind": "snapshot", "payload": snapshot.model_dump(mode="json")},
            *({"kind": "detail", "payload": detail.model_dump(mode="json"), "amount_types": []} for detail in details),
        ]:
            output.write(json.dumps(row) + "\n")
    seed_nvda(store, tmp_path)
    assert store.bootstrap_bundle(bundle)
    assert not store.bootstrap_bundle(bundle)
    assert store.activity("NVDA", snapshot.report_period).institutions_holding == 2


def test_incomplete_bootstrap_never_exposes_staged_details(tmp_path: Path) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    snapshot, details = fixture_data()
    bundle = tmp_path / "incomplete.json.gz"
    with gzip.open(bundle, "wt", encoding="utf-8") as output:
        output.write(json.dumps({"kind": "snapshot", "payload": snapshot.model_dump(mode="json")}) + "\n")
        output.write(json.dumps({
            "kind": "detail", "payload": details[0].model_dump(mode="json"),
            "amount_types": [],
        }) + "\n")
    with pytest.raises(ValueError, match="Incomplete"):
        store.bootstrap_bundle(bundle)
    assert store.latest_snapshot() is None
    assert store.detail("0000000001") is None


def test_http_index_search_is_paginated_without_sec(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    snapshot, details = fixture_data()
    store.publish(snapshot, details)
    seed_nvda(store, tmp_path)
    service = InstitutionService(store=store, universe_path=tmp_path / "missing.json")
    monkeypatch.setattr(routes, "institution_service", service)
    response = TestClient(app).get(
        "/api/v1/discovery/institutions/security/holdings?q=NVDA&limit=1&offset=1"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["results"]) == 1
    assert body["results"][0]["cik"] == "0000000001"


def test_history_uses_only_published_periods_and_survives_restart(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "history.db"
    store = InstitutionStore(create_engine(f"sqlite:///{db}"))
    q2, q2_details = fixture_data()
    q1_date = date(2026, 3, 31)
    q1_summaries = [item.model_copy(update={
        "report_period": q1_date, "filed_at": date(2026, 5, 12),
        "total_13f_value": item.total_13f_value / 2,
        "holdings_count": 1, "new_positions_count": 1,
        "increased_positions_count": 0, "comparison_available": False,
    }) for item in q2.institutions]
    q1 = q2.model_copy(update={
        "report_period": q1_date, "previous_report_period": None,
        "institutions": q1_summaries,
    })
    q1_details = [detail.model_copy(update={
        "institution": summary, "previous_report_period": None,
        "holdings": [detail.holdings[0].model_copy(update={
            "shares": detail.holdings[0].shares / 2,
            "value": detail.holdings[0].value / 2,
            "status": "new",
        })],
    }) for detail, summary in zip(q2_details, q1_summaries, strict=True)]
    store.publish(q1, q1_details)
    store.publish(q2, q2_details)
    seed_nvda(store, tmp_path)
    restarted = InstitutionStore(create_engine(f"sqlite:///{db}"))
    assert restarted.published_periods() == [date(2026, 6, 30), q1_date]
    history = restarted.manager_history("0000000001")
    assert [point.report_period for point in history.periods] == [q1_date, date(2026, 6, 30)]
    assert [point.total_13f_value for point in history.periods] == [500, 1000]
    position = restarted.position_history("NVDA")
    assert [point.report_period for point in position.periods] == [q1_date, date(2026, 6, 30)]
    assert [point.managers_holding for point in position.periods] == [2, 2]
    assert [point.value for point in position.periods] == [1500, 3000]
    assert position.periods[0].filing_urls[0].startswith("https://www.sec.gov/")
    assert restarted.quality()["consistency_ok"] is True

    service = InstitutionService(store=restarted, universe_path=tmp_path / "missing.json")
    monkeypatch.setattr(routes, "institution_service", service)
    client = TestClient(app)
    assert client.get("/api/v1/discovery/institutions/periods").json() == ["2026-06-30", "2026-03-31"]
    assert len(client.get("/api/v1/discovery/institutions/history/1").json()["periods"]) == 2
    assert len(client.get("/api/v1/discovery/institutions/security/history?q=NVDA").json()["periods"]) == 2
    assert client.get("/api/v1/discovery/institutions?period=2026-03-31").json()["institutions"][0]["total_13f_value"] == 500
    assert client.get("/api/v1/discovery/institutions/1?period=2026-03-31").json()["institution"]["total_13f_value"] == 500
    assert client.get("/api/v1/discovery/institutions?period=2025-12-31").status_code == 404
    assert client.get("/api/v1/discovery/institutions/1?period=2025-12-31").status_code == 400


@pytest.mark.asyncio
async def test_daily_discovery_keeps_partial_quarter_separate(tmp_path: Path) -> None:
    store = InstitutionStore(create_engine(f"sqlite:///{tmp_path / 'institutions.db'}"))
    snapshot, details = fixture_data()
    store.publish(snapshot, details)

    class FakeWorker:
        async def get_submissions(self, cik: str, *, force_refresh: bool):
            assert force_refresh
            return ({
                "filings": {"recent": {
                    "form": ["13F-HR"],
                    "accessionNumber": [f"{cik}-26-000003"],
                    "filingDate": ["2026-11-02"],
                    "reportDate": ["2026-09-30"],
                    "primaryDocument": ["primary.xml"],
                }}
            }, False)

    result = await discover_recent_13f(store, worker=FakeWorker())
    assert result.checked == 2
    assert result.failed == 0
    assert result.new_filings == 2
    assert result.latest_partial_period == date(2026, 9, 30)
    assert store.latest_snapshot().report_period == date(2026, 6, 30)
    assert (await discover_recent_13f(store, worker=FakeWorker())).new_filings == 0
