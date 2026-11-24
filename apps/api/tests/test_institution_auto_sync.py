from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
import sys

import pytest
from sqlalchemy import create_engine

from app.schemas.institutions import InstitutionHolding
from app.services.institution_collector import (
    _latest_closed_quarter, _previous_quarter_end, _publish_pending, collect_recent_13f,
)
from app.services.institution_store import InstitutionStore
from app.services.institutions import InstitutionService
from test_institution_store import fixture_data

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
from scripts.sync_institution_store import dataset_requires_download, zip_can_replace_period  # noqa: E402


def test_same_zip_url_detects_revision_and_weekly_hash_check() -> None:
    now = datetime(2026, 11, 23, tzinfo=UTC)
    old = {"signature": "etag-1|Mon|100", "checked_at": (now - timedelta(days=1)).isoformat()}
    assert not dataset_requires_download(old, "etag-1|Mon|100", now)
    assert dataset_requires_download(old, "etag-2|Tue|100", now)
    assert not dataset_requires_download(old, "||", now)
    week_old = {**old, "checked_at": (now - timedelta(days=8)).isoformat()}
    assert dataset_requires_download(week_old, "||", now)
    assert dataset_requires_download(week_old, "etag-1|Mon|100", now)


def test_official_zip_cannot_downgrade_a_published_edgar_quarter() -> None:
    snapshot, _ = fixture_data()
    edgar = snapshot.model_copy(update={"period_status": "published_edgar"})
    assert not zip_can_replace_period(date(2026, 6, 30), edgar)
    assert zip_can_replace_period(date(2026, 9, 30), edgar)
    assert zip_can_replace_period(date(2026, 6, 30), snapshot)


@pytest.mark.parametrize(("today", "expected"), [
    (date(2026, 11, 23), date(2026, 9, 30)),
    (date(2027, 1, 1), date(2026, 12, 31)),
    (date(2027, 4, 1), date(2027, 3, 31)),
])
def test_quarter_rollover(today: date, expected: date) -> None:
    assert _latest_closed_quarter(today) == expected
    assert _previous_quarter_end(date(2027, 3, 31)) == date(2026, 12, 31)


class SECWorker:
    def __init__(self) -> None:
        self.reporting = {"0000000001"}
        self.amended = False
        self.amendment_type = "RESTATEMENT"
        self.fail_cik: str | None = None
        self.include_q4 = False
        self.table_requests: list[str] = []

    async def get_submissions(self, cik: str, *, force_refresh: bool):
        assert force_refresh
        if cik == self.fail_cik:
            raise ConnectionError("SEC unavailable")
        forms = ["13F-HR"] if cik in self.reporting else []
        accessions = [f"{cik}-26-000003"] if forms else []
        dates = ["2026-11-02"] if forms else []
        periods = ["2026-09-30"] if forms else []
        documents = ["primary.xml"] if forms else []
        if cik == "0000000001" and self.amended:
            forms.append("13F-HR/A")
            accessions.append(f"{cik}-26-000004")
            dates.append("2026-11-20")
            periods.append("2026-09-30")
            documents.append("amendment.xml")
        if cik in self.reporting and self.include_q4:
            forms.append("13F-HR")
            accessions.append(f"{cik}-27-000001")
            dates.append("2027-02-10")
            periods.append("2026-12-31")
            documents.append("q4.xml")
        return ({
            "cik": int(cik), "name": f"Manager {int(cik)}",
            "filings": {"recent": {
                "form": forms, "accessionNumber": accessions,
                "filingDate": dates, "reportDate": periods,
                "primaryDocument": documents,
            }},
        }, False)

    async def _sec_request(self, url: str):
        assert url.startswith("https://www.sec.gov/Archives/")
        return SimpleNamespace(text=f"<cover><amendmentType>{self.amendment_type}</amendmentType></cover>")

    async def fetch_13f_information_table(self, filing, *, force_refresh: bool):
        assert force_refresh
        self.table_requests.append(filing.accession)
        value = 1300 if filing.form.endswith("/A") else 1200
        return ([InstitutionHolding(
            cusip="02079K305" if filing.form.endswith("/A") and self.amendment_type == "NEW HOLDINGS" else "67066G104",
            issuer="ADDED CORP" if filing.form.endswith("/A") and self.amendment_type == "NEW HOLDINGS" else "NVIDIA CORP",
            security_class="COM",
            shares=value / 10, previous_shares=0, share_change=0,
            value=value, portfolio_weight_percent=100, previous_value=0,
            status="unchanged",
        )], False)


def prepared_store(tmp_path: Path) -> InstitutionStore:
    engine = create_engine(f"sqlite:///{tmp_path / 'institutions.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE account_users (id TEXT PRIMARY KEY)")
        connection.exec_driver_sql("INSERT INTO account_users VALUES ('account-sentinel')")
    store = InstitutionStore(engine)
    snapshot, details = fixture_data()
    store.publish(snapshot, details)
    return store


@pytest.mark.asyncio
async def test_partial_quarter_publish_amendment_and_idempotence(tmp_path: Path) -> None:
    store = prepared_store(tmp_path)
    worker = SECWorker()
    partial = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert partial.staged == 1
    assert partial.published_period is None
    assert store.latest_snapshot().report_period == date(2026, 6, 30)
    assert store.pending_managers(date(2026, 9, 30)).keys() == {"0000000001"}
    response = await InstitutionService(store=store).institutions_snapshot()
    assert response.partial_report_period == date(2026, 9, 30)
    assert response.partial_institutions_reporting == 1
    assert response.next_check_at is not None
    progressive = await InstitutionService(store=store).institution_detail(
        "0000000001", limit=50,
    )
    assert progressive.institution.report_period == date(2026, 9, 30)
    assert "en cours de collecte" in (progressive.message or "")
    assert progressive.holdings_total == 1
    waiting = await InstitutionService(store=store).institution_detail("0000000002", limit=50)
    assert waiting.institution.report_period == date(2026, 6, 30)

    worker.reporting.add("0000000002")
    published = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert published.published_period == date(2026, 9, 30)
    assert published.reporting == 2
    assert store.latest_snapshot().period_status == "published_edgar"
    assert store.published_periods() == [date(2026, 9, 30), date(2026, 6, 30)]
    assert {item.institution.report_period for item in (
        store.detail("0000000001"), store.detail("0000000002")
    )} == {date(2026, 9, 30)}
    requests = list(worker.table_requests)
    unchanged = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert unchanged.staged == 0 and unchanged.published_period is None
    assert worker.table_requests == requests

    worker.amended = True
    amended = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert amended.published_period == date(2026, 9, 30)
    assert store.detail("0000000001").institution.total_13f_value == 1300
    assert store.detail("0000000002").institution.total_13f_value == 1200
    assert len(store.published_periods()) == 2
    with store.engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT id FROM account_users").scalar_one() == "account-sentinel"
        assert connection.exec_driver_sql(
            "SELECT COUNT(*) FROM institution_holdings WHERE period='2026-09-30'"
        ).scalar_one() == 2


@pytest.mark.asyncio
async def test_new_holdings_amendment_supplements_original_filing(tmp_path: Path) -> None:
    store = prepared_store(tmp_path)
    worker = SECWorker()
    worker.reporting.add("0000000002")
    await collect_recent_13f(store, worker=worker, min_coverage=1)
    worker.amended = True
    worker.amendment_type = "NEW HOLDINGS"
    result = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert result.published_period == date(2026, 9, 30)
    detail = store.detail("0000000001")
    assert detail.institution.total_13f_value == 2500
    assert {item.cusip for item in detail.holdings} == {"67066G104", "02079K305"}


@pytest.mark.asyncio
async def test_discovered_unverified_amendment_is_not_published(tmp_path: Path) -> None:
    store = prepared_store(tmp_path)
    worker = SECWorker()
    worker.reporting.add("0000000002")
    await collect_recent_13f(store, worker=worker, min_coverage=1)
    period = date(2026, 9, 30)
    verified = store.published_manager_accessions(period, "0000000001")
    store.record_discovered_filings([dict(
        accession="0000000001-26-000099", cik="0000000001",
        period=period.isoformat(), form="13F-HR/A", amendment_type="unclassified",
        filed_at="2026-11-23", source_url="https://www.sec.gov/Archives/test",
    )])
    second = store.detail("0000000002", period)
    assert second is not None
    second_accession = "0000000002-26-000099"
    second_filing = dict(
        accession=second_accession, cik="0000000002", period=period.isoformat(),
        form="13F-HR/A", amendment_type="RESTATEMENT", filed_at="2026-11-23",
        source_url=second.institution.filing_url,
    )
    store.stage_manager(period, "0000000002", [second_accession], dict(
        name=second.institution.name, country=second.institution.country,
        filed_at="2026-11-23", filing_url=second.institution.filing_url,
        holdings=[item.model_dump(mode="json") for item in second.holdings],
        filings=[second_filing],
    ))
    assert _publish_pending(store, period, store.latest_snapshot(),
                            {"0000000001", "0000000002"}, min_coverage=1) == 2
    accessions = {row["accession"] for row in store.published_filings(period)}
    assert "0000000001-26-000099" not in accessions
    assert set(verified).issubset(accessions)
    assert store.published_manager_accessions(period, "0000000001") == verified


@pytest.mark.asyncio
async def test_network_failure_keeps_last_valid_quarter_and_recovers(tmp_path: Path) -> None:
    store = prepared_store(tmp_path)
    worker = SECWorker()
    worker.reporting.add("0000000002")
    worker.fail_cik = "0000000002"
    failed = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert failed.failed == 1
    assert store.latest_snapshot().report_period == date(2026, 6, 30)
    assert store.public_collection_status()["collection_error"] is not None

    worker.fail_cik = None
    recovered = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert recovered.published_period == date(2026, 9, 30)
    assert store.public_collection_status()["collection_error"] is None
    assert store.published_periods() == [date(2026, 9, 30), date(2026, 6, 30)]


@pytest.mark.asyncio
async def test_catch_up_two_quarters_links_each_to_its_predecessor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = prepared_store(tmp_path)
    worker = SECWorker()
    worker.reporting.add("0000000002")
    worker.include_q4 = True
    monkeypatch.setattr("app.services.institution_collector._latest_closed_quarter",
                        lambda _: date(2026, 12, 31))
    result = await collect_recent_13f(store, worker=worker, min_coverage=1)
    assert result.published_period == date(2026, 12, 31)
    assert store.published_periods() == [
        date(2026, 12, 31), date(2026, 9, 30), date(2026, 6, 30),
    ]
    assert store.latest_snapshot().previous_report_period == date(2026, 9, 30)
