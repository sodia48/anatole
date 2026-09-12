from __future__ import annotations

from time import monotonic

import pytest

from app.services.canada_360 import Canada360Service
from app.services.provincial_statistics import provincial_statistics_service


@pytest.mark.asyncio
async def test_successful_province_warm_invalidates_placeholder_cache(
    monkeypatch,
) -> None:
    service = Canada360Service()
    service._cache["fr"] = (monotonic(), object())  # type: ignore[assignment]

    async def fake_snapshot(*, region=None, lang="fr", force=False):
        return object()

    monkeypatch.setattr(
        provincial_statistics_service,
        "get_snapshot",
        fake_snapshot,
    )

    service._schedule_province_warm("fr")
    task = service._province_warm_tasks["fr"]
    await task

    assert "fr" not in service._cache
