from __future__ import annotations

import math
import statistics
from dataclasses import dataclass

from app.schemas.backtest import (
    BacktestEquityPoint,
    BacktestRequest,
    BacktestResult,
    BacktestTrade,
)
from app.schemas.stocks import Candle
from app.services.anatole_script import compile_script
from app.services.market_data import market_data_service
from app.services.technical_analysis import (
    aggregate_candles,
    calculate_indicator,
    crossed_above,
    crossed_below,
    ema,
    rsi,
    sma,
)


@dataclass(slots=True)
class StrategySignals:
    enter_long: list[bool]
    exit_long: list[bool]
    entry_reason: str
    exit_reason: str


@dataclass(slots=True)
class OpenPosition:
    side: str
    quantity: float
    entry_time: int
    entry_price: float
    entry_commission: float


def _parameter(
    request: BacktestRequest,
    key: str,
    default: int,
    *,
    minimum: int = 1,
    maximum: int = 500,
) -> int:
    try:
        value = int(request.strategy_parameters.get(key, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))


def _crosses(
    left: list[float | None],
    right: list[float | None],
) -> tuple[list[bool], list[bool]]:
    above = [False] * len(left)
    below = [False] * len(left)
    for index in range(1, len(left)):
        above[index] = crossed_above(
            left[max(0, index - 1):index + 1],
            right[max(0, index - 1):index + 1],
        )
        below[index] = crossed_below(
            left[max(0, index - 1):index + 1],
            right[max(0, index - 1):index + 1],
        )
    return above, below


def strategy_signals(
    candles: list[Candle],
    request: BacktestRequest,
) -> StrategySignals:
    closes = [item.close for item in candles]
    if request.strategy == "anatole_script":
        if not request.script:
            raise ValueError("Un Anatole Script est requis pour cette stratégie.")
        compiled = compile_script(request.script, candles)
        if compiled.program.kind != "strategy":
            raise ValueError("Le script doit être déclaré avec strategy.")
        return StrategySignals(
            enter_long=compiled.enter_long,
            exit_long=compiled.exit_long,
            entry_reason="Anatole Script · enter_long",
            exit_reason="Anatole Script · exit_long",
        )
    if request.strategy in {"sma_crossover", "ema_crossover"}:
        fast = _parameter(request, "fast", 20)
        slow = _parameter(request, "slow", 50)
        if fast >= slow:
            raise ValueError("La période rapide doit être inférieure à la période lente.")
        calculator = sma if request.strategy == "sma_crossover" else ema
        fast_series = calculator(closes, fast)
        slow_series = calculator(closes, slow)
        entries, exits = _crosses(fast_series, slow_series)
        label = "SMA" if request.strategy == "sma_crossover" else "EMA"
        return StrategySignals(
            entries,
            exits,
            f"{label}{fast} croise au-dessus de {label}{slow}",
            f"{label}{fast} croise sous {label}{slow}",
        )
    if request.strategy == "rsi_mean_reversion":
        window = _parameter(request, "period", 14)
        oversold = float(request.strategy_parameters.get("oversold", 30))
        exit_level = float(request.strategy_parameters.get("exit", 50))
        values = rsi(closes, window)
        return StrategySignals(
            [value is not None and value <= oversold for value in values],
            [value is not None and value >= exit_level for value in values],
            f"RSI{window} sous {oversold:g}",
            f"RSI{window} au-dessus de {exit_level:g}",
        )
    if request.strategy == "macd_crossover":
        values = calculate_indicator(
            candles,
            "macd",
            {
                "fast": _parameter(request, "fast", 12),
                "slow": _parameter(request, "slow", 26),
                "signal": _parameter(request, "signal", 9),
            },
        )
        entries, exits = _crosses(values["macd"], values["signal"])
        return StrategySignals(
            entries,
            exits,
            "MACD croise au-dessus du signal",
            "MACD croise sous le signal",
        )
    if request.strategy == "bollinger_breakout":
        values = calculate_indicator(
            candles,
            "bollinger",
            {
                "period": _parameter(request, "period", 20),
                "deviation": float(request.strategy_parameters.get("deviation", 2)),
            },
        )
        return StrategySignals(
            [
                upper is not None and close > upper
                for close, upper in zip(closes, values["upper"], strict=False)
            ],
            [
                middle is not None and close < middle
                for close, middle in zip(closes, values["middle"], strict=False)
            ],
            "Clôture au-dessus de la bande supérieure",
            "Clôture sous la moyenne Bollinger",
        )
    if request.strategy == "donchian_breakout":
        values = calculate_indicator(
            candles,
            "donchian",
            {"period": _parameter(request, "period", 20)},
        )
        upper = [None, *values["upper"][:-1]]
        lower = [None, *values["lower"][:-1]]
        return StrategySignals(
            [
                level is not None and close > level
                for close, level in zip(closes, upper, strict=False)
            ],
            [
                level is not None and close < level
                for close, level in zip(closes, lower, strict=False)
            ],
            "Cassure du plus haut Donchian précédent",
            "Cassure du plus bas Donchian précédent",
        )
    raise ValueError(f"Stratégie inconnue : {request.strategy}")


def _valid_provider_combination(range_: str, interval: str) -> bool:
    if interval == "1m":
        return range_ in {"1d", "5d"}
    if interval in {"2m", "5m", "15m", "30m"}:
        return range_ in {"1d", "5d", "1mo"}
    if interval in {"1h", "4h"}:
        return range_ in {
            "1d", "5d", "1mo", "3mo", "6mo", "ytd", "1y", "2y"
        }
    return True


def _mark_equity(
    cash: float,
    position: OpenPosition | None,
    price: float,
) -> float:
    if position is None:
        return cash
    value = position.quantity * price
    return cash + value if position.side == "long" else cash - value


class BacktestService:
    async def run(
        self,
        request: BacktestRequest,
        *,
        candles: list[Candle] | None = None,
    ) -> BacktestResult:
        if not _valid_provider_combination(request.range, request.interval):
            raise ValueError(
                "Cette combinaison période/unité de temps n’est pas offerte "
                "de façon fiable par le fournisseur de données."
            )
        if candles is None:
            provider_interval = {
                "1h": "60m",
                "4h": "60m",
            }.get(request.interval, request.interval)
            candles = await market_data_service.get_history(
                request.ticker,
                range_=request.range,
                interval=provider_interval,
            )
            if request.interval == "4h":
                candles = aggregate_candles(candles, 4)
        if len(candles) < 3:
            raise ValueError("Au moins trois observations sont requises.")
        candles = sorted(candles, key=lambda item: item.time)
        signals = strategy_signals(candles, request)
        return self._simulate(request, candles, signals)

    def _simulate(
        self,
        request: BacktestRequest,
        candles: list[Candle],
        signals: StrategySignals,
    ) -> BacktestResult:
        cash = request.initial_capital
        position: OpenPosition | None = None
        trades: list[BacktestTrade] = []
        curve: list[BacktestEquityPoint] = []
        peak = request.initial_capital
        max_drawdown = 0.0
        max_drawdown_percent = 0.0
        exposure_bars = 0
        slippage_rate = request.slippage / 100

        def close_position(candle: Candle, reason: str) -> None:
            nonlocal cash, position
            if position is None:
                return
            fill = (
                candle.open * (1 - slippage_rate)
                if position.side == "long"
                else candle.open * (1 + slippage_rate)
            )
            if reason == "Fin de la période testée":
                fill = (
                    candle.close * (1 - slippage_rate)
                    if position.side == "long"
                    else candle.close * (1 + slippage_rate)
                )
            gross = (
                (fill - position.entry_price) * position.quantity
                if position.side == "long"
                else (position.entry_price - fill) * position.quantity
            )
            if position.side == "long":
                cash += position.quantity * fill - request.commission
            else:
                cash -= position.quantity * fill + request.commission
            total_commission = position.entry_commission + request.commission
            pnl = gross - total_commission
            entry_notional = position.quantity * position.entry_price
            trades.append(BacktestTrade(
                side=position.side,
                entry_time=position.entry_time,
                entry_price=round(position.entry_price, 6),
                exit_time=candle.time,
                exit_price=round(fill, 6),
                quantity=round(position.quantity, 6),
                pnl=round(pnl, 4),
                pnl_percent=round(
                    pnl / entry_notional * 100 if entry_notional else 0,
                    4,
                ),
                commission=round(total_commission, 4),
                slippage=request.slippage,
                reason=reason,
            ))
            position = None

        def open_position(candle: Candle, side: str) -> None:
            nonlocal cash, position
            equity = _mark_equity(cash, position, candle.open)
            allocation = max(0.0, equity * request.position_size / 100)
            fill = (
                candle.open * (1 + slippage_rate)
                if side == "long"
                else candle.open * (1 - slippage_rate)
            )
            quantity = max(
                0.0,
                (allocation - request.commission) / fill,
            )
            if quantity <= 0:
                return
            if side == "long":
                cash -= quantity * fill + request.commission
            else:
                cash += quantity * fill - request.commission
            position = OpenPosition(
                side=side,
                quantity=quantity,
                entry_time=candle.time,
                entry_price=fill,
                entry_commission=request.commission,
            )

        for index, candle in enumerate(candles):
            if index > 0:
                signal_index = index - 1
                enter = signals.enter_long[signal_index]
                exit_ = signals.exit_long[signal_index]
                desired: str | None = None
                exit_reason: str | None = None
                if request.direction == "long":
                    desired = "long" if enter else None
                    exit_reason = signals.exit_reason if exit_ else None
                elif request.direction == "short":
                    desired = "short" if exit_ else None
                    exit_reason = signals.entry_reason if enter else None
                else:
                    desired = "long" if enter else "short" if exit_ else None
                    if position is not None and position.side == "long" and exit_:
                        exit_reason = signals.exit_reason
                    elif position is not None and position.side == "short" and enter:
                        exit_reason = signals.entry_reason
                if position is not None and (
                    exit_reason is not None
                    or desired is not None and desired != position.side
                ):
                    close_position(candle, exit_reason or "Signal opposé")
                if position is None and desired is not None:
                    open_position(candle, desired)

            if position is not None:
                exposure_bars += 1
            equity = _mark_equity(cash, position, candle.close)
            peak = max(peak, equity)
            drawdown = min(0.0, equity - peak)
            drawdown_percent = drawdown / peak * 100 if peak else 0.0
            max_drawdown = min(max_drawdown, drawdown)
            max_drawdown_percent = min(
                max_drawdown_percent,
                drawdown_percent,
            )
            curve.append(BacktestEquityPoint(
                time=candle.time,
                equity=round(equity, 4),
                drawdown=round(drawdown, 4),
                drawdown_percent=round(drawdown_percent, 4),
            ))

        if position is not None:
            close_position(candles[-1], "Fin de la période testée")
            peak = max(peak, cash)
            final_drawdown = min(0.0, cash - peak)
            final_drawdown_percent = final_drawdown / peak * 100 if peak else 0.0
            max_drawdown = min(max_drawdown, final_drawdown)
            max_drawdown_percent = min(
                max_drawdown_percent,
                final_drawdown_percent,
            )
            curve[-1] = curve[-1].model_copy(update={
                "equity": round(cash, 4),
                "drawdown": round(final_drawdown, 4),
                "drawdown_percent": round(final_drawdown_percent, 4),
            })

        final_equity = cash
        net_profit = final_equity - request.initial_capital
        winners = [trade.pnl for trade in trades if trade.pnl > 0]
        losers = [trade.pnl for trade in trades if trade.pnl < 0]
        gross_profit = sum(winners)
        gross_loss = abs(sum(losers))
        returns = [
            current.equity / previous.equity - 1
            for previous, current in zip(curve, curve[1:], strict=False)
            if previous.equity > 0
        ]
        sharpe = None
        sortino = None
        if len(returns) >= 2:
            deviation = statistics.stdev(returns)
            if deviation > 1e-12:
                sharpe = statistics.mean(returns) / deviation * math.sqrt(252)
            downside = [value for value in returns if value < 0]
            if len(downside) >= 2:
                downside_deviation = statistics.stdev(downside)
                if downside_deviation > 1e-12:
                    sortino = statistics.mean(returns) / downside_deviation * math.sqrt(252)
        elapsed_years = max(
            (candles[-1].time - candles[0].time) / (365.25 * 86_400),
            0,
        )
        cagr = None
        if elapsed_years > 0 and final_equity > 0:
            cagr = (final_equity / request.initial_capital) ** (1 / elapsed_years) - 1

        return BacktestResult(
            ticker=request.ticker,
            strategy=request.strategy,
            interval=request.interval,
            initial_capital=round(request.initial_capital, 2),
            final_equity=round(final_equity, 2),
            net_profit=round(net_profit, 2),
            net_profit_percent=round(
                net_profit / request.initial_capital * 100,
                4,
            ),
            cagr=round(cagr * 100, 4) if cagr is not None else None,
            max_drawdown=round(abs(max_drawdown), 2),
            max_drawdown_percent=round(abs(max_drawdown_percent), 4),
            win_rate=round(len(winners) / len(trades) * 100, 4) if trades else 0,
            trades_count=len(trades),
            winning_trades=len(winners),
            losing_trades=len(losers),
            profit_factor=(
                round(gross_profit / gross_loss, 4)
                if gross_loss > 0 else None
            ),
            average_trade=round(
                sum(trade.pnl for trade in trades) / len(trades),
                4,
            ) if trades else 0,
            sharpe=round(sharpe, 4) if sharpe is not None else None,
            sortino=round(sortino, 4) if sortino is not None else None,
            exposure_percent=round(exposure_bars / len(candles) * 100, 4),
            equity_curve=curve,
            trades=trades,
        )


backtest_service = BacktestService()
