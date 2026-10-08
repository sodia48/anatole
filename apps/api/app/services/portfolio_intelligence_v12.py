"""Portfolio intelligence computed from histories already loaded by PortfolioService."""

from __future__ import annotations

import math
import re
import statistics
from datetime import datetime

from pydantic import ValidationError

from app.schemas.stocks import Candle
from app.schemas.workspace import (
    PortfolioAttributionHorizon, PortfolioCorrelationCluster, PortfolioCorrelationMatrix,
    PortfolioCoverage, PortfolioFactorSensitivity, PortfolioHorizonResult,
    PortfolioContributionResult, PortfolioPositionSnapshot, PortfolioRiskContribution,
    PortfolioRiskContributionSnapshot, PortfolioScenarioPositionImpact,
    PortfolioScenarioRequest, PortfolioScenarioResult,
)
from app.services.portfolio_intelligence import (
    MINIMUM_COVERAGE_PERCENT, MINIMUM_OBSERVATIONS, daily_returns, factor_sensitivity,
)

FACTOR_HISTORY = {"tsx": "^GSPTSE", "wti": "CL=F", "cad_usd": "CAD=X"}
_UNKNOWN = {"autres", "other", "unknown", "n/a", "non classé", "indisponible"}


def _coverage(expected: int, available: int, weight: float) -> PortfolioCoverage:
    return PortfolioCoverage(symbols_expected=expected, symbols_available=available,
                             coverage_percent=round(max(0.0, min(100.0, weight)), 2))


def build_risk_contributions(
    positions: list[PortfolioPositionSnapshot], histories: dict[str, list[Candle]],
) -> PortfolioRiskContributionSnapshot:
    """Euler volatility contributions for synchronized daily returns; no imputation."""
    returns = {row.symbol: daily_returns(histories.get(row.symbol, [])) for row in positions}
    eligible = [row for row in positions if len(returns[row.symbol]) >= MINIMUM_OBSERVATIONS]
    weight = sum(row.weight_percent for row in eligible)
    coverage = _coverage(len(positions), len(eligible), weight)
    dates = set.intersection(*(set(returns[row.symbol]) for row in eligible)) if eligible else set()
    observations = len(dates)
    empty = PortfolioRiskContributionSnapshot(coverage=coverage, observations=observations)
    if coverage.coverage_percent < MINIMUM_COVERAGE_PERCENT or observations < MINIMUM_OBSERVATIONS:
        return empty
    ordered = sorted(dates)[-252:]
    observations = len(ordered)
    series = [[returns[row.symbol][day] for day in ordered] for row in eligible]
    means = [statistics.mean(values) for values in series]
    cov = [[sum((x - means[i]) * (y - means[j])
                for x, y in zip(series[i], series[j], strict=True)) / (observations - 1)
            for j in range(len(eligible))] for i in range(len(eligible))]
    weights = [row.weight_percent / 100 for row in eligible]
    sigma_w = [sum(cov[i][j] * weights[j] for j in range(len(eligible))) for i in range(len(eligible))]
    variance = sum(weights[i] * sigma_w[i] for i in range(len(eligible)))
    if not math.isfinite(variance) or variance <= 1e-12:
        return empty
    daily_vol = math.sqrt(variance)
    annualization = math.sqrt(252) * 100
    items = [
        PortfolioRiskContribution(
            symbol=row.symbol, portfolio_weight_percent=row.weight_percent,
            standalone_volatility_percent=round(math.sqrt(max(0.0, cov[i][i])) * annualization, 2),
            component_risk=round(weights[i] * sigma_w[i] / daily_vol * annualization, 4),
            risk_contribution_percent=round(weights[i] * sigma_w[i] / variance * 100, 4),
            observations=observations,
        )
        for i, row in enumerate(eligible)
    ]
    return PortfolioRiskContributionSnapshot(
        items=sorted(items, key=lambda row: row.risk_contribution_percent, reverse=True),
        portfolio_volatility_percent=round(daily_vol * annualization, 4),
        coverage=coverage, observations=observations,
    )


def build_factor_sensitivities(
    positions: list[PortfolioPositionSnapshot], histories: dict[str, list[Candle]],
    canada_10y: list[tuple[int, float]],
) -> list[PortfolioFactorSensitivity]:
    factor_returns = {key: daily_returns(histories.get(ticker, []))
                      for key, ticker in FACTOR_HISTORY.items()}
    factor_returns["canada_10y"] = {
        current[0] // 86_400: current[1] - previous[1]
        for previous, current in zip(canada_10y, canada_10y[1:], strict=False)
    }
    output: list[PortfolioFactorSensitivity] = []
    for row in positions:
        security = daily_returns(histories.get(row.symbol, []))
        for key, factor in factor_returns.items():
            beta, count = factor_sensitivity(security, factor)
            if beta is not None and math.isfinite(beta):
                output.append(PortfolioFactorSensitivity(symbol=row.symbol, factor=key,
                                                          beta=round(beta, 6), observations=count))
    return output


def build_correlation_clusters(
    matrix: PortfolioCorrelationMatrix | None, positions: list[PortfolioPositionSnapshot],
    risk: PortfolioRiskContributionSnapshot | None = None, threshold: float = 0.70,
) -> list[PortfolioCorrelationCluster]:
    if matrix is None or not 0 <= threshold <= 1:
        return []
    count = len(matrix.symbols)
    parent = list(range(count))
    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i in range(count):
        for j in range(i + 1, count):
            value = matrix.values[i][j]
            if (value is not None and value >= threshold
                    and matrix.observations[i][j] >= matrix.minimum_observations):
                parent[root(j)] = root(i)
    groups: dict[int, list[int]] = {}
    for i in range(count):
        groups.setdefault(root(i), []).append(i)
    weights = {row.symbol: row.weight_percent for row in positions}
    risk_rank = {row.symbol: row.risk_contribution_percent for row in risk.items} if risk else {}
    clusters: list[PortfolioCorrelationCluster] = []
    for members in groups.values():
        if len(members) < 2:
            continue
        edges = [(matrix.values[i][j], matrix.observations[i][j])
                 for offset, i in enumerate(members) for j in members[offset + 1:]
                 if matrix.values[i][j] is not None
                 and matrix.observations[i][j] >= matrix.minimum_observations]
        if not edges:
            continue
        symbols = [matrix.symbols[i] for i in members]
        possible = len(members) * (len(members) - 1) // 2
        clusters.append(PortfolioCorrelationCluster(
            label=f"Cluster corrélé {len(clusters) + 1}", symbols=symbols,
            combined_weight_percent=round(sum(weights.get(symbol, 0) for symbol in symbols), 2),
            average_internal_correlation=round(statistics.mean(value for value, _ in edges), 4),
            observations=min(count for _, count in edges),
            coverage_percent=round(len(edges) / possible * 100, 2),
            top_risk_contributors=sorted(
                (symbol for symbol in symbols if symbol in risk_rank),
                key=lambda symbol: risk_rank[symbol], reverse=True)[:3],
        ))
    return sorted(clusters, key=lambda row: row.combined_weight_percent, reverse=True)


def build_attribution(
    positions: list[PortfolioPositionSnapshot],
    performance: list[PortfolioHorizonResult],
    contributions: list[PortfolioContributionResult],
) -> list[PortfolioAttributionHorizon]:
    sectors = {row.symbol: row.sector for row in positions}
    by_horizon = {row.horizon: row for row in performance}
    output: list[PortfolioAttributionHorizon] = []
    for row in contributions:
        perf = by_horizon.get(row.horizon)
        if perf is None:
            continue
        items = row.items if perf.return_percent is not None else []
        sector_totals: dict[str, float] = {}
        for item in items:
            sector = sectors.get(item.symbol, "").casefold()
            if sector and sector not in _UNKNOWN:
                label = sectors[item.symbol]
                sector_totals[label] = sector_totals.get(label, 0.0) + item.contribution_percent
        ranked = sorted(items, key=lambda item: item.contribution_percent, reverse=True)
        output.append(PortfolioAttributionHorizon(
            horizon=row.horizon, portfolio_return_percent=perf.return_percent,
            benchmark_return_percent=perf.benchmark_return_percent,
            excess_return_percent=perf.excess_return_percent,
            contributions=items, top_contributors=[item for item in ranked if item.contribution_percent > 0][:3],
            top_detractors=[item for item in reversed(ranked) if item.contribution_percent < 0][:3],
            sector_contributions={key: round(value, 2) for key, value in sector_totals.items()},
            coverage=row.coverage, methodology=row.methodology,
        ))
    return output


def run_portfolio_scenarios(
    request: PortfolioScenarioRequest, positions: list[PortfolioPositionSnapshot],
    sensitivities: list[PortfolioFactorSensitivity],
) -> list[PortfolioScenarioResult]:
    weights = {row.symbol: row.weight_percent / 100 for row in positions}
    output: list[PortfolioScenarioResult] = []
    for field, factor, unit in (
        ("tsx_percent", "tsx", "percent"), ("wti_percent", "wti", "percent"),
        ("cad_usd_percent", "cad_usd", "percent"), ("canada_10y_bps", "canada_10y", "basis_points"),
    ):
        shock = getattr(request, field)
        if shock is None:
            continue
        relevant = [row for row in sensitivities if row.factor == factor and row.symbol in weights]
        coverage = _coverage(len(positions), len(relevant),
                             sum(weights[row.symbol] * 100 for row in relevant))
        factor_change = shock / 100  # Percent shocks become fractions; bps become yield percentage points.
        impacts = [PortfolioScenarioPositionImpact(
            symbol=row.symbol, contribution_percent_points=round(weights[row.symbol] * row.beta * factor_change * 100, 4),
            sensitivity=row.beta, observations=row.observations,
        ) for row in relevant]
        sufficient = coverage.coverage_percent >= MINIMUM_COVERAGE_PERCENT
        output.append(PortfolioScenarioResult(
            factor=factor, shock=shock, shock_unit=unit,
            estimated_portfolio_change_percent=round(sum(row.contribution_percent_points for row in impacts), 2)
            if sufficient else None,
            positions=impacts if sufficient else [], coverage=coverage,
            limitations=[] if sufficient else ["Couverture de sensibilités inférieure à 70 %; impact non publié."],
        ))
    return output


def scenario_request_from_question(question: str) -> PortfolioScenarioRequest | None:
    text = question.casefold()
    factor = ("wti_percent" if any(word in text for word in ("pétrole", "petrole", "wti", "oil")) else
              "tsx_percent" if "tsx" in text else
              "cad_usd_percent" if any(word in text for word in ("cad/usd", "dollar canadien")) else
              "canada_10y_bps" if any(word in text for word in ("taux 10 ans", "10y", "points de base", "pdb", "bps")) else None)
    if factor is None:
        return None
    unit = r"(?:points? de base|pdb|bps)" if factor == "canada_10y_bps" else "%"
    match = re.search(rf"([+-]?\d{{1,3}}(?:[.,]\d+)?)\s*{unit}", text)
    if not match:
        return None
    value = float(match.group(1).replace(",", "."))
    if not match.group(1).startswith(("+", "-")):
        if any(cue in text for cue in ("baisse", "baisser", "chute", "recul", "diminue", "perd", "down", "drop")):
            value = -value
    try:
        return PortfolioScenarioRequest(**{factor: value})
    except ValidationError:
        return None
