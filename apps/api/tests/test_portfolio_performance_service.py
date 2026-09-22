from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from app.schemas.stocks import Candle
from app.schemas.workspace import PortfolioPerformanceRequest
from app.services.market_data import market_data_service
from app.services.portfolio_performance import PortfolioPerformanceService


def candles(
    seed: float,
    daily_return: float,
    count: int = 45,
) -> list[Candle]:
    start = datetime.now(UTC) - timedelta(days=count + 2)
    price = seed
    output: list[Candle] = []
    for index in range(count):
        price *= 1 + daily_return
        output.append(
            Candle(
                time=int((start + timedelta(days=index)).timestamp()),
                open=price,
                high=price,
                low=price,
                close=price,
                volume=1_000,
            )
        )
    return output


@pytest.mark.asyncio
async def test_portfolio_performance_supports_alternate_benchmark(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    histories = {
        "RY.TO": candles(100, 0.002),
        "TD.TO": candles(100, 0.001),
        "^GSPC": candles(100, 0.0012),
    }
    loader = AsyncMock(return_value=histories)
    monkeypatch.setattr(
        market_data_service,
        "get_history_many_strict",
        loader,
    )

    result = await PortfolioPerformanceService().analyze(
        PortfolioPerformanceRequest(
            positions=[
                {"symbol": "RY", "weight_percent": 60},
                {"symbol": "TD", "weight_percent": 40},
            ],
            benchmark="^GSPC",
            range="1m",
        )
    )

    assert result.benchmark == "^GSPC"
    assert result.benchmark_name == "S&P 500"
    assert result.range == "1m"
    assert result.coverage_percent == pytest.approx(100.0)
    assert result.portfolio_return_percent is not None
    assert result.benchmark_return_percent is not None
    assert result.excess_return_percent is not None
    assert len(result.points) >= 2

    kwargs = loader.await_args.kwargs
    assert kwargs["range_"] == "3mo"
    assert kwargs["interval"] == "1d"
    assert kwargs["attempts"] == 1


@pytest.mark.parametrize(
    ("range_", "provider_range"),
    [
        ("5y", "5y"),
        ("10y", "10y"),
    ],
)
@pytest.mark.asyncio
async def test_portfolio_performance_long_horizons_use_matching_provider_range(
    monkeypatch: pytest.MonkeyPatch,
    range_: str,
    provider_range: str,
) -> None:
    histories = {
        "RY.TO": candles(100, 0.001, count=90),
        "^GSPTSE": candles(100, 0.0008, count=90),
    }
    loader = AsyncMock(return_value=histories)
    monkeypatch.setattr(
        market_data_service,
        "get_history_many_strict",
        loader,
    )

    result = await PortfolioPerformanceService().analyze(
        PortfolioPerformanceRequest(
            positions=[
                {"symbol": "RY", "weight_percent": 100},
            ],
            benchmark="^GSPTSE",
            range=range_,
        )
    )

    assert result.range == range_
    assert result.points
    assert loader.await_args.kwargs["range_"] == provider_range
    assert loader.await_args.kwargs["deadline_seconds"] == 12.0
