from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.schemas.stocks import Quote
from app.schemas.workspace import PortfolioAnalyzeRequest
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.market_data import market_data_service
from app.services.portfolio import PortfolioService, _covered_performance, _pnl_percent, _risk_statistics


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
    assert performance[0].portfolio == 107.7
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
    assert performance[1].portfolio == 120.91


def test_zero_cost_basis_keeps_pnl_percent_unavailable() -> None:
    assert _pnl_percent(100, 0) is None
    assert _pnl_percent(0, 100) == 0


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
    assert histories.await_args.kwargs["deadline_seconds"] == 4.0


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
