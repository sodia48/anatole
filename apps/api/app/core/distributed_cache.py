from __future__ import annotations

import asyncio
import hashlib
import importlib
import json
import logging
import secrets
from datetime import date, datetime
from math import ceil
from time import time
from typing import Any, Awaitable, Callable

from pydantic import BaseModel
from redis.asyncio import Redis

from app.core.config import settings
from app.core.resilience import RemoteCacheBackend, RemoteCacheEntry

logger = logging.getLogger(__name__)

_WIRE_TAG = "__anatole_cache_type__"
_WIRE_VERSION = 1
_ALLOWED_MODEL_PREFIX = "app.schemas."


def _to_wire(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, datetime):
        return {_WIRE_TAG: "datetime", "value": value.isoformat()}
    if isinstance(value, date):
        return {_WIRE_TAG: "date", "value": value.isoformat()}
    if isinstance(value, BaseModel):
        return {
            _WIRE_TAG: "pydantic",
            "model": f"{value.__class__.__module__}:{value.__class__.__qualname__}",
            "data": _to_wire(value.model_dump(mode="python")),
        }
    if isinstance(value, tuple):
        return {_WIRE_TAG: "tuple", "items": [_to_wire(item) for item in value]}
    if isinstance(value, list):
        return [_to_wire(item) for item in value]
    if isinstance(value, dict):
        return {
            _WIRE_TAG: "dict",
            "items": [
                [_to_wire(key), _to_wire(item)]
                for key, item in value.items()
            ],
        }
    raise TypeError(f"Unsupported Redis snapshot type: {type(value).__name__}")


def _resolve_model(path: str) -> type[BaseModel]:
    module_name, separator, qualname = path.partition(":")
    if (
        not separator
        or not module_name.startswith(_ALLOWED_MODEL_PREFIX)
        or not qualname
    ):
        raise ValueError("Redis snapshot contains an invalid model reference")

    module = importlib.import_module(module_name)
    candidate: Any = module
    for part in qualname.split("."):
        candidate = getattr(candidate, part)

    if not isinstance(candidate, type) or not issubclass(candidate, BaseModel):
        raise ValueError("Redis snapshot model is not a Pydantic schema")
    return candidate


def _from_wire(value: Any) -> Any:
    if isinstance(value, list):
        return [_from_wire(item) for item in value]
    if not isinstance(value, dict):
        return value

    kind = value.get(_WIRE_TAG)
    if kind is None:
        return {key: _from_wire(item) for key, item in value.items()}
    if kind == "datetime":
        return datetime.fromisoformat(str(value["value"]))
    if kind == "date":
        return date.fromisoformat(str(value["value"]))
    if kind == "tuple":
        return tuple(_from_wire(item) for item in value["items"])
    if kind == "dict":
        return {
            _from_wire(key): _from_wire(item)
            for key, item in value["items"]
        }
    if kind == "pydantic":
        model = _resolve_model(str(value["model"]))
        data = _from_wire(value["data"])
        return model.model_validate(data)
    raise ValueError(f"Unknown Redis snapshot wire type: {kind!r}")


def encode_snapshot(value: Any) -> bytes:
    payload = {
        "version": _WIRE_VERSION,
        "stored_at": time(),
        "value": _to_wire(value),
    }
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8")


def decode_snapshot(payload: bytes) -> RemoteCacheEntry[Any]:
    document = json.loads(payload.decode("utf-8"))
    if not isinstance(document, dict) or document.get("version") != _WIRE_VERSION:
        raise ValueError("Unsupported Redis snapshot version")
    stored_at = float(document["stored_at"])
    age_seconds = max(0.0, time() - stored_at)
    return RemoteCacheEntry(
        value=_from_wire(document["value"]),
        age_seconds=age_seconds,
    )


def _key_digest(key: Any) -> str:
    encoded = json.dumps(
        _to_wire(key),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class RedisNamespaceBackend(RemoteCacheBackend[Any, Any]):
    def __init__(self, store: "RedisSnapshotStore", namespace: str) -> None:
        self._store = store
        self._namespace = namespace

    async def read(self, key: Any) -> RemoteCacheEntry[Any] | None:
        return await self._store.read(self._namespace, key)

    async def write(
        self,
        key: Any,
        value: Any,
        *,
        ttl_seconds: float,
    ) -> None:
        await self._store.write(
            self._namespace,
            key,
            value,
            ttl_seconds=ttl_seconds,
        )

    async def load_through(
        self,
        key: Any,
        loader: Callable[[], Awaitable[Any]],
        *,
        fresh_seconds: float,
        stale_seconds: float,
    ) -> RemoteCacheEntry[Any]:
        return await self._store.load_through(
            self._namespace,
            key,
            loader,
            fresh_seconds=fresh_seconds,
            stale_seconds=stale_seconds,
        )


class RedisSnapshotStore:
    """Best-effort shared snapshot layer.

    Redis is never on the critical success path. Reads and writes are bounded
    by a very short timeout. Any Redis error becomes a cache miss, leaving the
    in-memory cache and provider fallback unchanged.
    """

    def __init__(
        self,
        *,
        url: str,
        prefix: str = "anatole:cache:v1",
        timeout_seconds: float = 0.08,
        singleflight_lease_seconds: float = 30.0,
        singleflight_wait_seconds: float = 1.5,
        singleflight_poll_seconds: float = 0.05,
    ) -> None:
        self._url = url.strip()
        self._prefix = prefix.strip().strip(":") or "anatole:cache:v1"
        self._timeout_seconds = min(1.0, max(0.02, float(timeout_seconds)))
        self._singleflight_lease_seconds = min(
            120.0,
            max(2.0, float(singleflight_lease_seconds)),
        )
        self._singleflight_wait_seconds = min(
            10.0,
            max(0.0, float(singleflight_wait_seconds)),
        )
        self._singleflight_poll_seconds = min(
            1.0,
            max(0.01, float(singleflight_poll_seconds)),
        )
        self._client: Redis | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._url)

    def namespace(self, namespace: str) -> RedisNamespaceBackend:
        return RedisNamespaceBackend(self, namespace)

    def _redis_key(self, namespace: str, key: Any) -> str:
        safe_namespace = "".join(
            character
            if character.isalnum() or character in {"-", "_", "."}
            else "_"
            for character in namespace
        )
        return f"{self._prefix}:{safe_namespace}:{_key_digest(key)}"

    def _client_for_loop(self) -> Redis | None:
        if not self.enabled:
            return None
        current_loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not current_loop:
            self._client = Redis.from_url(
                self._url,
                decode_responses=False,
                socket_connect_timeout=self._timeout_seconds,
                socket_timeout=self._timeout_seconds,
                retry_on_timeout=False,
                health_check_interval=30,
            )
            self._loop = current_loop
        return self._client

    async def _read_once(
        self,
        namespace: str,
        key: Any,
    ) -> tuple[bool, RemoteCacheEntry[Any] | None]:
        client = self._client_for_loop()
        if client is None:
            return False, None

        try:
            async with asyncio.timeout(self._timeout_seconds):
                payload = await client.get(self._redis_key(namespace, key))
            if payload is None:
                return True, None
            if isinstance(payload, str):
                payload = payload.encode("utf-8")
            return True, decode_snapshot(payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug(
                "redis_snapshot_read_failed namespace=%s",
                namespace,
                exc_info=True,
            )
            return False, None

    async def read(
        self,
        namespace: str,
        key: Any,
    ) -> RemoteCacheEntry[Any] | None:
        _, entry = await self._read_once(namespace, key)
        return entry

    def _lease_key(self, namespace: str, key: Any) -> str:
        return f"{self._redis_key(namespace, key)}:fill-lock"

    async def _acquire_fill_lease(
        self,
        namespace: str,
        key: Any,
    ) -> tuple[bool, str | None]:
        client = self._client_for_loop()
        if client is None:
            return False, None

        token = secrets.token_urlsafe(24)
        try:
            async with asyncio.timeout(self._timeout_seconds):
                acquired = await client.set(
                    self._lease_key(namespace, key),
                    token,
                    nx=True,
                    px=max(
                        1,
                        ceil(self._singleflight_lease_seconds * 1000),
                    ),
                )
            return True, token if acquired else None
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug(
                "redis_fill_lease_acquire_failed namespace=%s",
                namespace,
                exc_info=True,
            )
            return False, None

    async def _release_fill_lease(
        self,
        namespace: str,
        key: Any,
        token: str,
    ) -> None:
        client = self._client_for_loop()
        if client is None:
            return

        script = (
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
            "return redis.call('del', KEYS[1]) else return 0 end"
        )
        try:
            async with asyncio.timeout(self._timeout_seconds):
                await client.eval(
                    script,
                    1,
                    self._lease_key(namespace, key),
                    token,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug(
                "redis_fill_lease_release_failed namespace=%s",
                namespace,
                exc_info=True,
            )

    async def _wait_for_peer_fill(
        self,
        namespace: str,
        key: Any,
        *,
        fresh_seconds: float,
    ) -> RemoteCacheEntry[Any] | None:
        if self._singleflight_wait_seconds <= 0:
            return None

        loop = asyncio.get_running_loop()
        deadline = loop.time() + self._singleflight_wait_seconds

        while loop.time() < deadline:
            await asyncio.sleep(self._singleflight_poll_seconds)
            available, entry = await self._read_once(namespace, key)
            if not available:
                return None
            if (
                entry is not None
                and max(0.0, float(entry.age_seconds)) <= fresh_seconds
            ):
                return entry

        return None

    async def _run_provider(
        self,
        loader: Callable[[], Awaitable[Any]],
        *,
        stale: RemoteCacheEntry[Any] | None,
    ) -> RemoteCacheEntry[Any]:
        try:
            value = await loader()
        except asyncio.CancelledError:
            raise
        except Exception:
            if stale is not None:
                return stale
            raise
        return RemoteCacheEntry(value=value, age_seconds=0.0)

    async def load_through(
        self,
        namespace: str,
        key: Any,
        loader: Callable[[], Awaitable[Any]],
        *,
        fresh_seconds: float,
        stale_seconds: float,
    ) -> RemoteCacheEntry[Any]:
        available, current = await self._read_once(namespace, key)

        if not available:
            return await self._run_provider(loader, stale=None)

        stale: RemoteCacheEntry[Any] | None = None
        if current is not None:
            current_age = max(0.0, float(current.age_seconds))
            if current_age <= fresh_seconds:
                return current
            if current_age <= stale_seconds:
                stale = RemoteCacheEntry(
                    value=current.value,
                    age_seconds=current_age,
                )

        lease_available, token = await self._acquire_fill_lease(
            namespace,
            key,
        )

        if not lease_available:
            return await self._run_provider(loader, stale=stale)

        if token is None:
            if stale is not None:
                return stale

            peer_value = await self._wait_for_peer_fill(
                namespace,
                key,
                fresh_seconds=fresh_seconds,
            )
            if peer_value is not None:
                return peer_value

            lease_available, token = await self._acquire_fill_lease(
                namespace,
                key,
            )
            if not lease_available or token is None:
                return await self._run_provider(loader, stale=None)

        try:
            result = await self._run_provider(loader, stale=stale)
            if result.age_seconds == 0.0:
                await self.write(
                    namespace,
                    key,
                    result.value,
                    ttl_seconds=stale_seconds,
                )
            return result
        finally:
            await self._release_fill_lease(
                namespace,
                key,
                token,
            )

    async def write(
        self,
        namespace: str,
        key: Any,
        value: Any,
        *,
        ttl_seconds: float,
    ) -> None:
        client = self._client_for_loop()
        if client is None:
            return

        try:
            payload = encode_snapshot(value)
            ttl = max(1, ceil(float(ttl_seconds)))
            async with asyncio.timeout(self._timeout_seconds):
                await client.set(
                    self._redis_key(namespace, key),
                    payload,
                    ex=ttl,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug(
                "redis_snapshot_write_failed namespace=%s",
                namespace,
                exc_info=True,
            )


redis_snapshot_store = RedisSnapshotStore(
    url=settings.redis_url,
    prefix=settings.redis_cache_prefix,
    timeout_seconds=settings.redis_cache_timeout_seconds,
    singleflight_lease_seconds=settings.redis_singleflight_lease_seconds,
    singleflight_wait_seconds=settings.redis_singleflight_wait_seconds,
    singleflight_poll_seconds=settings.redis_singleflight_poll_seconds,
)
