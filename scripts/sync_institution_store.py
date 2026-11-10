"""Offline SEC 13F ingest into the existing Anatole database.

Run in a scheduled worker or manually; never from a user request. A single
transaction publishes the new period after every detail has validated.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import uuid
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine

from update_institution_universe import (
    build_payload,
    discover_dataset_urls,
    download,
)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.schemas.institutions import InstitutionDetail  # noqa: E402
from app.services.institution_store import InstitutionStore, snapshot_from_payload  # noqa: E402


def normalized_database_url() -> str:
    url = os.environ.get("ACCOUNT_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("ACCOUNT_DATABASE_URL is required for persistent 13F ingestion")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


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
    if not current_url or not previous_url:
        discovered = discover_dataset_urls(args.user_agent)
        current_url = current_url or discovered[0]
        previous_url = previous_url or discovered[1]
    if args.check_only:
        print(json.dumps({"current_url": current_url, "previous_url": previous_url}))
        return

    engine = create_engine(normalized_database_url(), pool_pre_ping=True)
    store = InstitutionStore(engine)
    store.create_schema()
    if args.if_new:
        existing = store.latest_snapshot()
        if (
            existing and existing.sources and existing.sources[0].url == current_url
            and (args.report_period is None or args.report_period == existing.report_period)
        ):
            print("No new SEC 13F dataset; collection skipped")
            engine.dispose()
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
        store.publish(snapshot, validated_details, amount_types=amount_types, filings=filings)
        if args.snapshot_output:
            args.snapshot_output.parent.mkdir(parents=True, exist_ok=True)
            args.snapshot_output.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        store.finish_run(
            run_id, period=snapshot.report_period,
            institutions_count=len(snapshot.institutions),
        )
        print(f"Published {snapshot.report_period}: {len(snapshot.institutions)} managers, {len(filings)} filings")
    except Exception as exc:
        store.finish_run(run_id, period=None, institutions_count=0, error_category=type(exc).__name__)
        raise
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
