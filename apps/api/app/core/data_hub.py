from __future__ import annotations

from threading import Lock
from typing import Any, Hashable, TypeVar, cast

from app.core.resilience import AsyncStaleCache

K = TypeVar("K", bound=Hashable)
T = TypeVar("T")


class SharedDataHub:
    """Registry of process-wide stale caches used by market-data services.

    Phase 3A deliberately keeps the backing store in memory. Services ask for a
    stable namespace instead of owning isolated caches, so duplicate service
    instances share the same snapshot and the same single-flight loader. A
    later Redis backend can sit behind this boundary without changing callers.
    """

    def __init__(self) -> None:
        self._caches: dict[str, AsyncStaleCache[Any, Any]] = {}
        self._capacities: dict[str, int] = {}
        self._registry_lock = Lock()

    def cache(
        self,
        namespace: str,
        *,
        max_entries: int = 2048,
    ) -> AsyncStaleCache[K, T]:
        key = namespace.strip()
        if not key:
            raise ValueError("Data Hub namespace cannot be empty")
        capacity = max(1, int(max_entries))

        with self._registry_lock:
            existing = self._caches.get(key)
            if existing is not None:
                configured = self._capacities[key]
                if configured != capacity:
                    raise ValueError(
                        f"Data Hub namespace {key!r} already uses "
                        f"max_entries={configured}, requested {capacity}"
                    )
                return cast(AsyncStaleCache[K, T], existing)

            created: AsyncStaleCache[Any, Any] = AsyncStaleCache(
                max_entries=capacity
            )
            self._caches[key] = created
            self._capacities[key] = capacity
            return cast(AsyncStaleCache[K, T], created)

    def namespaces(self) -> tuple[str, ...]:
        with self._registry_lock:
            return tuple(sorted(self._caches))

    def describe(self) -> dict[str, int]:
        with self._registry_lock:
            return dict(self._capacities)


shared_data_hub = SharedDataHub()
