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


@pytest.mark.parametrize("range_", ["5y", "10y", "max"])
@pytest.mark.asyncio
async def test_long_range_distinguishes_strict_and_partial_proxy(
    monkeypatch: pytest.MonkeyPatch, range_: str,
) -> None:
    start = datetime.now(UTC) - timedelta(days=3_650)
    def weekly(growth: float, count: int = 522) -> list[Candle]:
        price = 100.0
        output = []
        for index in range(count):
            price *= 1 + growth
            stamp = int((start + timedelta(days=index * 7)).timestamp())
            output.append(Candle(time=stamp, open=price, high=price, low=price,
                                 close=price, volume=1000))
        return output
    histories = {"A.TO": weekly(.004)[-78:], "B.TO": weekly(.001),
                 "C.TO": weekly(.002), "D.TO": weekly(.003),
                 "^GSPTSE": weekly(.0015)}
    monkeypatch.setattr(market_data_service, "get_history_many_strict", AsyncMock(return_value=histories))
    monkeypatch.setattr(market_data_service, "get_quotes", AsyncMock(return_value=[]))
    result = await PortfolioPerformanceService().analyze(PortfolioPerformanceRequest(
        positions=[{"symbol": symbol, "weight_percent": weight} for symbol, weight in
                   (("A", 42), ("B", 20), ("C", 20), ("D", 18))], range=range_,
    ))
    assert result.requested_range == range_
    assert result.history_status == "partial"
    assert result.effective_start is not None and result.effective_start.year >= 2025
    assert result.points == result.strict_points
    assert result.points[0].time > result.proxy_points[0].time
    assert result.coverage_percent == result.effective_coverage_percent == 100
    assert result.proxy_points[1].coverage_percent == pytest.approx(58)
    expected = 100 * (1 + (.20 * .001 + .20 * .002 + .18 * .003) / .58)
    assert result.proxy_points[1].portfolio == pytest.approx(expected, abs=.0001)
    assert result.proxy_points[0].benchmark == 100
    assert result.points[0].benchmark == 100
    if range_ == "max":
        assert result.requested_days is None
    else:
        assert result.requested_days is not None
        assert result.requested_window_coverage_percent < 50


@pytest.mark.parametrize("range_", ["5y", "10y"])
@pytest.mark.asyncio
async def test_long_range_is_full_when_eighty_percent_has_full_history(
    monkeypatch: pytest.MonkeyPatch, range_: str,
) -> None:
    start = datetime.now(UTC) - timedelta(days=3_660)
    def series(count: int) -> list[Candle]:
        return [Candle(time=int((start + timedelta(days=index * 7)).timestamp()),
                       open=100 + index, high=100 + index, low=100 + index,
                       close=100 + index, volume=1000) for index in range(count)]
    histories = {"A.TO": series(523), "B.TO": series(523)[-78:], "^GSPTSE": series(523)}
    monkeypatch.setattr(market_data_service, "get_history_many_strict", AsyncMock(return_value=histories))
    monkeypatch.setattr(market_data_service, "get_quotes", AsyncMock(return_value=[]))
    result = await PortfolioPerformanceService().analyze(PortfolioPerformanceRequest(
        positions=[{"symbol": "A", "weight_percent": 80},
                   {"symbol": "B", "weight_percent": 20}], range=range_,
    ))
    assert result.history_status == "full"
    assert result.effective_days >= result.requested_days * .9
    assert result.points[1].coverage_percent == pytest.approx(80)
    assert not result.proxy_points
