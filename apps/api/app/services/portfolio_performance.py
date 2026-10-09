from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from app.core.resilience import AsyncStaleCache
from app.schemas.stocks import Candle
from app.schemas.workspace import (
    PortfolioPerformancePoint,
    PortfolioPerformanceRequest,
    PortfolioPerformanceView,
)
from app.services.market_data import market_data_service
from app.services.currency_conversion import currency_conversion_service
from app.services.portfolio_symbols import portfolio_provider_ticker


_RANGE_LABELS = {
    "1w": "1 semaine",
    "1m": "1 mois",
    "3m": "3 mois",
    "ytd": "Année en cours",
    "1y": "1 an",
    "5y": "5 ans",
    "10y": "10 ans",
    "max": "Maximum disponible",
}

_PROVIDER_RANGES = {
    "1w": "1mo",
    "1m": "3mo",
    "3m": "6mo",
    "ytd": "ytd",
    "1y": "1y",
    "5y": "5y",
    "10y": "10y",
    "max": "max",
}

_BENCHMARK_NAMES = {
    "^GSPTSE": "S&P/TSX Composite",
    "^GSPC": "S&P 500",
    "VFV": "Vanguard S&P 500 Index ETF",
    "XIC": "iShares Core S&P/TSX Capped Composite ETF",
    "XIU": "iShares S&P/TSX 60 Index ETF",
}
STRICT_COVERAGE = 0.70
PROXY_COVERAGE = 0.50


def _benchmark_name(value: str) -> str:
    key = value.strip().upper().removesuffix(".TO")
    return _BENCHMARK_NAMES.get(key, key)


def _cutoff(range_: str, now: datetime) -> int | None:
    if range_ == "max":
        return None
    if range_ == "ytd":
        return int(datetime(now.year, 1, 1, tzinfo=UTC).timestamp())

    days = {
        "1w": 9,
        "1m": 33,
        "3m": 96,
        "1y": 370,
        "5y": 1_835,
        "10y": 3_665,
    }[range_]
    return int((now - timedelta(days=days)).timestamp())


def _returns(candles: list[Candle], cutoff: int | None) -> dict[int, float]:
    output: dict[int, float] = {}
    for previous, current in zip(candles, candles[1:], strict=False):
        if cutoff is not None and current.time < cutoff:
            continue
        if previous.close:
            output[current.time // 86_400] = current.close / previous.close - 1
    return output


def _downsample(
    points: list[PortfolioPerformancePoint],
    max_points: int = 520,
) -> list[PortfolioPerformancePoint]:
    if len(points) <= max_points:
        return points

    last_index = len(points) - 1
    indexes = {
        round(index * last_index / (max_points - 1))
        for index in range(max_points)
    }
    return [points[index] for index in sorted(indexes)]


def _series(
    days: list[int], returns: dict[str, dict[int, float]], weights: dict[str, float],
    benchmark: dict[int, float], *, threshold: float, renormalize: bool,
) -> tuple[list[PortfolioPerformancePoint], list[float], float, float | None]:
    included = [(day, [symbol for symbol in weights if day in returns[symbol]]) for day in days]
    included = [(day, symbols, sum(weights[symbol] for symbol in symbols))
                for day, symbols in included]
    included = [(day, symbols, coverage) for day, symbols, coverage in included
                if symbols and coverage >= threshold]
    if not included:
        return [], [], 100.0, None
    # A benchmark without the first portfolio return cannot be rebased to the same start.
    benchmark_complete = all(day in benchmark for day, _, _ in included)
    level = benchmark_level = 100.0
    first_day = included[0][0]
    points = [PortfolioPerformancePoint(
        time=max(0, (first_day - 1) * 86_400), portfolio=100.0,
        benchmark=100.0 if benchmark_complete else None,
        coverage_percent=round(included[0][2] * 100, 2),
    )]
    coverages: list[float] = []
    for day, symbols, coverage in included:
        daily_return = sum(weights[symbol] * returns[symbol][day] for symbol in symbols)
        if renormalize:
            daily_return /= coverage
        level *= 1 + daily_return
        if benchmark_complete:
            benchmark_level *= 1 + benchmark[day]
        coverages.append(coverage)
        points.append(PortfolioPerformancePoint(
            time=day * 86_400, portfolio=round(level, 4),
            benchmark=round(benchmark_level, 4) if benchmark_complete else None,
            coverage_percent=round(coverage * 100, 2),
        ))
    return points, coverages, level, benchmark_level if benchmark_complete else None


class PortfolioPerformanceService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[
            tuple[str, str, tuple[tuple[str, str, float], ...]],
            PortfolioPerformanceView,
        ] = AsyncStaleCache(
            max_entries=256,
            metric_namespace="portfolio-performance-view",
        )

    async def analyze(
        self,
        request: PortfolioPerformanceRequest,
    ) -> PortfolioPerformanceView:
        total_weight = sum(item.weight_percent for item in request.positions)
        weights = {
            item.symbol: item.weight_percent / total_weight
            for item in request.positions
        }
        markets = {
            item.symbol: item.market
            for item in request.positions
        }
        key = (
            request.range,
            request.benchmark,
            tuple(
                sorted(
                    (symbol, markets[symbol], round(weight, 4))
                    for symbol, weight in weights.items()
                )
            ),
        )

        return await self._cache.get_or_load(
            key,
            lambda: self._load(request, weights, markets),
            fresh_seconds=10 * 60,
            stale_seconds=2 * 60 * 60,
        )

    async def _load(
        self,
        request: PortfolioPerformanceRequest,
        weights: dict[str, float],
        markets: dict[str, str],
    ) -> PortfolioPerformanceView:
        now = datetime.now(UTC)
        provider_symbols = {
            symbol: portfolio_provider_ticker(symbol, markets[symbol])
            for symbol in weights
        }
        normalized = {
            symbol: market_data_service.normalize_ticker(provider_symbol)
            for symbol, provider_symbol in provider_symbols.items()
        }
        benchmark_ticker = market_data_service.normalize_ticker(request.benchmark)
        tickers = list(
            dict.fromkeys([
                *normalized.values(),
                benchmark_ticker,
            ])
        )

        quotes, histories = await asyncio.gather(
            market_data_service.get_quotes(
                list(provider_symbols.values()),
                deadline_seconds=4.0,
            ),
            market_data_service.get_history_many_strict(
                tickers,
                range_=_PROVIDER_RANGES[request.range],
                interval="1d",
                concurrency=10,
                deadline_seconds=(
                    12.0
                    if request.range in {"5y", "10y", "max"}
                    else 8.0
                ),
                attempts=1,
                exact_symbols=True,
            ),
        )

        quote_by_ticker = {
            quote.ticker.strip().upper(): quote
            for quote in quotes
        }
        conversion_jobs = {
            symbol: currency_conversion_service.candles_to_cad(
                ticker,
                (
                    quote_by_ticker[ticker].native_currency
                    or quote_by_ticker[ticker].currency
                ),
                histories.get(ticker, []),
            )
            for symbol, ticker in normalized.items()
            if ticker in quote_by_ticker and histories.get(ticker)
        }
        if conversion_jobs:
            converted = await asyncio.gather(
                *conversion_jobs.values(),
                return_exceptions=True,
            )
            for symbol, result in zip(conversion_jobs, converted, strict=False):
                if not isinstance(result, Exception):
                    histories[normalized[symbol]] = result

        cutoff = _cutoff(request.range, now)
        return_maps = {
            symbol: _returns(
                histories.get(ticker, histories.get(symbol, [])),
                cutoff,
            )
            for symbol, ticker in normalized.items()
        }
        benchmark_map = _returns(
            histories.get(
                benchmark_ticker,
                histories.get(request.benchmark, []),
            ),
            cutoff,
        )

        all_days = sorted(
            set().union(
                *(values.keys() for values in return_maps.values())
            )
            if return_maps
            else set()
        )

        points, coverages, level, benchmark_level = _series(
            all_days, return_maps, weights, benchmark_map,
            threshold=STRICT_COVERAGE, renormalize=False,
        )
        long_range = request.range in {"5y", "10y", "max"}
        proxy, _, _, _ = _series(
            all_days, return_maps, weights, benchmark_map,
            threshold=PROXY_COVERAGE, renormalize=True,
        ) if long_range else ([], [], 100.0, None)
        if not points or not proxy or proxy[0].time >= points[0].time:
            proxy = []
        coverage = sum(coverages) / len(coverages) * 100 if coverages else 0.0
        effective_start = datetime.fromtimestamp(points[0].time, UTC) if points else None
        effective_end = datetime.fromtimestamp(points[-1].time, UTC) if points else None
        effective_days = max(0, (points[-1].time - points[0].time) // 86_400) if points else None
        requested_days = (None if request.range == "max" else
                          max(1, int((now.timestamp() - cutoff) // 86_400)) if cutoff is not None else None)
        # Dates below the strict threshold count as zero. Use the observed
        # cadence to account for years with no price, including weekly fixtures.
        observed_days = all_days[-1] - all_days[0] + 1 if all_days else 0
        observed_fraction = (min(1.0, observed_days / requested_days)
                             if requested_days else 1.0)
        window_coverage = 100 * sum(coverages) / max(len(all_days), 1) * observed_fraction
        history_status = ("insufficient" if len(points) < 2 else
                          "partial" if requested_days and effective_days is not None
                          and (effective_days < requested_days * .9 or window_coverage < 70) else
                          "partial" if request.range == "max" and proxy else "full")
        portfolio_return = level - 100.0 if len(points) >= 2 else None
        benchmark_return = benchmark_level - 100.0 if benchmark_level is not None else None
        excess = (
            portfolio_return - benchmark_return
            if portfolio_return is not None and benchmark_return is not None
            else None
        )

        return PortfolioPerformanceView(
            range=request.range,
            range_label=_RANGE_LABELS[request.range],
            benchmark=request.benchmark,
            benchmark_name=_benchmark_name(request.benchmark),
            points=_downsample(points),
            requested_range=request.range,
            strict_points=_downsample(points),
            proxy_points=_downsample(proxy),
            effective_start=effective_start,
            effective_end=effective_end,
            effective_days=effective_days,
            effective_years=round(effective_days / 365.25, 2) if effective_days is not None else None,
            requested_days=requested_days,
            effective_coverage_percent=round(coverage, 2),
            requested_window_coverage_percent=round(window_coverage, 2),
            history_status=history_status,
            portfolio_return_percent=(
                round(portfolio_return, 2)
                if portfolio_return is not None
                else None
            ),
            benchmark_return_percent=(
                round(benchmark_return, 2)
                if benchmark_return is not None
                else None
            ),
            excess_return_percent=(
                round(excess, 2)
                if excess is not None
                else None
            ),
            coverage_percent=round(coverage, 2),
            methodology=(
                "Performance reconstituée avec les poids actuels du portefeuille. "
                "Cette courbe ne tient pas encore compte des dates d'achat, "
                "apports, retraits ou dividendes personnels. Historique strict: poids disponibles "
                "≥70 %. Proxy partiel facultatif: poids disponibles ≥50 %, renormalisés chaque jour; "
                "ce proxy n’est pas la performance réelle du portefeuille complet."
            ),
            generated_at=now,
            refresh_after_seconds=300,
        )


portfolio_performance_service = PortfolioPerformanceService()
