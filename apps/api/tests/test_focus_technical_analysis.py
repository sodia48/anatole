from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.schemas.stocks import Candle
from app.services.technical_analysis import (
    INDICATOR_DEFINITIONS,
    aggregate_candles,
    calculate_indicator,
    heikin_ashi,
)


def candles(count: int = 260) -> list[Candle]:
    start = datetime(2025, 1, 2, 14, 30, tzinfo=UTC)
    output: list[Candle] = []
    for index in range(count):
        base = 100 + index * 0.13 + (index % 11 - 5) * 0.31
        close = base + (0.65 if index % 2 else -0.25)
        output.append(Candle(
            time=int((start + timedelta(days=index)).timestamp()),
            open=base,
            high=max(base, close) + 1.2,
            low=min(base, close) - 0.9,
            close=close,
            volume=100_000 + index * 137,
        ))
    return output


@pytest.mark.parametrize("indicator_id", sorted(INDICATOR_DEFINITIONS))
def test_every_focus_indicator_returns_aligned_real_series(indicator_id: str) -> None:
    source = candles()
    result = calculate_indicator(source, indicator_id)
    definition = INDICATOR_DEFINITIONS[indicator_id]
    assert set(result) == set(definition.outputs)
    assert all(len(values) == len(source) for values in result.values())
    assert any(
        value is not None
        for values in result.values()
        for value in values
    ), indicator_id


def test_heikin_ashi_uses_previous_transformed_candle() -> None:
    source = [
        Candle(time=1, open=10, high=14, low=8, close=12, volume=100),
        Candle(time=2, open=12, high=16, low=10, close=14, volume=110),
    ]
    result = heikin_ashi(source)
    assert result[0].close == pytest.approx(11)
    assert result[0].open == pytest.approx(11)
    assert result[1].close == pytest.approx(13)
    assert result[1].open == pytest.approx(11)
    assert result[1].high == 16
    assert result[1].low == 10
    assert result[1].volume == 110


def test_four_hour_aggregation_does_not_bridge_toronto_sessions() -> None:
    first = int(datetime(2025, 6, 2, 13, 30, tzinfo=UTC).timestamp())
    second = int(datetime(2025, 6, 3, 13, 30, tzinfo=UTC).timestamp())
    source = [
        Candle(time=first + index * 3_600, open=10 + index, high=12 + index, low=9, close=11 + index, volume=100)
        for index in range(3)
    ] + [
        Candle(time=second + index * 3_600, open=20 + index, high=22 + index, low=19, close=21 + index, volume=200)
        for index in range(2)
    ]
    result = aggregate_candles(source, 4)
    assert len(result) == 2
    assert result[0].open == 10
    assert result[0].close == 13
    assert result[0].volume == 300
    assert result[1].open == 20
    assert result[1].close == 22
    assert result[1].volume == 400
