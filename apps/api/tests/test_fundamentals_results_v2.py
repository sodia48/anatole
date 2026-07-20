from datetime import UTC, datetime

from app.services.fundamentals import FundamentalsService


def wrapped(value: float) -> dict[str, float]:
    return {"raw": value}


def ts(year: int, month: int, day: int) -> dict[str, float]:
    return wrapped(
        datetime(
            year,
            month,
            day,
            tzinfo=UTC,
        ).timestamp()
    )


def quarterly_row(
    end: dict[str, float],
    revenue: float,
    operating_income: float,
    net_income: float,
    diluted_eps: float,
) -> dict:
    return {
        "endDate": end,
        "totalRevenue": wrapped(revenue),
        "grossProfit": wrapped(revenue * 0.4),
        "operatingIncome": wrapped(operating_income),
        "netIncome": wrapped(net_income),
        "dilutedEPS": wrapped(diluted_eps),
    }


def sample_payload() -> dict:
    quarter_dates = [
        ts(2026, 6, 30),
        ts(2026, 3, 31),
        ts(2025, 12, 31),
        ts(2025, 9, 30),
        ts(2025, 6, 30),
        ts(2025, 3, 31),
        ts(2024, 12, 31),
        ts(2024, 9, 30),
    ]
    revenues = [110, 105, 100, 95, 90, 88, 86, 84]
    operating = [22, 21, 20, 19, 18, 17, 16, 15]
    incomes = [15, 14, 13, 12, 10, 9, 8, 7]
    eps = [1.5, 1.4, 1.3, 1.2, 1.0, 0.9, 0.8, 0.7]

    return {
        "assetProfile": {
            "sector": "Basic Materials",
            "industry": "Specialty Chemicals",
        },
        "price": {
            "longName": "5N Plus Inc.",
            "currency": "CAD",
            "exchangeName": "TOR",
            "marketCap": wrapped(3_000_000_000),
        },
        "summaryDetail": {},
        "defaultKeyStatistics": {},
        "financialData": {},
        "incomeStatementHistoryQuarterly": {
            "incomeStatementHistory": [
                quarterly_row(
                    quarter_dates[index],
                    revenues[index],
                    operating[index],
                    incomes[index],
                    eps[index],
                )
                for index in range(8)
            ]
        },
        "cashflowStatementHistoryQuarterly": {
            "cashflowStatements": [
                {
                    "endDate": quarter_dates[index],
                    "totalCashFromOperatingActivities": wrapped(
                        20 + index
                    ),
                    "capitalExpenditures": wrapped(-5),
                    "dividendsPaid": wrapped(-1),
                    "repurchaseOfStock": wrapped(-2),
                }
                for index in range(8)
            ]
        },
        "balanceSheetHistoryQuarterly": {
            "balanceSheetStatements": [
                {
                    "endDate": quarter_dates[index],
                    "cash": wrapped(50),
                    "totalDebt": wrapped(80),
                    "totalCurrentAssets": wrapped(120),
                    "totalCurrentLiabilities": wrapped(60),
                    "totalAssets": wrapped(400),
                    "totalLiab": wrapped(250),
                    "totalStockholderEquity": wrapped(150),
                }
                for index in range(8)
            ]
        },
        "incomeStatementHistory": {
            "incomeStatementHistory": [
                {
                    "endDate": ts(year, 12, 31),
                    "totalRevenue": wrapped(value),
                    "operatingIncome": wrapped(value * 0.2),
                    "netIncome": wrapped(value * 0.12),
                    "dilutedEPS": wrapped(value / 100),
                }
                for year, value in [
                    (2025, 400),
                    (2024, 350),
                    (2023, 300),
                    (2022, 250),
                ]
            ]
        },
        "cashflowStatementHistory": {
            "cashflowStatements": [
                {
                    "endDate": ts(year, 12, 31),
                    "totalCashFromOperatingActivities": wrapped(value * 0.18),
                    "capitalExpenditures": wrapped(-value * 0.04),
                }
                for year, value in [
                    (2025, 400),
                    (2024, 350),
                    (2023, 300),
                    (2022, 250),
                ]
            ]
        },
        "balanceSheetHistory": {
            "balanceSheetStatements": []
        },
        "earningsTrend": {
            "trend": [
                {
                    "period": "0q",
                    "endDate": "2026-09-30",
                    "earningsEstimate": {
                        "avg": wrapped(0.42),
                        "low": wrapped(0.38),
                        "high": wrapped(0.46),
                        "yearAgoEps": wrapped(0.34),
                        "growth": wrapped(0.235),
                        "numberOfAnalysts": wrapped(5),
                    },
                    "revenueEstimate": {
                        "avg": wrapped(120_000_000),
                        "low": wrapped(115_000_000),
                        "high": wrapped(125_000_000),
                        "yearAgoRevenue": wrapped(100_000_000),
                        "growth": wrapped(0.20),
                        "numberOfAnalysts": wrapped(4),
                    },
                }
            ]
        },
    }


def test_quarterly_yoy_and_ttm_are_derived() -> None:
    service = FundamentalsService()
    snapshot = service._snapshot(
        "VNP",
        "VNP.TO",
        sample_payload(),
    )

    latest = snapshot.quarterly_financials[0]

    assert round(latest.revenue_growth_yoy or 0, 2) == 22.22
    assert round(latest.net_income_growth_yoy or 0, 2) == 50.0
    assert snapshot.ttm.total_revenue == 410
    assert snapshot.ttm.net_income == 54
    assert snapshot.ttm.free_cash_flow is not None
    assert snapshot.ttm.net_debt == 30


def test_annual_cagr_and_estimates_are_available() -> None:
    service = FundamentalsService()
    snapshot = service._snapshot(
        "VNP",
        "VNP.TO",
        sample_payload(),
    )

    assert snapshot.highlights.three_year_revenue_cagr is not None
    assert snapshot.earnings_estimates[0].eps_average == 0.42
    assert snapshot.earnings_estimates[0].revenue_growth == 20.0
