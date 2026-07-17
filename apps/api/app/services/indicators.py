from collections.abc import Sequence

from app.schemas.stocks import Candle, Technicals


def _sma(values: Sequence[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def _ema_series(values: Sequence[float], period: int) -> list[float]:
    if not values:
        return []
    multiplier = 2 / (period + 1)
    output = [float(values[0])]
    for value in values[1:]:
        output.append((float(value) - output[-1]) * multiplier + output[-1])
    return output


def _rsi(values: Sequence[float], period: int = 14) -> float | None:
    if len(values) <= period:
        return None
    changes = [values[index] - values[index - 1] for index in range(1, len(values))]
    gains = [max(change, 0.0) for change in changes[-period:]]
    losses = [abs(min(change, 0.0)) for change in changes[-period:]]
    average_gain = sum(gains) / period
    average_loss = sum(losses) / period
    if average_loss == 0:
        return 100.0
    relative_strength = average_gain / average_loss
    return 100 - (100 / (1 + relative_strength))


def calculate_technicals(candles: list[Candle]) -> Technicals:
    closes = [item.close for item in candles]
    if not closes:
        return Technicals()

    ema_12 = _ema_series(closes, 12)
    ema_26 = _ema_series(closes, 26)
    size = min(len(ema_12), len(ema_26))
    macd_series = [ema_12[-size + index] - ema_26[-size + index] for index in range(size)] if size else []
    signal_series = _ema_series(macd_series, 9)

    recent = candles[-60:] if len(candles) >= 60 else candles
    support = min(item.low for item in recent)
    resistance = max(item.high for item in recent)
    sma_20 = _sma(closes, 20)
    sma_50 = _sma(closes, 50)
    sma_200 = _sma(closes, 200)
    last = closes[-1]

    if sma_50 is not None and sma_200 is not None:
        trend = "Haussière" if last > sma_50 > sma_200 else "Baissière" if last < sma_50 < sma_200 else "Mixte"
    elif sma_20 is not None:
        trend = "Haussière" if last > sma_20 else "Baissière"
    else:
        trend = "Indéterminée"

    return Technicals(
        rsi_14=round(_rsi(closes) or 0, 2) if _rsi(closes) is not None else None,
        macd=round(macd_series[-1], 4) if macd_series else None,
        macd_signal=round(signal_series[-1], 4) if signal_series else None,
        sma_20=round(sma_20, 4) if sma_20 is not None else None,
        sma_50=round(sma_50, 4) if sma_50 is not None else None,
        sma_200=round(sma_200, 4) if sma_200 is not None else None,
        support=round(support, 4),
        resistance=round(resistance, 4),
        trend=trend,
    )
