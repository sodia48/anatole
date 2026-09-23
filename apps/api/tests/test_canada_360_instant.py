from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

import pytest

from app.schemas.canada_360 import Canada360Snapshot
from app.services.canada_360 import Canada360Service
from app.services.provincial_statistics import METRICS, ProvincialStatisticsService


def snap(tag: str) -> Canada360Snapshot:
    return Canada360Snapshot(
        language="fr", status="partial", macro=[], rates=[], markets=[],
        provinces=[], sources=[], issues=[tag], generated_at=datetime.now(UTC),
        refresh_after_seconds=1,
    )


@pytest.mark.asyncio
async def test_stale_snapshot_returns_immediately_and_refreshes(monkeypatch):
    service=Canada360Service(); old=snap("old"); new=snap("new")
    service._cache["fr"]=(monotonic()-20,old)
    started=asyncio.Event(); release=asyncio.Event()
    async def build(_lang):
        started.set(); await release.wait(); return new
    monkeypatch.setattr(service,"_build",build)
    assert await service.get_snapshot("fr") is old
    await asyncio.wait_for(started.wait(),1); release.set()
    await service._snapshot_refresh_tasks["fr"]
    assert service._cache["fr"][1] is new


@pytest.mark.asyncio
async def test_last_good_is_served_while_rehydrating(monkeypatch):
    service=Canada360Service(); old=snap("old"); new=snap("new")
    service._last_good["fr"]=old
    async def build(_lang): return new
    monkeypatch.setattr(service,"_build",build)
    assert await service.get_snapshot("fr") is old
    await service._snapshot_refresh_tasks["fr"]
    assert service._cache["fr"][1] is new


@pytest.mark.asyncio
async def test_province_build_has_bounded_parallelism(monkeypatch):
    service=ProvincialStatisticsService(); service.metric_concurrency=2
    active=0; peak=0
    async def metric(_client,_spec,_selected,_lang):
        nonlocal active,peak
        active+=1; peak=max(peak,active)
        try:
            await asyncio.sleep(0.02); return {},None
        finally: active-=1
    monkeypatch.setattr(service,"_metric_for_provinces",metric)
    result=await service._build("ALL","fr")
    assert len(METRICS)>2 and peak==2 and result.provinces


def test_web_contract_uses_last_good_without_forced_hydration():
    root=Path(__file__).resolve().parents[3]
    client=(root/"apps/web/components/canada/Canada360Client.tsx").read_text(encoding="utf-8")
    resilient=(root/"apps/web/lib/resilient-fetch.ts").read_text(encoding="utf-8")
    assert "readLastGoodJson<Snapshot>" in client
    assert "void load(controller.signal, false)" in client
    assert '"/api/anatole/api/v1/canada/overview"' in resilient
