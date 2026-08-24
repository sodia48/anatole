from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from app.schemas.stocks import Candle


IndicatorPane = Literal["main", "separate"]
IndicatorSeries = dict[str, list[float | None]]


@dataclass(frozen=True, slots=True)
class IndicatorDefinition:
    id: str
    name: str
    category: str
    pane: IndicatorPane
    inputs: dict[str, float | int | str]
    outputs: tuple[str, ...]
    calculate: Callable[[list[Candle], dict[str, float | int | str]], IndicatorSeries]


def _source(candles: Sequence[Candle], name: str) -> list[float]:
    if name == "open":
        return [item.open for item in candles]
    if name == "high":
        return [item.high for item in candles]
    if name == "low":
        return [item.low for item in candles]
    if name == "hl2":
        return [(item.high + item.low) / 2 for item in candles]
    if name == "hlc3":
        return [(item.high + item.low + item.close) / 3 for item in candles]
    if name == "ohlc4":
        return [
            (item.open + item.high + item.low + item.close) / 4
            for item in candles
        ]
    return [item.close for item in candles]


def _period(inputs: dict[str, float | int | str], key: str, default: int) -> int:
    value = inputs.get(key, default)
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, 500))


def sma(values: Sequence[float | None], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    total = 0.0
    valid = 0
    queue: list[float | None] = []
    for index, raw in enumerate(values):
        value = float(raw) if raw is not None else None
        queue.append(value)
        if value is not None:
            total += value
            valid += 1
        if len(queue) > period:
            removed = queue.pop(0)
            if removed is not None:
                total -= removed
                valid -= 1
        if len(queue) == period and valid == period:
            output[index] = total / period
    return output


def ema(values: Sequence[float | None], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    seed: list[float] = []
    current: float | None = None
    multiplier = 2 / (period + 1)
    for index, raw in enumerate(values):
        if raw is None:
            continue
        value = float(raw)
        if current is None:
            seed.append(value)
            if len(seed) == period:
                current = sum(seed) / period
                output[index] = current
            continue
        current += (value - current) * multiplier
        output[index] = current
    return output


def wma(values: Sequence[float | None], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    denominator = period * (period + 1) / 2
    for index in range(period - 1, len(values)):
        sample = values[index - period + 1:index + 1]
        if any(value is None for value in sample):
            continue
        output[index] = sum(
            float(value) * weight
            for weight, value in enumerate(sample, start=1)
            if value is not None
        ) / denominator
    return output


def rolling_highest(values: Sequence[float], period: int) -> list[float | None]:
    return [
        None if index < period - 1 else max(values[index - period + 1:index + 1])
        for index in range(len(values))
    ]


def rolling_lowest(values: Sequence[float], period: int) -> list[float | None]:
    return [
        None if index < period - 1 else min(values[index - period + 1:index + 1])
        for index in range(len(values))
    ]


def true_range(candles: Sequence[Candle]) -> list[float]:
    output: list[float] = []
    for index, item in enumerate(candles):
        previous = candles[index - 1].close if index else item.close
        output.append(max(
            item.high - item.low,
            abs(item.high - previous),
            abs(item.low - previous),
        ))
    return output


def rma(values: Sequence[float], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    if len(values) < period:
        return output
    current = sum(values[:period]) / period
    output[period - 1] = current
    for index in range(period, len(values)):
        current = (current * (period - 1) + values[index]) / period
        output[index] = current
    return output


def rsi(values: Sequence[float], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return output
    gains = [0.0]
    losses = [0.0]
    for previous, current in zip(values, values[1:], strict=False):
        change = current - previous
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))
    average_gains = rma(gains[1:], period)
    average_losses = rma(losses[1:], period)
    for index in range(period, len(values)):
        gain = average_gains[index - 1]
        loss = average_losses[index - 1]
        if gain is None or loss is None:
            continue
        if loss == 0:
            output[index] = 100.0
        elif gain == 0:
            output[index] = 0.0
        else:
            strength = gain / loss
            output[index] = 100 - 100 / (1 + strength)
    return output


def heikin_ashi(candles: Sequence[Candle]) -> list[Candle]:
    """Transform genuine OHLC observations without presenting them as raw OHLC."""
    output: list[Candle] = []
    previous_open: float | None = None
    previous_close: float | None = None
    for item in candles:
        close = (item.open + item.high + item.low + item.close) / 4
        open_ = (
            (item.open + item.close) / 2
            if previous_open is None or previous_close is None
            else (previous_open + previous_close) / 2
        )
        output.append(Candle(
            time=item.time,
            open=open_,
            high=max(item.high, open_, close),
            low=min(item.low, open_, close),
            close=close,
            volume=item.volume,
        ))
        previous_open = open_
        previous_close = close
    return output


def aggregate_candles(candles: Sequence[Candle], factor: int) -> list[Candle]:
    """Aggregate consecutive provider observations; never creates missing candles."""
    if factor <= 1:
        return list(candles)
    sessions: dict[str, list[Candle]] = {}
    for candle in candles:
        session = datetime.fromtimestamp(
            candle.time,
            UTC,
        ).astimezone(ZoneInfo("America/Toronto")).date().isoformat()
        sessions.setdefault(session, []).append(candle)
    output: list[Candle] = []
    for session in sessions.values():
        for offset in range(0, len(session), factor):
            batch = session[offset:offset + factor]
            if not batch:
                continue
            output.append(Candle(
                time=batch[0].time,
                open=batch[0].open,
                high=max(item.high for item in batch),
                low=min(item.low for item in batch),
                close=batch[-1].close,
                volume=sum(item.volume for item in batch),
            ))
    output.sort(key=lambda item: item.time)
    return output


def _single_moving_average(
    candles: list[Candle],
    inputs: dict[str, float | int | str],
    calculator: Callable[[Sequence[float | None], int], list[float | None]],
) -> IndicatorSeries:
    values = _source(candles, str(inputs.get("source", "close")))
    return {"value": calculator(values, _period(inputs, "period", 20))}


def _vwap(candles: list[Candle], _: dict[str, float | int | str]) -> IndicatorSeries:
    total_value = 0.0
    total_volume = 0.0
    output: list[float | None] = []
    for item in candles:
        total_value += ((item.high + item.low + item.close) / 3) * item.volume
        total_volume += item.volume
        output.append(total_value / total_volume if total_volume else None)
    return {"value": output}


def _rsi(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    return {"value": rsi(
        _source(candles, str(inputs.get("source", "close"))),
        _period(inputs, "period", 14),
    )}


def _macd(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    values = _source(candles, str(inputs.get("source", "close")))
    fast = ema(values, _period(inputs, "fast", 12))
    slow = ema(values, _period(inputs, "slow", 26))
    line = [
        left - right if left is not None and right is not None else None
        for left, right in zip(fast, slow, strict=False)
    ]
    signal = ema(line, _period(inputs, "signal", 9))
    histogram = [
        left - right if left is not None and right is not None else None
        for left, right in zip(line, signal, strict=False)
    ]
    return {"macd": line, "signal": signal, "histogram": histogram}


def _bollinger(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    values = _source(candles, str(inputs.get("source", "close")))
    period = _period(inputs, "period", 20)
    deviation = float(inputs.get("deviation", 2.0))
    middle = sma(values, period)
    upper: list[float | None] = [None] * len(values)
    lower: list[float | None] = [None] * len(values)
    for index in range(period - 1, len(values)):
        sample = values[index - period + 1:index + 1]
        mean = middle[index]
        if mean is None:
            continue
        variance = sum((item - mean) ** 2 for item in sample) / period
        spread = math.sqrt(variance) * deviation
        upper[index] = mean + spread
        lower[index] = mean - spread
    return {"upper": upper, "middle": middle, "lower": lower}


def _atr(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    return {"value": rma(true_range(candles), _period(inputs, "period", 14))}


def _stochastic(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    period = _period(inputs, "period", 14)
    smooth = _period(inputs, "smooth", 3)
    highs = rolling_highest([item.high for item in candles], period)
    lows = rolling_lowest([item.low for item in candles], period)
    raw: list[float | None] = []
    for item, high, low in zip(candles, highs, lows, strict=False):
        raw.append(
            None if high is None or low is None or high == low
            else (item.close - low) / (high - low) * 100
        )
    k = sma(raw, smooth)
    return {"k": k, "d": sma(k, _period(inputs, "signal", 3))}


def _stoch_rsi(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    period = _period(inputs, "period", 14)
    values = rsi(_source(candles, str(inputs.get("source", "close"))), period)
    raw: list[float | None] = [None] * len(values)
    for index in range(period - 1, len(values)):
        sample = [value for value in values[index - period + 1:index + 1] if value is not None]
        if len(sample) != period:
            continue
        low, high = min(sample), max(sample)
        raw[index] = 0.0 if high == low else (float(values[index]) - low) / (high - low) * 100
    k = sma(raw, _period(inputs, "smooth", 3))
    return {"k": k, "d": sma(k, _period(inputs, "signal", 3))}


def _directional(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    period = _period(inputs, "period", 14)
    plus_dm = [0.0]
    minus_dm = [0.0]
    for previous, current in zip(candles, candles[1:], strict=False):
        up = current.high - previous.high
        down = previous.low - current.low
        plus_dm.append(up if up > down and up > 0 else 0.0)
        minus_dm.append(down if down > up and down > 0 else 0.0)
    atr_values = rma(true_range(candles), period)
    plus_smooth = rma(plus_dm, period)
    minus_smooth = rma(minus_dm, period)
    plus_di: list[float | None] = []
    minus_di: list[float | None] = []
    dx: list[float | None] = []
    for atr_value, plus, minus in zip(
        atr_values, plus_smooth, minus_smooth, strict=False
    ):
        if atr_value is None or plus is None or minus is None or atr_value == 0:
            plus_di.append(None)
            minus_di.append(None)
            dx.append(None)
            continue
        plus_value = plus / atr_value * 100
        minus_value = minus / atr_value * 100
        plus_di.append(plus_value)
        minus_di.append(minus_value)
        denominator = plus_value + minus_value
        dx.append(
            abs(plus_value - minus_value) / denominator * 100
            if denominator else 0.0
        )
    return {
        "adx": rma([value or 0.0 for value in dx], period),
        "plus_di": plus_di,
        "minus_di": minus_di,
    }


def _cci(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    period = _period(inputs, "period", 20)
    values = _source(candles, "hlc3")
    averages = sma(values, period)
    output: list[float | None] = [None] * len(values)
    for index in range(period - 1, len(values)):
        mean = averages[index]
        if mean is None:
            continue
        sample = values[index - period + 1:index + 1]
        deviation = sum(abs(value - mean) for value in sample) / period
        output[index] = 0.0 if deviation == 0 else (values[index] - mean) / (0.015 * deviation)
    return {"value": output}


def _change_indicator(
    candles: list[Candle],
    inputs: dict[str, float | int | str],
    *,
    percent: bool,
) -> IndicatorSeries:
    values = _source(candles, str(inputs.get("source", "close")))
    period = _period(inputs, "period", 12 if percent else 10)
    output: list[float | None] = [None] * len(values)
    for index in range(period, len(values)):
        previous = values[index - period]
        if percent:
            output[index] = None if previous == 0 else (values[index] / previous - 1) * 100
        else:
            output[index] = values[index] - previous
    return {"value": output}


def _obv(candles: list[Candle], _: dict[str, float | int | str]) -> IndicatorSeries:
    output = [0.0] * len(candles)
    for index in range(1, len(candles)):
        direction = 1 if candles[index].close > candles[index - 1].close else (
            -1 if candles[index].close < candles[index - 1].close else 0
        )
        output[index] = output[index - 1] + direction * candles[index].volume
    return {"value": output}


def _mfi(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    period = _period(inputs, "period", 14)
    typical = _source(candles, "hlc3")
    positive = [0.0] * len(candles)
    negative = [0.0] * len(candles)
    for index in range(1, len(candles)):
        flow = typical[index] * candles[index].volume
        if typical[index] >= typical[index - 1]:
            positive[index] = flow
        else:
            negative[index] = flow
    output: list[float | None] = [None] * len(candles)
    for index in range(period, len(candles)):
        gains = sum(positive[index - period + 1:index + 1])
        losses = sum(negative[index - period + 1:index + 1])
        output[index] = 100.0 if losses == 0 else 100 - 100 / (1 + gains / losses)
    return {"value": output}


def _donchian(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    period = _period(inputs, "period", 20)
    upper = rolling_highest([item.high for item in candles], period)
    lower = rolling_lowest([item.low for item in candles], period)
    middle = [
        (high + low) / 2 if high is not None and low is not None else None
        for high, low in zip(upper, lower, strict=False)
    ]
    return {"upper": upper, "middle": middle, "lower": lower}


def _ichimoku(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    conversion_period = _period(inputs, "conversion", 9)
    base_period = _period(inputs, "base", 26)
    span_period = _period(inputs, "span", 52)
    highs = [item.high for item in candles]
    lows = [item.low for item in candles]

    def midpoint(period: int) -> list[float | None]:
        upper = rolling_highest(highs, period)
        lower = rolling_lowest(lows, period)
        return [
            (high + low) / 2 if high is not None and low is not None else None
            for high, low in zip(upper, lower, strict=False)
        ]

    conversion = midpoint(conversion_period)
    base = midpoint(base_period)
    span_a = [
        (left + right) / 2 if left is not None and right is not None else None
        for left, right in zip(conversion, base, strict=False)
    ]
    return {
        "conversion": conversion,
        "base": base,
        "span_a": span_a,
        "span_b": midpoint(span_period),
    }


def _supertrend(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    period = _period(inputs, "period", 10)
    multiplier = float(inputs.get("multiplier", 3.0))
    atr_values = rma(true_range(candles), period)
    output: list[float | None] = [None] * len(candles)
    direction: list[float | None] = [None] * len(candles)
    final_upper: float | None = None
    final_lower: float | None = None
    bullish = True
    for index, item in enumerate(candles):
        atr_value = atr_values[index]
        if atr_value is None:
            continue
        middle = (item.high + item.low) / 2
        basic_upper = middle + multiplier * atr_value
        basic_lower = middle - multiplier * atr_value
        previous_close = candles[index - 1].close if index else item.close
        final_upper = (
            basic_upper
            if final_upper is None or basic_upper < final_upper or previous_close > final_upper
            else final_upper
        )
        final_lower = (
            basic_lower
            if final_lower is None or basic_lower > final_lower or previous_close < final_lower
            else final_lower
        )
        if bullish and item.close < final_lower:
            bullish = False
        elif not bullish and item.close > final_upper:
            bullish = True
        output[index] = final_lower if bullish else final_upper
        direction[index] = 1.0 if bullish else -1.0
    return {"value": output, "direction": direction}


def _parabolic_sar(candles: list[Candle], inputs: dict[str, float | int | str]) -> IndicatorSeries:
    output: list[float | None] = [None] * len(candles)
    if len(candles) < 2:
        return {"value": output}
    step = max(0.001, min(float(inputs.get("step", 0.02)), 0.2))
    maximum = max(step, min(float(inputs.get("maximum", 0.2)), 1.0))
    bullish = candles[1].close >= candles[0].close
    sar = candles[0].low if bullish else candles[0].high
    extreme = candles[0].high if bullish else candles[0].low
    acceleration = step
    output[0] = sar
    for index in range(1, len(candles)):
        item = candles[index]
        sar += acceleration * (extreme - sar)
        if bullish:
            sar = min(
                sar,
                candles[index - 1].low,
                candles[index - 2].low if index > 1 else candles[index - 1].low,
            )
            if item.low < sar:
                bullish = False
                sar = extreme
                extreme = item.low
                acceleration = step
            elif item.high > extreme:
                extreme = item.high
                acceleration = min(maximum, acceleration + step)
        else:
            sar = max(
                sar,
                candles[index - 1].high,
                candles[index - 2].high if index > 1 else candles[index - 1].high,
            )
            if item.high > sar:
                bullish = True
                sar = extreme
                extreme = item.high
                acceleration = step
            elif item.low < extreme:
                extreme = item.low
                acceleration = min(maximum, acceleration + step)
        output[index] = sar
    return {"value": output}


INDICATOR_DEFINITIONS: dict[str, IndicatorDefinition] = {
    "sma": IndicatorDefinition("sma", "SMA", "trend", "main", {"period": 20, "source": "close"}, ("value",), lambda c, i: _single_moving_average(c, i, sma)),
    "ema": IndicatorDefinition("ema", "EMA", "trend", "main", {"period": 20, "source": "close"}, ("value",), lambda c, i: _single_moving_average(c, i, ema)),
    "wma": IndicatorDefinition("wma", "WMA", "trend", "main", {"period": 20, "source": "close"}, ("value",), lambda c, i: _single_moving_average(c, i, wma)),
    "vwap": IndicatorDefinition("vwap", "VWAP", "volume", "main", {}, ("value",), _vwap),
    "rsi": IndicatorDefinition("rsi", "RSI", "momentum", "separate", {"period": 14, "source": "close"}, ("value",), _rsi),
    "macd": IndicatorDefinition("macd", "MACD", "momentum", "separate", {"fast": 12, "slow": 26, "signal": 9, "source": "close"}, ("macd", "signal", "histogram"), _macd),
    "bollinger": IndicatorDefinition("bollinger", "Bollinger Bands", "volatility", "main", {"period": 20, "deviation": 2.0, "source": "close"}, ("upper", "middle", "lower"), _bollinger),
    "atr": IndicatorDefinition("atr", "ATR", "volatility", "separate", {"period": 14}, ("value",), _atr),
    "stochastic": IndicatorDefinition("stochastic", "Stochastic", "momentum", "separate", {"period": 14, "smooth": 3, "signal": 3}, ("k", "d"), _stochastic),
    "stoch_rsi": IndicatorDefinition("stoch_rsi", "Stoch RSI", "momentum", "separate", {"period": 14, "smooth": 3, "signal": 3}, ("k", "d"), _stoch_rsi),
    "adx": IndicatorDefinition("adx", "ADX", "trend", "separate", {"period": 14}, ("adx", "plus_di", "minus_di"), _directional),
    "cci": IndicatorDefinition("cci", "CCI", "momentum", "separate", {"period": 20}, ("value",), _cci),
    "roc": IndicatorDefinition("roc", "ROC", "momentum", "separate", {"period": 12, "source": "close"}, ("value",), lambda c, i: _change_indicator(c, i, percent=True)),
    "momentum": IndicatorDefinition("momentum", "Momentum", "momentum", "separate", {"period": 10, "source": "close"}, ("value",), lambda c, i: _change_indicator(c, i, percent=False)),
    "obv": IndicatorDefinition("obv", "OBV", "volume", "separate", {}, ("value",), _obv),
    "mfi": IndicatorDefinition("mfi", "MFI", "volume", "separate", {"period": 14}, ("value",), _mfi),
    "donchian": IndicatorDefinition("donchian", "Donchian", "volatility", "main", {"period": 20}, ("upper", "middle", "lower"), _donchian),
    "ichimoku": IndicatorDefinition("ichimoku", "Ichimoku", "trend", "main", {"conversion": 9, "base": 26, "span": 52}, ("conversion", "base", "span_a", "span_b"), _ichimoku),
    "supertrend": IndicatorDefinition("supertrend", "Supertrend", "trend", "main", {"period": 10, "multiplier": 3.0}, ("value", "direction"), _supertrend),
    "parabolic_sar": IndicatorDefinition("parabolic_sar", "Parabolic SAR", "trend", "main", {"step": 0.02, "maximum": 0.2}, ("value",), _parabolic_sar),
}


def calculate_indicator(
    candles: list[Candle],
    indicator_id: str,
    inputs: dict[str, float | int | str] | None = None,
) -> IndicatorSeries:
    definition = INDICATOR_DEFINITIONS.get(indicator_id.strip().lower())
    if definition is None:
        raise ValueError(f"Indicateur inconnu : {indicator_id}")
    merged = {**definition.inputs, **(inputs or {})}
    return definition.calculate(candles, merged)


def latest_value(series: Sequence[float | None]) -> float | None:
    return next((value for value in reversed(series) if value is not None), None)


def crossed_above(
    left: Sequence[float | None],
    right: Sequence[float | None],
) -> bool:
    pairs = [
        (a, b)
        for a, b in zip(left, right, strict=False)
        if a is not None and b is not None
    ]
    return len(pairs) >= 2 and pairs[-2][0] <= pairs[-2][1] and pairs[-1][0] > pairs[-1][1]


def crossed_below(
    left: Sequence[float | None],
    right: Sequence[float | None],
) -> bool:
    pairs = [
        (a, b)
        for a, b in zip(left, right, strict=False)
        if a is not None and b is not None
    ]
    return len(pairs) >= 2 and pairs[-2][0] >= pairs[-2][1] and pairs[-1][0] < pairs[-1][1]
