from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.resilience import shared_http_client
from app.schemas.discovery import ScreenerRow
from app.schemas.stocks import Candle
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.terminal_drivers import correlation, correlation_yield_changes_to_equity_returns, rate_market_drivers, yahoo_market_drivers
from app.services.terminal_engine import build_anomalies, build_sector_rotation


def history(*, drift: float = 0.2, count: int = 260, volume: int = 1_000, gap: float = 0) -> list[Candle]:
    start = datetime(2025, 1, 2, tzinfo=UTC)
    price = 100.0
    output: list[Candle] = []
    for index in range(count):
        previous = price
        price += drift
        opening = previous * (1 + gap / 100) if index == count - 1 else previous
        output.append(Candle(
            time=int((start + timedelta(days=index)).timestamp()), open=opening,
            high=max(opening, price) + 0.5, low=min(opening, price) - 0.5,
            close=price, volume=volume + index,
        ))
    return output


def terminal_row(symbol: str, *, sector: str = "Financials", change: float = 1, volume: int = 3_000, rsi: float = 55, score: float = 70) -> ScreenerRow:
    return ScreenerRow(
        ticker=f"{symbol}.TO", symbol=symbol, name=symbol, sector=sector, price=150,
        change_percent=change, volume=volume, average_volume_20d=1_000, relative_volume=volume / 1_000,
        momentum_20d=6, rsi_14=rsi, sma_20=140, sma_50=130, trend="Haussière",
        score=score, signal="Constructif", source="yahoo-public", delayed=True,
    )


def anomaly_types(rows: list[ScreenerRow], histories: dict[str, list[Candle]]) -> set[str]:
    return {item.type for item in build_anomalies(rows, histories)}


def test_volume_gap_rsi_price_volume_and_sector_anomalies() -> None:
    spike = history(gap=3)
    spike[-1] = spike[-1].model_copy(update={"volume": 20_000})
    rows = [
        terminal_row("RY", change=-3, volume=20_000, rsi=80),
        terminal_row("TD", change=1, volume=1_000),
        terminal_row("BMO", change=1, volume=1_000),
    ]
    types = anomaly_types(rows, {"RY": spike, "TD": history(drift=-0.05), "BMO": history(drift=0.05)})
    assert {"volume_spike", "gap", "rsi_extreme", "price_volume_divergence", "sector_dislocation"} <= types


def test_momentum_acceleration_sma_cross_and_score_shift() -> None:
    candles = history(drift=-0.05)
    for index in range(len(candles) - 5, len(candles)):
        previous = candles[index - 1].close
        candles[index] = candles[index].model_copy(update={"open": previous, "close": previous + 4, "high": previous + 5, "low": previous - 1})
    # Force the last close across the actual MM20 while retaining sufficient history.
    current_sma20 = sum(item.close for item in candles[-20:]) / 20
    candles[-2] = candles[-2].model_copy(update={"close": current_sma20 - 2})
    candles[-1] = candles[-1].model_copy(update={"close": current_sma20 + 2})
    types = anomaly_types([terminal_row("SHOP", change=2.5, score=95)], {"SHOP": candles})
    assert "momentum_acceleration" in types
    assert "sma_cross" in types
    assert "score_shift" in types
    first = build_anomalies([terminal_row("SHOP", change=2.5, score=95)], {"SHOP": candles})
    second = build_anomalies([terminal_row("SHOP", change=2.5, score=95)], {"SHOP": candles})
    assert [(item.id, item.rarity_score, item.z_score) for item in first] == [(item.id, item.rarity_score, item.z_score) for item in second]
    assert all(0 <= item.rarity_score <= 100 for item in first)


def test_rotation_relative_strength_and_previous_coordinates_are_deterministic() -> None:
    histories = {"RY": history(drift=0.3), "ENB": history(drift=-0.1)}
    rows = [terminal_row("RY"), terminal_row("ENB", sector="Energy", change=-1)]
    first = build_sector_rotation(rows, histories, history(drift=0.1), 2)
    second = build_sector_rotation(rows, histories, history(drift=0.1), 2)
    assert first == second
    assert all(item.relative_strength_20d is not None for item in first)
    assert all(item.previous_x is not None and item.previous_y is not None for item in first)


def test_yahoo_driver_normalization_correlation_and_unavailable_nulls() -> None:
    benchmark = history(drift=0.2)
    observed_now = datetime.fromtimestamp(benchmark[-1].time, UTC)
    drivers = yahoo_market_drivers({"CL=F": history(drift=0.3)}, benchmark, now=observed_now)
    wti = next(item for item in drivers if item.key == "wti")
    brent = next(item for item in drivers if item.key == "brent")
    assert wti.status == "available"
    assert wti.change_1d is not None and wti.change_5d is not None and wti.change_20d is not None
    assert wti.correlation_60d_to_tsx == round(correlation(history(drift=0.3), benchmark) or 0, 3)
    assert wti.relationship_label and "TSX" in wti.relationship_label
    assert brent.status == "unavailable"
    assert brent.value is None and brent.change_5d is None


@pytest.mark.asyncio
async def test_bank_of_canada_valet_fixture_and_yield_changes_are_bps(monkeypatch: pytest.MonkeyPatch) -> None:
    observations = []
    for index in range(25):
        observations.append({
            "d": (datetime(2026, 1, 1) + timedelta(days=index)).date().isoformat(),
            "BD.CDN.2YR.DQ.YLD": {"v": str(3 + index * 0.01)},
            "BD.CDN.10YR.DQ.YLD": {"v": str(3.5 + index * 0.02)},
        })

    async def fixture(*args: object, **kwargs: object) -> dict[str, object]:
        return {"observations": observations}

    bank_of_canada_valet_service._cache._entries.clear()
    monkeypatch.setattr(shared_http_client, "get_json", fixture)
    series = await bank_of_canada_valet_service.yields()
    drivers = rate_market_drivers(series, history(count=25), now=datetime(2026, 1, 25, tzinfo=UTC))
    two_year = next(item for item in drivers if item.key == "canada_2y")
    ten_year = next(item for item in drivers if item.key == "canada_10y")
    assert len(series["V39051"]) == 25 and len(series["V39055"]) == 25
    assert two_year.change_unit == "bps" and two_year.change_5d == 5
    assert ten_year.change_20d == 40
    assert two_year.source_name == "Banque du Canada / Bank of Canada"


def test_canada_2y_and_10y_correlate_yield_changes_to_aligned_tsx_returns() -> None:
    benchmark = history(count=70, drift=0.35)
    level = 3.0
    points: list[tuple[int, float]] = []
    for index, candle in enumerate(benchmark):
        if index:
            level += (candle.close / benchmark[index - 1].close - 1) * 10
        points.append((candle.time, level))
    value = correlation_yield_changes_to_equity_returns(points, benchmark)
    drivers = rate_market_drivers({"V39051": points, "V39055": points}, benchmark, now=datetime.fromtimestamp(points[-1][0], UTC))
    assert value is not None and value > 0.99
    for key in ("canada_2y", "canada_10y"):
        driver = next(item for item in drivers if item.key == key)
        assert driver.correlation_60d_to_tsx is not None and driver.correlation_60d_to_tsx > 0.99
        assert driver.relationship_label == "Corrélation fortement positive entre variations du taux et rendements du TSX"


def test_yield_correlation_requires_twenty_common_observations() -> None:
    benchmark = history(count=20)
    points = [(candle.time, 3 + index * 0.01) for index, candle in enumerate(benchmark)]
    assert correlation_yield_changes_to_equity_returns(points, benchmark) is None
    assert all(item.correlation_60d_to_tsx is None for item in rate_market_drivers({"V39051": points, "V39055": points}, benchmark, now=datetime.fromtimestamp(points[-1][0], UTC)))


def test_driver_freshness_retains_real_stale_values_and_unavailable_is_null() -> None:
    yahoo = history(count=30)
    last = datetime.fromtimestamp(yahoo[-1].time, UTC)
    fresh = next(item for item in yahoo_market_drivers({"CL=F": yahoo}, yahoo, now=last + timedelta(days=3)) if item.key == "wti")
    stale = next(item for item in yahoo_market_drivers({"CL=F": yahoo}, yahoo, now=last + timedelta(days=8)) if item.key == "wti")
    unavailable = next(item for item in yahoo_market_drivers({}, yahoo, now=last) if item.key == "wti")
    single_yahoo = next(item for item in yahoo_market_drivers({"CL=F": yahoo[-1:]}, yahoo, now=last + timedelta(days=8)) if item.key == "wti")
    points = [(item.time, 3 + index * 0.01) for index, item in enumerate(yahoo)]
    stale_rate = next(item for item in rate_market_drivers({"V39051": points}, yahoo, now=last + timedelta(days=8)) if item.key == "canada_2y")
    single_rate = next(item for item in rate_market_drivers({"V39051": points[-1:]}, yahoo, now=last + timedelta(days=8)) if item.key == "canada_2y")
    assert fresh.status == "available"
    assert stale.status == "stale" and stale.value == fresh.value and stale.as_of == fresh.as_of
    assert stale_rate.status == "stale" and stale_rate.value == points[-1][1]
    assert single_yahoo.status == "stale" and single_yahoo.value == round(yahoo[-1].close, 4) and single_yahoo.change_1d is None
    assert single_rate.status == "stale" and single_rate.value == points[-1][1] and single_rate.change_1d is None
    assert unavailable.status == "unavailable" and unavailable.value is None and unavailable.as_of is None


def test_unavailable_bank_of_canada_is_null_not_demo() -> None:
    drivers = rate_market_drivers(None)
    assert all(item.status == "unavailable" and item.value is None for item in drivers)
