from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.schemas.stocks import Candle, Quote
from app.schemas.workspace import AlertEvaluateRequest, DrawingAlertPoint
from app.services.alerts import AlertService, drawing_level
from app.services.market_data import market_data_service


def history() -> list[Candle]:
    return [
        Candle(time=1, open=3, high=4, low=2, close=3, volume=100),
        Candle(time=2, open=2, high=3, low=1, close=2, volume=100),
        Candle(time=3, open=1, high=2, low=0.5, close=1, volume=100),
        Candle(time=4, open=3, high=5, low=2.5, close=4, volume=200),
    ]


def test_drawing_level_interpolates_real_anchor_prices() -> None:
    points = [
        DrawingAlertPoint(time=10, price=100),
        DrawingAlertPoint(time=20, price=110),
    ]
    assert drawing_level(points, 15) == 105
    assert drawing_level(points, 30) == 120


@pytest.mark.asyncio
async def test_advanced_alerts_use_indicator_drawing_and_strategy_engines(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    quote = Quote(
        ticker="RY.TO",
        symbol="RY",
        name="Royal Bank",
        exchange="TSX",
        currency="CAD",
        price=4,
        previous_close=1,
        change=3,
        change_percent=300,
        day_high=5,
        day_low=2.5,
        volume=200,
        timestamp=datetime.now(UTC),
        source="test",
        delayed=True,
    )

    async def get_quotes(_symbols: list[str]) -> list[Quote]:
        return [quote]

    async def get_histories(
        _symbols: list[str],
        *,
        range_: str,
        interval: str,
        concurrency: int,
    ) -> dict[str, list[Candle]]:
        assert range_ == "3mo"
        assert interval == "1d"
        assert concurrency == 6
        return {"RY": history()}

    monkeypatch.setattr(market_data_service, "get_quotes", get_quotes)
    monkeypatch.setattr(market_data_service, "get_history_many", get_histories)
    request = AlertEvaluateRequest.model_validate({
        "rules": [
            {
                "id": "threshold",
                "symbol": "RY",
                "metric": "price",
                "operator": "above",
                "threshold": 40,
                "alert_type": "indicator_threshold",
                "indicator_id": "rsi",
                "indicator_inputs": {"period": 2},
            },
            {
                "id": "cross",
                "symbol": "RY",
                "metric": "price",
                "operator": "above",
                "threshold": 0,
                "alert_type": "indicator_cross",
                "indicator_id": "sma",
                "indicator_inputs": {"period": 2},
                "comparison_indicator_id": "sma",
                "comparison_indicator_inputs": {"period": 3},
            },
            {
                "id": "drawing",
                "symbol": "RY",
                "metric": "price",
                "operator": "above",
                "threshold": 2,
                "alert_type": "drawing_break",
                "drawing_points": [{"time": 1, "price": 2}],
            },
            {
                "id": "strategy",
                "symbol": "RY",
                "metric": "price",
                "operator": "above",
                "threshold": 1,
                "alert_type": "strategy_signal",
                "strategy_id": "donchian_breakout",
                "strategy_parameters": {"period": 2},
                "strategy_signal": "buy",
            },
        ]
    })
    result = await AlertService().evaluate(request)
    assert result.triggered_count == 4
    assert {item.alert_type for item in result.items} == {
        "indicator_threshold",
        "indicator_cross",
        "drawing_break",
        "strategy_signal",
    }


@pytest.mark.asyncio
async def test_invalid_custom_rule_isolated_as_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    quote = Quote(
        ticker="RY.TO", symbol="RY", name="RY", exchange="TSX",
        currency="CAD", price=4, previous_close=3, change=1,
        change_percent=33, day_high=5, day_low=3, volume=200,
        timestamp=datetime.now(UTC), source="test", delayed=True,
    )
    async def get_quotes(_symbols: list[str]) -> list[Quote]: return [quote]
    async def get_histories(*_args, **_kwargs): return {"RY": history()}
    monkeypatch.setattr(market_data_service, "get_quotes", get_quotes)
    monkeypatch.setattr(market_data_service, "get_history_many", get_histories)
    request = AlertEvaluateRequest.model_validate({"rules": [{
        "id": "bad", "symbol": "RY", "metric": "price",
        "operator": "above", "threshold": 1,
        "alert_type": "indicator_threshold", "indicator_id": "unknown",
    }]})
    result = await AlertService().evaluate(request)
    assert result.items[0].status == "unavailable"
    assert result.unavailable_count == 1
