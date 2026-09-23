from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.schemas.stocks import Quote
from app.services.market_data import market_data_service
from app.services.session_quotes import session_quote_service


def make_quote(
    *,
    ticker: str,
    symbol: str,
    exchange: str,
    currency: str,
    native_currency: str,
    price: float,
) -> Quote:
    return Quote(
        ticker=ticker,
        symbol=symbol,
        name=symbol,
        exchange=exchange,
        currency=currency,
        native_currency=native_currency,
        fx_rate_to_cad=1.35 if native_currency == "USD" else 1.0,
        price=price,
        previous_close=price - 1,
        change=1,
        change_percent=0.5,
        day_high=price + 1,
        day_low=price - 1,
        volume=1_000_000,
        timestamp=datetime(2026, 9, 22, 16, 0, tzinfo=UTC),
        source="yahoo-public",
        delayed=True,
    )


@pytest.mark.asyncio
async def test_market_data_keeps_us_quote_after_internal_prefix_is_removed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    quote = make_quote(
        ticker="AAPL",
        symbol="AAPL",
        exchange="NMS",
        currency="CAD",
        native_currency="USD",
        price=310.5,
    )
    loader = AsyncMock(return_value=[quote])
    monkeypatch.setattr(session_quote_service, "get_quotes", loader)

    result = await market_data_service.get_quotes(["US:AAPL"])

    assert result == [quote]
    loader.assert_awaited_once()


@pytest.mark.asyncio
async def test_market_data_keeps_international_quote_after_internal_prefix_is_removed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    quote = make_quote(
        ticker="BMW.DE",
        symbol="BMW.DE",
        exchange="GER",
        currency="CAD",
        native_currency="EUR",
        price=145.0,
    )
    loader = AsyncMock(return_value=[quote])
    monkeypatch.setattr(session_quote_service, "get_quotes", loader)

    result = await market_data_service.get_quotes(["INTL:BMW.DE"])

    assert result == [quote]


@pytest.mark.asyncio
async def test_market_data_canadian_default_still_matches_tsx_quote(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    quote = make_quote(
        ticker="RY.TO",
        symbol="RY",
        exchange="TOR",
        currency="CAD",
        native_currency="CAD",
        price=205.0,
    )
    loader = AsyncMock(return_value=[quote])
    monkeypatch.setattr(session_quote_service, "get_quotes", loader)

    result = await market_data_service.get_quotes(["RY"])

    assert result == [quote]
