from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.schemas.stocks import Candle, Quote
from app.schemas.workspace import PortfolioAnalyzeRequest
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.market_data import market_data_service
from app.services.portfolio import PortfolioService, _covered_performance, _pnl_percent, _risk_statistics


def candles(seed: float = 100.0, count: int = 80, step: float = 0.002) -> list[Candle]:
    value = seed
    output = []
    for index in range(count):
        value *= 1 + step + ((index % 5) - 2) * 0.0004
        output.append({
            "time": (20_000 + index) * 86_400,
            "open": value,
            "high": value,
            "low": value,
            "close": value,
            "volume": 1_000_000 + index,
        })
    return [Candle(**item) for item in output]


def quote(symbol: str, price: float) -> Quote:
    return Quote(
        ticker=f"{symbol}.TO",
        symbol=symbol,
        name=symbol,
        exchange="TSX",
        currency="CAD",
        price=price,
        previous_close=price - 1,
        change=1,
        change_percent=1 / (price - 1) * 100,
        day_high=price + 1,
        day_low=price - 2,
        volume=1_000_000,
        timestamp=datetime.now(UTC),
        source="yahoo-public",
        delayed=True,
    )


def test_history_below_70_percent_is_not_used_for_risk_or_chart() -> None:
    returns, benchmark, performance, coverage = _covered_performance(
        {"RY": {1: 0.10, 2: 0.05}},
        {"RY": 0.69, "TD": 0.31},
        {1: 0.01, 2: 0.01},
    )
    assert coverage == 69
    assert returns == []
    assert benchmark == []
    assert performance == []
    assert _risk_statistics(returns, benchmark) == (None, None, None, None)


def test_history_at_70_percent_is_calculated_without_renormalizing_missing_weight() -> None:
    returns, benchmark, performance, coverage = _covered_performance(
        {"RY": {day: 0.10 + (day % 2) * 0.01 for day in range(1, 22)}},
        {"RY": 0.70, "TD": 0.30},
        {day: 0.01 + day / 10_000 for day in range(1, 22)},
    )
    assert coverage == 70
    assert returns[0] == pytest.approx(0.077)
    assert performance[0].portfolio == 100
    assert performance[1].portfolio == 107.7
    volatility, beta, drawdown, sharpe = _risk_statistics(returns, benchmark)
    assert volatility is not None
    assert beta is not None
    assert drawdown == 0
    assert sharpe is not None


def test_missing_day_is_not_renormalized_as_a_complete_portfolio() -> None:
    returns, _, performance, coverage = _covered_performance(
        {"RY": {1: 0.10, 2: 0.10}, "TD": {1: 0.20}},
        {"RY": 0.70, "TD": 0.30},
        {},
    )
    assert coverage == 85
    assert returns == pytest.approx([0.13, 0.07])
    assert performance[2].portfolio == 120.91


def test_small_or_recent_missing_history_uses_value_weighted_coverage() -> None:
    full = {day: 0.001 for day in range(1, 61)}
    recent = {day: 0.002 for day in range(51, 61)}
    returns, benchmark, performance, coverage = _covered_performance(
        {"RY": full, "NEW": recent, "SMALL": {}},
        {"RY": 0.78, "NEW": 0.20, "SMALL": 0.02},
        full,
    )
    assert coverage == pytest.approx(81.333333, rel=1e-5)
    assert len(returns) == 60
    assert len(performance) == 61
    assert performance[0].portfolio == 100
    assert all(value is not None for value in benchmark)


def test_missing_benchmark_keeps_portfolio_curve_and_historical_risk() -> None:
    values = [0.001 + (index % 3) * 0.0002 for index in range(60)]
    returns, benchmark, performance, coverage = _covered_performance(
        {"RY": {index + 1: value for index, value in enumerate(values)}},
        {"RY": 1.0},
        {},
    )
    volatility, beta, drawdown, sharpe = _risk_statistics(returns, benchmark)
    assert coverage == 100
    assert len(performance) == 61
    assert all(item.benchmark is None for item in performance)
    assert volatility is not None
    assert beta is None
    assert drawdown is not None
    assert sharpe is not None


def test_beta_aligns_only_shared_benchmark_sessions() -> None:
    returns = [0.001 + index / 100_000 for index in range(30)]
    benchmark: list[float | None] = [
        None if index in {3, 11, 22} else 0.0007 + index / 120_000
        for index in range(30)
    ]
    _volatility, beta, _drawdown, _sharpe = _risk_statistics(
        returns,
        benchmark,
    )
    assert beta is not None


def test_zero_cost_basis_keeps_pnl_percent_unavailable() -> None:
    assert _pnl_percent(100, 0) is None
    assert _pnl_percent(0, 100) == 0


@pytest.mark.asyncio
async def test_strict_history_forwards_bounded_retry_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    attempts_seen: list[int | None] = []

    async def history(
        ticker: str,
        range_: str,
        interval: str,
        attempts: int | None = None,
    ) -> list[Candle]:
        attempts_seen.append(attempts)
        return candles()

    monkeypatch.setattr(market_data_service.yahoo, "history", history)
    result = await market_data_service.get_history_many_strict(
        ["RY.TO"],
        attempts=2,
    )
    assert len(result["RY.TO"]) == 80
    assert attempts_seen == [2]


@pytest.mark.asyncio
async def test_portfolio_keeps_base_metrics_when_histories_are_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    quote = Quote(
        ticker="RY.TO",
        symbol="RY",
        name="Royal Bank",
        exchange="TSX",
        currency="CAD",
        price=140,
        previous_close=138,
        change=2,
        change_percent=1.4493,
        day_high=141,
        day_low=137,
        volume=1_000_000,
        timestamp=datetime.now(UTC),
        source="yahoo-public",
        delayed=True,
    )
    monkeypatch.setattr(market_data_service, "get_quotes", AsyncMock(return_value=[quote]))
    histories = AsyncMock(return_value={})
    monkeypatch.setattr(market_data_service, "get_history_many_strict", histories)
    monkeypatch.setattr(bank_of_canada_valet_service, "yields", AsyncMock(return_value={}))
    snapshot = await PortfolioService().analyze(PortfolioAnalyzeRequest(
        positions=[{"symbol": "RY", "quantity": 10, "average_cost": 120}],
        base_currency="CAD",
    ))
    assert snapshot.total_market_value == 1_400
    assert snapshot.total_unrealized_pnl == 200
    assert snapshot.positions[0].price == 140
    assert snapshot.performance == []
    assert snapshot.risk is not None
    assert snapshot.risk.history_coverage_percent == 0
    assert histories.await_count == 2
    core_call, optional_call = histories.await_args_list
    assert set(core_call.args[0]) == {"RY.TO", "^GSPTSE"}
    assert core_call.kwargs["deadline_seconds"] == 5.0
    assert core_call.kwargs["concurrency"] == 10
    assert core_call.kwargs["attempts"] == 1
    assert set(optional_call.args[0]) == {"CL=F", "CAD=X"}
    assert optional_call.kwargs["deadline_seconds"] == 2.0


@pytest.mark.asyncio
async def test_fast_portfolio_returns_base_metrics_without_loading_history(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    quote = Quote(
        ticker="RY.TO",
        symbol="RY",
        name="Royal Bank",
        exchange="TSX",
        currency="CAD",
        price=140,
        previous_close=138,
        change=2,
        change_percent=1.4493,
        day_high=141,
        day_low=137,
        volume=1_000_000,
        timestamp=datetime.now(UTC),
        source="yahoo-public",
        delayed=True,
    )
    monkeypatch.setattr(market_data_service, "get_quotes", AsyncMock(return_value=[quote]))
    histories = AsyncMock(side_effect=AssertionError("fast snapshots must not load history"))
    monkeypatch.setattr(market_data_service, "get_history_many_strict", histories)
    yields = AsyncMock(side_effect=AssertionError("fast snapshots must not load macro drivers"))
    monkeypatch.setattr(bank_of_canada_valet_service, "yields", yields)

    snapshot = await PortfolioService().analyze(PortfolioAnalyzeRequest(
        positions=[{"symbol": "RY", "quantity": 10, "average_cost": 120}],
        base_currency="CAD",
    ), fast=True)

    assert snapshot.total_market_value == 1_400
    assert snapshot.total_unrealized_pnl == 200
    assert snapshot.positions[0].price == 140
    histories.assert_not_awaited()
    yields.assert_not_awaited()
    assert not any("Couverture historique" in note for note in snapshot.notes)


@pytest.mark.asyncio
async def test_portfolio_uses_quote_normalization_for_core_history_and_logs_coverage(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    monkeypatch.setattr(
        market_data_service,
        "get_quotes",
        AsyncMock(return_value=[
            quote("RY", 200),
            quote("TD", 100),
            quote("XIC", 40),
        ]),
    )
    calls: list[tuple[list[str], dict]] = []

    async def histories(tickers: list[str], **kwargs) -> dict:
        calls.append((tickers, kwargs))
        if tickers == ["CL=F", "CAD=X"]:
            return {}
        return {
            ticker: candles(seed=100 + index * 10, step=0.001 + index * 0.0002)
            for index, ticker in enumerate(tickers)
        }

    monkeypatch.setattr(market_data_service, "get_history_many_strict", histories)
    monkeypatch.setattr(bank_of_canada_valet_service, "yields", AsyncMock(return_value={}))
    caplog.set_level("INFO", logger="app.services.portfolio")

    snapshot = await PortfolioService().analyze(PortfolioAnalyzeRequest(
        positions=[
            {"symbol": "RY", "quantity": 12, "average_cost": 122},
            {"symbol": "TD", "quantity": 18, "average_cost": 78},
            {"symbol": "XIC", "quantity": 25, "average_cost": 33},
        ],
        base_currency="CAD",
    ))

    assert set(calls[0][0]) == {"RY.TO", "TD.TO", "XIC.TO", "^GSPTSE"}
    assert calls[0][1]["attempts"] == 1
    assert calls[0][1]["concurrency"] == 10
    assert set(calls[1][0]) == {"CL=F", "CAD=X"}
    assert snapshot.risk is not None
    assert snapshot.risk.history_coverage_percent == 100
    assert snapshot.risk.volatility_percent is not None
    assert snapshot.risk.beta is not None
    assert snapshot.risk.max_drawdown_percent is not None
    assert snapshot.risk.sharpe_ratio is not None
    assert snapshot.portfolio_score is not None
    assert len(snapshot.performance) == 80
    assert snapshot.performance[0].portfolio == 100
    assert "portfolio_history ticker=RY.TO points=80 status=ok" in caplog.text
    assert "weighted_coverage=100.00%" in caplog.text

@pytest.mark.asyncio
async def test_portfolio_reuses_history_batch_for_identical_positions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    monkeypatch.setattr(
        market_data_service,
        "get_quotes",
        AsyncMock(return_value=[quote("RY", 200)]),
    )
    histories = AsyncMock(side_effect=[
        {"RY.TO": candles(), "^GSPTSE": candles(seed=120)},
        {},
    ])
    monkeypatch.setattr(
        market_data_service,
        "get_history_many_strict",
        histories,
    )
    monkeypatch.setattr(
        bank_of_canada_valet_service,
        "yields",
        AsyncMock(return_value={}),
    )

    service = PortfolioService()
    request = PortfolioAnalyzeRequest(
        positions=[
            {"symbol": "RY", "quantity": 12, "average_cost": 122},
        ],
        base_currency="CAD",
    )

    first = await service.analyze(request)
    second = await service.analyze(request)

    assert first.total_market_value == second.total_market_value
    # Core + optional drivers only once; the second analysis reuses both
    # history batches while refreshing current quotes.
    assert histories.await_count == 2

