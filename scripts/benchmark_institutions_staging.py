"""Read-only HTTP benchmark of the isolated Institutions staging API.

Run after confirming that the staging API points at its isolated PostgreSQL
database. The script deliberately rejects any other host and prints no payload.
"""

from __future__ import annotations

import argparse
import math
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter
from urllib.parse import urlparse

import httpx


STAGING_HOST = "anatole-api-institutions-staging.onrender.com"


def percentile(values: list[float], fraction: float) -> float:
    return sorted(values)[math.ceil(len(values) * fraction) - 1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--cik", required=True)
    args = parser.parse_args()
    parsed = urlparse(args.base_url)
    if parsed.scheme != "https" or parsed.hostname != STAGING_HOST or parsed.path.rstrip("/"):
        parser.error("only the isolated HTTPS staging API is allowed")
    if not args.cik.isdigit() or len(args.cik) != 10:
        parser.error("a 10-digit public SEC CIK is required")

    base = f"{args.base_url.rstrip('/')}/api/v1/discovery/institutions/{args.cik}"
    with httpx.Client(timeout=60, trust_env=False) as client:
        ready = client.get(f"{args.base_url.rstrip('/')}/ready")
        ready.raise_for_status()
        storage = ready.json().get("account_storage", {})
        if storage.get("mode") != "postgresql" or not storage.get("durable"):
            raise SystemExit("staging PostgreSQL is not ready")

        for mode, suffix in (("legacy_full", ""), ("page_100", "?limit=100&offset=0")):
            url = base + suffix

            def request(_index: int) -> tuple[float, int, int]:
                start = perf_counter()
                response = client.get(url)
                return 1000 * (perf_counter() - start), response.status_code, len(response.content)

            for workers in (1, 5, 10):
                with ThreadPoolExecutor(max_workers=workers) as executor:
                    list(executor.map(request, range(2)))
                    samples = list(executor.map(request, range(20)))
                statuses = {sample[1] for sample in samples}
                if statuses != {200}:
                    raise SystemExit(f"unexpected HTTP statuses: {sorted(statuses)}")
                durations = [sample[0] for sample in samples]
                print(
                    f"{mode} workers={workers} "
                    f"p50_ms={percentile(durations, 0.5):.2f} "
                    f"p95_ms={percentile(durations, 0.95):.2f} "
                    f"bytes={samples[0][2]} status=200",
                    flush=True,
                )


if __name__ == "__main__":
    main()
