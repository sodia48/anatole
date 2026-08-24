from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.schemas.paper_trading import PaperOrderRequest
from app.schemas.stocks import Candle, Quote
from app.services.accounts import AccountService
from app.services.broker import PaperBrokerAdapter
from app.services.market_data import market_data_service
from app.services.paper_trading import PAPER_SLIPPAGE_PERCENT, PaperTradingService


def quote(price: float = 100, timestamp: int = 1_000) -> Quote:
    return Quote(
        ticker="RY.TO",
        symbol="RY",
        name="Royal Bank",
        exchange="TSX",
        currency="CAD",
        price=price,
        previous_close=price - 1,
        change=1,
        change_percent=1,
        day_high=price + 1,
        day_low=price - 1,
        volume=1_000,
        timestamp=datetime.fromtimestamp(timestamp, UTC),
        source="test",
        delayed=True,
    )


@pytest.fixture()
def service(tmp_path: Path) -> PaperTradingService:
    accounts = AccountService(f"sqlite:///{tmp_path / 'paper.db'}")
    value = PaperTradingService(accounts)
    yield value
    accounts.engine.dispose()


@pytest.mark.asyncio
async def test_market_order_waits_for_next_observation_and_is_user_isolated(
    service: PaperTradingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def get_quote(_ticker: str) -> Quote:
        return quote()

    async def get_quotes(_tickers: list[str]) -> list[Quote]:
        return [quote(110, 1_001)]

    monkeypatch.setattr(market_data_service, "get_quote", get_quote)
    monkeypatch.setattr(market_data_service, "get_quotes", get_quotes)
    adapter = PaperBrokerAdapter(service)
    assert adapter.live_trading_enabled is False
    order = await adapter.place_order(
        "user-a",
        PaperOrderRequest(ticker="RY", side="buy", quantity=10),
    )
    await service.process_observation(
        "user-a",
        "RY",
        Candle(time=1_000, open=100, high=101, low=99, close=100, volume=1),
    )
    assert (await service.get_account("user-a")).orders[0].status == "pending"
    await service.process_observation(
        "user-a",
        "RY",
        Candle(time=1_001, open=110, high=112, low=109, close=111, volume=1),
    )
    account = await service.get_account("user-a")
    assert account.orders[0].status == "filled"
    assert account.orders[0].filled_price == pytest.approx(
        110 * (1 + PAPER_SLIPPAGE_PERCENT / 100)
    )
    assert account.positions[0].quantity == 10
    other = await service.get_account("user-b")
    assert other.positions == []
    assert other.orders == []
    with pytest.raises(LookupError):
        await service.cancel_order("user-b", order.id)


@pytest.mark.asyncio
async def test_limit_order_only_fills_when_future_price_crosses(
    service: PaperTradingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def get_quote(_ticker: str) -> Quote:
        return quote()

    async def get_quotes(_tickers: list[str]) -> list[Quote]:
        return [quote(99, 1_002)]

    monkeypatch.setattr(market_data_service, "get_quote", get_quote)
    monkeypatch.setattr(market_data_service, "get_quotes", get_quotes)
    await service.place_order(
        "limit-user",
        PaperOrderRequest(
            ticker="RY",
            side="buy",
            quantity=5,
            order_type="limit",
            limit_price=100,
        ),
    )
    await service.process_observation(
        "limit-user",
        "RY",
        Candle(time=1_001, open=102, high=104, low=101, close=103, volume=1),
    )
    assert (await service.get_account("limit-user")).orders[0].status == "pending"
    await service.process_observation(
        "limit-user",
        "RY",
        Candle(time=1_002, open=99, high=101, low=98, close=100, volume=1),
    )
    account = await service.get_account("limit-user")
    assert account.orders[0].status == "filled"
    assert account.orders[0].filled_price == 99


@pytest.mark.asyncio
async def test_stop_order_activates_only_when_level_is_reached(
    service: PaperTradingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def get_quote(_ticker: str) -> Quote:
        return quote()

    async def get_quotes(_tickers: list[str]) -> list[Quote]:
        return [quote(106, 1_002)]

    monkeypatch.setattr(market_data_service, "get_quote", get_quote)
    monkeypatch.setattr(market_data_service, "get_quotes", get_quotes)
    await service.place_order(
        "stop-market-user",
        PaperOrderRequest(
            ticker="RY",
            side="buy",
            quantity=1,
            order_type="stop",
            stop_price=105,
        ),
    )
    await service.process_observation(
        "stop-market-user",
        "RY",
        Candle(time=1_001, open=103, high=104, low=102, close=103, volume=1),
    )
    assert (await service.get_account("stop-market-user")).orders[0].status == "pending"
    await service.process_observation(
        "stop-market-user",
        "RY",
        Candle(time=1_002, open=104, high=106, low=103, close=105, volume=1),
    )
    filled = (await service.get_account("stop-market-user")).orders[0]
    assert filled.status == "filled"
    assert filled.filled_price == pytest.approx(
        105 * (1 + PAPER_SLIPPAGE_PERCENT / 100)
    )


@pytest.mark.asyncio
async def test_stop_limit_activation_requires_a_later_observation(
    service: PaperTradingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def get_quote(_ticker: str) -> Quote:
        return quote()

    async def get_quotes(_tickers: list[str]) -> list[Quote]:
        return [quote(105, 1_002)]

    monkeypatch.setattr(market_data_service, "get_quote", get_quote)
    monkeypatch.setattr(market_data_service, "get_quotes", get_quotes)
    await service.place_order(
        "stop-user",
        PaperOrderRequest(
            ticker="RY",
            side="buy",
            quantity=2,
            order_type="stop_limit",
            stop_price=105,
            limit_price=106,
        ),
    )
    activation = Candle(
        time=1_001,
        open=104,
        high=107,
        low=103,
        close=106,
        volume=1,
    )
    await service.process_observation("stop-user", "RY", activation)
    activated = (await service.get_account("stop-user")).orders[0]
    assert activated.status == "pending"
    assert activated.activated_at is not None
    await service.process_observation(
        "stop-user",
        "RY",
        Candle(time=1_002, open=105, high=106, low=104, close=105, volume=1),
    )
    filled = (await service.get_account("stop-user")).orders[0]
    assert filled.status == "filled"
    assert filled.filled_price == 105
