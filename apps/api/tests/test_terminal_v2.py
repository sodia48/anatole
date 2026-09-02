from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import settings
from app.schemas.discovery import ScreenerRow
from app.schemas.stocks import Candle
from app.services.market_data import market_data_service
from app.services.terminal_engine import (
    build_anomalies,
    build_breadth,
    build_regime_history,
    build_regime_horizons,
    build_sector_rotation,
    data_quality,
    rebuild_real_rows,
    regime_label,
)


def candles(*, start: float = 100, drift: float = 0.3, count: int = 260, volume: int = 1_000) -> list[Candle]:
    first = datetime(2025, 1, 2, tzinfo=UTC)
    output: list[Candle] = []
    price = start
    for index in range(count):
        price += drift
        timestamp = int((first + timedelta(days=index)).timestamp())
        output.append(Candle(time=timestamp, open=price - drift / 2, high=price + 1, low=price - 1, close=price, volume=volume + index))
    return output


def row(symbol: str, *, source: str = "yahoo-public", change: float = 1, sector: str = "Financials", volume: int = 2_000) -> ScreenerRow:
    return ScreenerRow(
        ticker=f"{symbol}.TO", symbol=symbol, name=symbol, sector=sector, price=100,
        change_percent=change, volume=volume, average_volume_20d=1_000,
        relative_volume=2, momentum_20d=3, rsi_14=55, sma_20=95, sma_50=90,
        trend="Haussière", score=70, signal="Constructif", source=source, delayed=True,
    )


def test_demo_fallback_is_excluded_from_every_terminal_input() -> None:
    histories = {"RY": candles(), "TD": candles(drift=-0.1)}
    rows = [row("RY"), row("TD", source="demo-fallback")]
    rebuilt = rebuild_real_rows(rows, histories, explicit_demo=False)
    quality = data_quality(rows, histories, ["RY", "TD"], explicit_demo=False)
    assert [item.symbol for item in rebuilt] == ["RY"]
    assert quality.real_symbols == 1
    assert quality.unavailable_symbols == ["TD"]
    assert quality.source_statuses["demo_fallback_excluded"] == "1"
    assert all(item.symbol != "TD" for item in rebuilt)
    assert sum(item.member_count for item in build_sector_rotation(rebuilt, {"RY": histories["RY"]}, candles(start=1_000), 2)) == 1
    assert all(item.symbol != "TD" for item in build_anomalies(rebuilt, {"RY": histories["RY"]}))


@pytest.mark.parametrize(("score", "expected"), [
    (72, "Haussier"), (71.9, "Constructif"), (60, "Constructif"),
    (59.9, "Neutre"), (45, "Neutre"), (44.9, "Fragile"),
    (32, "Fragile"), (31.9, "Baissier"),
])
def test_regime_thresholds_are_exact(score: float, expected: str) -> None:
    assert regime_label(score) == expected


def test_multi_horizon_uses_one_formula_and_real_coverage() -> None:
    histories = {"RY": candles(), "TD": candles(start=90, drift=-0.08)}
    rows = rebuild_real_rows([row("RY"), row("TD", change=-0.5)], histories, explicit_demo=False)
    horizons = build_regime_horizons(rows, histories, {"RY": 60, "TD": 40}, 2)
    assert [item.key for item in horizons] == ["session", "5d", "20d", "3m"]
    assert all(item.score is not None for item in horizons)
    assert all(item.coverage_percent == 100 for item in horizons)
    assert all(item.regime == regime_label(item.score or 0) for item in horizons)


def test_regime_history_is_chronological_normalized_and_has_no_future_leak() -> None:
    equity = {"RY": candles(), "TD": candles(start=90, drift=-0.05)}
    benchmark = candles(start=1_000, drift=1)
    original = build_regime_history(equity, benchmark, 2)
    changed = {**equity, "RY": [*equity["RY"][:-1], equity["RY"][-1].model_copy(update={"close": 9_999})]}
    revised = build_regime_history(changed, benchmark, 2)
    assert [point.timestamp for point in original] == sorted(point.timestamp for point in original)
    assert original[0].benchmark_value == 100
    assert original[:-1] == revised[:-1]
    assert len(original) <= 260


def test_breadth_pro_real_history_metrics_and_rotation() -> None:
    histories = {"RY": candles(drift=0.4, volume=2_000), "TD": candles(start=180, drift=-0.2, volume=1_000)}
    rows = rebuild_real_rows([row("RY", change=1.5, volume=4_000), row("TD", change=-1, volume=800)], histories, explicit_demo=False)
    breadth = build_breadth(rows, histories, {"RY": 75, "TD": 25}, 2)
    assert (breadth.advancers, breadth.decliners, breadth.unchanged) == (1, 1, 0)
    assert breadth.above_sma20_percent is not None
    assert breadth.above_sma50_percent is not None
    assert breadth.above_sma200_percent is not None
    assert breadth.new_highs_52w == 1
    assert breadth.new_lows_52w == 1
    assert breadth.up_volume == 4_000
    assert breadth.down_volume == 800
    assert breadth.equal_weight_change_percent != breadth.cap_weight_change_percent
    assert breadth.advance_decline_line
    assert breadth.positive_sectors == 1
    assert breadth.negative_sectors == 0
    assert breadth.positive_sectors_percent == 100
    rotation = build_sector_rotation(rows, histories, candles(start=1_000, drift=0.5), 2)
    assert rotation[0].relative_strength_20d is not None
    assert rotation[0].previous_x is not None
    assert rotation[0].quadrant in {"LEADERSHIP", "AMÉLIORATION", "AFFAIBLISSEMENT", "SOUS PRESSION"}


def test_low_coverage_returns_null_cross_sectional_metrics_not_zero() -> None:
    histories = {"RY": candles()}
    rows = rebuild_real_rows([row("RY")], histories, explicit_demo=False)
    horizons = build_regime_horizons(rows, histories, {"RY": 100}, 2)
    breadth = build_breadth(rows, histories, {"RY": 100}, 2)
    assert all(item.score is None and item.regime is None for item in horizons)
    assert breadth.advancers is None
    assert breadth.advance_ratio is None
    assert breadth.up_volume is None


@pytest.mark.asyncio
async def test_strict_history_never_calls_demo_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    demo_called = False

    async def strict_yahoo(ticker: str, range_: str, interval: str) -> list[Candle]:
        if ticker == "TD":
            raise RuntimeError("unavailable")
        return candles(count=30)

    async def forbidden_demo(ticker: str, range_: str, interval: str) -> list[Candle]:
        nonlocal demo_called
        demo_called = True
        return candles(count=30)

    monkeypatch.setattr(market_data_service.yahoo, "history", strict_yahoo)
    monkeypatch.setattr(market_data_service.demo, "history", forbidden_demo)
    result = await market_data_service.get_history_many_strict(["RY", "TD"], concurrency=2)
    assert set(result) == {"RY"}
    assert demo_called is False
