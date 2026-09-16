from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class HotsetPolicy:
    level: str
    poll_seconds: float
    tsx60_seconds: float
    psychology_seconds: float
    composite_seconds: float
    discovery_seconds: float


_HEALTHY = HotsetPolicy(
    level="healthy",
    poll_seconds=10.0,
    tsx60_seconds=20.0,
    psychology_seconds=60.0,
    composite_seconds=100.0,
    discovery_seconds=120.0,
)

_PRESSURED = HotsetPolicy(
    level="pressured",
    poll_seconds=15.0,
    tsx60_seconds=40.0,
    psychology_seconds=90.0,
    composite_seconds=150.0,
    discovery_seconds=240.0,
)

_SEVERE = HotsetPolicy(
    level="severe",
    poll_seconds=20.0,
    tsx60_seconds=90.0,
    psychology_seconds=180.0,
    composite_seconds=300.0,
    discovery_seconds=360.0,
)


def _number(payload: Mapping[str, Any], key: str) -> float:
    try:
        return max(0.0, float(payload.get(key) or 0.0))
    except (TypeError, ValueError):
        return 0.0


def _max_upstream_p95(performance: Mapping[str, Any]) -> float:
    maximum = 0.0
    latency = performance.get("latency")
    if not isinstance(latency, list):
        return maximum

    for item in latency:
        if not isinstance(item, Mapping):
            continue
        if str(item.get("kind") or "").lower() != "upstream":
            continue
        try:
            maximum = max(maximum, float(item.get("p95_ms") or 0.0))
        except (TypeError, ValueError):
            continue
    return maximum


def choose_hotset_policy(
    reliability: Mapping[str, Any],
    performance: Mapping[str, Any],
) -> HotsetPolicy:
    """Choose how aggressively background warming may use providers.

    The public hotset is useful only when it does not compete with interactive
    traffic. Until enough requests are observed, keep the established healthy
    cadence. Once the process has a meaningful sample, progressively back off
    background work when API or upstream p95/error signals degrade.
    """

    total_requests = int(_number(reliability, "total_requests"))
    if total_requests < 20:
        return _HEALTHY

    api_p95 = _number(reliability, "p95_duration_ms")
    error_rate = _number(reliability, "error_rate_5xx")
    upstream_p95 = _max_upstream_p95(performance)

    if (
        error_rate >= 3.0
        or api_p95 >= 2_500.0
        or upstream_p95 >= 2_500.0
    ):
        return _SEVERE

    if (
        error_rate >= 1.0
        or api_p95 >= 1_500.0
        or upstream_p95 >= 1_200.0
    ):
        return _PRESSURED

    return _HEALTHY
