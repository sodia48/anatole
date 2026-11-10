"""Local read benchmark against a populated Institutions database."""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
import time
from pathlib import Path

from sqlalchemy import create_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from fastapi.testclient import TestClient  # noqa: E402
from app.api.routes import institutions as routes  # noqa: E402
from app.main import app  # noqa: E402
from app.services.institution_store import InstitutionStore  # noqa: E402
from app.services.institutions import InstitutionService  # noqa: E402


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite-path", required=True, type=Path)
    parser.add_argument("--iterations", type=int, default=100)
    args = parser.parse_args()
    if args.iterations < 20:
        raise ValueError("At least 20 iterations are required")
    store = InstitutionStore(create_engine(f"sqlite:///{args.sqlite_path.resolve().as_posix()}"))
    store.create_schema()
    if store.latest_snapshot() is None:
        raise ValueError("Populate the Institutions database first")
    routes.institution_service = InstitutionService(store=store)
    client = TestClient(app)
    logging.disable(logging.CRITICAL)
    results: dict[str, dict[str, float | int]] = {}
    for name, path in {
        "ranking": "/api/v1/discovery/institutions?limit=50",
        "indexed_activity": "/api/v1/discovery/institutions/security/activity?q=NVDA",
        "indexed_page": "/api/v1/discovery/institutions/security/holdings?q=NVDA&limit=20",
    }.items():
        for _ in range(5):
            assert client.get(path).status_code == 200
        timings = []
        size = 0
        for _ in range(args.iterations):
            started = time.perf_counter()
            response = client.get(path)
            timings.append((time.perf_counter() - started) * 1000)
            assert response.status_code == 200
            size = len(response.content)
        results[name] = {
            "p50_ms": round(statistics.median(timings), 2),
            "p95_ms": round(percentile(timings, 0.95), 2),
            "max_ms": round(max(timings), 2),
            "response_bytes": size,
        }
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
