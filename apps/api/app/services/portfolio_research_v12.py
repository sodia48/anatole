"""Typed, bounded portfolio evidence assembled from one V12 snapshot."""

from __future__ import annotations

from datetime import UTC, datetime, time
from typing import Literal

from app.schemas.assistant_context import (
    AnatoleEvidenceBundle, PortfolioConcentrationMap, PortfolioLookThroughHolding,
    PortfolioLookThroughOverlap, PortfolioLookThroughSummary, PortfolioMacroExposure,
    PortfolioWatchtowerAggregate, PortfolioWatchtowerDelta, PortfolioXRay,
)
from app.schemas.workspace import PortfolioSnapshot

PortfolioConversationFocus = Literal[
    "overview", "diversification", "risk_contribution", "attribution", "correlation",
    "stress", "macro", "watchtower", "news", "lookthrough",
]
_UNKNOWN = {"autres", "other", "unknown", "n/a", "non classé", "non classe", "indisponible"}
_FACTORS = ("tsx", "wti", "cad_usd", "canada_10y")


def portfolio_focus_from_question(question: str, previous: PortfolioConversationFocus | None) -> PortfolioConversationFocus:
    text = question.casefold()
    if any(word in text for word in ("changé", "change", "dernière analyse", "last analysis", "watchtower")):
        return "watchtower"
    if any(word in text for word in ("nouvelle", "actualité", "news")):
        return "news"
    if any(word in text for word in ("chevauch", "doublonn", "look-through", "holdings")):
        return "lookthrough"
    if any(word in text for word in ("sous-perform", "sous perform", "attribution", "rendement", "performance")):
        return "attribution"
    if any(word in text for word in ("cluster", "corrél")):
        return "correlation"
    if "plus sensible" in text and any(word in text for word in ("pétrole", "petrole", "wti", "tsx", "taux")):
        return "macro"
    if any(word in text for word in ("pétrole", "petrole", "wti", "choc", "stress", "si le tsx", "si les taux")):
        return "stress"
    if any(word in text for word in ("macro", "inflation", "taux directeur", "chômage")):
        return "macro"
    if any(word in text for word in ("contribu", "explique le plus mon risque", "plus sensible")):
        return "risk_contribution"
    if any(word in text for word in ("diversif", "répart", "repart")):
        return "diversification"
    if text.strip(" ?!").startswith(("pourquoi", "et ", "quel", "quelle")) and previous:
        return previous
    return "overview"


def build_lookthrough_summary(
    positions: list[object], etf_symbols: set[str], snapshots: dict[str, object],
) -> PortfolioLookThroughSummary:
    etfs = [row for row in positions if row.symbol in etf_symbols]
    if not etfs:
        return PortfolioLookThroughSummary()
    etf_weights = {row.symbol: row.weight_percent for row in etfs}
    direct = {row.symbol.upper().removesuffix(".TO"): row.weight_percent
              for row in positions if row.symbol not in etf_symbols}
    indirect: dict[str, dict[str, float]] = {}
    sources: dict[str, str] = {}
    as_of: dict[str, datetime] = {}
    coverages: dict[str, float] = {}
    sectors: dict[str, float] = {}
    for etf in etfs:
        source = snapshots.get(etf.symbol)
        if source is None:
            continue
        rows = getattr(source, "holdings", [])
        coverage = min(100.0, sum(max(0.0, row.weight_percent) for row in rows))
        coverages[etf.symbol] = coverage
        for row in rows:
            symbol = row.display_symbol.upper().removesuffix(".TO")
            if not symbol or symbol == etf.symbol:
                continue
            observed = etf.weight_percent * row.weight_percent / 100
            by_etf = indirect.setdefault(symbol, {})
            by_etf[etf.symbol] = by_etf.get(etf.symbol, 0) + observed
            sources[symbol] = source.source_name
            composition_date = getattr(source, "composition_as_of", None)
            as_of[symbol] = (datetime.combine(composition_date, time.min, tzinfo=UTC)
                             if composition_date else source.generated_at)
        if getattr(source, "official", False) and not getattr(source, "stale", False):
            for row in getattr(source, "sectors", []):
                if row.label.casefold() not in _UNKNOWN:
                    sectors[row.label] = sectors.get(row.label, 0) + etf.weight_percent * row.weight_percent / 100
    total_etf_weight = sum(etf_weights.values())
    weighted_coverage = (sum(etf_weights[symbol] * coverages.get(symbol, 0)
                             for symbol in etf_weights) / total_etf_weight) if total_etf_weight > 0 else 0
    holdings: list[PortfolioLookThroughHolding] = []
    overlaps: list[PortfolioLookThroughOverlap] = []
    for symbol, by_etf in indirect.items():
        observed = sum(by_etf.values())
        direct_weight = direct.get(symbol, 0)
        source_etfs = sorted(by_etf)
        holdings.append(PortfolioLookThroughHolding(
            symbol=symbol, direct_weight_percent=round(direct_weight, 4),
            indirect_observed_weight_percent=round(observed, 4),
            combined_observed_weight_percent=round(direct_weight + observed, 4),
            source_etfs=source_etfs,
            holdings_coverage_percent=round(min(coverages[etf] for etf in source_etfs), 2),
            source=sources[symbol], as_of=as_of[symbol],
        ))
        if direct_weight > 0:
            overlaps.append(PortfolioLookThroughOverlap(kind="direct_etf", symbol=symbol,
                source_etfs=source_etfs, observed_weight_percent=round(observed, 4)))
        if len(source_etfs) > 1:
            overlaps.append(PortfolioLookThroughOverlap(kind="etf_etf", symbol=symbol,
                source_etfs=source_etfs, observed_weight_percent=round(min(by_etf.values()), 4)))
    status = "unavailable" if not snapshots else (
        "observed" if len(coverages) == len(etfs) and weighted_coverage >= 99.5
        and all(not getattr(snapshots[symbol], "stale", False) for symbol in coverages) else "partial")
    return PortfolioLookThroughSummary(
        holdings=sorted(holdings, key=lambda row: row.combined_observed_weight_percent, reverse=True)[:60],
        overlaps=overlaps[:60], etf_count=len(etfs),
        holdings_coverage_percent=round(weighted_coverage, 2), status=status,
        sector_exposures_observed={key: round(value, 3) for key, value in sectors.items()},
    )


def build_macro_exposures(snapshot: PortfolioSnapshot) -> list[PortfolioMacroExposure]:
    positions = getattr(snapshot, "positions", [])
    weights = {row.symbol: row.weight_percent for row in positions}
    sensitivities = getattr(snapshot, "factor_sensitivities", [])
    output = []
    for factor in _FACTORS:
        rows = [row for row in sensitivities if row.factor == factor and row.symbol in weights]
        coverage = sum(weights[row.symbol] for row in rows)
        output.append(PortfolioMacroExposure(
            factor=factor,
            weighted_sensitivity=round(sum(weights[row.symbol] / 100 * row.beta for row in rows), 5)
            if coverage >= 70 else None,
            coverage_percent=round(coverage, 2), source_freshness="internal" if rows else "unknown",
            context_only=coverage < 70,
        ))
    return output


def build_portfolio_xray(
    snapshot: PortfolioSnapshot, requested_count: int | None,
    lookthrough: PortfolioLookThroughSummary,
) -> PortfolioXRay:
    positions = getattr(snapshot, "positions", [])
    weights = [row.weight_percent / 100 for row in positions]
    denominator = sum(weight * weight for weight in weights)
    risk = getattr(snapshot, "risk", None)
    sectors = getattr(snapshot, "sector_allocation", [])
    currencies = getattr(snapshot, "currency_allocation", [])
    sector_coverage = max(0.0, 100 - sum(row.weight_percent for row in sectors
                                          if row.label.casefold() in _UNKNOWN)) if sectors else None
    currency_coverage = max(0.0, 100 - sum(row.weight_percent for row in currencies
                                            if row.label.casefold() in _UNKNOWN)) if currencies else None
    risk_contributions = getattr(snapshot, "risk_contributions", None)
    attribution = getattr(snapshot, "attribution", [])
    correlation = getattr(snapshot, "correlation", None)
    pairs = len(correlation.symbols) * (len(correlation.symbols) - 1) // 2 if correlation else 0
    valid_pairs = sum(correlation.values[i][j] is not None for i in range(len(correlation.symbols))
                      for j in range(i + 1, len(correlation.symbols))) if correlation else 0
    stress = getattr(snapshot, "stress_tests", [])
    stress_coverage = min((row.coverage.coverage_percent for row in stress
                           if row.estimated_portfolio_change_percent is not None), default=None)
    quote_coverage = len(positions) / requested_count * 100 if requested_count else (100 if positions else 0)
    history_coverage = getattr(risk, "history_coverage_percent", None)
    risk_coverage = risk_contributions.coverage.coverage_percent if risk_contributions else None
    attribution_coverage = max((row.coverage.coverage_percent for row in attribution
                                if row.portfolio_return_percent is not None), default=None)
    required = [quote_coverage, history_coverage or 0, sector_coverage or 0,
                risk_coverage or 0, attribution_coverage or 0]
    quality = ("élevée" if min(required) >= 85 else
               "partielle" if quote_coverage >= 70 and max(required[1:]) >= 70 else "limitée")
    return PortfolioXRay(
        total_market_value=getattr(snapshot, "total_market_value", None),
        total_cost_basis=getattr(snapshot, "total_cost_basis", None),
        unrealized_pnl=getattr(snapshot, "total_unrealized_pnl", None),
        unrealized_pnl_percent=getattr(snapshot, "total_unrealized_pnl_percent", None),
        day_pnl=getattr(snapshot, "total_day_pnl", None),
        day_change_percent=getattr(snapshot, "total_day_change_percent", None),
        position_count=len(positions), quote_coverage_percent=round(quote_coverage, 2),
        top_position_percent=round(max(weights) * 100, 2) if weights else None,
        top_three_percent=round(sum(sorted(weights, reverse=True)[:3]) * 100, 2) if weights else None,
        top_five_percent=round(sum(sorted(weights, reverse=True)[:5]) * 100, 2) if weights else None,
        hhi=getattr(risk, "concentration_hhi", None),
        effective_positions=round(1 / denominator, 2) if denominator > 0 else None,
        diversification_score=getattr(risk, "diversification_score", None),
        sector_coverage_percent=sector_coverage, currency_coverage_percent=currency_coverage,
        history_coverage_percent=history_coverage,
        etf_lookthrough_coverage_percent=lookthrough.holdings_coverage_percent if lookthrough.etf_count else None,
        risk_contribution_coverage_percent=risk_coverage,
        attribution_coverage_percent=attribution_coverage,
        correlation_coverage_percent=round(valid_pairs / pairs * 100, 2) if pairs else None,
        stress_coverage_percent=stress_coverage, analysis_quality=quality,
    )


def build_concentration_map(
    snapshot: PortfolioSnapshot, lookthrough: PortfolioLookThroughSummary,
    macro: list[PortfolioMacroExposure],
) -> PortfolioConcentrationMap:
    xray = build_portfolio_xray(snapshot, None, lookthrough)
    clusters = getattr(snapshot, "correlation_clusters", [])
    return PortfolioConcentrationMap(
        direct_top_three_percent=xray.top_three_percent,
        observed_economic_top=lookthrough.holdings[:10],
        sector_weights={row.label: row.weight_percent for row in getattr(snapshot, "sector_allocation", [])
                        if row.label.casefold() not in _UNKNOWN},
        currency_weights={row.label: row.weight_percent for row in getattr(snapshot, "currency_allocation", [])},
        top_cluster_weight_percent=max((row.combined_weight_percent for row in clusters), default=None),
        factor_exposures={row.factor: row.weighted_sensitivity for row in macro
                          if row.weighted_sensitivity is not None},
        coverage={
            "sector": xray.sector_coverage_percent or 0,
            "currency": xray.currency_coverage_percent or 0,
            "lookthrough": xray.etf_lookthrough_coverage_percent or 0,
            "correlation": xray.correlation_coverage_percent or 0,
            **{f"factor_{row.factor}": row.coverage_percent for row in macro},
        },
    )


def build_watchtower_aggregate(bundle: AnatoleEvidenceBundle, snapshot: PortfolioSnapshot) -> PortfolioWatchtowerAggregate:
    xray = bundle.portfolio_xray or PortfolioXRay()
    risk = getattr(snapshot, "risk", None)
    sectors = [row for row in getattr(snapshot, "sector_allocation", [])
               if row.label.casefold() not in _UNKNOWN]
    currencies = getattr(snapshot, "currency_allocation", [])
    clusters = getattr(snapshot, "correlation_clusters", [])
    contributions = getattr(snapshot, "risk_contributions", None)
    return PortfolioWatchtowerAggregate(
        timestamp=snapshot.generated_at, total_market_value=xray.total_market_value,
        top_position_weight_percent=xray.top_position_percent, top_three_percent=xray.top_three_percent,
        hhi=xray.hhi, effective_positions=xray.effective_positions,
        volatility_percent=getattr(risk, "volatility_percent", None), beta=getattr(risk, "beta", None),
        max_drawdown_percent=getattr(risk, "max_drawdown_percent", None),
        sharpe_ratio=getattr(risk, "sharpe_ratio", None),
        diversification_score=xray.diversification_score,
        sector_coverage_percent=xray.sector_coverage_percent,
        top_known_sector=max(sectors, key=lambda row: row.weight_percent).label if sectors else None,
        top_currency=max(currencies, key=lambda row: row.weight_percent).label if currencies else None,
        average_correlation=getattr(getattr(snapshot, "correlation", None), "average_correlation", None),
        top_cluster_weight_percent=max((row.combined_weight_percent for row in clusters), default=None),
        top_risk_contributor=contributions.items[0].symbol if contributions and contributions.items else None,
        benchmark_gap={row.horizon: row.excess_return_percent for row in getattr(snapshot, "attribution", [])
                       if row.excess_return_percent is not None},
        coverage_fingerprints={
            "quotes": xray.quote_coverage_percent,
            "history": xray.history_coverage_percent or 0,
            "sectors": xray.sector_coverage_percent or 0,
            "risk_contribution": xray.risk_contribution_coverage_percent or 0,
            "attribution": xray.attribution_coverage_percent or 0,
        },
    )


def build_watchtower_delta(
    previous: PortfolioWatchtowerAggregate | None, current: PortfolioWatchtowerAggregate,
) -> PortfolioWatchtowerDelta:
    if previous is None:
        return PortfolioWatchtowerDelta(current_at=current.timestamp)
    fields = (
        "total_market_value", "top_position_weight_percent", "top_three_percent", "hhi",
        "effective_positions", "volatility_percent", "beta", "max_drawdown_percent",
        "sharpe_ratio", "diversification_score", "sector_coverage_percent",
        "average_correlation", "top_cluster_weight_percent",
    )
    changes = {key: round(getattr(current, key) - getattr(previous, key), 4)
               for key in fields if getattr(current, key) is not None and getattr(previous, key) is not None}
    changes.update({f"benchmark_gap_{key}": round(value - previous.benchmark_gap[key], 4)
                    for key, value in current.benchmark_gap.items() if key in previous.benchmark_gap})
    changes.update({f"coverage_{key}": round(value - previous.coverage_fingerprints[key], 4)
                    for key, value in current.coverage_fingerprints.items()
                    if key in previous.coverage_fingerprints})
    return PortfolioWatchtowerDelta(
        previous_at=previous.timestamp, current_at=current.timestamp,
        elapsed_seconds=max(0, (current.timestamp - previous.timestamp).total_seconds()),
        changes=changes, previous_available=True,
    )
