"""Migrate, import and verify 13F data on an explicitly named database.

Create a restorable backup before migration or import. The database URL is
read only from ACCOUNT_DATABASE_URL and is never printed.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import uuid
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine, func, inspect, select

API_ROOT = Path(__file__).resolve().parents[2]

from app.services.institution_store import InstitutionStore, snapshot_from_payload


DEFAULT_BUNDLE = API_ROOT / "app" / "data" / "institution_details_t2_2026.json.gz"
DEFAULT_SYMBOLS = API_ROOT / "app" / "data" / "institution_symbol_map.json"


def normalized_database_url() -> str:
    url = os.environ.get("ACCOUNT_DATABASE_URL")
    if not url:
        raise RuntimeError("ACCOUNT_DATABASE_URL is required")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def inspect_bundle(path: Path) -> tuple[date, int, int]:
    """Reject an unexpected bundle before opening a database transaction."""
    details = positions = 0
    with gzip.open(path, "rt", encoding="utf-8") as source:
        first = json.loads(next(source))
        if first.get("kind") != "snapshot":
            raise ValueError("Invalid bundle header")
        snapshot = snapshot_from_payload(first["payload"])
        if snapshot.report_period is None:
            raise ValueError("Bundle period is missing")
        for line in source:
            row = json.loads(line)
            if row.get("kind") == "detail":
                details += 1
                positions += len(row["payload"]["holdings"])
            elif row.get("kind") != "filing":
                raise ValueError("Unexpected bundle row")
    if details != len(snapshot.institutions):
        raise ValueError("Bundle manager coverage is incomplete")
    return snapshot.report_period, details, positions


def require_schema(store: InstitutionStore) -> None:
    """The migration must have been run separately after the staging backup."""
    inspector = inspect(store.engine)
    required = {"account_users", *store.metadata.tables}
    missing = required - set(inspector.get_table_names())
    if missing:
        raise RuntimeError("Required schema is missing: " + ", ".join(sorted(missing)))
    for table in store.metadata.tables.values():
        expected_columns = set(table.columns.keys())
        actual_columns = {column["name"] for column in inspector.get_columns(table.name)}
        if expected_columns - actual_columns:
            raise RuntimeError("Institution columns are missing on " + table.name)
        expected_pk = {column.name for column in table.primary_key}
        actual_pk = set(inspector.get_pk_constraint(table.name).get("constrained_columns") or ())
        if expected_pk != actual_pk:
            raise RuntimeError("Institution primary key differs on " + table.name)
        expected = {index.name for index in table.indexes}
        actual = {index["name"] for index in inspector.get_indexes(table.name)}
        if expected - actual:
            raise RuntimeError("Institution index is missing on " + table.name)


def verify(store: InstitutionStore, period: date, managers: int, positions: int) -> dict[str, object]:
    snapshot = store.latest_snapshot()
    if snapshot is None or snapshot.report_period != period:
        raise RuntimeError("Expected published period is absent")
    with store.engine.connect() as connection:
        manager_count = connection.execute(
            select(func.count()).select_from(store.details).where(store.details.c.period == period.isoformat())
        ).scalar_one()
        position_count = connection.execute(
            select(func.count()).select_from(store.holdings).where(store.holdings.c.period == period.isoformat())
        ).scalar_one()
        cusip = connection.execute(
            select(store.holdings.c.cusip)
            .where(store.holdings.c.period == period.isoformat())
            .order_by(store.holdings.c.cusip)
            .limit(1)
        ).scalar_one_or_none()
    if len(snapshot.institutions) != managers or manager_count != managers or position_count != positions:
        raise RuntimeError("Published 13F totals do not match the validated bundle")
    if positions and not cusip:
        raise RuntimeError("The CUSIP index has no searchable position")
    return {
        "period": period.isoformat(),
        "managers": manager_count,
        "positions": position_count,
        "sample_cusip": cusip,
        "indexes_present": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("migrate-up", "import", "verify"))
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--period", type=date.fromisoformat, default=date(2026, 6, 30))
    parser.add_argument("--managers", type=int, default=100)
    parser.add_argument("--positions", type=int, default=395_419)
    parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE)
    parser.add_argument("--symbols", type=Path, default=DEFAULT_SYMBOLS)
    parser.add_argument("--allow-production", action="store_true")
    parser.add_argument("--allow-sqlite-tests", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if os.environ.get("APP_ENV") == "production" and not args.allow_production:
        raise RuntimeError("Production operation requires explicit --allow-production")
    if args.command != "migrate-up":
        period, managers, positions = inspect_bundle(args.bundle)
        if (period, managers, positions) != (args.period, args.managers, args.positions):
            raise ValueError("Bundle totals or period differ from the approved manifest")

    engine = create_engine(normalized_database_url(), pool_pre_ping=True)
    try:
        if engine.url.database != args.expected_database:
            raise RuntimeError("Connected database does not match --expected-database")
        if engine.url.get_backend_name() != "postgresql" and not args.allow_sqlite_tests:
            raise RuntimeError("A PostgreSQL database is required")
        store = InstitutionStore(engine)
        if args.command == "migrate-up":
            store.create_schema()
            require_schema(store)
            print(json.dumps({"migrated": True}, sort_keys=True))
            return
        require_schema(store)
        installed = False
        if args.command == "import":
            run_id = str(uuid.uuid4())
            if not store.start_run(run_id, "bundled:SEC-13F-2026-Q2"):
                raise RuntimeError("Another Institutions import is active")
            try:
                store.seed_symbols(args.symbols)
                installed = store.bootstrap_bundle(args.bundle)
                result = verify(store, args.period, args.managers, args.positions)
            except BaseException as error:
                store.finish_run(run_id, period=None, institutions_count=0, error_category=type(error).__name__)
                raise
            store.finish_run(run_id, period=args.period, institutions_count=args.managers)
        else:
            result = verify(store, args.period, args.managers, args.positions)
        print(json.dumps({**result, "imported": installed}, sort_keys=True))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
