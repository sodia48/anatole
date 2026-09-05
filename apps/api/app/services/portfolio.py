from __future__ import annotations

import asyncio
import logging
import math
import statistics
from collections import defaultdict
from datetime import UTC, datetime
from time import monotonic

from app.data.etf_catalog import ETF_CATALOG
from app.schemas.stocks import Candle, Quote
from app.schemas.workspace import (
    PortfolioAllocation,
    PortfolioAnalyzeRequest,
    PortfolioContributor,
    PortfolioPerformancePoint,
    PortfolioPositionSnapshot,
    PortfolioRisk,
    PortfolioSnapshot,
)
from app.services.market_data import market_data_service
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.portfolio_intelligence import (
    build_correlation_matrix,
    build_horizon_results,
    build_portfolio_risk_reading,
    build_stress_tests,
)
from app.services.tsx60 import TSX60

logger = logging.getLogger(__name__)


TRADING_DAYS = 252
RISK_FREE_RATE_PERCENT = 3.0

_TSX_METADATA = {
    item.symbol: (item.name, item.sector)
    for item in TSX60
}
_ETF_METADATA = {
    item["ticker"]: (item["name"], item["category"])
    for item in ETF_CATALOG
}


def _key(value: str) -> str:
    return value.strip().upper().removesuffix(".TO").replace("-", ".")


def _metadata(symbol: str, quote: Quote) -> tuple[str, str]:
    data = _TSX_METADATA.get(symbol) or _ETF_METADATA.get(symbol)
    if data:
        return data
    return quote.name or symbol, "Autres"


def _returns(candles: list[Candle]) -> dict[int, float]:
    output: dict[int, float] = {}
    for previous, current in zip(candles, candles[1:], strict=False):
        if previous.close:
            output[current.time // 86_400] = current.close / previous.close - 1
    return output


def _momentum(candles: list[Candle], sessions: int = 20) -> float | None:
    if len(candles) <= sessions or candles[-sessions - 1].close == 0:
        return None
    return (candles[-1].close / candles[-sessions - 1].close - 1) * 100


def _average_volume(candles: list[Candle], sessions: int = 20) -> float | None:
    if not candles:
        return None
    sample = candles[-sessions:] if len(candles) >= sessions else candles
    return sum(item.volume for item in sample) / len(sample)


def _position_score(
    *,
    change_percent: float,
    momentum: float | None,
    relative_volume: float | None,
    rsi: float | None,
    trend: str,
) -> float | None:
    if momentum is None or relative_volume is None:
        return None
    score = 50.0
    score += max(-18.0, min(18.0, momentum * 1.8))
    score += max(-8.0, min(8.0, change_percent * 2.0))
    score += max(-5.0, min(8.0, (relative_volume - 1.0) * 8.0))
    score += {"Haussière": 12.0, "Mixte": 2.0, "Baissière": -14.0}.get(
        trend,
        0.0,
    )
    if rsi is not None:
        if 48 <= rsi <= 68:
            score += 6.0
        elif rsi >= 80 or rsi <= 25:
            score -= 8.0
    return round(max(0.0, min(100.0, score)), 1)


def _risk_statistics(
    returns: list[float],
    benchmark_returns: list[float],
) -> tuple[float | None, float | None, float | None, float | None]:
    if len(returns) < 5:
        return None, None, None, None

    volatility = statistics.stdev(returns) * math.sqrt(TRADING_DAYS) * 100
    daily_rf = (1 + RISK_FREE_RATE_PERCENT / 100) ** (1 / TRADING_DAYS) - 1
    sharpe = None
    if len(returns) >= 20 and statistics.stdev(returns) > 1e-12:
        sharpe = (
            (statistics.mean(returns) - daily_rf)
            / statistics.stdev(returns)
            * math.sqrt(TRADING_DAYS)
        )

    beta = None
    if len(benchmark_returns) == len(returns) and len(returns) >= 20:
        variance = statistics.variance(benchmark_returns)
        if variance > 1e-12:
            left_mean = statistics.mean(returns)
            right_mean = statistics.mean(benchmark_returns)
            covariance = sum(
                (left - left_mean) * (right - right_mean)
                for left, right in zip(
                    returns,
                    benchmark_returns,
                    strict=False,
                )
            ) / (len(returns) - 1)
            beta = covariance / variance

    level = 100.0
    peak = 100.0
    worst = 0.0
    for value in returns:
        level *= 1 + value
        peak = max(peak, level)
        if peak:
            worst = min(worst, level / peak - 1)

    return volatility, beta, worst * 100, sharpe


def _risk_level(
    volatility: float | None,
    top_position: float,
    drawdown: float | None,
) -> str | None:
    if volatility is None or drawdown is None:
        return None
    risk_points = 0
    if volatility is not None:
        risk_points += 0 if volatility < 18 else 1 if volatility < 28 else 2
    risk_points += 0 if top_position < 25 else 1 if top_position < 40 else 2
    if drawdown is not None:
        risk_points += 0 if drawdown > -12 else 1 if drawdown > -25 else 2
    if risk_points <= 1:
        return "Faible"
    if risk_points <= 3:
        return "Modéré"
    if risk_points <= 4:
        return "Élevé"
    return "Très élevé"


def _pnl_percent(pnl: float, cost_basis: float) -> float | None:
    return pnl / cost_basis * 100 if cost_basis else None


def _covered_performance(
    return_maps: dict[str, dict[int, float]],
    weights: dict[str, float],
    benchmark_map: dict[int, float],
) -> tuple[list[float], list[float], list[PortfolioPerformancePoint], float]:
    all_days = sorted(set().union(*(values.keys() for values in return_maps.values())) if return_maps else set())
    portfolio_returns: list[float] = []
    benchmark_returns: list[float] = []
    performance: list[PortfolioPerformancePoint] = []
    portfolio_level = 100.0
    benchmark_level = 100.0
    daily_coverages: list[float] = []
    for day in all_days:
        available = [symbol for symbol, values in return_maps.items() if day in values]
        available_weight = sum(weights[symbol] for symbol in available)
        daily_coverages.append(available_weight)
        if not available or available_weight < 0.70:
            continue
        daily_return = sum(weights[symbol] * return_maps[symbol][day] for symbol in available)
        portfolio_level *= 1 + daily_return
        portfolio_returns.append(daily_return)
        benchmark_value = benchmark_map.get(day)
        if benchmark_value is not None:
            benchmark_level *= 1 + benchmark_value
            benchmark_returns.append(benchmark_value)
        performance.append(PortfolioPerformancePoint(
            time=day * 86_400,
            portfolio=round(portfolio_level, 4),
            benchmark=round(benchmark_level, 4) if benchmark_value is not None else None,
        ))
    coverage = sum(daily_coverages) / len(daily_coverages) * 100 if daily_coverages else 0.0
    return portfolio_returns, benchmark_returns, performance, coverage


def _allocation(
    positions: list[PortfolioPositionSnapshot],
    attribute: str,
) -> list[PortfolioAllocation]:
    values: dict[str, float] = defaultdict(float)
    total = sum(item.market_value for item in positions) or 1.0
    for item in positions:
        values[str(getattr(item, attribute))] += item.market_value
    return [
        PortfolioAllocation(
            key=key.casefold().replace(" ", "-"),
            label=key,
            value=round(value, 2),
            weight_percent=round(value / total * 100, 2),
        )
        for key, value in sorted(
            values.items(),
            key=lambda entry: entry[1],
            reverse=True,
        )
    ]


class PortfolioService:
    history_deadline_seconds = 4.0
    driver_deadline_seconds = 1.5

    async def _fx_rates(
        self,
        currencies: set[str],
        base_currency: str,
    ) -> tuple[dict[str, float | None], list[str]]:
        rates: dict[str, float | None] = {base_currency: 1.0}
        notes: list[str] = []
        for currency in sorted(currencies):
            if currency == base_currency:
                continue
            if {currency, base_currency} == {"CAD", "USD"}:
                try:
                    fx = await market_data_service.get_quote("CAD=X")
                    if fx.source.startswith("demo") or fx.price <= 0:
                        raise RuntimeError("Taux public indisponible")
                    rates["USD"] = fx.price if base_currency == "CAD" else 1.0
                    rates["CAD"] = 1.0 if base_currency == "CAD" else 1 / fx.price
                except Exception:  # noqa: BLE001
                    rates[currency] = None
                    notes.append(
                        f"Conversion {currency}/{base_currency} indisponible; "
                        "la position est exclue des agrégats."
                    )
            else:
                rates[currency] = None
                notes.append(
                    f"La devise {currency} n'est pas convertie automatiquement."
                )
        return rates, notes

    async def analyze(
        self,
        request: PortfolioAnalyzeRequest,
        *,
        fast: bool = False,
    ) -> PortfolioSnapshot:
        started_at = monotonic()
        symbols = [item.symbol for item in request.positions]
        history_symbols = list(dict.fromkeys(symbols + [request.benchmark, "CL=F", "CAD=X"]))
        if fast:
            quotes = await market_data_service.get_quotes(symbols)
            histories = {}
        else:
            quotes, histories = await asyncio.gather(
                market_data_service.get_quotes(symbols),
                market_data_service.get_history_many_strict(
                    history_symbols,
                    range_="1y",
                    interval="1d",
                    concurrency=6,
                    deadline_seconds=self.history_deadline_seconds,
                ),
            )
        quote_by_symbol = {_key(item.symbol): item for item in quotes}
        quote_by_symbol.update({_key(item.ticker): item for item in quotes})

        currencies = {
            quote_by_symbol[item.symbol].currency
            for item in request.positions
            if item.symbol in quote_by_symbol
        }
        fx_rates, notes = await self._fx_rates(
            currencies,
            request.base_currency,
        )

        raw_positions: list[dict[str, object]] = []
        for item in request.positions:
            quote = quote_by_symbol.get(item.symbol)
            candles = histories.get(item.symbol, [])
            if quote is None:
                notes.append(f"Aucune cotation n'a été récupérée pour {item.symbol}.")
                continue
            if quote.source.startswith("demo-fallback") and not market_data_service.demo_mode:
                notes.append(f"La cotation réelle de {item.symbol} est indisponible; la position est exclue.")
                continue
            technicals = market_data_service.calculate_technicals(candles)
            average_volume = _average_volume(candles)
            relative_volume = quote.volume / average_volume if average_volume else None
            momentum = _momentum(candles)
            name, sector = _metadata(item.symbol, quote)
            fx_rate = fx_rates.get(quote.currency)
            if fx_rate is None:
                continue
            cost_basis = item.quantity * item.average_cost * fx_rate
            market_value = item.quantity * quote.price * fx_rate
            pnl = market_value - cost_basis
            raw_positions.append(
                {
                    "input": item,
                    "quote": quote,
                    "name": name,
                    "sector": sector,
                    "fx_rate": fx_rate,
                    "cost_basis": cost_basis,
                    "market_value": market_value,
                    "pnl": pnl,
                    "momentum": momentum,
                    "technicals": technicals,
                    "relative_volume": relative_volume,
                }
            )

        total_market_value = sum(
            float(item["market_value"])
            for item in raw_positions
        )
        total_cost_basis = sum(
            float(item["cost_basis"])
            for item in raw_positions
        )
        positions: list[PortfolioPositionSnapshot] = []

        for raw in raw_positions:
            item = raw["input"]
            quote = raw["quote"]
            technicals = raw["technicals"]
            assert hasattr(item, "symbol")
            assert isinstance(quote, Quote)
            market_value = float(raw["market_value"])
            cost_basis = float(raw["cost_basis"])
            pnl = float(raw["pnl"])
            weight = (
                market_value / total_market_value * 100
                if total_market_value
                else 0.0
            )
            score = _position_score(
                change_percent=quote.change_percent,
                momentum=raw["momentum"] if isinstance(raw["momentum"], float) else None,
                relative_volume=raw["relative_volume"] if isinstance(raw["relative_volume"], float) else None,
                rsi=technicals.rsi_14,
                trend=technicals.trend,
            )
            positions.append(
                PortfolioPositionSnapshot(
                    symbol=item.symbol,
                    ticker=quote.ticker,
                    name=str(raw["name"]),
                    sector=str(raw["sector"]),
                    currency=quote.currency,
                    quantity=item.quantity,
                    average_cost=item.average_cost,
                    price=round(quote.price, 4),
                    fx_rate=round(float(raw["fx_rate"]), 6),
                    cost_basis=round(cost_basis, 2),
                    market_value=round(market_value, 2),
                    unrealized_pnl=round(pnl, 2),
                    unrealized_pnl_percent=(round(value, 2) if (value := _pnl_percent(pnl, cost_basis)) is not None else None),
                    day_pnl=round(
                        item.quantity * quote.change * float(raw["fx_rate"]),
                        2,
                    ),
                    day_change_percent=round(quote.change_percent, 2),
                    weight_percent=round(weight, 2),
                    momentum_20d=(round(float(raw["momentum"]), 2) if raw["momentum"] is not None else None),
                    rsi_14=technicals.rsi_14,
                    relative_volume=(round(float(raw["relative_volume"]), 3) if raw["relative_volume"] is not None else None),
                    trend=technicals.trend,
                    score=score,
                    source=quote.source,
                    delayed=quote.delayed,
                )
            )

        positions.sort(key=lambda item: item.market_value, reverse=True)
        total_pnl = sum(item.unrealized_pnl for item in positions)
        total_day_pnl = sum(item.day_pnl for item in positions)

        weights = {
            item.symbol: item.weight_percent / 100
            for item in positions
        }
        return_maps = {
            symbol: _returns(histories.get(symbol, []))
            for symbol in weights
        }
        benchmark_map = _returns(histories.get(request.benchmark, []))
        portfolio_returns, benchmark_returns, performance, history_coverage = _covered_performance(return_maps, weights, benchmark_map)
        portfolio_level = performance[-1].portfolio if performance else 100.0
        history_observations = len(portfolio_returns)
        if history_coverage >= 70:
            volatility, beta, max_drawdown, sharpe = _risk_statistics(
                portfolio_returns,
                benchmark_returns,
            )
        else:
            volatility, beta, max_drawdown, sharpe = None, None, None, None
            notes.append(
                "Couverture historique inférieure à 70 %; les statistiques "
                "de risque restent indisponibles."
            )
        top_position = positions[0].weight_percent if positions else 0.0
        top_three = sum(item.weight_percent for item in positions[:3])
        hhi = sum((item.weight_percent / 100) ** 2 for item in positions) * 10_000
        diversification = max(0.0, min(100.0, 110 - hhi / 55))
        risk_level = _risk_level(volatility, top_position, max_drawdown)

        score_parts: list[tuple[float, float]] = [(diversification, 0.25)] if positions else []
        scored_weight = sum(item.weight_percent for item in positions if item.score is not None)
        if scored_weight >= 70:
            holdings_score = sum(item.score * item.weight_percent for item in positions if item.score is not None) / scored_weight
            score_parts.append((holdings_score, 0.45))
        if performance:
            score_parts.append((max(0.0, min(100.0, 50 + (portfolio_level - 100) * 2.0)), 0.15))
        if volatility is not None:
            score_parts.append((max(0.0, min(100.0, 100 - volatility * 1.8)), 0.10))
        if max_drawdown is not None:
            score_parts.append((max(0.0, min(100.0, 100 + max_drawdown * 2.5)), 0.05))
        score_weight = sum(weight for _, weight in score_parts)
        portfolio_score = round(sum(value * weight for value, weight in score_parts) / score_weight, 1) if score_weight >= 0.7 else None

        if top_position >= 40:
            notes.append(
                f"Concentration élevée : {positions[0].symbol} représente "
                f"{top_position:.1f} % du portefeuille."
            )
        if not positions:
            notes.append("Aucune position exploitable n'a été calculée.")

        observed_at = datetime.now(UTC)
        performance_horizons, contribution_horizons = build_horizon_results(positions, histories, observed_at)
        correlation = build_correlation_matrix(positions, histories)
        canada_10y: list[tuple[int, float]] = []
        if not fast and not market_data_service.demo_mode:
            try:
                canada_10y = (
                    await asyncio.wait_for(
                        bank_of_canada_valet_service.yields(),
                        timeout=self.driver_deadline_seconds,
                    )
                ).get("V39055", [])
            except Exception:  # noqa: BLE001
                notes.append("La série officielle Canada 10 ans est temporairement indisponible.")
        stress_tests = build_stress_tests(positions, histories, canada_10y)
        sector_allocation = _allocation(positions, "sector")
        risk_reading = build_portfolio_risk_reading(
            positions,
            [(item.label, item.weight_percent) for item in sector_allocation],
            correlation,
        )

        contributors = [
            PortfolioContributor(
                symbol=item.symbol,
                name=item.name,
                value=item.day_pnl,
                value_percent=item.day_change_percent,
                kind="day",
            )
            for item in sorted(
                positions,
                key=lambda entry: entry.day_pnl,
                reverse=True,
            )[:5]
            if item.day_pnl > 0
        ]
        detractors = [
            PortfolioContributor(
                symbol=item.symbol,
                name=item.name,
                value=item.day_pnl,
                value_percent=item.day_change_percent,
                kind="day",
            )
            for item in sorted(
                positions,
                key=lambda entry: entry.day_pnl,
            )[:5]
            if item.day_pnl < 0
        ]

        snapshot = PortfolioSnapshot(
            base_currency=request.base_currency,
            benchmark=request.benchmark,
            benchmark_name="S&P/TSX Composite",
            total_market_value=round(total_market_value, 2),
            total_cost_basis=round(total_cost_basis, 2),
            total_unrealized_pnl=round(total_pnl, 2),
            total_unrealized_pnl_percent=(round(value, 2) if (value := _pnl_percent(total_pnl, total_cost_basis)) is not None else None),
            total_day_pnl=round(total_day_pnl, 2),
            total_day_change_percent=round(
                total_day_pnl / max(total_market_value - total_day_pnl, 1) * 100,
                2,
            ),
            portfolio_score=portfolio_score,
            positions=positions,
            sector_allocation=sector_allocation,
            currency_allocation=_allocation(positions, "currency"),
            performance=performance,
            risk=PortfolioRisk(
                volatility_percent=(round(volatility, 2) if volatility is not None else None),
                beta=(round(beta, 2) if beta is not None else None),
                max_drawdown_percent=(round(max_drawdown, 2) if max_drawdown is not None else None),
                sharpe_ratio=(round(sharpe, 2) if sharpe is not None else None),
                concentration_hhi=round(hhi, 1),
                top_position_percent=round(top_position, 2),
                top_three_percent=round(top_three, 2),
                diversification_score=round(diversification, 1),
                risk_level=risk_level,
                history_coverage_percent=round(history_coverage, 2),
                history_observations=history_observations,
            ) if positions else None,
            contributors=contributors,
            detractors=detractors,
            performance_horizons=performance_horizons,
            contribution_horizons=contribution_horizons,
            correlation=correlation,
            stress_tests=stress_tests,
            risk_reading=risk_reading,
            methodology="Les horizons supérieurs à un jour reconstituent la performance des positions actuelles en supposant les quantités constantes. Les corrélations et sensibilités utilisent uniquement des historiques stricts réellement disponibles.",
            notes=notes,
            generated_at=observed_at,
            refresh_after_seconds=30,
        )
        logger.info(
            "portfolio_snapshot_complete fast=%s positions_requested=%s positions_priced=%s histories=%s duration_ms=%s",
            fast,
            len(request.positions),
            len(positions),
            len(histories),
            round((monotonic() - started_at) * 1000),
        )
        return snapshot


portfolio_service = PortfolioService()
