from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date
from pathlib import Path

import pytest

from app.services.institutions import UNIVERSE_PATH, latest_due_13f_period
from scripts.update_institution_universe import build_payload, previous_quarter_end


def _archive(path: Path, filings: list[tuple[str, str, str, str, int]]) -> None:
    columns = {
        "SUBMISSION.tsv": ["ACCESSION_NUMBER", "SUBMISSIONTYPE", "CIK", "FILING_DATE", "PERIODOFREPORT"],
        "COVERPAGE.tsv": ["ACCESSION_NUMBER", "AMENDMENTTYPE", "FILINGMANAGER_NAME", "FILINGMANAGER_STATEORCOUNTRY"],
        "SUMMARYPAGE.tsv": ["ACCESSION_NUMBER", "TABLEENTRYTOTAL", "TABLEVALUETOTAL"],
        "INFOTABLE.tsv": ["ACCESSION_NUMBER", "CUSIP", "TITLEOFCLASS", "PUTCALL", "NAMEOFISSUER", "SSHPRNAMTTYPE", "SSHPRNAMT", "VALUE"],
    }
    rows: dict[str, list[dict[str, str]]] = {name: [] for name in columns}
    for accession, cik, period, filed_at, shares in filings:
        rows["SUBMISSION.tsv"].append({
            "ACCESSION_NUMBER": accession, "SUBMISSIONTYPE": "13F-HR", "CIK": cik,
            "FILING_DATE": filed_at, "PERIODOFREPORT": period,
        })
        rows["COVERPAGE.tsv"].append({
            "ACCESSION_NUMBER": accession, "AMENDMENTTYPE": "",
            "FILINGMANAGER_NAME": f"Manager {cik}",
            "FILINGMANAGER_STATEORCOUNTRY": "NY",
        })
        rows["SUMMARYPAGE.tsv"].append({
            "ACCESSION_NUMBER": accession, "TABLEENTRYTOTAL": "1",
            "TABLEVALUETOTAL": str(shares * 10),
        })
        rows["INFOTABLE.tsv"].append({
            "ACCESSION_NUMBER": accession, "CUSIP": "67066G104",
            "TITLEOFCLASS": "COM", "PUTCALL": "", "NAMEOFISSUER": "NVIDIA CORP",
            "SSHPRNAMTTYPE": "SH", "SSHPRNAMT": str(shares),
            "VALUE": str(shares * 10),
        })
    with zipfile.ZipFile(path, "w") as archive:
        for name, fields in columns.items():
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=fields, delimiter="\t")
            writer.writeheader()
            writer.writerows(rows[name])
            archive.writestr(name, output.getvalue())


def test_snapshot_uses_one_explicit_quarter_and_only_comparable_filings(tmp_path: Path) -> None:
    current = tmp_path / "current.zip"
    previous = tmp_path / "previous.zip"
    _archive(current, [
        ("0000000001-26-000002", "1", "30-Jun-2026", "10-Aug-2026", 15),
        ("0000000002-26-000002", "2", "30-Jun-2026", "11-Aug-2026", 20),
        ("0000000003-26-000001", "3", "31-Mar-2026", "12-Jun-2026", 100),
    ])
    _archive(previous, [
        ("0000000001-26-000001", "1", "31-Mar-2026", "10-May-2026", 10),
    ])

    payload = build_payload(
        current, previous, current_url="https://www.sec.gov/current.zip",
        previous_url="https://www.sec.gov/previous.zip", universe_size=50,
        report_period=date(2026, 6, 30),
    )

    assert payload["report_period"] == "2026-06-30"
    assert payload["previous_report_period"] == "2026-03-31"
    assert payload["institutions_reporting"] == 2
    assert payload["institutions_comparable"] == 1
    by_cik = {item["cik"]: item for item in payload["institutions"]}
    assert set(by_cik) == {"0000000001", "0000000002"}
    assert by_cik["0000000001"]["increased_positions_count"] == 1
    assert by_cik["0000000002"]["comparison_available"] is False
    assert by_cik["0000000002"]["new_positions_count"] == 0


def test_invalid_or_absent_quarter_is_rejected(tmp_path: Path) -> None:
    archive = tmp_path / "empty.zip"
    _archive(archive, [])
    with pytest.raises(ValueError, match="non trimestrielle"):
        previous_quarter_end(date(2026, 8, 31))
    with pytest.raises(RuntimeError, match="Aucun dépôt"):
        build_payload(
            archive, archive, current_url="https://www.sec.gov/current.zip",
            previous_url="https://www.sec.gov/previous.zip", universe_size=50,
            report_period=date(2026, 6, 30),
        )


def test_bundled_sec_snapshot_is_t2_or_newer_and_has_single_period() -> None:
    payload = json.loads(UNIVERSE_PATH.read_text(encoding="utf-8"))
    period = date.fromisoformat(payload["report_period"])
    assert period >= date(2026, 6, 30)
    assert payload["previous_report_period"] == previous_quarter_end(period).isoformat()
    assert payload["period_status"] == "published_dataset"
    assert payload["source_url"].startswith("https://www.sec.gov/")
    assert payload["previous_source_url"].startswith("https://www.sec.gov/")
    assert payload["extracted_at"] <= payload["validated_at"] <= payload["generated_at"]
    assert len(payload["institutions"]) == payload["institutions_reporting"]
    assert len({item["cik"] for item in payload["institutions"]}) == len(payload["institutions"])
    assert {item["report_period"] for item in payload["institutions"]} == {period.isoformat()}


def test_latest_due_period_respects_q3_2026_weekend_deadline() -> None:
    assert latest_due_13f_period(date(2026, 11, 15)) == date(2026, 6, 30)
    assert latest_due_13f_period(date(2026, 11, 16)) == date(2026, 9, 30)
    assert latest_due_13f_period(date(2027, 2, 15)) == date(2026, 9, 30)
    assert latest_due_13f_period(date(2027, 2, 16)) == date(2026, 12, 31)
