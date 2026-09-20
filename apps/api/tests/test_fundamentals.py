from datetime import UTC, datetime

import pytest

from app.core.resilience import RemoteCacheEntry
from app.schemas.fundamentals import FinancialPeriod
from app.services.fundamentals import FundamentalsService, percent


def wrapped(value: float) -> dict[str, float]:
    return {"raw": value}


def sample_payload() -> dict:
    return {
        "assetProfile": {
            "sector": "Financial Services",
            "industry": "Banks—Diversified",
        },
        "price": {
            "longName": "Royal Bank of Canada",
            "currency": "CAD",
            "exchangeName": "TOR",
            "marketCap": wrapped(200_000_000_000),
        },
        "summaryDetail": {
            "trailingPE": wrapped(15.2),
            "dividendYield": wrapped(0.034),
            "fiftyTwoWeekHigh": wrapped(310),
            "fiftyTwoWeekLow": wrapped(210),
        },
        "defaultKeyStatistics": {
            "enterpriseValue": wrapped(250_000_000_000),
            "priceToBook": wrapped(2.1),
            "trailingEps": wrapped(19.5),
            "sharesOutstanding": wrapped(1_400_000_000),
        },
        "financialData": {
            "currentPrice": wrapped(296.73),
            "targetMeanPrice": wrapped(320),
            "targetLowPrice": wrapped(285),
            "targetMedianPrice": wrapped(318),
            "targetHighPrice": wrapped(350),
            "numberOfAnalystOpinions": wrapped(14),
            "recommendationMean": wrapped(2.1),
            "recommendationKey": "buy",
            "totalRevenue": wrapped(65_000_000_000),
            "profitMargins": wrapped(0.29),
            "returnOnEquity": wrapped(0.18),
        },
        "recommendationTrend": {
            "trend": [
                {
                    "period": "0m",
                    "strongBuy": 3,
                    "buy": 7,
                    "hold": 4,
                    "sell": 0,
                    "strongSell": 0,
                }
            ]
        },
        "calendarEvents": {
            "earnings": {
                "earningsDate": [
                    wrapped(
                        datetime(
                            2026,
                            8,
                            27,
                            tzinfo=UTC,
                        ).timestamp()
                    )
                ]
            }
        },
        "earnings": {
            "earningsChart": {
                "quarterly": [
                    {
                        "date": "2Q2026",
                        "actual": wrapped(3.05),
                        "estimate": wrapped(2.91),
                    }
                ]
            }
        },
        "incomeStatementHistory": {
            "incomeStatementHistory": [
                {
                    "endDate": wrapped(
                        datetime(
                            2025,
                            10,
                            31,
                            tzinfo=UTC,
                        ).timestamp()
                    ),
                    "totalRevenue": wrapped(60_000_000_000),
                    "grossProfit": wrapped(30_000_000_000),
                    "operatingIncome": wrapped(18_000_000_000),
                    "netIncome": wrapped(14_000_000_000),
                }
            ]
        },
        "cashflowStatementHistory": {
            "cashflowStatements": [
                {
                    "endDate": wrapped(
                        datetime(
                            2025,
                            10,
                            31,
                            tzinfo=UTC,
                        ).timestamp()
                    ),
                    "totalCashFromOperatingActivities": wrapped(
                        20_000_000_000
                    ),
                    "capitalExpenditures": wrapped(-2_000_000_000),
                }
            ]
        },
        "balanceSheetHistory": {
            "balanceSheetStatements": [
                {
                    "endDate": wrapped(
                        datetime(
                            2025,
                            10,
                            31,
                            tzinfo=UTC,
                        ).timestamp()
                    ),
                    "cash": wrapped(40_000_000_000),
                    "totalDebt": wrapped(50_000_000_000),
                    "totalAssets": wrapped(2_000_000_000_000),
                    "totalStockholderEquity": wrapped(100_000_000_000),
                }
            ]
        },
    }


def test_percent_converts_ratio_to_percentage() -> None:
    assert percent({"raw": 0.034}) == 3.4


def test_snapshot_maps_real_fields_without_invention() -> None:
    service = FundamentalsService()
    snapshot = service._snapshot(
        "RY",
        "RY.TO",
        sample_payload(),
    )

    assert snapshot.name == "Royal Bank of Canada"
    assert snapshot.currency == "CAD"
    assert snapshot.metrics.market_cap == 200_000_000_000
    assert snapshot.metrics.dividend_yield == 3.4
    assert snapshot.analysts.target_mean == 320
    assert snapshot.analysts.analyst_count == 14
    assert snapshot.analysts.upside_to_mean_percent is not None
    assert snapshot.annual_financials[0].free_cash_flow == 18_000_000_000
    assert snapshot.earnings_history[0].surprise_percent is not None


@pytest.mark.asyncio
async def test_quote_summary_failure_still_uses_structured_financials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = FundamentalsService()

    async def fail_summary(symbol: str) -> dict:
        raise RuntimeError("private upstream diagnostic")

    async def enrich(snapshot, *, upstream_failed: bool = False):
        assert upstream_failed is True
        return snapshot.model_copy(
            update={
                "status": "partial",
                "message": "Certaines sources sont temporairement indisponibles.",
                "annual_financials": [
                    FinancialPeriod(
                        period_end=datetime(2025, 12, 31, tzinfo=UTC),
                        period_type="annual",
                        currency="CAD",
                        total_revenue=42_000_000_000,
                    )
                ],
            }
        )

    monkeypatch.setattr(service, "_request_summary", fail_summary)
    monkeypatch.setattr(
        "app.services.fundamentals.official_financials_service.enrich",
        enrich,
    )

    snapshot = await service.get_snapshot("CNQ")

    if task := service._refresh_tasks.get("CNQ.TO"):
        await task
    snapshot = await service.get_snapshot("CNQ")

    assert snapshot.status == "partial"
    assert snapshot.annual_financials[0].total_revenue == 42_000_000_000
    assert "RuntimeError" not in (snapshot.message or "")


@pytest.mark.asyncio
async def test_tmx_fallback_populates_cards_when_yahoo_summary_is_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = FundamentalsService()

    async def fail_summary(symbol: str) -> dict:
        raise RuntimeError("Yahoo unavailable")

    async def tmx_summary(symbol: str) -> dict:
        assert symbol == "TD.TO"
        return {
            "_source": "TMX Money",
            "price": {
                "longName": "Toronto-Dominion Bank",
                "currency": "CAD",
                "exchangeName": "TSX",
                "marketCap": 282_052_993_664,
            },
            "summaryDetail": {
                "trailingPE": 18.5,
                "fiftyTwoWeekHigh": 175.33,
                "fiftyTwoWeekLow": 107.55,
                "dividendRate": 4.48,
                "dividendYield": 0.02613,
                "payoutRatio": 4.48 / 12.34,
            },
            "defaultKeyStatistics": {
                "priceToBook": 2.46,
                "trailingEps": 12.34,
                "beta": 0.886524,
                "sharesOutstanding": 1_644_815_685,
            },
            "financialData": {
                "financialCurrency": "CAD",
                "currentPrice": 171.48,
            },
        }

    async def analyst_payload(symbol: str) -> dict:
        return {}

    async def enrich(snapshot, *, upstream_failed: bool = False):
        return snapshot

    monkeypatch.setattr(service, "_request_summary", fail_summary)
    monkeypatch.setattr(
        "app.services.fundamentals.tmx_money_service.get_summary",
        tmx_summary,
    )
    monkeypatch.setattr(service, "_analyst_payload", analyst_payload)
    monkeypatch.setattr(
        "app.services.fundamentals.official_financials_service.enrich",
        enrich,
    )

    snapshot = await service.get_snapshot("TD")
    if task := service._refresh_tasks.get("TD.TO"):
        await task
    snapshot = await service.get_snapshot("TD")

    assert snapshot.source == "TMX Money"
    assert snapshot.status == "partial"
    assert snapshot.metrics.market_cap == 282_052_993_664
    assert snapshot.metrics.trailing_pe == 18.5
    assert snapshot.metrics.beta == pytest.approx(0.886524)
    assert snapshot.metrics.fifty_two_week_high == 175.33
    assert snapshot.metrics.shares_outstanding == 1_644_815_685
    assert snapshot.metrics.dividend_rate == pytest.approx(4.48)
    assert snapshot.metrics.dividend_yield == pytest.approx(2.613)
    assert snapshot.metrics.payout_ratio == pytest.approx(4.48 / 12.34 * 100)
    assert snapshot.metrics.average_volume_3m is None


@pytest.mark.asyncio
async def test_restores_last_valid_snapshot_after_process_restart() -> None:
    service = FundamentalsService()
    saved = service._snapshot(
        "RY",
        "RY.TO",
        {
            "_source": "TMX Money",
            "price": {
                "longName": "Royal Bank of Canada",
                "currency": "CAD",
                "exchangeName": "TSX",
                "marketCap": 394_418_219_242,
            },
        },
    )

    class PersistentCache:
        async def read(self, key: str) -> RemoteCacheEntry:
            assert key == "RY.TO"
            return RemoteCacheEntry(value=saved, age_seconds=12)

        async def write(self, key, value, *, ttl_seconds):
            raise AssertionError("restore must not write")

    service._persistent = PersistentCache()

    await service._restore("RY.TO")

    restored = service._cache["RY.TO"][1]
    assert restored.source == "TMX Money"
    assert restored.metrics.market_cap == 394_418_219_242
    assert restored.generated_at == saved.generated_at
    assert restored.stale is True
    assert restored.refresh_in_progress is False
