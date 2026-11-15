"""Read-only PostgreSQL profile for the isolated Institutions staging service.

Run from apps/api in the staging Render Shell:
  PYTHONPATH=. python ../../scripts/profile_institutions_staging.py \
    --expected-database anatole_institutions_staging --cik 0002012383

Never prints connection strings, SQL bind parameters, account rows, or payloads.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from time import perf_counter
from typing import Any, Callable

from sqlalchemy import event, text

from app.core.config import settings
from app.services.accounts import account_service
from app.services.institution_store import InstitutionStore


def _percentiles(samples: list[float]) -> dict[str, float]:
    ordered = sorted(samples)
    return {
        "p50_ms": round(ordered[math.ceil(len(ordered) * 0.5) - 1], 2),
        "p95_ms": round(ordered[math.ceil(len(ordered) * 0.95) - 1], 2),
    }


def _plan_nodes(node: dict[str, Any]) -> list[dict[str, Any]]:
    fields = (
        "Node Type", "Relation Name", "Index Name", "Actual Rows",
        "Actual Total Time", "Shared Hit Blocks", "Shared Read Blocks",
        "Shared Dirtied Blocks", "Shared Written Blocks",
    )
    current = {key: node[key] for key in fields if key in node}
    return [current, *(
        child for nested in node.get("Plans", []) for child in _plan_nodes(nested)
    )]


def _cgroup_metrics() -> dict[str, Any]:
    root = Path("/sys/fs/cgroup")
    output: dict[str, Any] = {}
    for filename in ("memory.current", "memory.peak", "memory.max", "cpu.max"):
        path = root / filename
        if path.is_file():
            output[filename] = path.read_text(encoding="utf-8").strip()
    cpu_stat = root / "cpu.stat"
    if cpu_stat.is_file():
        output["cpu.stat"] = dict(
            line.split(maxsplit=1)
            for line in cpu_stat.read_text(encoding="utf-8").splitlines()
            if " " in line
        )
    return output


def _timed(operation: Callable[[], Any], *, repetitions: int = 12) -> tuple[dict[str, float], Any]:
    samples: list[float] = []
    result = None
    for index in range(repetitions + 2):
        start = perf_counter()
        result = operation()
        elapsed = (perf_counter() - start) * 1000
        if index >= 2:
            samples.append(elapsed)
    return _percentiles(samples), result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--cik", required=True)
    args = parser.parse_args()
    if settings.app_env != "staging":
        raise SystemExit("Refusing to profile outside APP_ENV=staging")
    if not args.cik.isdigit() or len(args.cik) != 10:
        raise SystemExit("A 10-digit public SEC CIK is required")
    engine = account_service.engine
    if engine.dialect.name != "postgresql":
        raise SystemExit("PostgreSQL staging is required")

    store = InstitutionStore(engine)
    report: dict[str, Any] = {"environment": "staging", "pool": engine.pool.status()}
    with engine.connect() as connection:
        # The transaction guard precedes every diagnostic query. EXPLAIN below
        # applies only to SELECT statements and cannot mutate the database.
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")
        connection.exec_driver_sql("SET LOCAL statement_timeout = '10000ms'")
        database = connection.execute(text("SELECT current_database()" )).scalar_one()
        if database != args.expected_database:
            raise SystemExit("Unexpected database; no profile executed")
        period = connection.execute(text(
            "SELECT period FROM institution_snapshots ORDER BY period DESC LIMIT 1"
        )).scalar_one_or_none()
        if period is None:
            raise SystemExit("No published Institutions period")
        report["period"] = period
        report["postgres_version"] = connection.execute(text("SHOW server_version")).scalar_one()
        report["database_bytes"] = connection.execute(text(
            "SELECT pg_database_size(current_database())"
        )).scalar_one()
        report["connections"] = dict(connection.execute(text(
            "SELECT count(*) AS total, "
            "count(*) FILTER (WHERE state = 'active') AS active "
            "FROM pg_stat_activity WHERE datname = current_database()"
        )).mappings().one())
        report["database_stats"] = dict(connection.execute(text(
            "SELECT numbackends, xact_commit, xact_rollback, blks_read, blks_hit, "
            "temp_files, temp_bytes, deadlocks FROM pg_stat_database "
            "WHERE datname = current_database()"
        )).mappings().one())
        report["relations"] = [dict(row) for row in connection.execute(text(
            "SELECT relname, pg_total_relation_size(relid) AS total_bytes, "
            "seq_scan, idx_scan, n_live_tup, n_dead_tup "
            "FROM pg_stat_user_tables WHERE relname LIKE 'institution_%' ORDER BY relname"
        )).mappings()]
        report["index_usage"] = [dict(row) for row in connection.execute(text(
            "SELECT relname, indexrelname, idx_scan, idx_tup_read, idx_tup_fetch "
            "FROM pg_stat_user_indexes WHERE relname LIKE 'institution_%' "
            "ORDER BY relname, indexrelname"
        )).mappings()]
        report["pg_stat_statements_installed"] = connection.execute(text(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements')"
        )).scalar_one()
        statements = {
            "latest_period": (
                "SELECT period FROM institution_snapshots ORDER BY period DESC LIMIT 1", {}
            ),
            "detail_payload": (
                "SELECT payload FROM institution_details WHERE period = :period AND cik = :cik",
                {"period": period, "cik": args.cik},
            ),
            "symbols": ("SELECT cusip, ticker FROM institution_symbol_map", {}),
            "relational_page_candidate": (
                "SELECT cusip, value FROM institution_holdings "
                "WHERE period = :period AND cik = :cik ORDER BY value DESC LIMIT 100",
                {"period": period, "cik": args.cik},
            ),
        }
        report["plans"] = {}
        for name, (statement, params) in statements.items():
            plan = connection.execute(text(
                "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement
            ), params).scalar_one()
            if isinstance(plan, str):
                plan = json.loads(plan)
            report["plans"][name] = {
                "planning_ms": plan[0]["Planning Time"],
                "execution_ms": plan[0]["Execution Time"],
                "nodes": _plan_nodes(plan[0]["Plan"]),
            }
        fetched, payload = _timed(lambda: connection.execute(text(
            "SELECT payload FROM institution_details WHERE period = :period AND cik = :cik"
        ), {"period": period, "cik": args.cik}).scalar_one())
        report["payload_fetch"] = {**fetched, "bytes": len(payload.encode("utf-8"))}
        connection.rollback()

    sql_events: list[tuple[str, float]] = []

    def before_cursor_execute(_conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        context._institutions_profile_started = perf_counter()

    def after_cursor_execute(_conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        label = next((name for name in (
            "institution_snapshots", "institution_details", "institution_symbol_map"
        ) if name in statement), "other")
        sql_events.append((label, (perf_counter() - context._institutions_profile_started) * 1000))

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    event.listen(engine, "after_cursor_execute", after_cursor_execute)
    try:
        for label, limit in (("legacy_full", None), ("page_100", 100)):
            timing, detail = _timed(lambda: store.detail(args.cik, limit=limit))
            if detail is None:
                raise SystemExit("Manager detail missing")
            serialization, encoded = _timed(detail.model_dump_json)
            report[label] = {
                "store": timing, "json_serialization": serialization,
                "response_bytes": len(encoded.encode("utf-8")),
                "returned_holdings": len(detail.holdings),
            }
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)
        event.remove(engine, "after_cursor_execute", after_cursor_execute)
    report["sql_calls_for_28_detail_reads"] = {
        label: {
            "count": sum(1 for name, _ in sql_events if name == label),
            "total_ms": round(sum(elapsed for name, elapsed in sql_events if name == label), 2),
        }
        for label in sorted({name for name, _ in sql_events})
    }
    report["container"] = _cgroup_metrics()
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"institution_profile_failed category={type(error).__name__}", file=sys.stderr)
        raise SystemExit(1) from None
