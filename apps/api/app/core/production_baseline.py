from __future__ import annotations

import asyncio
import json
import logging
import statistics
from collections import defaultdict
from datetime import UTC, datetime
from time import time
from typing import Any

from redis.asyncio import Redis

from app.core.config import settings
from app.core.resilience import shared_http_client
from app.core.telemetry import performance_monitor, reliability_monitor

logger = logging.getLogger("anatole.production_baseline")

_SAMPLE_INTERVAL_SECONDS = 300.0
_RETENTION_SECONDS = 72 * 60 * 60
_KEY_SUFFIX = "production-baseline:v1:samples"


def _median(values: list[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def _percent(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 2)


def summarize_production_samples(
    samples: list[dict[str, Any]],
    *,
    requested_hours: int = 48,
) -> dict[str, Any]:
    requested_hours = max(1, min(72, int(requested_hours)))
    ordered = sorted(
        samples,
        key=lambda item: float(item.get("captured_ts") or 0.0),
    )
    expected_samples = max(
        1,
        int(requested_hours * 3600 / _SAMPLE_INTERVAL_SECONDS),
    )

    if not ordered:
        return {
            "enabled": True,
            "available": True,
            "requested_hours": requested_hours,
            "observed_hours": 0.0,
            "sample_count": 0,
            "expected_samples": expected_samples,
            "coverage_percent": 0.0,
            "sufficient": False,
            "process_restarts_detected": 0,
            "api": {},
            "cache": {},
            "slowest_routes": [],
            "slowest_upstreams": [],
            "recurring_budget_violations": [],
            "generated_at": datetime.now(UTC).isoformat(),
        }

    first_ts = float(ordered[0].get("captured_ts") or 0.0)
    last_ts = float(ordered[-1].get("captured_ts") or first_ts)
    observed_hours = max(0.0, (last_ts - first_ts) / 3600.0)
    coverage_percent = _percent(len(ordered) / expected_samples * 100.0)

    restarts = 0
    previous_uptime: float | None = None
    api_p95_values: list[float] = []
    api_5xx_values: list[float] = []
    memory_hit_rates: list[float] = []
    redis_hit_rates: list[float] = []
    redis_errors: list[float] = []

    route_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    provider_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    violation_counts: dict[str, int] = defaultdict(int)
    violation_opportunities: dict[str, int] = defaultdict(int)

    for sample in ordered:
        uptime = float(sample.get("uptime_seconds") or 0.0)
        if (
            previous_uptime is not None
            and uptime + _SAMPLE_INTERVAL_SECONDS < previous_uptime
        ):
            restarts += 1
        previous_uptime = uptime

        api_p95_values.append(float(sample.get("api_p95_ms") or 0.0))
        api_5xx_values.append(float(sample.get("error_rate_5xx") or 0.0))

        performance = sample.get("performance") or {}
        cache = performance.get("cache") or {}
        memory_hit_rates.append(
            float(cache.get("memory_hit_rate_percent") or 0.0)
        )
        redis_hit_rates.append(
            float(cache.get("redis_hit_rate_percent") or 0.0)
        )
        redis_errors.append(float(cache.get("redis_errors") or 0.0))

        for route in sample.get("route_metrics") or []:
            path = str(route.get("path") or "unknown")
            route_groups[path].append(route)
            key = f"route:{path}"
            violation_opportunities[key] += 1
            if not bool(route.get("within_budget", True)):
                violation_counts[key] += 1

        for item in performance.get("latency") or []:
            if str(item.get("kind") or "") != "upstream":
                continue
            name = str(item.get("name") or "unknown")
            provider_groups[name].append(item)
            key = f"upstream:{name}"
            violation_opportunities[key] += 1
            if not bool(item.get("within_budget", True)):
                violation_counts[key] += 1

    route_rows: list[dict[str, Any]] = []
    for path, rows in route_groups.items():
        p95_values = [
            float(row.get("p95_duration_ms") or 0.0)
            for row in rows
        ]
        request_values = [
            int(row.get("requests") or 0)
            for row in rows
        ]
        key = f"route:{path}"
        route_rows.append(
            {
                "path": path,
                "sample_windows": len(rows),
                "p95_median_ms": round(_median(p95_values), 2),
                "p95_peak_ms": round(max(p95_values, default=0.0), 2),
                "requests_peak_per_window": max(request_values, default=0),
                "budget_violation_percent": _percent(
                    violation_counts.get(key, 0)
                    / max(1, violation_opportunities.get(key, 0))
                    * 100.0
                ),
            }
        )
    route_rows.sort(
        key=lambda row: (
            row["p95_median_ms"],
            row["p95_peak_ms"],
            row["sample_windows"],
        ),
        reverse=True,
    )

    provider_rows: list[dict[str, Any]] = []
    for name, rows in provider_groups.items():
        p95_values = [
            float(row.get("p95_ms") or 0.0)
            for row in rows
        ]
        key = f"upstream:{name}"
        provider_rows.append(
            {
                "name": name,
                "sample_windows": len(rows),
                "p95_median_ms": round(_median(p95_values), 2),
                "p95_peak_ms": round(max(p95_values, default=0.0), 2),
                "budget_violation_percent": _percent(
                    violation_counts.get(key, 0)
                    / max(1, violation_opportunities.get(key, 0))
                    * 100.0
                ),
            }
        )
    provider_rows.sort(
        key=lambda row: (
            row["p95_median_ms"],
            row["p95_peak_ms"],
            row["sample_windows"],
        ),
        reverse=True,
    )

    violation_rows: list[dict[str, Any]] = []
    for name, opportunities in violation_opportunities.items():
        count = violation_counts.get(name, 0)
        if count <= 0:
            continue
        violation_rows.append(
            {
                "name": name,
                "violating_windows": count,
                "observed_windows": opportunities,
                "violation_percent": _percent(
                    count / max(1, opportunities) * 100.0
                ),
            }
        )
    violation_rows.sort(
        key=lambda row: (
            row["violation_percent"],
            row["violating_windows"],
        ),
        reverse=True,
    )

    sufficient = (
        observed_hours >= min(36.0, requested_hours * 0.75)
        and len(ordered) >= max(24, int(expected_samples * 0.25))
    )

    return {
        "enabled": True,
        "available": True,
        "requested_hours": requested_hours,
        "observed_hours": round(observed_hours, 2),
        "sample_count": len(ordered),
        "expected_samples": expected_samples,
        "coverage_percent": coverage_percent,
        "sufficient": sufficient,
        "process_restarts_detected": restarts,
        "api": {
            "p95_median_ms": round(_median(api_p95_values), 2),
            "p95_peak_ms": round(max(api_p95_values, default=0.0), 2),
            "error_rate_5xx_median_percent": round(
                _median(api_5xx_values),
                3,
            ),
            "error_rate_5xx_peak_percent": round(
                max(api_5xx_values, default=0.0),
                3,
            ),
        },
        "cache": {
            "memory_hit_rate_median_percent": round(
                _median(memory_hit_rates),
                2,
            ),
            "redis_hit_rate_median_percent": round(
                _median(redis_hit_rates),
                2,
            ),
            "redis_errors_peak_per_process": int(
                max(redis_errors, default=0.0)
            ),
        },
        "slowest_routes": route_rows[:10],
        "slowest_upstreams": provider_rows[:10],
        "recurring_budget_violations": violation_rows[:10],
        "generated_at": datetime.now(UTC).isoformat(),
    }


class ProductionBaselineStore:
    """Short-lived aggregate telemetry persisted in Anatole's shared Redis.

    No account, portfolio, request-id, IP, user-agent, feedback or raw request
    content is stored. Redis is best-effort and never sits on the interactive
    request success path.
    """

    def __init__(self) -> None:
        self._url = settings.redis_url.strip()
        prefix = settings.redis_cache_prefix.strip().strip(":")
        self._key = f"{prefix}:{_KEY_SUFFIX}"
        self._client: Redis | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._url)

    def _client_for_loop(self) -> Redis | None:
        if not self.enabled:
            return None
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop:
            self._client = Redis.from_url(
                self._url,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.75,
                retry_on_timeout=False,
                health_check_interval=30,
            )
            self._loop = loop
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:
                logger.debug(
                    "production_baseline_redis_close_failed",
                    exc_info=True,
                )
        self._client = None
        self._loop = None

    def _capture(self) -> dict[str, Any]:
        reliability = reliability_monitor.snapshot()
        performance = performance_monitor.snapshot()
        captured_ts = time()
        return {
            "captured_ts": captured_ts,
            "captured_at": datetime.fromtimestamp(
                captured_ts,
                tz=UTC,
            ).isoformat(),
            "uptime_seconds": reliability.get("uptime_seconds", 0.0),
            "total_requests": reliability.get("total_requests", 0),
            "api_p95_ms": reliability.get("p95_duration_ms", 0.0),
            "error_rate_5xx": reliability.get("error_rate_5xx", 0.0),
            "route_metrics": reliability.get("route_metrics", [])[:24],
            "performance": {
                "cache": performance.get("cache", {}),
                "singleflight": performance.get("singleflight", {}),
                "latency": performance.get("latency", [])[:40],
                "budget_violations": performance.get(
                    "budget_violations",
                    [],
                )[:20],
            },
            "upstream_metrics": shared_http_client.metrics.as_dict(),
        }

    async def record_once(self) -> bool:
        client = self._client_for_loop()
        if client is None:
            return False

        sample = self._capture()
        captured_ts = float(sample["captured_ts"])
        encoded = json.dumps(
            sample,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )

        try:
            async with asyncio.timeout(1.5):
                pipe = client.pipeline(transaction=False)
                pipe.zadd(self._key, {encoded: captured_ts})
                pipe.zremrangebyscore(
                    self._key,
                    0,
                    captured_ts - _RETENTION_SECONDS,
                )
                pipe.expire(
                    self._key,
                    _RETENTION_SECONDS + 12 * 3600,
                )
                await pipe.execute()
            return True
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "production_baseline_record_failed",
                exc_info=True,
            )
            return False

    async def run(self) -> None:
        if not self.enabled:
            logger.warning(
                "production_baseline_disabled redis_configured=false"
            )
            return

        logger.info(
            "production_baseline_started interval_seconds=%.0f retention_hours=%.0f",
            _SAMPLE_INTERVAL_SECONDS,
            _RETENTION_SECONDS / 3600,
        )
        try:
            while True:
                await self.record_once()
                await asyncio.sleep(_SAMPLE_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            raise
        finally:
            logger.info("production_baseline_stopped")

    async def summary(self, *, hours: int = 48) -> dict[str, Any]:
        hours = max(1, min(72, int(hours)))
        if not self.enabled:
            return {
                "enabled": False,
                "available": False,
                "reason": "redis_not_configured",
                "requested_hours": hours,
                "generated_at": datetime.now(UTC).isoformat(),
            }

        client = self._client_for_loop()
        if client is None:
            return {
                "enabled": False,
                "available": False,
                "reason": "redis_not_configured",
                "requested_hours": hours,
                "generated_at": datetime.now(UTC).isoformat(),
            }

        cutoff = time() - hours * 3600
        try:
            async with asyncio.timeout(1.5):
                payloads = await client.zrangebyscore(
                    self._key,
                    cutoff,
                    "+inf",
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "production_baseline_summary_failed",
                exc_info=True,
            )
            return {
                "enabled": True,
                "available": False,
                "reason": "redis_temporarily_unavailable",
                "requested_hours": hours,
                "generated_at": datetime.now(UTC).isoformat(),
            }

        samples: list[dict[str, Any]] = []
        for payload in payloads:
            try:
                decoded = json.loads(payload)
            except (TypeError, json.JSONDecodeError):
                continue
            if isinstance(decoded, dict):
                samples.append(decoded)

        return summarize_production_samples(
            samples,
            requested_hours=hours,
        )


production_baseline_store = ProductionBaselineStore()
