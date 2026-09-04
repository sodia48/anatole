from app.schemas.stocks import Candle
from app.services.screener import _breakout_metrics


def candles(highs: list[float]) -> list[Candle]:
    return [Candle(time=index * 86_400, open=value, high=value, low=value - 1, close=value, volume=1_000) for index, value in enumerate(highs)]


def test_breakout_uses_exact_previous_20_sessions_and_excludes_current() -> None:
    history = candles([float(value) for value in range(100, 120)] + [500])
    prior, breakout, percent = _breakout_metrics(history, 121)
    assert prior == 119
    assert breakout is True
    assert percent == 1.6807


def test_equal_to_previous_high_is_not_a_breakout() -> None:
    assert _breakout_metrics(candles([100] * 21), 100) == (100, False, 0)


def test_breakout_is_unavailable_with_insufficient_or_invalid_history() -> None:
    assert _breakout_metrics(candles([100] * 20), 101) == (None, None, None)
    assert _breakout_metrics(candles([0] * 21), 101) == (None, None, None)
