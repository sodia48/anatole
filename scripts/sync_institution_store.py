"""Offline SEC 13F ingest into the existing Anatole database.

Run in a scheduled worker or manually; never from a user request. A single
transaction publishes the new period after every detail has validated.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
import tempfile
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine

from update_institution_universe import (
    build_payload,
    dataset_signature,
    discover_dataset_urls,
    download,
)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.schemas.institutions import InstitutionDetail, InstitutionsSnapshot  # noqa: E402
from app.services.institution_store import InstitutionStore, snapshot_from_payload  # noqa: E402
from app.services.institution_collector import collect_recent_13f  # noqa: E402


def normalized_database_url() -> str:
    url = os.environ.get("ACCOUNT_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("ACCOUNT_DATABASE_URL is required for persistent 13F ingestion")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def dataset_requires_download(version: dict[str, str] | None,
                              signature: str, now: datetime) -> bool:
    if version is None:
        return True
    if signature.strip("|") and signature != version["signature"]:
        return True
    # A weekly content hash also catches revisions behind unchanged HTTP metadata.
    return now - datetime.fromisoformat(version["checked_at"]) >= timedelta(days=7)


def zip_can_replace_period(zip_period: date, latest: InstitutionsSnapshot | None) -> bool:
    """Never replace an equal or newer EDGAR snapshot with an older ZIP view."""
    if latest is None or latest.report_period is None:
        return True
    if zip_period < latest.report_period:
        return False
    return not (zip_period == latest.report_period
                and latest.period_status == "published_edgar")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current-zip", type=Path)
    parser.add_argument("--previous-zip", type=Path)
    parser.add_argument("--current-url")
    parser.add_argument("--previous-url")
    parser.add_argument("--report-period", type=date.fromisoformat)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--user-agent", default=os.environ.get("SEC_USER_AGENT") or "Anatole contact@anatole.app")
    parser.add_argument("--snapshot-output", type=Path)
    parser.add_argument("--check-only", action="store_true", help="Discover SEC datasets without downloading")
    parser.add_argument("--if-new", action="store_true", help="Skip downloads when the latest SEC dataset is already published")
    args = parser.parse_args()
    current_url, previous_url = args.current_url, args.previous_url
    if args.check_only:
        if not current_url or not previous_url:
            discovered = discover_dataset_urls(args.user_agent)
            current_url = current_url or discovered[0]
            previous_url = previous_url or discovered[1]
        print(json.dumps({"current_url": current_url, "previous_url": previous_url}))
        return

    engine = create_engine(normalized_database_url(), pool_pre_ping=True)
    store = InstitutionStore(engine)
    store.create_schema()
    try:
        direct_failed = False
        if args.if_new and args.current_zip is None and args.current_url is None:
            try:
                direct = asyncio.run(collect_recent_13f(store, limit=max(50, min(args.limit, 100))))
                direct_failed = direct.failed > 0 and direct.published_period is None
                print(f"EDGAR checked={direct.checked} staged={direct.staged} "
                      f"failed={direct.failed} published={direct.published_period}")
            except Exception as exc:
                direct_failed = True
                print(f"EDGAR collection failed ({type(exc).__name__}); checking official ZIP")
        if not current_url or not previous_url:
            try:
                discovered = discover_dataset_urls(args.user_agent)
            except Exception as exc:
                if args.if_new and args.current_zip is None:
                    print(f"SEC ZIP discovery unavailable ({type(exc).__name__}); EDGAR state retained")
                    return
                raise
            current_url = current_url or discovered[0]
            previous_url = previous_url or discovered[1]
        signature = ""
        version = None
        if args.if_new and args.current_zip is None:
            version = store.dataset_version(current_url)
            try:
                signature = dataset_signature(current_url, args.user_agent)
            except Exception:
                # Validators are optional; a weekly hash check still catches revisions.
                pass
            if not dataset_requires_download(version, signature, datetime.now(UTC)):
                print("SEC ZIP validators unchanged or weekly hash check not due")
                return
        run_id = str(uuid.uuid4())
        if not store.start_run(run_id, current_url):
            raise RuntimeError("An institution ingestion is already running")
        try:
            with tempfile.TemporaryDirectory(prefix="anatole-13f-") as directory:
                temp = Path(directory)
                current_zip = args.current_zip or temp / "current.zip"
                previous_zip = args.previous_zip or temp / "previous.zip"
                if args.current_zip is None:
                    download(current_url, current_zip, args.user_agent)
                with current_zip.open("rb") as archive:
                    digest = hashlib.file_digest(archive, "sha256").hexdigest()
                if args.if_new and version and digest == version["sha256"]:
                    store.save_dataset_version(current_url, signature, digest)
                    store.finish_run(run_id, period=None, institutions_count=0,
                                     error_category="PartialSEC" if direct_failed else None)
                    print("SEC ZIP content unchanged; import skipped")
                    return
                if args.previous_zip is None:
                    download(previous_url, previous_zip, args.user_agent)
                details: dict[str, dict[str, object]] = {}
                filings: list[dict[str, str]] = []
                amount_types: dict[tuple[str, str, str, str], str] = {}
                payload = build_payload(
                    current_zip, previous_zip,
                    current_url=current_url, previous_url=previous_url,
                    universe_size=max(50, min(args.limit, 100)),
                    report_period=args.report_period,
                    details_out=details, filings_out=filings,
                    amount_types_out=amount_types,
                )
            snapshot = snapshot_from_payload(payload)
            validated_details = [InstitutionDetail.model_validate(item) for item in details.values()]
            if len(validated_details) != len(snapshot.institutions):
                raise ValueError("Incomplete 13F manager detail coverage")
            latest = store.latest_snapshot()
            zip_published = False
            if not zip_can_replace_period(snapshot.report_period, latest):
                print("SEC ZIP cannot replace the current published EDGAR quarter; import skipped")
            else:
                store.publish(snapshot, validated_details, amount_types=amount_types, filings=filings)
                zip_published = True
                if args.snapshot_output:
                    args.snapshot_output.parent.mkdir(parents=True, exist_ok=True)
                    args.snapshot_output.write_text(
                        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                    )
                print(f"Published {snapshot.report_period}: {len(snapshot.institutions)} managers, {len(filings)} filings")
            store.save_dataset_version(current_url, signature, digest)
            store.finish_run(run_id, period=snapshot.report_period,
                             institutions_count=len(snapshot.institutions),
                             error_category="PartialSEC" if direct_failed and not zip_published else None)
        except BaseException as exc:
            store.finish_run(run_id, period=None, institutions_count=0,
                             error_category=type(exc).__name__)
            raise
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
