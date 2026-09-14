from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.schemas.fundamentals import (
    AnalystConsensus,
    CorporateEvents,
    FinancialHighlights,
    FinancialPeriod,
    FundamentalMetrics,
    FundamentalSnapshot,
    TTMSummary,
)
from app.schemas.stocks import Candle, Quote
from app.services.currency_conversion import CurrencyConversionService
from app.services.market_data import YahooProvider


def usd_quote(ticker: str = "GC=F") -> Quote:
    return Quote(
        ticker=ticker,
        symbol=ticker,
        name=ticker,
        exchange="CMX",
        currency="USD",
        price=100.0,
        previous_close=90.0,
        change=10.0,
        change_percent=11.111111,
        day_high=105.0,
        day_low=88.0,
        volume=1000,
        timestamp=datetime.now(UTC),
        source="test",
        delayed=True,
    )


@pytest.mark.asyncio
async def test_quote_money_is_normalized_to_cad(monkeypatch) -> None:
    service = CurrencyConversionService()

    async def rate(_currency):
        return 1.35

    monkeypatch.setattr(service, "rate_to_cad", rate)
    quote = await service.quote_to_cad(usd_quote("GC=F"))

    assert quote.currency == "CAD"
    assert quote.native_currency == "USD"
    assert quote.fx_rate_to_cad == 1.35
    assert quote.price == 135.0
    assert quote.previous_close == 121.5
    assert quote.change == 13.5
    assert quote.change_percent == pytest.approx(11.111111)


@pytest.mark.asyncio
async def test_fx_and_indices_are_not_monetary_conversions(monkeypatch) -> None:
    service = CurrencyConversionService()

    async def forbidden(_currency):
        raise AssertionError("FX conversion must not be requested")

    monkeypatch.setattr(service, "rate_to_cad", forbidden)

    fx = await service.quote_to_cad(usd_quote("CADUSD=X"))
    index = await service.quote_to_cad(usd_quote("^GSPC"))

    assert fx.price == 100.0
    assert fx.currency == "FX"
    assert index.price == 100.0
    assert index.currency == "PTS"


@pytest.mark.asyncio
async def test_history_ohlc_is_normalized_with_date_fx(monkeypatch) -> None:
    service = CurrencyConversionService()
    candles = [
        Candle(
            time=1_700_000_000,
            open=10.0,
            high=12.0,
            low=9.0,
            close=11.0,
            volume=50,
        )
    ]

    async def rates(_currency, timestamps):
        return {int(value): 1.4 for value in timestamps}

    monkeypatch.setattr(service, "rates_to_cad", rates)

    result = await service.candles_to_cad(
        "GC=F",
        "USD",
        candles,
    )
    assert result[0].open == 14.0
    assert result[0].high == 16.8
    assert result[0].low == 12.6
    assert result[0].close == 15.4
    assert result[0].volume == 50


@pytest.mark.asyncio
async def test_yahoo_history_passes_normalized_symbol_to_cad_converter(
    monkeypatch,
) -> None:
    provider = YahooProvider()
    timestamps = [1_700_000_000, 1_700_086_400]

    async def chart(_ticker, _range, _interval, _attempts=None):
        return {
            "meta": {"currency": "CAD"},
            "timestamp": timestamps,
            "indicators": {
                "quote": [
                    {
                        "open": [10.0, 11.0],
                        "high": [12.0, 13.0],
                        "low": [9.0, 10.0],
                        "close": [11.0, 12.0],
                        "volume": [100, 120],
                    }
                ]
            },
        }

    calls = []

    async def candles_to_cad(symbol, currency, candles):
        calls.append((symbol, currency, candles))
        return candles

    monkeypatch.setattr(provider, "chart", chart)
    monkeypatch.setattr(
        "app.services.market_data.currency_conversion_service.candles_to_cad",
        candles_to_cad,
    )

    candles = await provider.history("AEM", "1y", "1d")

    assert len(candles) == 2
    assert calls == [("AEM.TO", "CAD", candles)]


@pytest.mark.asyncio
async def test_yahoo_exact_symbol_history_preserves_native_listing_currency(
    monkeypatch,
) -> None:
    provider = YahooProvider()
    timestamps = [1_700_000_000, 1_700_086_400]
    chart_calls = []

    async def chart(
        ticker,
        _range,
        _interval,
        _attempts=None,
        *,
        normalize_symbol=True,
    ):
        chart_calls.append((ticker, normalize_symbol))
        return {
            "meta": {"currency": "USD"},
            "timestamp": timestamps,
            "indicators": {"quote": [{
                "open": [128.0, 129.0],
                "high": [131.0, 132.0],
                "low": [126.0, 127.0],
                "close": [130.0, 131.0],
                "volume": [100, 120],
            }]},
        }

    async def unexpected_conversion(*_args):
        raise AssertionError("exact listing history must remain source-native")

    monkeypatch.setattr(provider, "chart", chart)
    monkeypatch.setattr(
        "app.services.market_data.currency_conversion_service.candles_to_cad",
        unexpected_conversion,
    )

    candles = await provider.history(
        "SHOP",
        "1y",
        "1d",
        normalize_symbol=False,
    )

    assert chart_calls == [("SHOP", False)]
    assert candles[0].low == 126.0
    assert candles[0].high == 131.0


@pytest.mark.asyncio
async def test_fundamentals_money_is_cad_ratios_are_unchanged(
    monkeypatch,
) -> None:
    service = CurrencyConversionService()

    async def rate(currency):
        return 1.25 if currency == "USD" else 1.0

    monkeypatch.setattr(service, "rate_to_cad", rate)

    period = FinancialPeriod(
        period_end=datetime(2026, 6, 30, tzinfo=UTC),
        period_type="quarterly",
        currency="USD",
        total_revenue=100.0,
        net_income=10.0,
        diluted_eps=2.0,
        gross_margin=50.0,
    )
    snapshot = FundamentalSnapshot(
        ticker="TEST.TO",
        symbol="TEST",
        name="Test",
        exchange="TOR",
        currency="CAD",
        financial_currency="USD",
        status="available",
        metrics=FundamentalMetrics(
            market_cap=1000.0,
            trailing_pe=20.0,
            trailing_eps=2.0,
            total_revenue=400.0,
            gross_margin=50.0,
        ),
        quarterly_financials=[period],
        ttm=TTMSummary(
            currency="USD",
            total_revenue=400.0,
            diluted_eps=8.0,
            gross_margin=50.0,
        ),
        highlights=FinancialHighlights(),
        analysts=AnalystConsensus(
            current_price=50.0,
            target_mean=60.0,
            upside_to_mean_percent=20.0,
        ),
        events=CorporateEvents(),
        source="test",
        generated_at=datetime.now(UTC),
    )

    result = await service.fundamental_to_cad(snapshot)

    assert result.currency == "CAD"
    assert result.financial_currency == "CAD"
    assert result.native_financial_currency == "USD"
    assert result.metrics.market_cap == 1000.0
    assert result.metrics.trailing_pe == 20.0
    assert result.metrics.trailing_eps == 2.5
    assert result.metrics.total_revenue == 500.0
    assert result.metrics.gross_margin == 50.0
    assert result.quarterly_financials[0].currency == "CAD"
    assert result.quarterly_financials[0].total_revenue == 125.0
    assert result.quarterly_financials[0].diluted_eps == 2.5
    assert result.quarterly_financials[0].gross_margin == 50.0
    assert result.ttm.currency == "CAD"
    assert result.ttm.total_revenue == 500.0
    assert result.analysts.current_price == 50.0
    assert result.analysts.target_mean == 60.0
    assert result.analysts.upside_to_mean_percent == 20.0
