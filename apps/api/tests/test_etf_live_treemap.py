from __future__ import annotations

import asyncio

from app.data.etf_catalog import ETF_CATALOG
from app.services.etf import etf_service


def test_etf_snapshot_keeps_complete_catalog() -> None:
    snapshot = asyncio.run(etf_service.snapshot())

    assert len(snapshot.items) == len(ETF_CATALOG)
    assert len(snapshot.items) >= 100
    assert snapshot.categories
    assert snapshot.refresh_after_seconds == 15


def test_etf_items_are_groupable_and_quote_ready() -> None:
    snapshot = asyncio.run(etf_service.snapshot())

    for item in snapshot.items:
        assert item.ticker
        assert item.category
        assert item.provider
        assert item.price >= 0
        assert item.volume >= 0
