from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

import pytest

from app.schemas.discovery import PsychologySnapshot
from app.services.psychology import PsychologyService


def snapshot(score: float = 60.0) -> PsychologySnapshot:
    return PsychologySnapshot(
        score=score,
        label="Confiance",
        change_20d=1.0,
        change_50d=2.0,
        volatility_20d=12.0,
        advance_ratio=55.0,
        components=[],
        generated_at=datetime.now(UTC),
        refresh_after_seconds=45,
        source="test",
    )


@pytest.mark.asyncio
async def test_fresh_psychology_cache_returns_without_refresh(
    monkeypatch,
) -> None:
    service = PsychologyService()
    cached = snapshot()
    service._cached = cached
    service._cached_at = monotonic()

    async def forbidden():
        raise AssertionError("fresh cache must not refresh")

    monkeypatch.setattr(service, "_refresh", forbidden)

    assert await service.get_snapshot() is cached


@pytest.mark.asyncio
async def test_stale_psychology_returns_immediately_and_refreshes_background(
    monkeypatch,
) -> None:
    service = PsychologyService()
    cached = snapshot(51.0)
    service._cached = cached
    service._cached_at = monotonic() - service.cache_ttl_seconds - 1
    gate = asyncio.Event()
    refreshed = snapshot(72.0)

    async def slow_refresh():
        await gate.wait()
        service._cached = refreshed
        service._cached_at = monotonic()
        return refreshed

    monkeypatch.setattr(service, "_refresh", slow_refresh)

    result = await asyncio.wait_for(service.get_snapshot(), 0.1)
    assert result is cached
    assert service._refresh_task is not None
    assert not service._refresh_task.done()

    gate.set()
    await service._refresh_task
    assert (await service.get_snapshot()).score == 72.0


@pytest.mark.asyncio
async def test_cold_psychology_timeout_keeps_single_flight_alive(
    monkeypatch,
) -> None:
    service = PsychologyService()
    service.cold_wait_seconds = 0.01
    gate = asyncio.Event()
    refreshed = snapshot(68.0)
    calls = 0

    async def slow_refresh():
        nonlocal calls
        calls += 1
        await gate.wait()
        service._cached = refreshed
        service._cached_at = monotonic()
        return refreshed

    monkeypatch.setattr(service, "_refresh", slow_refresh)

    with pytest.raises(RuntimeError, match="synchronisation"):
        await service.get_snapshot()

    task = service._refresh_task
    assert task is not None
    assert not task.done()

    with pytest.raises(RuntimeError, match="synchronisation"):
        await service.get_snapshot()
    assert calls == 1
    assert service._refresh_task is task

    gate.set()
    await task
    assert (await service.get_snapshot()).score == 68.0


def test_today_source_counter_is_dynamic() -> None:
    root = Path(__file__).resolve().parents[3]
    today = (
        root / "apps/web/app/aujourdhui/page.tsx"
    ).read_text(encoding="utf-8")
    assert "expectedSourceCount" in today
    assert "/8 sources" not in today
