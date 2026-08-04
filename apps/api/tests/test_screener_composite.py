from __future__ import annotations

import asyncio

import pytest

from app.services.screener import (
    ScreenerService,
)


def test_universe_normalization() -> None:
    service = ScreenerService()

    assert (
        service._normalize_universe(
            "composite"
        )
        == "composite"
    )
    assert (
        service._normalize_universe(
            "TSX Composite"
        )
        == "composite"
    )
    assert (
        service._normalize_universe(
            "tsx60"
        )
        == "tsx60"
    )

    with pytest.raises(ValueError):
        service._normalize_universe(
            "sp500"
        )


def test_composite_cache_is_longer() -> None:
    service = ScreenerService()

    assert (
        service._ttl("composite")
        > service._ttl("tsx60")
    )


def test_tsx60_constituents_are_available() -> None:
    service = ScreenerService()
    universe, constituents = asyncio.run(
        service._constituents("tsx60")
    )

    assert universe == "S&P/TSX 60"
    assert len(constituents) == 60
    assert all(
        item.ticker
        for item in constituents
    )
