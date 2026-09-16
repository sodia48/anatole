import asyncio
from datetime import UTC, datetime

import pytest

from app.core.data_hub import SharedDataHub
from app.core.distributed_cache import decode_snapshot, encode_snapshot
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
