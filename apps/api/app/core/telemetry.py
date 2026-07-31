from __future__ import annotations

import re
import threading
from collections import deque
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
            "recent_errors": [asdict(sample) for sample in reversed(errors)],
        }


reliability_monitor = ReliabilityMonitor()
