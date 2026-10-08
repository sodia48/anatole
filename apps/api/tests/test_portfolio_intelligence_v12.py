"""Numerical invariants for covariance risk, attribution, clusters and custom stress."""

import math
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.stocks import Candle
from app.schemas.workspace import (
    PortfolioContributionResult, PortfolioCorrelationMatrix, PortfolioCoverage,
    PortfolioFactorSensitivity, PortfolioHorizonContribution, PortfolioHorizonResult,
    PortfolioPositionSnapshot, PortfolioScenarioRequest,
)
from app.services.portfolio_intelligence_v12 import (
    build_attribution, build_correlation_clusters, build_risk_contributions,
    run_portfolio_scenarios, scenario_request_from_question,
)


def position(symbol: str, weight: float, sector: str = "Finance") -> PortfolioPositionSnapshot:
    return PortfolioPositionSnapshot(
        symbol=symbol, ticker=symbol, name=symbol, sector=sector, market="CA", currency="CAD",
        quantity=1, average_cost=90, price=100, fx_rate=1, cost_basis=90,
        market_value=weight * 100, unrealized_pnl=10, day_pnl=1,
        day_change_percent=1, weight_percent=weight, source="Fixture", delayed=False,
    )


def candles(phase: float, length: int = 100, constant: bool = False) -> list[Candle]:
    price = 100.0
    output = []
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for index in range(length):
        change = .01 if constant else .001 + .014 * math.sin(index * .31 + phase) + .006 * math.cos(index * .13 + phase)
        price *= 1 + change
        output.append(Candle(time=int((start + timedelta(days=index)).timestamp()),
                             open=price, high=price, low=price, close=price, volume=1000))
    return output


def test_covariance_risk_contribution_sums_to_100_with_real_coverage():
    positions = [position("A", 50), position("B", 30), position("C", 20)]
    history = {"A": candles(0), "B": candles(.5), "C": candles(1.4)}
    result = build_risk_contributions(positions, history)
    assert result.coverage.coverage_percent == 100
    assert result.observations >= 40
    assert result.portfolio_volatility_percent is not None
    assert len(result.items) == 3
    assert sum(item.risk_contribution_percent for item in result.items) == pytest.approx(100, abs=.01)
    assert sum(item.component_risk for item in result.items) == pytest.approx(result.portfolio_volatility_percent, abs=.01)
    assert any(abs(item.portfolio_weight_percent - item.risk_contribution_percent) > 1 for item in result.items)
    partial = build_risk_contributions(positions, {"A": history["A"], "B": history["B"]})
    assert partial.coverage.coverage_percent == 80
    assert partial.items
    insufficient = build_risk_contributions(positions, {"A": candles(0, 20), "B": candles(.5, 20), "C": candles(1, 20)})
    assert insufficient.items == [] and insufficient.portfolio_volatility_percent is None
    zero_variance = build_risk_contributions(positions, {symbol: candles(0, constant=True) for symbol in "ABC"})
    assert zero_variance.items == []


def test_attribution_preserves_position_and_sector_sums_and_methodology():
    positions = [position("A", 50, "Finance"), position("B", 30, "Finance"), position("C", 20, "Énergie")]
    coverage = PortfolioCoverage(symbols_expected=3, symbols_available=3, coverage_percent=100)
    performance = [
        PortfolioHorizonResult(horizon=horizon, return_percent=2, benchmark_return_percent=3,
            excess_return_percent=-1, coverage=coverage, methodology=method)
        for horizon, method in (("1d", "observed_day"), ("1m", "current_positions_reconstructed"))
    ]
    contributions = [
        PortfolioContributionResult(horizon=horizon, coverage=coverage, methodology=method, items=[
            PortfolioHorizonContribution(symbol="A", contribution_percent=2.5, security_return_percent=5, current_weight_percent=50),
            PortfolioHorizonContribution(symbol="B", contribution_percent=-.9, security_return_percent=-3, current_weight_percent=30),
            PortfolioHorizonContribution(symbol="C", contribution_percent=.4, security_return_percent=2, current_weight_percent=20),
        ]) for horizon, method in (("1d", "observed_day"), ("1m", "current_positions_reconstructed"))
    ]
    summary = build_attribution(positions, performance, contributions)
    assert len(summary) == 2
    for row in summary:
        assert sum(item.contribution_percent for item in row.contributions) == pytest.approx(row.portfolio_return_percent)
        assert row.excess_return_percent == -1
        assert row.top_contributors[0].symbol == "A"
        assert row.top_detractors[0].symbol == "B"
        assert row.sector_contributions == {"Finance": 1.6, "Énergie": .4}
        assert row.coverage.coverage_percent == 100
    assert summary[1].methodology == "current_positions_reconstructed"


def test_correlation_clusters_use_observed_edges_and_minimum_observations():
    symbols = ["A", "B", "C", "D", "E"]
    values = [[1 if i == j else None for j in range(5)] for i in range(5)]
    observations = [[80 for _ in range(5)] for _ in range(5)]
    for i, j, value in ((0, 1, .8), (1, 2, .75), (0, 2, .4), (3, 4, .9)):
        values[i][j] = values[j][i] = value
    observations[3][4] = observations[4][3] = 20
    matrix = PortfolioCorrelationMatrix(symbols=symbols, values=values, observations=observations)
    clusters = build_correlation_clusters(matrix, [position(symbol, weight) for symbol, weight in
                                                    zip(symbols, [30, 25, 20, 15, 10], strict=True)])
    assert len(clusters) == 1
    assert clusters[0].symbols == ["A", "B", "C"]
    assert clusters[0].combined_weight_percent == 75
    assert clusters[0].average_internal_correlation == pytest.approx((.8 + .75 + .4) / 3, abs=.0001)
    assert clusters[0].coverage_percent == 100


def test_custom_wti_20_percent_scenario_has_position_impacts_and_bounds():
    positions = [position("A", 50), position("B", 30), position("C", 20)]
    sensitivities = [PortfolioFactorSensitivity(symbol=symbol, factor="wti", beta=beta, observations=80)
                     for symbol, beta in (("A", 1.5), ("B", .5), ("C", .2))]
    request = scenario_request_from_question("Et si le pétrole chute de 20 % ?")
    assert request is not None and request.wti_percent == -20
    scenario = run_portfolio_scenarios(request, positions, sensitivities)[0]
    assert scenario.shock == -20 and scenario.coverage.coverage_percent == 100
    assert scenario.estimated_portfolio_change_percent == pytest.approx(-18.8)
    assert sum(item.contribution_percent_points for item in scenario.positions) == pytest.approx(-18.8)
    assert "scénario, pas prévision" in scenario.methodology
    unavailable = run_portfolio_scenarios(request, positions, sensitivities[:1])[0]
    assert unavailable.estimated_portfolio_change_percent is None
    assert unavailable.coverage.coverage_percent == 50
    with pytest.raises(ValidationError):
        PortfolioScenarioRequest(wti_percent=-81)
    with pytest.raises(ValidationError):
        PortfolioScenarioRequest(canada_10y_bps=501)
