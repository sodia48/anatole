import asyncio

import pytest

from app.core.data_hub import SharedDataHub


@pytest.mark.asyncio
async def test_named_cache_is_shared_and_coalesces_across_consumers():
    hub = SharedDataHub()
    left = hub.cache("quotes", max_entries=16)
    right = hub.cache("quotes", max_entries=16)

    assert left is right
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return {"price": 123.45}

    first, second = await asyncio.gather(
        left.get_or_load(
            "RY",
            loader,
            fresh_seconds=30,
            stale_seconds=300,
        ),
        right.get_or_load(
            "RY",
            loader,
            fresh_seconds=30,
            stale_seconds=300,
        ),
    )

    assert first == second == {"price": 123.45}
    assert calls == 1
    assert hub.namespaces() == ("quotes",)
    assert hub.describe() == {"quotes": 16}


def test_named_cache_rejects_conflicting_capacity():
    hub = SharedDataHub()
    hub.cache("history", max_entries=32)

    with pytest.raises(ValueError, match="already uses"):
        hub.cache("history", max_entries=64)
