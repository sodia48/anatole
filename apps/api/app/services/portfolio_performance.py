from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.resilience import AsyncStaleCache
from app.schemas.stocks import Candle
from app.schemas.workspace import (
    PortfolioPerformancePoint,
    PortfolioPerformanceRequest,
    PortfolioPerformanceView,
)
from app.services.market_data import market_data_service


_RANGE_LABELS = {
    "1w": "1 semaine",
    "1m": "1 mois",
    "3m": "3 mois",
    "ytd": "AnnÃ©e en cours",
    "1y": "1 an",
    "max": "Maximum disponible",
}

_PROVIDER_RANGES = {
    "1w": "1mo",
    "1m": "3mo",
    "3m": "6mo",
    "ytd": "ytd",
    "1y": "1y",
    "max": "max",
}

_BENCHMARK_NAMES = {
    "^GSPTSE": "S&P/TSX Composite",
    "^GSPC": "S&P 500",
    "VFV": "Vanguard S&P 500 Index ETF",
    "XIC": "iShares Core S&P/TSX Capped Composite ETF",
    "XIU": "iShares S&P/TSX 60 Index ETF",
}


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


class PortfolioPerformanceService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[
            tuple[str, str, tuple[tuple[str, float], ...]],
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
        key = (
            request.range,
            request.benchmark,
            tuple(
                sorted(
                    (symbol, round(weight, 4))
                    for symbol, weight in weights.items()
                )
            ),
        )

        return await self._cache.get_or_load(
            key,
            lambda: self._load(request, weights),
            fresh_seconds=10 * 60,
            stale_seconds=2 * 60 * 60,
        )

    async def _load(
        self,
        request: PortfolioPerformanceRequest,
        weights: dict[str, float],
    ) -> PortfolioPerformanceView:
        now = datetime.now(UTC)
        normalized = {
            symbol: market_data_service.normalize_ticker(symbol)
            for symbol in weights
        }
        benchmark_ticker = market_data_service.normalize_ticker(request.benchmark)
        tickers = list(
            dict.fromkeys([
                *normalized.values(),
                benchmark_ticker,
            ])
        )

        histories = await market_data_service.get_history_many_strict(
            tickers,
            range_=_PROVIDER_RANGES[request.range],
            interval="1d",
            concurrency=10,
            deadline_seconds=12.0 if request.range == "max" else 8.0,
            attempts=1,
        )

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

        level = 100.0
        benchmark_level = 100.0
        points: list[PortfolioPerformancePoint] = []
        coverages: list[float] = []
        benchmark_seen = False

        for day in all_days:
            available = [
                symbol
                for symbol, values in return_maps.items()
                if day in values
            ]
            available_weight = sum(weights[symbol] for symbol in available)
            coverages.append(available_weight)

            if not available or available_weight < 0.70:
                continue

            if not points:
                points.append(
                    PortfolioPerformancePoint(
                        time=max(0, (day - 1) * 86_400),
                        portfolio=100.0,
                        benchmark=100.0 if benchmark_map else None,
                    )
                )

            daily_return = sum(
                weights[symbol] * return_maps[symbol][day]
                for symbol in available
            )
            level *= 1 + daily_return

            benchmark_return = benchmark_map.get(day)
            if benchmark_return is not None:
                benchmark_level *= 1 + benchmark_return
                benchmark_seen = True

            points.append(
                PortfolioPerformancePoint(
                    time=day * 86_400,
                    portfolio=round(level, 4),
                    benchmark=(
                        round(benchmark_level, 4)
                        if benchmark_seen
                        else None
                    ),
                )
            )

        coverage = (
            sum(coverages) / len(coverages) * 100
            if coverages
            else 0.0
        )
        portfolio_return = level - 100.0 if len(points) >= 2 else None
        benchmark_return = benchmark_level - 100.0 if benchmark_seen else None
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
                "Performance reconstituÃ©e avec les poids actuels du portefeuille. "
                "Cette courbe ne tient pas encore compte des dates d'achat, "
                "apports, retraits ou dividendes personnels."
            ),
            generated_at=now,
            refresh_after_seconds=300,
        )


portfolio_performance_service = PortfolioPerformanceService()
