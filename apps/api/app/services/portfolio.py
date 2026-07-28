from __future__ import annotations

import asyncio
import math
import statistics
from collections import defaultdict
from datetime import UTC, datetime

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
from app.services.tsx60 import TSX60


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


def _momentum(candles: list[Candle], sessions: int = 20) -> float:
    if len(candles) <= sessions or candles[-sessions - 1].close == 0:
        return 0.0
    return (candles[-1].close / candles[-sessions - 1].close - 1) * 100


def _average_volume(candles: list[Candle], sessions: int = 20) -> float:
    sample = candles[-sessions:] if len(candles) >= sessions else candles
    return sum(item.volume for item in sample) / max(len(sample), 1)


def _position_score(
    *,
    change_percent: float,
    momentum: float,
    relative_volume: float,
    rsi: float | None,
    trend: str,
) -> float:
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
) -> str:
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
    async def _fx_rates(
        self,
        currencies: set[str],
        base_currency: str,
    ) -> tuple[dict[str, float], list[str]]:
        rates = {base_currency: 1.0}
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
                    rates[currency] = 1.0
                    notes.append(
                        f"Conversion {currency}/{base_currency} indisponible; "
                        "la valeur est présentée sans conversion."
                    )
            else:
                rates[currency] = 1.0
                notes.append(
                    f"La devise {currency} n'est pas convertie automatiquement."
                )
        return rates, notes

    async def analyze(
        self,
        request: PortfolioAnalyzeRequest,
    ) -> PortfolioSnapshot:
        symbols = [item.symbol for item in request.positions]
        history_symbols = list(dict.fromkeys(symbols + [request.benchmark]))
        quotes, histories = await asyncio.gather(
            market_data_service.get_quotes(symbols),
            market_data_service.get_history_many(
                history_symbols,
                range_="1y",
                interval="1d",
                concurrency=6,
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
            technicals = market_data_service.calculate_technicals(candles)
            average_volume = _average_volume(candles)
            relative_volume = quote.volume / average_volume if average_volume else 0.0
            momentum = _momentum(candles)
            name, sector = _metadata(item.symbol, quote)
            fx_rate = fx_rates.get(quote.currency, 1.0)
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
                momentum=float(raw["momentum"]),
                relative_volume=float(raw["relative_volume"]),
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
                    unrealized_pnl_percent=round(
                        pnl / cost_basis * 100 if cost_basis else 0.0,
                        2,
                    ),
                    day_pnl=round(
                        item.quantity * quote.change * float(raw["fx_rate"]),
                        2,
                    ),
                    day_change_percent=round(quote.change_percent, 2),
                    weight_percent=round(weight, 2),
                    momentum_20d=round(float(raw["momentum"]), 2),
                    rsi_14=technicals.rsi_14,
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
        all_days = sorted(
            set().union(*(values.keys() for values in return_maps.values()))
            if return_maps
            else set()
        )
        portfolio_returns: list[float] = []
        benchmark_returns: list[float] = []
        performance: list[PortfolioPerformancePoint] = []
        portfolio_level = 100.0
        benchmark_level = 100.0

        for day in all_days:
            available = [
                symbol
                for symbol, values in return_maps.items()
                if day in values
            ]
            available_weight = sum(weights[symbol] for symbol in available)
            if not available or available_weight <= 0:
                continue
            daily_return = sum(
                weights[symbol] / available_weight * return_maps[symbol][day]
                for symbol in available
            )
            portfolio_level *= 1 + daily_return
            portfolio_returns.append(daily_return)

            benchmark_value = benchmark_map.get(day)
            if benchmark_value is not None:
                benchmark_level *= 1 + benchmark_value
                benchmark_returns.append(benchmark_value)
            else:
                benchmark_returns.append(0.0)

            performance.append(
                PortfolioPerformancePoint(
                    time=day * 86_400,
                    portfolio=round(portfolio_level, 4),
                    benchmark=(
                        round(benchmark_level, 4)
                        if benchmark_value is not None
                        else None
                    ),
                )
            )

        volatility, beta, max_drawdown, sharpe = _risk_statistics(
            portfolio_returns,
            benchmark_returns,
        )
        top_position = positions[0].weight_percent if positions else 0.0
        top_three = sum(item.weight_percent for item in positions[:3])
        hhi = sum((item.weight_percent / 100) ** 2 for item in positions) * 10_000
        diversification = max(0.0, min(100.0, 110 - hhi / 55))
        risk_level = _risk_level(volatility, top_position, max_drawdown)

        period_return = portfolio_level - 100 if performance else 0.0
        return_score = max(0.0, min(100.0, 50 + period_return * 2.0))
        risk_score = 50.0 if volatility is None else max(0.0, min(100.0, 100 - volatility * 1.8))
        drawdown_score = 50.0 if max_drawdown is None else max(0.0, min(100.0, 100 + max_drawdown * 2.5))
        holdings_score = (
            sum(item.score * item.weight_percent for item in positions) / 100
            if positions
            else 0.0
        )
        portfolio_score = round(
            max(
                0.0,
                min(
                    100.0,
                    holdings_score * 0.38
                    + diversification * 0.22
                    + return_score * 0.18
                    + risk_score * 0.12
                    + drawdown_score * 0.10,
                ),
            ),
            1,
        )

        if top_position >= 40:
            notes.append(
                f"Concentration élevée : {positions[0].symbol} représente "
                f"{top_position:.1f} % du portefeuille."
            )
        if any(item.source.startswith("demo") for item in positions):
            notes.append(
                "Au moins une position utilise une donnée de secours; vérifie la source avant décision."
            )
        if not positions:
            notes.append("Aucune position exploitable n'a été calculée.")

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

        return PortfolioSnapshot(
            base_currency=request.base_currency,
            benchmark=request.benchmark,
            benchmark_name="S&P/TSX Composite",
            total_market_value=round(total_market_value, 2),
            total_cost_basis=round(total_cost_basis, 2),
            total_unrealized_pnl=round(total_pnl, 2),
            total_unrealized_pnl_percent=round(
                total_pnl / total_cost_basis * 100 if total_cost_basis else 0.0,
                2,
            ),
            total_day_pnl=round(total_day_pnl, 2),
            total_day_change_percent=round(
                total_day_pnl / max(total_market_value - total_day_pnl, 1) * 100,
                2,
            ),
            portfolio_score=portfolio_score,
            positions=positions,
            sector_allocation=_allocation(positions, "sector"),
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
            ),
            contributors=contributors,
            detractors=detractors,
            notes=notes,
            generated_at=datetime.now(UTC),
            refresh_after_seconds=30,
        )


portfolio_service = PortfolioService()
