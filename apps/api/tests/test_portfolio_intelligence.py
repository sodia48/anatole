from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.stocks import Candle
from app.schemas.workspace import PortfolioPositionSnapshot
from app.services.portfolio_intelligence import (
    build_correlation_matrix,
    build_horizon_results,
    build_portfolio_risk_reading,
    build_stress_tests,
    period_return,
)


def candles(seed: float = 100.0, count: int = 130, step: float = 0.002) -> list[Candle]:
    output: list[Candle] = []
    value = seed
    for index in range(count):
        value *= 1 + step + ((index % 5) - 2) * 0.0003
        output.append(Candle(time=(20_000 + index) * 86_400, open=value, high=value, low=value, close=value, volume=100_000 + index))
    return output


def position(symbol: str, weight: float) -> PortfolioPositionSnapshot:
    return PortfolioPositionSnapshot(
        symbol=symbol, ticker=f"{symbol}.TO", name=symbol, sector="Financials", currency="CAD",
        quantity=1, average_cost=90, price=100, fx_rate=1, cost_basis=90, market_value=100,
        unrealized_pnl=10, unrealized_pnl_percent=11.11, day_pnl=1, day_change_percent=1,
        weight_percent=weight, momentum_20d=4, rsi_14=55, relative_volume=1.2, trend="Haussière",
        score=65, source="Yahoo Finance", delayed=True,
    )


def test_horizon_reconstruction_preserves_nd_below_70_percent_coverage() -> None:
    positions = [position("RY", 60), position("TD", 40)]
    performance, contributions = build_horizon_results(
        positions,
        {"RY": candles()},
        datetime(2026, 9, 3, tzinfo=UTC),
    )
    one_month = next(item for item in performance if item.horizon == "1m")
    assert one_month.coverage.coverage_percent == 60
    assert one_month.return_percent is None
    assert next(item for item in contributions if item.horizon == "1m").items == []
    assert next(item for item in performance if item.horizon == "1d").return_percent == 1


def test_period_return_requires_real_strict_history() -> None:
    assert period_return(candles(count=10), "1m", datetime(2026, 9, 3, tzinfo=UTC)) is None
    assert period_return(candles(count=30), "1m", datetime(2026, 9, 3, tzinfo=UTC)) is not None


def test_correlations_require_40_shared_observations() -> None:
    positions = [position("RY", 50), position("TD", 50)]
    insufficient = build_correlation_matrix(positions, {"RY": candles(count=30), "TD": candles(count=30)})
    assert insufficient.values[0][1] is None
    complete = build_correlation_matrix(positions, {"RY": candles(), "TD": candles(step=0.0015)})
    assert complete.values[0][1] is not None
    assert complete.observations[0][1] >= 40


def test_stress_scenarios_use_sensitivities_and_yield_level_changes() -> None:
    positions = [position("RY", 100)]
    history = candles()
    yields = [((20_000 + index) * 86_400, 3.0 + index * 0.002 + (index % 3) * 0.001) for index in range(130)]
    results = build_stress_tests(
        positions,
        {"RY": history, "^GSPTSE": candles(step=0.0018), "CL=F": candles(step=0.003), "CAD=X": candles(step=0.001)},
        yields,
    )
    assert {item.key for item in results} == {"tsx", "wti", "cad_usd", "canada_10y"}
    assert all(item.estimated_portfolio_change_percent is not None for item in results)
    canada = next(item for item in results if item.key == "canada_10y")
    assert canada.shock == 50
    assert canada.shock_unit == "basis_points"
    assert "n’est pas une prévision" in canada.methodology


def test_risk_reading_is_deterministic_and_never_recommends() -> None:
    positions = [position("RY", 55), position("TD", 45)]
    correlation = build_correlation_matrix(positions, {"RY": candles(), "TD": candles(step=0.0015)})
    reading = build_portfolio_risk_reading(positions, [("Financials", 100)], correlation)
    assert reading[0] == "100.0 % du portefeuille est concentré dans le secteur Financials."
    serialized = " ".join(reading).casefold()
    assert "acheter" not in serialized
    assert "vendre" not in serialized
