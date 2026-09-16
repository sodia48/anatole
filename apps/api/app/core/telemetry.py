from __future__ import annotations

import re
import threading
from collections import Counter, defaultdict, deque
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any


_DYNAMIC_SEGMENTS = (
    re.compile(r"(/stocks/)[^/?]+", flags=re.IGNORECASE),
    re.compile(r"(/etfs/)[^/?]+", flags=re.IGNORECASE),
    re.compile(r"(/quotes/)[^/?]+", flags=re.IGNORECASE),
)


def normalize_path(path: str) -> str:
    """Regroupe les routes dynamiques pour garder des métriques lisibles."""
    normalized = path or "/"
    for pattern in _DYNAMIC_SEGMENTS:
        normalized = pattern.sub(r"\1{id}", normalized)
    return normalized[:180]


@dataclass(slots=True)
class RequestSample:
    path: str
    method: str
    status_code: int
    duration_ms: float
    request_id: str
    occurred_at: str


class ReliabilityMonitor:
    """Compteurs en mémoire pour le processus FastAPI courant.

    Le but est l'observabilité opérationnelle, pas l'archivage analytique.
    Les métriques sont réinitialisées lors d'un redémarrage Render.
    """

    def __init__(self) -> None:
        self._started_at = monotonic()
        self._lock = threading.Lock()
        self._total_requests = 0
        self._total_4xx = 0
        self._total_5xx = 0
        self._total_exceptions = 0
        self._slow_requests = 0
        self._reports_received = 0
        self._total_duration_ms = 0.0
        self._max_duration_ms = 0.0
        self._recent: deque[RequestSample] = deque(maxlen=240)
        self._recent_errors: deque[RequestSample] = deque(maxlen=24)
        self._last_report_at: str | None = None

    @property
    def uptime_seconds(self) -> float:
        return max(0.0, monotonic() - self._started_at)

    def record_request(
        self,
        *,
        path: str,
        method: str,
        status_code: int,
        duration_ms: float,
        request_id: str,
    ) -> None:
        sample = RequestSample(
            path=normalize_path(path),
            method=method.upper()[:12],
            status_code=int(status_code),
            duration_ms=round(max(0.0, duration_ms), 2),
            request_id=request_id[:64],
            occurred_at=datetime.now(UTC).isoformat(),
        )
        with self._lock:
            self._total_requests += 1
            self._total_duration_ms += sample.duration_ms
            self._max_duration_ms = max(
                self._max_duration_ms,
                sample.duration_ms,
            )
            if 400 <= sample.status_code < 500:
                self._total_4xx += 1
            if sample.status_code >= 500:
                self._total_5xx += 1
                self._recent_errors.append(sample)
            if sample.duration_ms >= 2_500:
                self._slow_requests += 1
            self._recent.append(sample)

    def record_exception(
        self,
        *,
        path: str,
        method: str,
        duration_ms: float,
        request_id: str,
    ) -> None:
        with self._lock:
            self._total_exceptions += 1
        self.record_request(
            path=path,
            method=method,
            status_code=500,
            duration_ms=duration_ms,
            request_id=request_id,
        )

    def record_report(self) -> None:
        with self._lock:
            self._reports_received += 1
            self._last_report_at = datetime.now(UTC).isoformat()

    @staticmethod
    def _percentile(values: list[float], percentile: float) -> float:
        if not values:
            return 0.0
        ordered = sorted(values)
        position = max(
            0,
            min(len(ordered) - 1, round((len(ordered) - 1) * percentile)),
        )
        return ordered[position]

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            recent = list(self._recent)
            errors = list(self._recent_errors)
            total_requests = self._total_requests
            total_4xx = self._total_4xx
            total_5xx = self._total_5xx
            total_exceptions = self._total_exceptions
            total_duration_ms = self._total_duration_ms
            max_duration_ms = self._max_duration_ms
            slow_requests = self._slow_requests
            reports_received = self._reports_received
            last_report_at = self._last_report_at

        durations = [sample.duration_ms for sample in recent]
        error_rate_5xx = (
            total_5xx / total_requests * 100 if total_requests else 0.0
        )
        status = (
            "critical"
            if error_rate_5xx >= 5
            else "degraded"
            if error_rate_5xx >= 1
            else "healthy"
        )

        route_groups: dict[str, list[RequestSample]] = defaultdict(list)
        for sample in recent:
            route_groups[sample.path].append(sample)

        route_metrics = []
        for route, samples in route_groups.items():
            route_durations = [sample.duration_ms for sample in samples]
            error_count = sum(sample.status_code >= 500 for sample in samples)
            budget_ms = (
                300.0
                if route in {"/health", "/api/v1/reliability/status"}
                else 1_500.0
            )
            p50 = self._percentile(route_durations, 0.50)
            p95 = self._percentile(route_durations, 0.95)
            route_metrics.append(
                {
                    "path": route,
                    "requests": len(samples),
                    "p50_duration_ms": round(p50, 2),
                    "p95_duration_ms": round(p95, 2),
                    "max_duration_ms": round(max(route_durations), 2),
                    "error_rate_5xx": round(
                        error_count / len(samples) * 100,
                        3,
                    ),
                    "budget_ms": budget_ms,
                    "within_budget": p95 <= budget_ms,
                }
            )

        route_metrics.sort(
            key=lambda item: (
                not item["within_budget"],
                item["p95_duration_ms"],
                item["requests"],
            ),
            reverse=True,
        )

        return {
            "status": status,
            "uptime_seconds": round(self.uptime_seconds, 1),
            "total_requests": total_requests,
            "total_4xx": total_4xx,
            "total_5xx": total_5xx,
            "total_exceptions": total_exceptions,
            "error_rate_5xx": round(error_rate_5xx, 3),
            "average_duration_ms": round(
                total_duration_ms / total_requests if total_requests else 0.0,
                2,
            ),
            "p95_duration_ms": round(self._percentile(durations, 0.95), 2),
            "max_duration_ms": round(max_duration_ms, 2),
            "slow_requests": slow_requests,
            "reports_received": reports_received,
            "last_report_at": last_report_at,
            "route_metrics": route_metrics[:24],
            "recent_errors": [asdict(sample) for sample in reversed(errors)],
        }


@dataclass(slots=True)
class PerformanceSample:
    kind: str
    name: str
    outcome: str
    duration_ms: float
    occurred_at: str


class PerformanceMonitor:
    """Bounded in-process performance telemetry for hot Anatole paths."""

    _BUDGETS_MS = {
        "upstream": 1_200.0,
        "redis": 80.0,
        "singleflight": 1_500.0,
    }

    def __init__(self, *, max_samples: int = 2_000) -> None:
        self._lock = threading.Lock()
        self._samples: deque[PerformanceSample] = deque(
            maxlen=max(100, int(max_samples))
        )
        self._counters: Counter[str] = Counter()

    def record(
        self,
        kind: str,
        name: str,
        outcome: str,
        *,
        duration_ms: float = 0.0,
    ) -> None:
        clean_kind = (kind or "unknown").strip().lower()[:40]
        clean_name = (name or "unknown").strip().lower()[:120]
        clean_outcome = (outcome or "unknown").strip().lower()[:40]
        sample = PerformanceSample(
            kind=clean_kind,
            name=clean_name,
            outcome=clean_outcome,
            duration_ms=round(max(0.0, float(duration_ms)), 3),
            occurred_at=datetime.now(UTC).isoformat(),
        )
        key = f"{clean_kind}:{clean_name}:{clean_outcome}"
        with self._lock:
            self._samples.append(sample)
            self._counters[key] += 1

    @staticmethod
    def _percentile(values: list[float], percentile: float) -> float:
        return ReliabilityMonitor._percentile(values, percentile)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            samples = list(self._samples)
            counters = dict(self._counters)

        groups: dict[tuple[str, str], list[PerformanceSample]] = defaultdict(list)
        for sample in samples:
            groups[(sample.kind, sample.name)].append(sample)

        latency = []
        violations = []
        for (kind, name), items in groups.items():
            durations = [item.duration_ms for item in items if item.duration_ms > 0]
            if not durations:
                continue
            p50 = self._percentile(durations, 0.50)
            p95 = self._percentile(durations, 0.95)
            budget = self._BUDGETS_MS.get(kind)
            entry = {
                "kind": kind,
                "name": name,
                "samples": len(durations),
                "p50_ms": round(p50, 2),
                "p95_ms": round(p95, 2),
                "max_ms": round(max(durations), 2),
                "budget_ms": budget,
                "within_budget": budget is None or p95 <= budget,
            }
            latency.append(entry)
            if budget is not None and p95 > budget:
                violations.append(entry)

        latency.sort(
            key=lambda item: (
                not item["within_budget"],
                item["p95_ms"],
                item["samples"],
            ),
            reverse=True,
        )

        cache = {
            "memory_hits": sum(
                count
                for key, count in counters.items()
                if key.startswith("cache:") and key.endswith(":hit")
            ),
            "memory_misses": sum(
                count
                for key, count in counters.items()
                if key.startswith("cache:") and key.endswith(":miss")
            ),
            "memory_stale_served": sum(
                count
                for key, count in counters.items()
                if key.startswith("cache:") and key.endswith(":stale")
            ),
            "local_singleflight_joins": sum(
                count
                for key, count in counters.items()
                if key.startswith("cache:") and key.endswith(":local_join")
            ),
            "redis_hits": sum(
                count
                for key, count in counters.items()
                if key.startswith("redis:") and key.endswith(":hit")
            ),
            "redis_misses": sum(
                count
                for key, count in counters.items()
                if key.startswith("redis:") and key.endswith(":miss")
            ),
            "redis_errors": sum(
                count
                for key, count in counters.items()
                if key.startswith("redis:")
                and (
                    key.endswith(":error")
                    or key.endswith(":unavailable")
                )
            ),
        }

        cache_requests = cache["memory_hits"] + cache["memory_misses"]
        cache["memory_hit_rate_percent"] = round(
            cache["memory_hits"] / cache_requests * 100
            if cache_requests
            else 0.0,
            2,
        )

        redis_requests = cache["redis_hits"] + cache["redis_misses"]
        cache["redis_hit_rate_percent"] = round(
            cache["redis_hits"] / redis_requests * 100
            if redis_requests
            else 0.0,
            2,
        )

        singleflight = {
            "owners": sum(
                count
                for key, count in counters.items()
                if key.startswith("singleflight:") and key.endswith(":owner")
            ),
            "peer_stale_served": sum(
                count
                for key, count in counters.items()
                if key.startswith("singleflight:") and key.endswith(":peer_stale")
            ),
            "peer_wait_hits": sum(
                count
                for key, count in counters.items()
                if key.startswith("singleflight:") and key.endswith(":peer_hit")
            ),
            "fallback_provider": sum(
                count
                for key, count in counters.items()
                if key.startswith("singleflight:")
                and key.endswith(":fallback_provider")
            ),
        }

        return {
            "sample_window": len(samples),
            "cache": cache,
            "singleflight": singleflight,
            "latency": latency[:40],
            "budget_violations": violations[:20],
        }


reliability_monitor = ReliabilityMonitor()
performance_monitor = PerformanceMonitor()
