import asyncio

import pytest

from app.core.resilience import AsyncStaleCache, SharedHttpClient


def test_shared_http_client_never_reuses_a_pool_across_event_loops():
    client = SharedHttpClient()

    async def first_loop():
        await client.start()
        assert client._client is not None
        return client._client

    async def second_loop():
        await client.start()
        assert client._client is not None
        instance = client._client
        await client.close()
        return instance

    assert asyncio.run(first_loop()) is not asyncio.run(second_loop())


@pytest.mark.asyncio
async def test_single_flight_runs_loader_once():
    cache = AsyncStaleCache[str, int]()
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return 42

    results = await asyncio.gather(
        *[
            cache.get_or_load(
                "same",
                loader,
                fresh_seconds=10,
                stale_seconds=60,
            )
            for _ in range(20)
        ]
    )

    assert results == [42] * 20
    assert calls == 1


@pytest.mark.asyncio
async def test_stale_value_is_used_when_reload_fails():
    cache = AsyncStaleCache[str, int]()
    cache.store("quote", 7)

    async def loader() -> int:
        raise RuntimeError("temporary upstream failure")

    result = await cache.get_or_load(
        "quote",
        loader,
        fresh_seconds=0,
        stale_seconds=60,
    )

    assert result == 7
