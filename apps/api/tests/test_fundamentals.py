from datetime import UTC, datetime, timedelta

import pytest

from app.schemas.fundamentals import FinancialPeriod
from app.core.resilience import RemoteCacheEntry
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
async def test_background_refresh_retries_market_summary(monkeypatch) -> None:
    service = FundamentalsService()
    calls = 0

    async def summary(symbol: str) -> dict:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise TimeoutError
        return sample_payload()

    async def empty(_: str) -> dict:
        return {}

    async def enrich(snapshot, *, upstream_failed: bool = False):
        assert upstream_failed is False
        return snapshot

    monkeypatch.setattr(service, "_request_summary", summary)
    monkeypatch.setattr(service, "_quote_fallback", empty)
    monkeypatch.setattr(service, "_analyst_payload", empty)
    monkeypatch.setattr(
        "app.services.fundamentals.official_financials_service.enrich",
        enrich,
    )

    await service.get_snapshot("RY")
    if task := service._refresh_tasks.get("RY.TO"):
        await task
    snapshot = await service.get_snapshot("RY")

    assert calls == 2
    assert snapshot.metrics.market_cap == 200_000_000_000
    assert snapshot.metrics.fifty_two_week_high == 310


@pytest.mark.asyncio
async def test_restores_last_valid_snapshot_after_restart() -> None:
    service = FundamentalsService()
    saved = service._snapshot("RY", "RY.TO", sample_payload())

    class PersistentCache:
        async def read(self, key: str) -> RemoteCacheEntry:
            assert key == "RY.TO"
            return RemoteCacheEntry(value=saved, age_seconds=12)

        async def write(self, *args, **kwargs) -> None:
            return None

    service._persistent = PersistentCache()
    await service._restore("RY.TO")

    restored = service._cache["RY.TO"][1]
    assert restored.stale is True
    assert restored.generated_at == saved.generated_at
    assert restored.metrics.market_cap == 200_000_000_000


def test_expired_values_are_not_inherited() -> None:
    service = FundamentalsService()
    current = service._unavailable("RY", "RY.TO", "refreshing")
    expired = service._snapshot("RY", "RY.TO", sample_payload()).model_copy(
        update={"generated_at": datetime.now(UTC) - timedelta(days=2)}
    )

    merged = service._retain_components(current, expired)

    assert merged.metrics.market_cap is None
    assert merged.generated_at == current.generated_at
