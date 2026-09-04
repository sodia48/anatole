from __future__ import annotations

import math
import statistics
from datetime import UTC, datetime

from app.schemas.stocks import Candle
from app.schemas.workspace import (
    PortfolioContributionResult,
    PortfolioCorrelationMatrix,
    PortfolioCoverage,
    PortfolioHorizonContribution,
    PortfolioHorizonResult,
    PortfolioPositionSnapshot,
    PortfolioStressTest,
)


MINIMUM_OBSERVATIONS = 40
MINIMUM_COVERAGE_PERCENT = 70.0
HORIZONS = ("1d", "1w", "1m", "3m", "ytd", "1y")
_SESSION_COUNTS = {"1w": 5, "1m": 21, "3m": 63, "1y": 252}


def daily_returns(candles: list[Candle]) -> dict[int, float]:
    output: dict[int, float] = {}
    for previous, current in zip(candles, candles[1:], strict=False):
        if previous.close > 0:
            output[current.time // 86_400] = current.close / previous.close - 1
    return output


def period_return(candles: list[Candle], horizon: str, now: datetime) -> float | None:
    ordered = sorted(candles, key=lambda item: item.time)
    if len(ordered) < 2 or ordered[-1].close <= 0:
        return None
    if horizon == "ytd":
        year_start = int(datetime(now.year, 1, 1, tzinfo=UTC).timestamp())
        eligible = [item for item in ordered if item.time >= year_start]
        if len(eligible) < 2 or eligible[0].close <= 0:
            return None
        return eligible[-1].close / eligible[0].close - 1
    sessions = _SESSION_COUNTS.get(horizon)
    if sessions is None or len(ordered) <= sessions or ordered[-sessions - 1].close <= 0:
        return None
    return ordered[-1].close / ordered[-sessions - 1].close - 1


def _coverage(expected: int, available: int, available_weight: float) -> PortfolioCoverage:
    return PortfolioCoverage(
        symbols_expected=expected,
        symbols_available=available,
        coverage_percent=round(max(0.0, min(100.0, available_weight * 100)), 2),
    )


def build_horizon_results(
    positions: list[PortfolioPositionSnapshot],
    histories: dict[str, list[Candle]],
    now: datetime,
) -> tuple[list[PortfolioHorizonResult], list[PortfolioContributionResult]]:
    performance: list[PortfolioHorizonResult] = []
    contributions: list[PortfolioContributionResult] = []
    expected = len(positions)
    for horizon in HORIZONS:
        values: list[tuple[PortfolioPositionSnapshot, float]] = []
        for position in positions:
            value = position.day_change_percent / 100 if horizon == "1d" else period_return(histories.get(position.symbol, []), horizon, now)
            if value is not None and math.isfinite(value):
                values.append((position, value))
        available_weight = sum((position.weight_percent / 100) for position, _ in values)
        coverage = _coverage(expected, len(values), available_weight)
        sufficient = coverage.coverage_percent >= MINIMUM_COVERAGE_PERCENT
        aggregate = sum(position.weight_percent / 100 * value for position, value in values) * 100 if sufficient else None
        methodology = "observed_day" if horizon == "1d" else "current_positions_reconstructed"
        performance.append(PortfolioHorizonResult(
            horizon=horizon,
            return_percent=round(aggregate, 2) if aggregate is not None else None,
            coverage=coverage,
            methodology=methodology,
        ))
        items = [
            PortfolioHorizonContribution(
                symbol=position.symbol,
                contribution_percent=round(position.weight_percent / 100 * value * 100, 2),
                security_return_percent=round(value * 100, 2),
                current_weight_percent=position.weight_percent,
            )
            for position, value in values
        ] if sufficient else []
        contributions.append(PortfolioContributionResult(
            horizon=horizon,
            items=sorted(items, key=lambda item: item.contribution_percent, reverse=True),
            coverage=coverage,
            methodology=methodology,
        ))
    return performance, contributions


def _pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) < MINIMUM_OBSERVATIONS or len(left) != len(right):
        return None
    left_deviation = [value - statistics.mean(left) for value in left]
    right_deviation = [value - statistics.mean(right) for value in right]
    denominator = math.sqrt(sum(value * value for value in left_deviation) * sum(value * value for value in right_deviation))
    if denominator <= 1e-12:
        return None
    return sum(a * b for a, b in zip(left_deviation, right_deviation, strict=False)) / denominator


def build_correlation_matrix(positions: list[PortfolioPositionSnapshot], histories: dict[str, list[Candle]]) -> PortfolioCorrelationMatrix:
    symbols = [position.symbol for position in positions]
    returns = {symbol: daily_returns(histories.get(symbol, [])) for symbol in symbols}
    values: list[list[float | None]] = []
    observations: list[list[int]] = []
    pairs: list[tuple[str, str, float]] = []
    for row_index, left in enumerate(symbols):
        row: list[float | None] = []
        counts: list[int] = []
        for column_index, right in enumerate(symbols):
            shared = sorted(set(returns[left]) & set(returns[right]))
            counts.append(len(shared))
            if row_index == column_index:
                correlation = 1.0 if len(shared) >= MINIMUM_OBSERVATIONS else None
            else:
                correlation = _pearson([returns[left][day] for day in shared], [returns[right][day] for day in shared])
            rounded = round(correlation, 4) if correlation is not None else None
            row.append(rounded)
            if column_index > row_index and rounded is not None:
                pairs.append((left, right, rounded))
        values.append(row)
        observations.append(counts)
    average = statistics.mean(pair[2] for pair in pairs) if pairs else None
    return PortfolioCorrelationMatrix(
        symbols=symbols,
        values=values,
        observations=observations,
        average_correlation=round(average, 4) if average is not None else None,
        highest_pair=max(pairs, key=lambda item: item[2]) if pairs else None,
        lowest_pair=min(pairs, key=lambda item: item[2]) if pairs else None,
    )


def factor_sensitivity(security: dict[int, float], factor: dict[int, float]) -> tuple[float | None, int]:
    shared = sorted(set(security) & set(factor))[-120:]
    if len(shared) < MINIMUM_OBSERVATIONS:
        return None, len(shared)
    x = [factor[day] for day in shared]
    y = [security[day] for day in shared]
    variance = statistics.variance(x)
    if variance <= 1e-12:
        return None, len(shared)
    covariance = sum((a - statistics.mean(x)) * (b - statistics.mean(y)) for a, b in zip(x, y, strict=False)) / (len(shared) - 1)
    return covariance / variance, len(shared)


def build_stress_tests(
    positions: list[PortfolioPositionSnapshot],
    histories: dict[str, list[Candle]],
    canada_10y: list[tuple[int, float]],
) -> list[PortfolioStressTest]:
    factors = {
        "tsx": ("TSX -5 %", -0.05, "percent", daily_returns(histories.get("^GSPTSE", []))),
        "wti": ("WTI -10 %", -0.10, "percent", daily_returns(histories.get("CL=F", []))),
        "cad_usd": ("CAD/USD +5 %", 0.05, "percent", daily_returns(histories.get("CAD=X", []))),
        "canada_10y": (
            "Canada 10 ans +50 pdb",
            0.5,
            "basis_points",
            {current[0] // 86_400: current[1] - previous[1] for previous, current in zip(canada_10y, canada_10y[1:], strict=False)},
        ),
    }
    security_returns = {position.symbol: daily_returns(histories.get(position.symbol, [])) for position in positions}
    output: list[PortfolioStressTest] = []
    for key, (label, shock, unit, factor) in factors.items():
        estimates: list[tuple[PortfolioPositionSnapshot, float]] = []
        for position in positions:
            sensitivity, _ = factor_sensitivity(security_returns[position.symbol], factor)
            if sensitivity is not None:
                estimates.append((position, sensitivity))
        available_weight = sum(position.weight_percent / 100 for position, _ in estimates)
        coverage = _coverage(len(positions), len(estimates), available_weight)
        estimate = sum(position.weight_percent / 100 * sensitivity * shock for position, sensitivity in estimates) * 100 if coverage.coverage_percent >= MINIMUM_COVERAGE_PERCENT else None
        output.append(PortfolioStressTest(
            key=key,
            label=label,
            shock=shock * 100 if unit == "percent" else shock * 100,
            shock_unit=unit,
            estimated_portfolio_change_percent=round(estimate, 2) if estimate is not None else None,
            coverage=coverage,
            methodology="Estimation fondée sur les sensibilités historiques; ce scénario n’est pas une prévision.",
        ))
    return output


def build_portfolio_risk_reading(
    positions: list[PortfolioPositionSnapshot],
    sector_weights: list[tuple[str, float]],
    correlation: PortfolioCorrelationMatrix,
) -> list[str]:
    if not positions:
        return []
    reading: list[str] = []
    if sector_weights:
        sector, weight = max(sector_weights, key=lambda item: item[1])
        reading.append(f"{weight:.1f} % du portefeuille est concentré dans le secteur {sector}.")
    reading.append(f"Les trois principales positions représentent {sum(item.weight_percent for item in positions[:3]):.1f} %.")
    if correlation.highest_pair is not None:
        left, right, value = correlation.highest_pair
        reading.append(f"{left} et {right} présentent une corrélation récente de {value:.2f}, calculée sur des rendements quotidiens partagés.")
    return reading
