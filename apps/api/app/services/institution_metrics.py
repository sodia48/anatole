"""Bounded, in-process SEC 13F telemetry; persistent run facts live in the store."""

from __future__ import annotations

import sys
import threading
import time
from collections import deque


class InstitutionRuntimeMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._durations: deque[float] = deque(maxlen=240)
        self._requests = 0
        self._response_bytes = 0
        self._sec_requests = 0
        self._cache_hits = 0
        self._cache_misses = 0
        self._stale_cache_served = 0
        self._active_searches = 0
        self._max_searches = 0

    def begin_search(self) -> None:
        with self._lock:
            self._active_searches += 1
            self._max_searches = max(self._max_searches, self._active_searches)

    def end_search(self) -> None:
        with self._lock:
            self._active_searches = max(0, self._active_searches - 1)

    def sec_request(self) -> None:
        with self._lock:
            self._sec_requests += 1

    def cache(self, *, hit: bool) -> None:
        with self._lock:
            if hit:
                self._cache_hits += 1
            else:
                self._cache_misses += 1

    def stale_served(self) -> None:
        with self._lock:
            self._stale_cache_served += 1

    def http(self, duration_ms: float, response_bytes: int | None) -> None:
        with self._lock:
            self._requests += 1
            self._durations.append(max(0.0, duration_ms))
            self._response_bytes += max(0, response_bytes or 0)

    def snapshot(self) -> dict[str, float | int | None]:
        with self._lock:
            durations = sorted(self._durations)
            requests = self._requests
            response_bytes = self._response_bytes
            sec_requests = self._sec_requests
            hits = self._cache_hits
            misses = self._cache_misses
            stale = self._stale_cache_served
            active = self._active_searches
            maximum = self._max_searches
        memory_mb = None
        if sys.platform != "win32":
            try:
                import resource
                usage = resource.getrusage(resource.RUSAGE_SELF)
                memory_mb = round(usage.ru_maxrss / (1024 if sys.platform.startswith("linux") else 1024 * 1024), 1)
            except (ImportError, OSError):
                pass
        return {
            "requests": requests,
            "p95_duration_ms": round(durations[min(len(durations) - 1, round((len(durations) - 1) * .95))], 1) if durations else 0.0,
            "response_bytes_observed": response_bytes,
            "sec_requests": sec_requests,
            "cache_hits": hits,
            "cache_misses": misses,
            "cache_hit_percent": round(hits / (hits + misses) * 100, 1) if hits + misses else None,
            "stale_cache_served": stale,
            "active_searches": active,
            "max_concurrent_searches": maximum,
            "process_cpu_seconds": round(time.process_time(), 1),
            "process_memory_high_water_mb": memory_mb,
        }


institution_runtime_metrics = InstitutionRuntimeMetrics()
