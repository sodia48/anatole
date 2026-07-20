from datetime import UTC, datetime

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
