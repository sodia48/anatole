from __future__ import annotations

import asyncio
import inspect
import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.schemas.discovery import ScreenerRow
from app.schemas.stocks import Candle, Quote
from app.services.market_data import market_data_service
from app.services.session_quotes import session_quote_service
from app.services.analysis import AnalysisService
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.screener import screener_service
from app.services.terminal_drivers import YAHOO_DRIVERS
from app.services.tsx60 import TSX60
from app.services.terminal_engine import (
    build_anomalies,
    build_breadth,
    build_regime_history,
    build_regime_horizons,
    build_sector_rotation,
    data_quality,
    legacy_sectors,
    rebuild_real_rows,
    regime_label,
)


def candles(*, start: float = 100, drift: float = 0.3, count: int = 260, volume: int = 1_000, span_days: int | None = None) -> list[Candle]:
    first = datetime(2025, 1, 2, tzinfo=UTC)
    output: list[Candle] = []
    price = start
    for index in range(count):
        price += drift
        day = index if span_days is None or count < 2 else round(index * span_days / (count - 1))
        timestamp = int((first + timedelta(days=day)).timestamp())
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


def test_rebuild_preserves_current_quote_price_change_volume_and_timestamp() -> None:
    quote_time = datetime(2026, 9, 2, 16, 0, tzinfo=UTC)
    history = candles(start=80, drift=0.3, count=60)
    history[-1] = history[-1].model_copy(update={"close": 95})
    source = row("RY", change=1.75, volume=9_876).model_copy(update={
        "price": 100,
        "quote_as_of": quote_time,
    })
    rebuilt = rebuild_real_rows([source], {"RY": history}, explicit_demo=False)
    assert len(rebuilt) == 1
    current = rebuilt[0]
    assert current.price == 100
    assert current.change_percent == 1.75
    assert current.volume == 9_876
    assert current.quote_as_of == quote_time
    expected_momentum = (100 / history[-21].close - 1) * 100
    assert current.momentum_20d == round(expected_momentum, 2)


def test_rebuild_uses_current_quote_price_for_trend() -> None:
    history = candles(start=80, drift=0.3, count=60)
    history[-1] = history[-1].model_copy(update={"close": 90})
    rebuilt = rebuild_real_rows(
        [row("RY").model_copy(update={"price": 120})],
        {"RY": history},
        explicit_demo=False,
    )
    assert rebuilt[0].trend == "Haussière"


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
    histories = {"RY": candles(drift=0.4, volume=2_000, span_days=365), "TD": candles(start=180, drift=-0.2, volume=1_000, span_days=365)}
    rows = rebuild_real_rows([row("RY", change=1.5, volume=4_000), row("TD", change=-1, volume=800)], histories, explicit_demo=False)
    breadth = build_breadth(rows, histories, {"RY": 75, "TD": 25}, 2)
    assert (breadth.advancers, breadth.decliners, breadth.unchanged) == (1, 1, 0)
    assert breadth.above_sma20_percent is not None
    assert breadth.above_sma50_percent is not None
    assert breadth.above_sma200_percent is not None
    assert breadth.new_highs_52w == 1
    assert breadth.new_lows_52w == 1
    assert breadth.high_low_52w_eligible_symbols == 2
    assert breadth.high_low_52w_coverage_percent == 100
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


def test_missing_rotation_values_remain_unknown_in_legacy_sectors() -> None:
    rows = [row("RY")]
    rotation = build_sector_rotation(rows, {}, [], 1)
    sectors = legacy_sectors(rotation, rows)
    assert len(sectors) == 1
    sector = sectors[0]
    assert sector.momentum_20d is None
    assert sector.average_score is None
    assert sector.relative_volume is None
    assert sector.leadership_score is None
    assert sector.state == "N/D"
    assert "Faiblesse" not in sector.model_dump().values()
    assert not any(value == 0 for key, value in sector.model_dump().items() if key in {"momentum_20d", "average_score", "relative_volume", "leadership_score"})


def test_52_week_depth_uses_elapsed_time_and_low_coverage_is_unknown() -> None:
    histories = {
        "RY": candles(count=260, drift=0.4, span_days=365),
        "TD": candles(count=200, drift=-0.1, span_days=199),
    }
    rows = rebuild_real_rows([row("RY"), row("TD", change=-1)], histories, explicit_demo=False)
    breadth = build_breadth(rows, histories, {"RY": 50, "TD": 50}, 2)
    assert breadth.high_low_52w_eligible_symbols == 1
    assert breadth.high_low_52w_coverage_percent == 50
    assert breadth.new_highs_52w is None
    assert breadth.new_lows_52w is None


def test_analysis_service_has_only_one_terminal_implementation() -> None:
    source = inspect.getsource(AnalysisService)
    assert source.count("async def terminal(") == 1
    assert "_terminal_legacy" not in source


@pytest.mark.asyncio
async def test_strict_history_never_calls_demo_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    demo_called = False

    async def strict_yahoo(ticker: str, range_: str, interval: str, attempts: int | None = None) -> list[Candle]:
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


@pytest.mark.asyncio
async def test_bulk_quotes_never_inject_demo_rows_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    monkeypatch.setattr(session_quote_service, "get_quotes", AsyncMock(return_value=[]))
    demo_quote = AsyncMock()
    monkeypatch.setattr(market_data_service.demo, "quote", demo_quote)
    assert await market_data_service.get_quotes(["RY", "TD"]) == []
    demo_quote.assert_not_awaited()


@pytest.mark.asyncio
async def test_strict_history_times_out_one_symbol_without_blocking_coverage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    monkeypatch.setattr(market_data_service, "strict_history_timeout_seconds", 0.01)

    async def history(ticker: str, range_: str, interval: str, attempts: int | None = None) -> list[Candle]:
        if ticker == "SLOW":
            await asyncio.sleep(0.05)
        return candles(count=30)

    monkeypatch.setattr(market_data_service.yahoo, "history", history)
    result = await market_data_service.get_history_many_strict(["RY", "SLOW"], concurrency=2)
    assert set(result) == {"RY"}


@pytest.mark.asyncio
async def test_bulk_history_global_deadline_returns_completed_tickers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")

    async def history(ticker: str, range_: str, interval: str, attempts: int | None = None) -> list[Candle]:
        if ticker != "RY":
            await asyncio.sleep(0.2)
        return candles(count=30)

    monkeypatch.setattr(market_data_service.yahoo, "history", history)
    loop = asyncio.get_running_loop()
    started = loop.time()
    result = await market_data_service.get_history_many_strict(
        ["RY", "SLOW-1", "SLOW-2"],
        concurrency=3,
        deadline_seconds=0.03,
    )
    assert set(result) == {"RY"}
    assert loop.time() - started < 0.15


@pytest.mark.asyncio
async def test_terminal_cold_path_fetches_quotes_history_and_rates_once(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "yahoo")
    symbols = [item.symbol for item in TSX60]
    history_symbols = list(dict.fromkeys([*symbols, "^GSPTSE", *(item[3] for item in YAHOO_DRIVERS)]))
    quote_time = datetime(2026, 9, 2, 16, 0, tzinfo=UTC)
    quotes = [Quote(
        ticker=f"{symbol}.TO",
        symbol=symbol,
        name=symbol,
        exchange="TSX",
        currency="CAD",
        price=100,
        previous_close=99,
        change=1,
        change_percent=1.0101,
        day_high=101,
        day_low=98,
        volume=2_000,
        timestamp=quote_time,
        source="yahoo-public",
        delayed=True,
    ) for symbol in symbols]
    histories = {symbol: candles() for symbol in history_symbols}
    quotes_mock = AsyncMock(return_value=quotes)
    histories_mock = AsyncMock(return_value=histories)
    rates_mock = AsyncMock(return_value={})
    screener_mock = AsyncMock(side_effect=AssertionError("Terminal must not load the screener snapshot"))
    legacy_history_mock = AsyncMock(side_effect=AssertionError("Terminal must not request a second 3mo history"))
    monkeypatch.setattr(market_data_service, "get_quotes", quotes_mock)
    monkeypatch.setattr(market_data_service, "get_history_many_strict", histories_mock)
    monkeypatch.setattr(market_data_service, "get_history_many", legacy_history_mock)
    monkeypatch.setattr(bank_of_canada_valet_service, "yields", rates_mock)
    monkeypatch.setattr(screener_service, "get_tsx60", screener_mock)

    with caplog.at_level(logging.INFO, logger="app.services.analysis"):
        snapshot = await AnalysisService().terminal()

    quotes_mock.assert_awaited_once_with(symbols)
    histories_mock.assert_awaited_once_with(history_symbols, range_="1y", interval="1d", concurrency=8)
    rates_mock.assert_awaited_once_with()
    screener_mock.assert_not_awaited()
    legacy_history_mock.assert_not_awaited()
    assert snapshot.schema_version == 2
    assert snapshot.data_quality.quotes_as_of == quote_time
    assert snapshot.data_quality.history_as_of is not None
    messages = " ".join(caplog.messages)
    for field in (
        "terminal_build_start",
        "terminal_quotes_ms",
        "terminal_histories_ms",
        "terminal_rates_ms",
        "terminal_compute_ms",
        "terminal_total_ms",
        "history_symbols_requested",
        "history_symbols_received",
        "real_quote_count",
    ):
        assert field in messages
