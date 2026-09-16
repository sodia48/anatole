from __future__ import annotations

from threading import Lock
from typing import Any, Hashable, Protocol, TypeVar, cast

from app.core.distributed_cache import redis_snapshot_store
from app.core.resilience import AsyncStaleCache, RemoteCacheBackend

K = TypeVar("K", bound=Hashable)
T = TypeVar("T")


class _SnapshotStore(Protocol):
    @property
    def enabled(self) -> bool: ...

    def namespace(
        self,
        namespace: str,
    ) -> RemoteCacheBackend[Any, Any]: ...


class SharedDataHub:
    """Registry of process-wide caches, optionally mirrored through Redis.

    The in-process AsyncStaleCache remains the zero-latency first level. When a
    Redis URL is configured, misses can reuse a recent snapshot produced by a
    different API instance. Redis is strictly best-effort: timeouts, decode
    failures and outages always fall back to the existing memory/upstream path.
    """

    def __init__(
        self,
        *,
        snapshot_store: _SnapshotStore | None = None,
    ) -> None:
        self._caches: dict[str, AsyncStaleCache[Any, Any]] = {}
        self._capacities: dict[str, int] = {}
        self._registry_lock = Lock()
        self._snapshot_store = snapshot_store

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

            remote_backend: RemoteCacheBackend[Any, Any] | None = None
            if self._snapshot_store is not None and self._snapshot_store.enabled:
                remote_backend = self._snapshot_store.namespace(key)

            created: AsyncStaleCache[Any, Any] = AsyncStaleCache(
                max_entries=capacity,
                remote_backend=remote_backend,
                metric_namespace=key,
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


shared_data_hub = SharedDataHub(snapshot_store=redis_snapshot_store)
