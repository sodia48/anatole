from __future__ import annotations

import argparse
import csv
import io
import json
import re
import tempfile
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Iterable


DATASET_PAGE = (
    "https://www.sec.gov/data-research/sec-markets-data/"
    "form-13f-data-sets"
)
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "apps"
    / "api"
    / "app"
    / "data"
    / "institution_universe.json"
)
CANADIAN_CODES = {
    "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9",
    "B0", "Z4",
}
US_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
    "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
    "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI",
    "WY", "PR", "VI",
}


@dataclass(frozen=True)
class Filing:
    accession: str
    cik: str
    filing_date: date
    report_period: date
    form: str
    amendment_type: str
    name: str
    country: str
    entries: int
    reported_value: int


@dataclass
class RawHolding:
    cusip: str
    issuer: str
    security_class: str
    put_call: str
    amount_type: str
    shares: float = 0
    value: float = 0


def request(url: str, user_agent: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept-Encoding": "identity",
        },
    )


def discover_dataset_urls(user_agent: str) -> tuple[str, str]:
    with urllib.request.urlopen(request(DATASET_PAGE, user_agent)) as response:
        html = response.read().decode("utf-8", errors="replace")
    links = re.findall(
        r'href=["\']([^"\']+_form13f\.zip)["\']',
        html,
        flags=re.I,
    )
    urls = list(dict.fromkeys(
        urllib.parse.urljoin(DATASET_PAGE, link) for link in links
    ))
    if len(urls) < 2:
        raise RuntimeError("La page SEC ne fournit pas deux datasets 13F.")
    return urls[0], urls[1]


def download(url: str, target: Path, user_agent: str) -> None:
    with urllib.request.urlopen(request(url, user_agent)) as response:
        with target.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)


def parse_sec_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%d-%b-%Y").date()


def country_from_code(value: str) -> str:
    code = value.strip().upper()
    if code in CANADIAN_CODES:
        return "Canada"
    if code in US_CODES:
        return "États-Unis"
    return "Non déterminé"


def rows(archive: zipfile.ZipFile, name: str) -> Iterable[dict[str, str]]:
    with archive.open(name) as binary:
        with io.TextIOWrapper(binary, encoding="utf-8-sig", newline="") as text:
            yield from csv.DictReader(text, delimiter="\t")


def effective_filings(archive: zipfile.ZipFile) -> dict[str, list[Filing]]:
    covers = {row["ACCESSION_NUMBER"]: row for row in rows(archive, "COVERPAGE.tsv")}
    summaries = {
        row["ACCESSION_NUMBER"]: row for row in rows(archive, "SUMMARYPAGE.tsv")
    }
    grouped: dict[tuple[str, date], list[Filing]] = defaultdict(list)
    for submission in rows(archive, "SUBMISSION.tsv"):
        form = submission["SUBMISSIONTYPE"].strip().upper()
        if form not in {"13F-HR", "13F-HR/A"}:
            continue
        accession = submission["ACCESSION_NUMBER"]
        cover = covers.get(accession, {})
        summary = summaries.get(accession, {})
        try:
            filing = Filing(
                accession=accession,
                cik=submission["CIK"].zfill(10),
                filing_date=parse_sec_date(submission["FILING_DATE"]),
                report_period=parse_sec_date(submission["PERIODOFREPORT"]),
                form=form,
                amendment_type=str(cover.get("AMENDMENTTYPE") or "").upper(),
                name=str(cover.get("FILINGMANAGER_NAME") or "").strip(),
                country=country_from_code(
                    str(cover.get("FILINGMANAGER_STATEORCOUNTRY") or "")
                ),
                entries=int(summary.get("TABLEENTRYTOTAL") or 0),
                reported_value=int(summary.get("TABLEVALUETOTAL") or 0),
            )
        except (KeyError, TypeError, ValueError):
            continue
        grouped[(filing.cik, filing.report_period)].append(filing)

    latest_period = {
        cik: max(period for candidate, period in grouped if candidate == cik)
        for cik, _ in grouped
    }
    output: dict[str, list[Filing]] = {}
    for (cik, period), filings in grouped.items():
        if latest_period[cik] != period:
            continue
        filings.sort(key=lambda item: (item.filing_date, item.accession))
        base_index = -1
        for index, filing in enumerate(filings):
            if filing.form == "13F-HR" or "RESTATEMENT" in filing.amendment_type:
                base_index = index
        if base_index < 0:
            continue
        effective = [filings[base_index]]
        effective.extend(
            filing
            for filing in filings[base_index + 1:]
            if "NEW HOLDING" in filing.amendment_type
        )
        output[cik] = effective
    return output


def load_holdings(
    archive: zipfile.ZipFile,
    filings_by_cik: dict[str, list[Filing]],
) -> dict[str, dict[tuple[str, str, str], RawHolding]]:
    accession_to_cik = {
        filing.accession: cik
        for cik, filings in filings_by_cik.items()
        for filing in filings
    }
    output: dict[str, dict[tuple[str, str, str], RawHolding]] = defaultdict(dict)
    for row in rows(archive, "INFOTABLE.tsv"):
        cik = accession_to_cik.get(row["ACCESSION_NUMBER"])
        if cik is None:
            continue
        cusip = row["CUSIP"].strip().upper()
        security_class = row["TITLEOFCLASS"].strip()
        put_call = row["PUTCALL"].strip().upper()
        key = (cusip, security_class, put_call)
        holding = output[cik].get(key)
        if holding is None:
            holding = RawHolding(
                cusip=cusip,
                issuer=row["NAMEOFISSUER"].strip(),
                security_class=security_class,
                put_call=put_call,
                amount_type=row["SSHPRNAMTTYPE"].strip().upper(),
            )
            output[cik][key] = holding
        try:
            holding.shares += float(row["SSHPRNAMT"] or 0)
            # Depuis le 3 janvier 2023, la SEC exige la valeur au dollar
            # près. Les datasets utilisés ici sont postérieurs à ce seuil.
            holding.value += float(row["VALUE"] or 0)
        except ValueError:
            continue
    return output


def status(current: RawHolding | None, previous: RawHolding | None) -> str:
    if current is not None and previous is None:
        return "new"
    if current is None and previous is not None:
        return "closed"
    assert current is not None and previous is not None
    if current.shares > previous.shares:
        return "increased"
    if current.shares < previous.shares:
        return "reduced"
    return "unchanged"


def build_payload(
    current_zip: Path,
    previous_zip: Path,
    *,
    current_url: str,
    previous_url: str,
    universe_size: int,
) -> dict[str, object]:
    with zipfile.ZipFile(current_zip) as current_archive:
        current_all = effective_filings(current_archive)
        ranked = sorted(
            current_all,
            key=lambda cik: sum(
                filing.reported_value for filing in current_all[cik]
            ),
            reverse=True,
        )[:universe_size]
        current_filings = {cik: current_all[cik] for cik in ranked}
        current_holdings = load_holdings(current_archive, current_filings)

    with zipfile.ZipFile(previous_zip) as previous_archive:
        previous_all = effective_filings(previous_archive)
        previous_filings = {
            cik: previous_all[cik]
            for cik in ranked
            if cik in previous_all
        }
        previous_holdings = load_holdings(previous_archive, previous_filings)

    institutions: list[dict[str, object]] = []
    flow_rows: dict[tuple[str, str, str], dict[str, object]] = {}
    top50 = set(ranked[:50])
    for cik in ranked:
        filings = current_filings[cik]
        latest = filings[-1]
        current = current_holdings.get(cik, {})
        previous = previous_holdings.get(cik, {})
        keys = set(current) | set(previous)
        counts = {name: 0 for name in ("new", "increased", "reduced", "closed")}
        for key in keys:
            change_status = status(current.get(key), previous.get(key))
            if change_status in counts:
                counts[change_status] += 1

            if cik not in top50:
                continue
            current_item = current.get(key)
            previous_item = previous.get(key)
            reference = current_item or previous_item
            assert reference is not None
            flow = flow_rows.setdefault(key, {
                "ticker": None,
                "cusip": reference.cusip,
                "issuer": reference.issuer,
                "institutions_holding": 0,
                "institutions_increased": 0,
                "institutions_reduced": 0,
                "institutions_new": 0,
                "institutions_closed": 0,
                "aggregate_share_change": 0.0,
                "current_reported_value": 0.0,
                "institution_values": [],
                "amount_types": set(),
            })
            if current_item is not None:
                flow["institutions_holding"] += 1
                flow["current_reported_value"] += current_item.value
                flow["amount_types"].add(current_item.amount_type)
            if previous_item is not None:
                flow["amount_types"].add(previous_item.amount_type)
            if change_status == "increased":
                flow["institutions_increased"] += 1
            elif change_status == "reduced":
                flow["institutions_reduced"] += 1
            elif change_status == "new":
                flow["institutions_new"] += 1
            elif change_status == "closed":
                flow["institutions_closed"] += 1
            current_shares = current_item.shares if current_item else 0
            previous_shares = previous_item.shares if previous_item else 0
            flow["aggregate_share_change"] += current_shares - previous_shares
            flow["institution_values"].append((
                current_item.value if current_item else 0,
                latest.name,
            ))

        values = sorted(
            (holding.value for holding in current.values()),
            reverse=True,
        )
        total_value = sum(filing.reported_value for filing in filings)
        previous_total = sum(
            filing.reported_value for filing in previous_filings.get(cik, [])
        )
        concentration = (sum(values[:10]) / total_value * 100) if total_value else 0
        accession = latest.accession.replace("-", "")
        filing_url = (
            f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/"
            f"{accession}/{latest.accession}-index.html"
        )
        institutions.append({
            "cik": cik,
            "name": latest.name,
            "country": latest.country,
            "report_period": latest.report_period.isoformat(),
            "filed_at": latest.filing_date.isoformat(),
            "filing_url": filing_url,
            "total_13f_value": total_value,
            "holdings_count": len(current),
            "previous_total_13f_value": previous_total,
            "top10_concentration_percent": round(concentration, 4),
            "new_positions_count": counts["new"],
            "increased_positions_count": counts["increased"],
            "reduced_positions_count": counts["reduced"],
            "closed_positions_count": counts["closed"],
        })

    flows: list[dict[str, object]] = []
    for flow in flow_rows.values():
        amount_types = flow.pop("amount_types")
        institution_values = flow.pop("institution_values")
        if amount_types != {"SH"}:
            flow["aggregate_share_change"] = None
        flow["institution_names"] = [
            name for _, name in sorted(institution_values, reverse=True)[:8]
        ]
        flows.append(flow)

    def top(metric: str) -> list[dict[str, object]]:
        return sorted(
            (flow for flow in flows if int(flow[metric]) > 0),
            key=lambda flow: (
                int(flow[metric]),
                float(flow["current_reported_value"]),
            ),
            reverse=True,
        )[:20]

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_url": current_url,
        "previous_source_url": previous_url,
        "report_period": institutions[0]["report_period"] if institutions else None,
        "previous_report_period": (
            previous_filings[ranked[0]][-1].report_period.isoformat()
            if ranked and ranked[0] in previous_filings else None
        ),
        "institutions": institutions,
        "top_increased": top("institutions_increased"),
        "top_new": top("institutions_new"),
        "top_reduced": top("institutions_reduced"),
        "top_closed": top("institutions_closed"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Construit l’univers institutionnel depuis les datasets 13F SEC."
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--current-zip", type=Path)
    parser.add_argument("--previous-zip", type=Path)
    parser.add_argument("--current-url")
    parser.add_argument("--previous-url")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument(
        "--user-agent",
        default="Anatole contact@anatole.app",
    )
    args = parser.parse_args()
    current_url = args.current_url
    previous_url = args.previous_url
    if not current_url or not previous_url:
        discovered_current, discovered_previous = discover_dataset_urls(
            args.user_agent
        )
        current_url = current_url or discovered_current
        previous_url = previous_url or discovered_previous

    with tempfile.TemporaryDirectory(prefix="anatole-13f-") as temp_dir:
        temp = Path(temp_dir)
        current_zip = args.current_zip or temp / "current.zip"
        previous_zip = args.previous_zip or temp / "previous.zip"
        if args.current_zip is None:
            download(current_url, current_zip, args.user_agent)
        if args.previous_zip is None:
            download(previous_url, previous_zip, args.user_agent)
        payload = build_payload(
            current_zip,
            previous_zip,
            current_url=current_url,
            previous_url=previous_url,
            universe_size=max(50, min(args.limit, 100)),
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"{len(payload['institutions'])} institutions écrites dans {args.output}"
    )


if __name__ == "__main__":
    main()
