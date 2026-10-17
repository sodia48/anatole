from fastapi.testclient import TestClient

from app.main import app
from app.schemas.fundamentals import EarningsEstimate, EarningsQuarter
from app.services.fundamental_capital import build_capital_research
from test_fundamental_intelligence import sample_snapshot


def capital_snapshot():
    snapshot = sample_snapshot()
    for row in snapshot.annual_financials[:2]:
        row.capital_expenditure = -20
        row.dividends_paid = -10
        row.share_repurchases = -5
    snapshot.annual_financials[1].total_debt = 110
    snapshot.analysts.recommendation_key = "buy"
    snapshot.analysts.target_mean = 150
    snapshot.analysts.buy = 5
    snapshot.earnings_estimates = [EarningsEstimate(period="FY2027", eps_average=8.5, eps_analyst_count=8)]
    snapshot.earnings_history = [EarningsQuarter(period="Q2 2026", actual=2.1, estimate=2, surprise_percent=5)]
    return snapshot


def test_capital_bridge_and_analyst_snapshot_keep_formulas_and_provenance() -> None:
    result = build_capital_research(capital_snapshot())
    assert result.status == "available"
    current = result.periods[0]
    assert current.currency == "CAD"
    assert current.source_url == "https://issuer.example/reports/2025.pdf"
    assert current.operating_cash_flow.value == 70
    assert current.capital_expenditure.value == 20
    assert current.cash_after_allocations.value == 35
    assert current.capex_share_of_known_uses.value == 57.142857
    assert current.earnings_cash_conversion.value == 70
    assert current.debt_change.value == -10
    assert result.analysts.target_mean == 150
    assert result.analysts.target_currency is None
    assert result.analysts.actual_vs_consensus[0].difference_eps == .1
    assert result.analysts.revision_history_status == "unavailable"
    assert result.analysts.estimates[0].period == "FY2027"


def test_missing_fields_and_currency_mismatch_are_explicit() -> None:
    snapshot = capital_snapshot()
    snapshot.annual_financials[0].dividends_paid = None
    snapshot.annual_financials[1].currency = "USD"
    result = build_capital_research(snapshot)
    assert result.periods[0].cash_after_allocations.status == "unavailable"
    assert "dividends" in result.periods[0].cash_after_allocations.missing_inputs
    assert result.periods[0].debt_change.status == "unavailable"
    assert result.periods[0].debt_change.value is None
    snapshot.annual_financials = []
    assert build_capital_research(snapshot).status == "partial"


def test_current_forecasts_never_become_revision_history() -> None:
    snapshot = capital_snapshot()
    snapshot.earnings_estimates.append(EarningsEstimate(period="FY2028", eps_average=9.1))
    result = build_capital_research(snapshot)
    assert len(result.analysts.estimates) == 2
    assert result.analysts.revision_history_status == "unavailable"
    assert result.analysts.actual_vs_consensus[0].period_date_verified is False


def test_http_capital_endpoint(monkeypatch) -> None:
    async def get_snapshot(_ticker):
        return capital_snapshot()
    monkeypatch.setattr("app.api.routes.fundamentals.fundamentals_service.get_snapshot", get_snapshot)
    response = TestClient(app).get("/api/v1/stocks/TEST/fundamental-intelligence/capital")
    assert response.status_code == 200
    assert response.json()["periods"][0]["cash_after_allocations"]["value"] == 35
    assert response.json()["analysts"]["revision_history_status"] == "unavailable"
