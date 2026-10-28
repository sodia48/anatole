"""Synthetic API benchmark; does not download or redistribute market data.

Run from apps/api: python scripts/benchmark_commodity_snapshots.py
The baseline executes the committed pre-change OptionsService with a simulated
200 ms upstream response, not a real CME PDF or a production benchmark.
"""
from __future__ import annotations

import asyncio
import json
import statistics
import subprocess
import sys
import types
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes import options as options_route
from app.core.config import settings
from app.core.resilience import AsyncStaleCache
from app.main import app
from app.schemas.options import OptionChainSnapshot, OptionContract, OptionSourceStatus
from app.services import options as current
from app.services.commodity_option_snapshots import CommodityOptionSnapshots

ROOT = Path(__file__).resolve().parents[3]
BASE_REF = "6e1e5cf41c26116faa455a355550209532fa37f4"
ROOTS = ("GC", "RB", "CL", "NG", "SI", "HG", "ZC", "ZS")


class MemoryRedis:
    def __init__(self):
        self.data = {}

    async def get(self, key):
        return self.data.get(key)


def synthetic(root: str) -> OptionChainSnapshot:
    rows = [OptionContract(symbol=f"{root}-{i}", underlying=root, market="commodities",
                           contract=f"{root}Z27", side="call" if i % 2 == 0 else "put",
                           strike=float(50 + i // 2), expiration="2027-11-25", exchange="TEST",
                           last=1.0, volume=1, open_interest=5, source="synthetic", delayed=True)
            for i in range(600)]
    return OptionChainSnapshot(market="commodities", symbol=root, provider_symbol=root,
                               name=root, category="test", exchange="TEST", contracts=rows,
                               expirations=["2027-11-25"], source_statuses=[OptionSourceStatus(
                                   source="synthetic", status="partial", detail="fixture only")],
                               generated_at=datetime.now(UTC))


def metrics(samples: list[float]) -> dict[str, float]:
    return {"p50_ms": round(statistics.median(samples), 2),
            "p95_ms": round(statistics.quantiles(samples, n=100, method="inclusive")[94], 2)}


async def run() -> None:
    source = subprocess.check_output(["git", "show", f"{BASE_REF}:apps/api/app/services/options.py"], cwd=ROOT, text=True, encoding="utf-8")
    baseline = types.ModuleType("options_benchmark_baseline")
    sys.modules[baseline.__name__] = baseline
    exec(compile(source, "baseline_options.py", "exec"), baseline.__dict__)
    snapshots = {root: synthetic(root) for root in ROOTS}
    redis = MemoryRedis()
    cache = CommodityOptionSnapshots(url="redis://synthetic", prefix="bench", client=redis)
    for root, snapshot in snapshots.items():
        redis.data[cache._key(root)] = snapshot.model_dump_json()
    baseline_calls = 0
    original_public_chain = baseline.public_commodity_options_service.chain
    original_options_service = options_route.options_service
    original_store = current.commodity_option_snapshots
    original_key = settings.barchart_api_key
    original_authorized = settings.commodity_options_barchart_authorized

    async def slow_fixture(root, expiration=None):
        nonlocal baseline_calls
        baseline_calls += 1
        await asyncio.sleep(0.2)
        snapshot = snapshots[root]
        return snapshot.contracts, snapshot.expirations, snapshot.source_statuses[0]

    try:
        baseline.public_commodity_options_service.chain = slow_fixture
        settings.barchart_api_key = ""
        settings.commodity_options_barchart_authorized = True
        current.commodity_option_snapshots = cache
        before: list[float] = []
        after: list[float] = []
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            options_route.options_service = baseline.OptionsService()
            options_route.options_service._chain_cache = AsyncStaleCache(max_entries=400)
            for root in ROOTS:
                start = perf_counter()
                response = await client.get("/api/v1/options/chain", params={"market": "commodities", "symbol": root})
                response.raise_for_status()
                before.append((perf_counter() - start) * 1000)
            options_route.options_service = current.OptionsService()
            for _ in range(10):
                for root in ROOTS:
                    start = perf_counter()
                    response = await client.get("/api/v1/options/chain", params={"market": "commodities", "symbol": root})
                    response.raise_for_status()
                    after.append((perf_counter() - start) * 1000)
        print(json.dumps({"kind": "synthetic; no real market or PDF data", "roots": ROOTS,
                          "contracts_per_root": 600, "baseline_upstream_delay_ms": 200,
                          "baseline_provider_calls": baseline_calls, "baseline": metrics(before),
                          "snapshot_requests": len(after), "snapshot": metrics(after)}, indent=2))
    finally:
        baseline.public_commodity_options_service.chain = original_public_chain
        options_route.options_service = original_options_service
        current.commodity_option_snapshots = original_store
        settings.barchart_api_key = original_key
        settings.commodity_options_barchart_authorized = original_authorized


if __name__ == "__main__":
    asyncio.run(run())
