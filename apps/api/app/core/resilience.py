from __future__ import annotations

import asyncio
import logging
import os
import random
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from time import monotonic
from typing import Any, Awaitable, Callable, Generic, Hashable, TypeVar

import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")
K = TypeVar("K", bound=Hashable)

_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
_RETRYABLE_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.PoolTimeout,
    httpx.ReadError,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
    httpx.WriteError,
    httpx.WriteTimeout,
)


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float, minimum: float = 0.0) -> float:
    try:
        return max(minimum, float(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


@dataclass(slots=True)
class HttpMetrics:
    requests: int = 0
    retries: int = 0
    failures: int = 0
    active: int = 0
    peak_active: int = 0
    last_error: str | None = None

    def as_dict(self) -> dict[str, int | str | None]:
        return {
            "requests": self.requests,
            "retries": self.retries,
            "failures": self.failures,
            "active": self.active,
            "peak_active": self.peak_active,
            "last_error": self.last_error,
        }


class SharedHttpClient:
    """Client HTTP partagé par tout le processus FastAPI.

    Il évite de recréer des pools TCP/TLS, borne la pression sur les sources
    publiques et applique des retries uniquement aux erreurs temporaires.
    """

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None
        self._start_lock: asyncio.Lock | None = None
        self._semaphore: asyncio.Semaphore | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self.metrics = HttpMetrics()

    @property
    def started(self) -> bool:
        return self._client is not None and not self._client.is_closed

    async def start(self) -> None:
        current_loop = asyncio.get_running_loop()
        if self.started and self._loop is current_loop:
            return

        # Test clients and reloaders can replace their event loop while this
        # process-level service remains alive. A pool must never cross loops.
        if self._loop is not None and self._loop is not current_loop:
            self._client = None
            self._semaphore = None
            self._start_lock = None
            self._loop = None

        if self._start_lock is None:
            self._start_lock = asyncio.Lock()

        async with self._start_lock:
            if self.started and self._loop is current_loop:
                return

            max_concurrency = _env_int("UPSTREAM_MAX_CONCURRENCY", 12)
            max_connections = _env_int("UPSTREAM_MAX_CONNECTIONS", 12)
            max_keepalive = min(
                max_connections,
                _env_int("UPSTREAM_MAX_KEEPALIVE", 6),
            )

            timeout = httpx.Timeout(
                connect=_env_float("UPSTREAM_CONNECT_TIMEOUT_SECONDS", 4.0),
                read=_env_float("UPSTREAM_READ_TIMEOUT_SECONDS", 8.0),
                write=_env_float("UPSTREAM_WRITE_TIMEOUT_SECONDS", 5.0),
                pool=_env_float("UPSTREAM_POOL_TIMEOUT_SECONDS", 3.0),
            )
            limits = httpx.Limits(
                max_connections=max_connections,
                max_keepalive_connections=max_keepalive,
                keepalive_expiry=_env_float(
                    "UPSTREAM_KEEPALIVE_EXPIRY_SECONDS",
                    30.0,
                ),
            )

            self._semaphore = asyncio.Semaphore(max_concurrency)
            self._loop = current_loop
            self._client = httpx.AsyncClient(
                timeout=timeout,
                limits=limits,
                follow_redirects=True,
                trust_env=False,
                headers={
                    "Accept": "application/json,text/plain;q=0.9,*/*;q=0.5",
                    "Accept-Encoding": "gzip, deflate",
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 Anatole/1.0"
                    ),
                },
            )

    async def close(self) -> None:
        client = self._client
        owner_loop = self._loop
        self._client = None
        self._semaphore = None
        self._start_lock = None
        self._loop = None
        if client is not None and not client.is_closed and owner_loop is asyncio.get_running_loop():
            await client.aclose()

    @staticmethod
    def _retry_after(response: httpx.Response) -> float | None:
        value = response.headers.get("Retry-After")
        if not value:
            return None

        try:
            return max(0.0, min(float(value), 10.0))
        except ValueError:
            pass

        try:
            retry_at = parsedate_to_datetime(value)
            delay = retry_at.timestamp() - __import__("time").time()
            return max(0.0, min(delay, 10.0))
        except (TypeError, ValueError, OverflowError):
            return None

    @staticmethod
    def _backoff(attempt: int) -> float:
        base = min(0.35 * (2 ** attempt), 3.0)
        return base + random.uniform(0.0, 0.18)

    async def request(
        self,
        method: str,
        url: str,
        *,
        attempts: int | None = None,
        **kwargs: Any,
    ) -> httpx.Response:
        await self.start()
        assert self._client is not None
        assert self._semaphore is not None

        max_attempts = max(
            1,
            attempts
            or _env_int("UPSTREAM_REQUEST_ATTEMPTS", 2),
        )
        last_error: Exception | None = None

        for attempt in range(max_attempts):
            self.metrics.requests += 1
            try:
                async with self._semaphore:
                    self.metrics.active += 1
                    self.metrics.peak_active = max(
                        self.metrics.peak_active,
                        self.metrics.active,
                    )
                    try:
                        response = await self._client.request(
                            method,
                            url,
                            **kwargs,
                        )
                    finally:
                        self.metrics.active -= 1

                if response.status_code not in _RETRYABLE_STATUS_CODES:
                    response.raise_for_status()
                    return response

                if attempt == max_attempts - 1:
                    response.raise_for_status()

                self.metrics.retries += 1
                delay = self._retry_after(response)
                await asyncio.sleep(
                    delay if delay is not None else self._backoff(attempt)
                )
            except asyncio.CancelledError:
                raise
            except _RETRYABLE_ERRORS as error:
                last_error = error
                if attempt == max_attempts - 1:
                    break
                self.metrics.retries += 1
                await asyncio.sleep(self._backoff(attempt))
            except httpx.HTTPStatusError:
                raise

        self.metrics.failures += 1
        self.metrics.last_error = (
            f"{type(last_error).__name__}: {last_error}"
            if last_error is not None
            else "Upstream request failed"
        )
        assert last_error is not None
        raise last_error

    async def get_json(
        self,
        url: str,
        *,
        attempts: int | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        response = await self.request(
            "GET",
            url,
            attempts=attempts,
            **kwargs,
        )
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object")
        return payload


@dataclass(slots=True)
class _CacheEntry(Generic[T]):
    value: T
    stored_at: float


class AsyncStaleCache(Generic[K, T]):
    """Cache TTL avec stale-if-error et single-flight.

    Une seule coroutine recharge une clé donnée. Les autres attendent la même
    tâche au lieu de lancer un nouvel appel identique vers Yahoo.
    """

    def __init__(self, *, max_entries: int = 2048) -> None:
        self._entries: dict[K, _CacheEntry[T]] = {}
        self._inflight: dict[K, asyncio.Task[T]] = {}
        self._lock: asyncio.Lock | None = None
        self._max_entries = max_entries

    def _age(self, key: K, now: float) -> float | None:
        entry = self._entries.get(key)
        return None if entry is None else now - entry.stored_at

    def peek(
        self,
        key: K,
        *,
        max_age_seconds: float | None = None,
    ) -> T | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if (
            max_age_seconds is not None
            and monotonic() - entry.stored_at > max_age_seconds
        ):
            return None
        return entry.value

    def store(self, key: K, value: T) -> None:
        if len(self._entries) >= self._max_entries and key not in self._entries:
            oldest_key = min(
                self._entries,
                key=lambda candidate: self._entries[candidate].stored_at,
            )
            self._entries.pop(oldest_key, None)
        self._entries[key] = _CacheEntry(value=value, stored_at=monotonic())

    async def get_or_load(
        self,
        key: K,
        loader: Callable[[], Awaitable[T]],
        *,
        fresh_seconds: float,
        stale_seconds: float,
    ) -> T:
        now = monotonic()
        entry = self._entries.get(key)
        if entry is not None and now - entry.stored_at <= fresh_seconds:
            return entry.value

        if self._lock is None:
            self._lock = asyncio.Lock()

        async with self._lock:
            now = monotonic()
            entry = self._entries.get(key)
            if entry is not None and now - entry.stored_at <= fresh_seconds:
                return entry.value

            task = self._inflight.get(key)
            if task is None:
                task = asyncio.create_task(loader())
                self._inflight[key] = task

        try:
            value = await asyncio.shield(task)
            self.store(key, value)
            return value
        except asyncio.CancelledError:
            raise
        except Exception:
            entry = self._entries.get(key)
            if (
                entry is not None
                and monotonic() - entry.stored_at <= stale_seconds
            ):
                return entry.value
            raise
        finally:
            if task.done():
                if self._lock is None:
                    self._inflight.pop(key, None)
                else:
                    async with self._lock:
                        if self._inflight.get(key) is task:
                            self._inflight.pop(key, None)


shared_http_client = SharedHttpClient()
