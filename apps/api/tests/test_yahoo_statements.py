from datetime import UTC, datetime

import pandas as pd

from app.services.yahoo_statements import YahooStatementsService


DATES = pd.to_datetime(
    ["2025-10-31", "2024-10-31", "2023-10-31", "2022-10-31"]
)


def frame(rows: dict[str, list[float]]) -> pd.DataFrame:
    return pd.DataFrame(rows, index=DATES).T


def test_beta_style_annual_statements_are_restored() -> None:
    service = YahooStatementsService()
    frames = {
        "annual_income": frame(
            {
                "TotalRevenue": [66.53e9, 57.49e9, 51.59e9, 48.77e9],
                "NetIncome": [19.87e9, 15.91e9, 14.37e9, 15.55e9],
                "DilutedEPS": [14.07, 11.25, 10.32, 11.06],
            }
        ),
        "annual_balance": frame(
            {
                "TotalAssets": [2.33e12, 2.17e12, 2.01e12, 1.92e12],
                "CashCashEquivalentsAndShortTermInvestments": [
                    87.39e9,
                    122.74e9,
                    133.07e9,
                    180.41e9,
                ],
                "TotalDebt": [545.44e9, 463.41e9, 439.35e9, 425.18e9],
                "StockholdersEquity": [
                    127.45e9,
                    118.07e9,
                    107.72e9,
                    100.74e9,
                ],
            }
        ),
        "annual_cashflow": frame(
            {
                "OperatingCashFlow": [55.22e9, 23.14e9, 26.08e9, 21.94e9],
                "CapitalExpenditure": [-2.24e9, -2.28e9, -2.73e9, -2.50e9],
            }
        ),
    }

    result = service.normalize_frames(
        ticker="TEST",
        frames=frames,
        currency="CAD",
    )
    latest = result.annual[0]

    assert latest.period_end == datetime(2025, 10, 31, tzinfo=UTC)
    assert latest.total_assets == 2.33e12
    assert latest.total_cash == 87.39e9
    assert latest.total_debt == 545.44e9
    assert latest.stockholder_equity == 127.45e9
    assert latest.total_revenue == 66.53e9
    assert latest.net_income == 19.87e9
    assert latest.diluted_eps == 14.07
    assert latest.operating_cash_flow == 55.22e9
    assert latest.capital_expenditure == -2.24e9
    assert latest.free_cash_flow == 52.98e9
    assert "free_cash_flow" in latest.calculated_fields
    assert latest.source is not None
    assert latest.source.source_type == "yahoo_structured"


def test_exact_balance_equation_is_used_only_when_possible() -> None:
    service = YahooStatementsService()
    date = pd.Timestamp("2025-12-31")
    balance = pd.DataFrame(
        {
            date: {
                "TotalAssets": 500.0,
                "TotalLiabilitiesNetMinorityInterest": 320.0,
            }
        }
    )
    result = service.normalize_frames(
        ticker="TEST",
        frames={"annual_balance": balance},
        currency="CAD",
    )
    latest = result.annual[0]

    assert latest.stockholder_equity == 180.0
    assert "stockholder_equity" in latest.calculated_fields
