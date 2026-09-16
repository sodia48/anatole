import asyncio
from datetime import UTC, datetime

import pytest

from app.core.data_hub import SharedDataHub
from app.core.distributed_cache import (
    RedisSnapshotStore,
    decode_snapshot,
    encode_snapshot,
)
from app.core.resilience import RemoteCacheEntry
from app.schemas.stocks import Quote


class FakeRemoteBackend:
    def __init__(self, entry=None):
        self.entry = entry
        self.reads = 0
        self.writes = []

    async def read(self, key):
        self.reads += 1
        return self.entry

    async def write(self, key, value, *, ttl_seconds):
        self.writes.append((key, value, ttl_seconds))


class FakeSnapshotStore:
    enabled = True

    def __init__(self, backend):
        self.backend = backend
        self.requested_namespaces = []

    def namespace(self, namespace):
        self.requested_namespaces.append(namespace)
        return self.backend


@pytest.mark.asyncio
async def test_remote_fresh_snapshot_avoids_provider_load():
    backend = FakeRemoteBackend(RemoteCacheEntry(value=123.45, age_seconds=2))
    hub = SharedDataHub(snapshot_store=FakeSnapshotStore(backend))
    cache = hub.cache("quotes", max_entries=16)
    provider_calls = 0

    async def loader():
        nonlocal provider_calls
        provider_calls += 1
        return 999.0

    value = await cache.get_or_load(
        "RY",
        loader,
        fresh_seconds=30,
        stale_seconds=300,
    )

    assert value == 123.45
    assert provider_calls == 0
    assert backend.reads == 1


@pytest.mark.asyncio
async def test_remote_stale_snapshot_is_used_only_when_provider_fails():
    backend = FakeRemoteBackend(RemoteCacheEntry(value=88.0, age_seconds=90))
    hub = SharedDataHub(snapshot_store=FakeSnapshotStore(backend))
    cache = hub.cache("quotes", max_entries=16)

    async def loader():
        raise RuntimeError("provider unavailable")

    value = await cache.get_or_load(
        "SHOP",
        loader,
        fresh_seconds=30,
        stale_seconds=300,
    )

    assert value == 88.0
    assert cache.peek("SHOP", max_age_seconds=30) is None
    assert cache.peek("SHOP", max_age_seconds=300) == 88.0


@pytest.mark.asyncio
async def test_provider_success_is_published_without_blocking_result_path():
    backend = FakeRemoteBackend()
    hub = SharedDataHub(snapshot_store=FakeSnapshotStore(backend))
    cache = hub.cache("charts", max_entries=16)

    result = await cache.get_or_load(
        ("RY", "1d", "1m"),
        lambda: asyncio.sleep(0, result={"close": [100.0]}),
        fresh_seconds=30,
        stale_seconds=600,
    )

    assert result == {"close": [100.0]}
    for _ in range(10):
        if backend.writes:
            break
        await asyncio.sleep(0)

    assert backend.writes == [
        (("RY", "1d", "1m"), {"close": [100.0]}, 600)
    ]


def test_safe_json_snapshot_round_trip_preserves_anatole_types():
    quote = Quote(
        ticker="RY",
        symbol="RY.TO",
        name="Royal Bank of Canada",
        exchange="TOR",
        currency="CAD",
        native_currency="CAD",
        fx_rate_to_cad=1.0,
        price=205.25,
        previous_close=203.0,
        change=2.25,
        change_percent=1.108,
        day_high=206.0,
        day_low=202.5,
        volume=123456,
        timestamp=datetime(2026, 9, 15, 15, 30, tzinfo=UTC),
        source="test",
        delayed=False,
    )
    original = {
        "quote": quote,
        "series": [(1, 1.25), (2, 1.30)],
    }

    decoded = decode_snapshot(encode_snapshot(original)).value

    assert decoded["quote"] == quote
    assert decoded["series"] == [(1, 1.25), (2, 1.30)]

class FakeRedis:
    def __init__(self):
        self.data = {}
        self._lock = asyncio.Lock()
        self.fail = False

    async def get(self, key):
        if self.fail:
            raise ConnectionError("redis unavailable")
        async with self._lock:
            return self.data.get(key)

    async def set(self, key, value, *, ex=None, nx=False, px=None):
        if self.fail:
            raise ConnectionError("redis unavailable")
        async with self._lock:
            if nx and key in self.data:
                return None
            self.data[key] = value
            return True

    async def eval(self, script, numkeys, key, token):
        if self.fail:
            raise ConnectionError("redis unavailable")
        async with self._lock:
            if self.data.get(key) == token:
                self.data.pop(key, None)
                return 1
            return 0


class TestRedisSnapshotStore(RedisSnapshotStore):
    def __init__(self, client, **kwargs):
        super().__init__(
            url="redis://unit-test",
            timeout_seconds=0.08,
            singleflight_lease_seconds=5.0,
            singleflight_wait_seconds=0.8,
            singleflight_poll_seconds=0.01,
            **kwargs,
        )
        self._test_client = client

    def _client_for_loop(self):
        return self._test_client


@pytest.mark.asyncio
async def test_two_instances_share_one_provider_fill():
    redis = FakeRedis()
    first_store = TestRedisSnapshotStore(redis)
    second_store = TestRedisSnapshotStore(redis)
    first = first_store.namespace("quotes")
    second = second_store.namespace("quotes")
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.12)
        return {"price": 211.25}

    first_task = asyncio.create_task(
        first.load_through(
            "RY",
            loader,
            fresh_seconds=30,
            stale_seconds=300,
        )
    )
    await asyncio.sleep(0.01)
    second_task = asyncio.create_task(
        second.load_through(
            "RY",
            loader,
            fresh_seconds=30,
            stale_seconds=300,
        )
    )

    left, right = await asyncio.gather(first_task, second_task)

    assert left.value == {"price": 211.25}
    assert right.value == {"price": 211.25}
    assert calls == 1


@pytest.mark.asyncio
async def test_peer_refresh_serves_valid_stale_immediately_without_duplicate_provider():
    import json
    import time

    redis = FakeRedis()
    owner_store = TestRedisSnapshotStore(redis)
    peer_store = TestRedisSnapshotStore(redis)
    peer = peer_store.namespace("quotes")

    stale_document = json.loads(
        encode_snapshot({"price": 200.0}).decode("utf-8")
    )
    stale_document["stored_at"] = time.time() - 60.0
    snapshot_key = peer_store._redis_key("quotes", "RY")
    redis.data[snapshot_key] = json.dumps(
        stale_document,
        separators=(",", ":"),
    ).encode("utf-8")

    lease_key = owner_store._lease_key("quotes", "RY")
    redis.data[lease_key] = "another-instance"

    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return {"price": 999.0}

    result = await peer.load_through(
        "RY",
        loader,
        fresh_seconds=30,
        stale_seconds=300,
    )

    assert result.value == {"price": 200.0}
    assert result.age_seconds >= 59.0
    assert calls == 0


@pytest.mark.asyncio
async def test_redis_outage_falls_through_to_provider_without_breaking_request():
    redis = FakeRedis()
    redis.fail = True
    store = TestRedisSnapshotStore(redis)
    backend = store.namespace("quotes")
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return {"price": 205.0}

    result = await backend.load_through(
        "RY",
        loader,
        fresh_seconds=30,
        stale_seconds=300,
    )

    assert result.value == {"price": 205.0}
    assert result.age_seconds == 0.0
    assert calls == 1
