import pytest

from app.services.portfolio import _covered_performance, _pnl_percent, _risk_statistics


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
