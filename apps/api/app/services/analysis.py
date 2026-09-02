from __future__ import annotations

import asyncio
import math
import statistics
from collections import defaultdict
from datetime import UTC, datetime
from time import monotonic
from typing import Iterable

from app.data.etf_catalog import ETF_CATALOG
from app.schemas.analysis import (
    CompareRequest,
    ComparisonInstrument,
    ComparisonPoint,
    ComparisonSeries,
    ComparisonSnapshot,
    CorrelationMatrix,
    TerminalAlert,
    TerminalComponent,
    TerminalRadarItem,
    TerminalSnapshot,
)
from app.schemas.fundamentals import FundamentalSnapshot
from app.schemas.stocks import Candle, Quote
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.fundamentals import fundamentals_service
from app.services.market_data import market_data_service
from app.services.screener import screener_service
from app.services.tsx60 import TSX60
from app.services.terminal_drivers import YAHOO_DRIVERS, rate_market_drivers, yahoo_market_drivers
from app.services.terminal_engine import (
    COVERAGE_THRESHOLD_PERCENT,
    build_anomalies,
    build_breadth,
    build_regime_history,
    build_regime_horizons,
    build_sector_rotation,
    data_quality,
    legacy_sectors,
    methodology_sections,
    opportunity,
    rebuild_real_rows,
)


RANGE_LABELS = {
    "1mo": "1 mois",
    "3mo": "3 mois",
    "6mo": "6 mois",
    "ytd": "Depuis janvier",
    "1y": "1 an",
    "3y": "3 ans",
    "5y": "5 ans",
}

SOURCE_RANGES = {
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "ytd": "ytd",
    "1y": "1y",
    "3y": "5y",
    "5y": "5y",
}

RISK_FREE_RATE_PERCENT = 3.0
TRADING_DAYS = 252

_TSX_METADATA = {
    item.symbol: {
        "name": item.name,
        "sector": item.sector,
        "instrument_type": "action",
    }
    for item in TSX60
}

_ETF_METADATA = {
    item["ticker"]: {
        "name": item["name"],
        "sector": item["category"],
        "instrument_type": "etf",
    }
    for item in ETF_CATALOG
}


class _TimedCache:
    def __init__(self) -> None:
        self._values: dict[object, tuple[float, object]] = {}
        self._locks: dict[object, asyncio.Lock] = {}

    def get(self, key: object, ttl_seconds: float) -> object | None:
        cached = self._values.get(key)
        if cached is None:
            return None
        if monotonic() - cached[0] > ttl_seconds:
            return None
        return cached[1]

    def set(self, key: object, value: object) -> None:
        self._values[key] = (monotonic(), value)

    def peek(self, key: object) -> object | None:
        cached = self._values.get(key)
        return None if cached is None else cached[1]

    def lock(self, key: object) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock


def _returns(candles: list[Candle]) -> list[float]:
    output: list[float] = []
    for previous, current in zip(candles, candles[1:], strict=False):
        if previous.close:
            output.append(current.close / previous.close - 1)
    return output


def _return_by_day(candles: list[Candle]) -> dict[int, float]:
    output: dict[int, float] = {}
    for previous, current in zip(candles, candles[1:], strict=False):
        if previous.close:
            output[current.time // 86_400] = current.close / previous.close - 1
    return output


def _total_return(candles: list[Candle]) -> float:
    if len(candles) < 2 or not candles[0].close:
        return 0.0
    return (candles[-1].close / candles[0].close - 1) * 100


def _annualized_return(candles: list[Candle]) -> float | None:
    if len(candles) < 2 or candles[0].close <= 0:
        return None
    elapsed_days = max((candles[-1].time - candles[0].time) / 86_400, 1)
    if elapsed_days < 60:
        return None
    growth = candles[-1].close / candles[0].close
    if growth <= 0:
        return None
    return (growth ** (365.25 / elapsed_days) - 1) * 100


def _volatility(candles: list[Candle]) -> float | None:
    values = _returns(candles)
    if len(values) < 5:
        return None
    return statistics.stdev(values) * math.sqrt(TRADING_DAYS) * 100


def _max_drawdown(candles: list[Candle]) -> float | None:
    if not candles:
        return None
    peak = candles[0].close
    worst = 0.0
    for candle in candles:
        peak = max(peak, candle.close)
        if peak > 0:
            worst = min(worst, candle.close / peak - 1)
    return worst * 100


def _sharpe(candles: list[Candle]) -> float | None:
    values = _returns(candles)
    if len(values) < 20:
        return None
    volatility = statistics.stdev(values)
    if volatility <= 1e-12:
        return None
    daily_risk_free = (1 + RISK_FREE_RATE_PERCENT / 100) ** (1 / TRADING_DAYS) - 1
    excess = statistics.mean(values) - daily_risk_free
    return excess / volatility * math.sqrt(TRADING_DAYS)


def _beta(candles: list[Candle], benchmark: list[Candle]) -> float | None:
    instrument_returns = _return_by_day(candles)
    benchmark_returns = _return_by_day(benchmark)
    shared = sorted(set(instrument_returns) & set(benchmark_returns))
    if len(shared) < 20:
        return None
    x = [benchmark_returns[day] for day in shared]
    y = [instrument_returns[day] for day in shared]
    variance = statistics.variance(x)
    if variance <= 1e-12:
        return None
    x_mean = statistics.mean(x)
    y_mean = statistics.mean(y)
    covariance = sum(
        (left - x_mean) * (right - y_mean)
        for left, right in zip(x, y, strict=False)
    ) / (len(shared) - 1)
    return covariance / variance


def _correlation(left: list[Candle], right: list[Candle]) -> float | None:
    left_returns = _return_by_day(left)
    right_returns = _return_by_day(right)
    shared = sorted(set(left_returns) & set(right_returns))
    if len(shared) < 5:
        return None
    x = [left_returns[day] for day in shared]
    y = [right_returns[day] for day in shared]
    x_mean = statistics.mean(x)
    y_mean = statistics.mean(y)
    numerator = sum(
        (a - x_mean) * (b - y_mean)
        for a, b in zip(x, y, strict=False)
    )
    denominator = math.sqrt(
        sum((a - x_mean) ** 2 for a in x)
        * sum((b - y_mean) ** 2 for b in y)
    )
    if denominator <= 1e-12:
        return None
    return max(-1.0, min(1.0, numerator / denominator))


def _momentum(candles: list[Candle], sessions: int = 20) -> float:
    if len(candles) <= sessions or candles[-sessions - 1].close == 0:
        return 0.0
    return (candles[-1].close / candles[-sessions - 1].close - 1) * 100


def _average_volume(candles: list[Candle], sessions: int = 20) -> float:
    sample = candles[-sessions:] if len(candles) >= sessions else candles
    return sum(item.volume for item in sample) / max(len(sample), 1)


def _normalized_series(candles: list[Candle]) -> list[ComparisonPoint]:
    if not candles or candles[0].close <= 0:
        return []
    base = candles[0].close
    return [
        ComparisonPoint(time=item.time, value=round(item.close / base * 100, 4))
        for item in candles
    ]


def _trim_range(candles: list[Candle], range_: str) -> list[Candle]:
    if range_ != "3y" or not candles:
        return candles
    threshold = candles[-1].time - int(3 * 365.25 * 86_400)
    trimmed = [candle for candle in candles if candle.time >= threshold]
    return trimmed or candles


def _metadata(symbol: str, quote: Quote) -> tuple[str, str, str]:
    if symbol.startswith("^"):
        return quote.name or symbol, "Indice", "indice"
    data = _TSX_METADATA.get(symbol) or _ETF_METADATA.get(symbol)
    if data:
        return data["name"], data["sector"], data["instrument_type"]
    return quote.name or symbol, "Autres", "autre"


def _score(
    *,
    total_return: float,
    sharpe: float | None,
    volatility: float | None,
    momentum: float,
    rsi: float | None,
    trend: str,
    forward_pe: float | None,
) -> float:
    performance = max(0.0, min(100.0, 50 + total_return * 2.2))
    risk_adjusted = 50.0 if sharpe is None else max(0.0, min(100.0, 50 + sharpe * 18))
    risk = 50.0 if volatility is None else max(0.0, min(100.0, 100 - volatility * 1.7))
    momentum_score = max(0.0, min(100.0, 50 + momentum * 3.0))
    rsi_score = 50.0 if rsi is None else max(0.0, min(100.0, 100 - abs(rsi - 58) * 2.1))
    trend_score = {"Haussière": 90.0, "Mixte": 55.0, "Baissière": 20.0}.get(trend, 45.0)
    valuation = 50.0
    if forward_pe is not None and forward_pe > 0:
        valuation = max(10.0, min(90.0, 82 - forward_pe * 1.8))
    value = (
        performance * 0.27
        + risk_adjusted * 0.20
        + risk * 0.12
        + momentum_score * 0.17
        + rsi_score * 0.08
        + trend_score * 0.11
        + valuation * 0.05
    )
    return round(max(0.0, min(100.0, value)), 1)


def _strengths_weaknesses(
    *,
    total_return: float,
    sharpe: float | None,
    volatility: float | None,
    momentum: float,
    rsi: float | None,
    trend: str,
    forward_pe: float | None,
    dividend_yield: float | None,
) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    weaknesses: list[str] = []
    if total_return >= 8:
        strengths.append("Performance de période solide")
    elif total_return <= -8:
        weaknesses.append("Performance de période négative")
    if sharpe is not None:
        if sharpe >= 1:
            strengths.append("Rendement ajusté au risque favorable")
        elif sharpe < 0:
            weaknesses.append("Rendement ajusté au risque négatif")
    if volatility is not None:
        if volatility <= 18:
            strengths.append("Volatilité contenue")
        elif volatility >= 35:
            weaknesses.append("Volatilité élevée")
    if momentum >= 5:
        strengths.append("Momentum 20 jours positif")
    elif momentum <= -5:
        weaknesses.append("Momentum 20 jours sous pression")
    if trend == "Haussière":
        strengths.append("Tendance technique haussière")
    elif trend == "Baissière":
        weaknesses.append("Tendance technique baissière")
    if rsi is not None and rsi >= 72:
        weaknesses.append("RSI en zone de surachat")
    elif rsi is not None and 45 <= rsi <= 65:
        strengths.append("RSI dans une zone constructive")
    if forward_pe is not None:
        if 0 < forward_pe <= 16:
            strengths.append("Valorisation prospective modérée")
        elif forward_pe >= 35:
            weaknesses.append("Valorisation prospective exigeante")
    if dividend_yield is not None and dividend_yield >= 3:
        strengths.append("Rendement du dividende notable")
    if not strengths:
        strengths.append("Profil équilibré sans avantage dominant")
    if not weaknesses:
        weaknesses.append("Aucune faiblesse majeure détectée dans les données disponibles")
    return strengths[:4], weaknesses[:4]


class AnalysisService:
    comparison_ttl_seconds = 300.0
    terminal_ttl_seconds = 60.0

    def __init__(self) -> None:
        self._cache = _TimedCache()

    async def _fundamental_snapshots(
        self,
        symbols: Iterable[str],
    ) -> dict[str, FundamentalSnapshot]:
        if market_data_service.demo_mode:
            return {}

        eligible = [
            symbol
            for symbol in symbols
            if symbol not in _ETF_METADATA and not symbol.startswith("^")
        ]
        if not eligible:
            return {}

        semaphore = asyncio.Semaphore(3)

        async def load(symbol: str) -> tuple[str, FundamentalSnapshot | None]:
            async with semaphore:
                try:
                    snapshot = await asyncio.wait_for(
                        fundamentals_service.get_snapshot(symbol),
                        timeout=12,
                    )
                    return symbol, snapshot
                except (TimeoutError, Exception):
                    return symbol, None

        pairs = await asyncio.gather(*(load(symbol) for symbol in eligible))
        return {symbol: value for symbol, value in pairs if value is not None}

    async def compare(self, request: CompareRequest) -> ComparisonSnapshot:
        cache_key = (
            "compare",
            tuple(request.symbols),
            request.range,
            request.benchmark,
        )
        cached = self._cache.get(cache_key, self.comparison_ttl_seconds)
        if isinstance(cached, ComparisonSnapshot):
            return cached

        async with self._cache.lock(cache_key):
            cached = self._cache.get(cache_key, self.comparison_ttl_seconds)
            if isinstance(cached, ComparisonSnapshot):
                return cached

            source_range = SOURCE_RANGES[request.range]
            history_symbols = list(dict.fromkeys([*request.symbols, request.benchmark]))
            quotes_task = market_data_service.get_quotes(request.symbols)
            histories_task = market_data_service.get_history_many(
                history_symbols,
                range_=source_range,
                interval="1d",
                concurrency=5,
            )
            fundamentals_task = self._fundamental_snapshots(request.symbols)
            quotes, histories, fundamentals = await asyncio.gather(
                quotes_task,
                histories_task,
                fundamentals_task,
            )

            quote_by_symbol = {
                quote.symbol.replace("-", ".").upper(): quote
                for quote in quotes
            }
            benchmark_history = _trim_range(
                histories.get(request.benchmark, []),
                request.range,
            )
            raw_rows: list[dict[str, object]] = []
            series: list[ComparisonSeries] = []

            for symbol in request.symbols:
                quote = quote_by_symbol.get(symbol.replace("-", "."))
                candles = _trim_range(histories.get(symbol, []), request.range)
                if quote is None or len(candles) < 2:
                    continue
                technicals = market_data_service.calculate_technicals(candles)
                fundamental = fundamentals.get(symbol)
                metrics = fundamental.metrics if fundamental is not None else None
                name, sector, instrument_type = _metadata(symbol, quote)
                avg_volume = _average_volume(candles)
                relative_volume = quote.volume / avg_volume if avg_volume else 0.0
                total_return = _total_return(candles)
                annualized = _annualized_return(candles)
                volatility = _volatility(candles)
                beta = _beta(candles, benchmark_history)
                drawdown = _max_drawdown(candles)
                sharpe = _sharpe(candles)
                momentum = _momentum(candles)
                dividend_yield = (
                    metrics.dividend_yield
                    if metrics is not None
                    else None
                )
                forward_pe = metrics.forward_pe if metrics is not None else None
                score = _score(
                    total_return=total_return,
                    sharpe=sharpe,
                    volatility=volatility,
                    momentum=momentum,
                    rsi=technicals.rsi_14,
                    trend=technicals.trend,
                    forward_pe=forward_pe,
                )
                strengths, weaknesses = _strengths_weaknesses(
                    total_return=total_return,
                    sharpe=sharpe,
                    volatility=volatility,
                    momentum=momentum,
                    rsi=technicals.rsi_14,
                    trend=technicals.trend,
                    forward_pe=forward_pe,
                    dividend_yield=dividend_yield,
                )
                raw_rows.append(
                    {
                        "ticker": quote.ticker,
                        "symbol": symbol,
                        "name": name,
                        "sector": sector,
                        "instrument_type": instrument_type,
                        "currency": quote.currency,
                        "price": quote.price,
                        "change_percent": quote.change_percent,
                        "total_return_percent": total_return,
                        "annualized_return_percent": annualized,
                        "volatility_percent": volatility,
                        "beta": beta,
                        "max_drawdown_percent": drawdown,
                        "sharpe_ratio": sharpe,
                        "momentum_20d": momentum,
                        "rsi_14": technicals.rsi_14,
                        "relative_volume": relative_volume,
                        "trend": technicals.trend,
                        "market_cap": metrics.market_cap if metrics is not None else None,
                        "trailing_pe": metrics.trailing_pe if metrics is not None else None,
                        "forward_pe": forward_pe,
                        "price_to_book": metrics.price_to_book if metrics is not None else None,
                        "dividend_yield_percent": dividend_yield,
                        "score": score,
                        "strengths": strengths,
                        "weaknesses": weaknesses,
                        "source": quote.source,
                        "delayed": quote.delayed,
                    }
                )
                series.append(
                    ComparisonSeries(
                        symbol=symbol,
                        name=name,
                        points=_normalized_series(candles),
                    )
                )

            ranked = sorted(raw_rows, key=lambda row: float(row["score"]), reverse=True)
            instruments = [
                ComparisonInstrument(**row, rank=index + 1)
                for index, row in enumerate(ranked)
            ]

            correlation_symbols = [item.symbol for item in instruments]
            correlation_values: list[list[float | None]] = []
            for left_symbol in correlation_symbols:
                left = _trim_range(histories.get(left_symbol, []), request.range)
                row: list[float | None] = []
                for right_symbol in correlation_symbols:
                    if left_symbol == right_symbol:
                        row.append(1.0)
                    else:
                        value = _correlation(
                            left,
                            _trim_range(histories.get(right_symbol, []), request.range),
                        )
                        row.append(round(value, 4) if value is not None else None)
                correlation_values.append(row)

            snapshot = ComparisonSnapshot(
                range=request.range,
                range_label=RANGE_LABELS[request.range],
                benchmark=request.benchmark,
                benchmark_name="S&P/TSX Composite",
                instruments=instruments,
                series=series,
                correlation=CorrelationMatrix(
                    symbols=correlation_symbols,
                    values=correlation_values,
                ),
                risk_free_rate_percent=RISK_FREE_RATE_PERCENT,
                methodology=(
                    "Score composite fondé sur la performance, le rendement ajusté au risque, "
                    "la volatilité, le momentum, le RSI, la tendance et les données de "
                    "valorisation disponibles. Il s'agit d'un outil d'analyse, pas d'une recommandation."
                ),
                generated_at=datetime.now(UTC),
                refresh_after_seconds=300,
            )
            self._cache.set(cache_key, snapshot)
            return snapshot

    async def terminal(self) -> TerminalSnapshot:
        cache_key = "terminal:v2:tsx60"
        cached = self._cache.get(cache_key, self.terminal_ttl_seconds)
        if isinstance(cached, TerminalSnapshot):
            return cached

        async with self._cache.lock(cache_key):
            cached = self._cache.get(cache_key, self.terminal_ttl_seconds)
            if isinstance(cached, TerminalSnapshot):
                return cached
            previous = self._cache.peek(cache_key)
            symbols = [item.symbol for item in TSX60]
            driver_symbols = [definition[3] for definition in YAHOO_DRIVERS]
            screener_result, histories_result, rates_result = await asyncio.gather(
                screener_service.get_tsx60(),
                market_data_service.get_history_many_strict(
                    [*symbols, "^GSPTSE", *driver_symbols],
                    range_="1y",
                    interval="1d",
                    concurrency=8,
                ),
                bank_of_canada_valet_service.yields(),
                return_exceptions=True,
            )
            if isinstance(screener_result, Exception):
                if isinstance(previous, TerminalSnapshot):
                    return previous
                raise screener_result
            histories = histories_result if isinstance(histories_result, dict) else {}
            rates = rates_result if isinstance(rates_result, dict) else None
            raw_rows = screener_result.items
            quality = data_quality(raw_rows, histories, symbols, explicit_demo=market_data_service.demo_mode)
            rows = rebuild_real_rows(raw_rows, histories, explicit_demo=market_data_service.demo_mode)
            equity_histories = {row.symbol: histories[row.symbol] for row in rows if row.symbol in histories}
            weights = {item.symbol: item.weight for item in TSX60}
            benchmark = histories.get("^GSPTSE", [])
            sufficient = quality.history_coverage_percent >= COVERAGE_THRESHOLD_PERCENT

            if (
                not sufficient
                and isinstance(previous, TerminalSnapshot)
                and previous.data_quality.history_coverage_percent >= COVERAGE_THRESHOLD_PERCENT
            ):
                stale_quality = previous.data_quality.model_copy(
                    update={
                        "warnings": [
                            *previous.data_quality.warnings,
                            "Dernier snapshot réel conservé: la couverture fournisseur actuelle est insuffisante.",
                        ],
                        "source_statuses": {**previous.data_quality.source_statuses, "terminal_cache": "stale-real"},
                    }
                )
                return previous.model_copy(update={"data_quality": stale_quality})

            horizons = build_regime_horizons(rows, equity_histories, weights, len(symbols))
            session = next((item for item in horizons if item.key == "session"), None)
            breadth = build_breadth(rows, equity_histories, weights, len(symbols))
            rotation = build_sector_rotation(rows, equity_histories, benchmark, len(symbols)) if sufficient else []
            anomalies = build_anomalies(rows, equity_histories) if sufficient else []
            sectors = legacy_sectors(rotation, rows)
            ranked = sorted(rows, key=lambda row: row.score, reverse=True)
            anomaly_types_by_symbol: dict[str, list[str]] = defaultdict(list)
            for anomaly in anomalies:
                if anomaly.symbol and anomaly.type not in anomaly_types_by_symbol[anomaly.symbol]:
                    anomaly_types_by_symbol[anomaly.symbol].append(anomaly.type)
            radar_items = [
                TerminalRadarItem(
                    **opportunity(row, "Radar").model_dump(),
                    volume=row.volume,
                    average_volume_20d=row.average_volume_20d,
                    sma_20=row.sma_20,
                    sma_50=row.sma_50,
                    trend=row.trend,
                    source=row.source,
                    delayed=row.delayed,
                    anomaly_types=anomaly_types_by_symbol.get(row.symbol, []),
                )
                for row in ranked
            ]
            leaders = [opportunity(row, "Leadership") for row in ranked[:8]]
            laggards = [opportunity(row, "Sous pression") for row in sorted(rows, key=lambda row: row.score)[:8]]
            opportunities = [
                opportunity(row, "Accélération" if row.relative_volume >= 1.4 else "Tendance")
                for row in ranked
                if row.score >= 62 and row.momentum_20d > 0 and (row.rsi_14 is None or row.rsi_14 < 75)
            ][:12]
            alerts = [
                TerminalAlert(
                    id=item.id,
                    severity=item.severity,
                    category="Anomalie statistique",
                    symbol=item.symbol,
                    title=item.title,
                    detail=item.detail,
                )
                for item in anomalies[:16]
            ]
            if breadth.divergence.active:
                alerts.insert(0, TerminalAlert(
                    id="breadth-divergence",
                    severity=breadth.divergence.severity,
                    category="Marché",
                    title=breadth.divergence.title,
                    detail=breadth.divergence.explanation,
                ))
            components = [
                TerminalComponent(
                    key="breadth", label="Largeur du marché", score=breadth.advance_ratio,
                    value=(f"{breadth.advancers} hausses / {breadth.decliners} baisses" if breadth.advancers is not None else "N/D"),
                    description="Part des titres en hausse parmi les mouvements directionnels sur données réelles éligibles.",
                ),
                TerminalComponent(
                    key="trend", label="Structure de tendance",
                    score=(None if breadth.above_sma20_percent is None or breadth.above_sma50_percent is None else round(breadth.above_sma20_percent * 0.45 + breadth.above_sma50_percent * 0.55, 1)),
                    value=(f"{breadth.above_sma50_percent:.0f} % au-dessus de la MM50" if breadth.above_sma50_percent is not None else "N/D"),
                    description="Proportion des titres au-dessus des MM20 et MM50, sans historique de démonstration implicite.",
                ),
                TerminalComponent(
                    key="momentum", label="Impulsion 20 jours",
                    score=(None if session is None or session.average_momentum_percent is None else max(0, min(100, 50 + session.average_momentum_percent * 4))),
                    value=(f"{session.average_momentum_percent:+.2f} % en moyenne" if session and session.average_momentum_percent is not None else "N/D"),
                    description="Momentum transversal moyen des composantes disposant d'un historique réel suffisant.",
                ),
                TerminalComponent(
                    key="quality", label="Qualité des signaux",
                    score=(round(statistics.fmean(row.score for row in rows), 1) if sufficient and rows else None),
                    value=(f"{statistics.fmean(row.score for row in rows):.1f}/100" if sufficient and rows else "N/D"),
                    description="Moyenne du score Anatole reconstruit à partir du jeu historique strict.",
                ),
            ]
            drivers = yahoo_market_drivers(histories, benchmark) + rate_market_drivers(rates, benchmark)
            source_statuses = dict(quality.source_statuses)
            source_statuses["bank_of_canada"] = "available" if rates else "unavailable"
            source_statuses["benchmark"] = "available" if benchmark else "unavailable"
            quality = quality.model_copy(update={"source_statuses": source_statuses})
            snapshot = TerminalSnapshot(
                universe=screener_result.universe,
                regime=session.regime if session else None,
                regime_score=session.score if session else None,
                risk_level=session.risk_level if session else None,
                weighted_change_percent=session.change_percent if session else None,
                advance_ratio=breadth.advance_ratio,
                average_anatole_score=(round(statistics.fmean(row.score for row in rows), 1) if sufficient and rows else None),
                average_momentum_20d=(round(statistics.fmean(row.momentum_20d for row in rows), 2) if sufficient and rows else None),
                above_sma20_percent=breadth.above_sma20_percent,
                above_sma50_percent=breadth.above_sma50_percent,
                high_relative_volume_count=(sum(row.relative_volume >= 1.5 for row in rows) if sufficient else None),
                components=components,
                sectors=sectors,
                opportunities=opportunities,
                alerts=alerts[:16],
                leaders=leaders,
                laggards=laggards,
                data_quality=quality,
                regime_horizons=horizons,
                regime_history=build_regime_history(equity_histories, benchmark, len(symbols)) if sufficient else [],
                breadth_pro=breadth,
                sector_rotation=rotation,
                anomalies=anomalies,
                market_drivers=drivers,
                radar_items=radar_items,
                methodology_sections=methodology_sections(),
                methodology=(
                    "Régime: largeur 30 %, tendance 30 %, score Anatole moyen 22 %, momentum 12 % et tape/performance 6 %. "
                    "Les calculs utilisent uniquement les données réelles disponibles, ou demo-explicit lorsque ce mode est demandé."
                ),
                generated_at=datetime.now(UTC),
                refresh_after_seconds=60,
            )
            self._cache.set(cache_key, snapshot)
            return snapshot


analysis_service = AnalysisService()
