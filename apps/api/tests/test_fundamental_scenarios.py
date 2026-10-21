from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from app.main import app
from app.schemas.fundamental_scenarios import DCFSettings, ScenarioAssumptions, ScenarioRequest
from app.services.fundamental_scenarios import simulate_financial_scenarios
from test_fundamental_intelligence import sample_snapshot


def request(*, dcf: bool = False) -> ScenarioRequest:
    return ScenarioRequest(scenarios=[
        ScenarioAssumptions(key="prudent", revenue_change_percent=-15, incremental_cost_inflation_percent=2),
        ScenarioAssumptions(key="central", revenue_change_percent=0),
        ScenarioAssumptions(key="optimistic", revenue_change_percent=15, operating_margin_change_points=1),
    ], dcf=DCFSettings(discount_rate_percent=10, terminal_growth_percent=2,
                       forecast_fcf_growth_percent=3) if dcf else None)


def financial_snapshot():
    snapshot = sample_snapshot()
    row = snapshot.annual_financials[0]
    row.capital_expenditure = -20
    row.income_before_tax = 120
    row.income_tax_expense = 20
    row.interest_expense = 10
    snapshot.metrics.shares_outstanding = 10
    return snapshot


def test_three_scenarios_keep_observations_assumptions_and_conditional_dcf() -> None:
    snapshot = financial_snapshot()
    result = simulate_financial_scenarios(snapshot, request(dcf=True))
    assert result.status == "available"
    assert result.baseline_source_url == "https://issuer.example/reports/2025.pdf"
    prudent, central, optimistic = result.outcomes
    assert prudent.revenue.value == 1020
    assert central.revenue.value == 1200
    assert central.net_income.value == 100
    assert central.operating_cash_flow.value == 70
    assert central.free_cash_flow.value == 50
    assert optimistic.revenue.value == 1380
    assert central.dcf.status == "calculated"
    assert len(central.dcf.projected_fcf) == 5
    assert len(central.dcf.sensitivity) == 9
    assert central.dcf.per_share is not None
    assert "pas des prévisions" in result.limitations_fr[0]


def test_missing_inputs_financial_sector_and_stale_snapshot_never_invent_a_dcf() -> None:
    snapshot = financial_snapshot()
    snapshot.annual_financials[0].income_tax_expense = None
    result = simulate_financial_scenarios(snapshot, request(dcf=True))
    assert result.status == "partial"
    assert all(item.net_income.value is None and item.dcf.status == "unavailable" for item in result.outcomes)
    snapshot = financial_snapshot()
    snapshot.sector = "Financial Services"
    snapshot.industry = "Banks"
    result = simulate_financial_scenarios(snapshot, request(dcf=True))
    assert all(item.operating_income.value is None and item.dcf.status == "unavailable" for item in result.outcomes)
    assert all("not suitable" in item.dcf.reason for item in result.outcomes)
    result = simulate_financial_scenarios(snapshot, request())
    assert all("not suitable" in item.dcf.reason for item in result.outcomes)
    snapshot = financial_snapshot()
    snapshot.stale = True
    result = simulate_financial_scenarios(snapshot, request(dcf=True))
    assert result.baseline_stale is True
    assert all(item.dcf.status == "unavailable" for item in result.outcomes)
    snapshot = financial_snapshot()
    snapshot.annual_financials[1].free_cash_flow = None
    snapshot.annual_financials[2].free_cash_flow = None
    result = simulate_financial_scenarios(snapshot, request(dcf=True))
    assert all(item.dcf.status == "unavailable" and "Two consecutive" in item.dcf.reason
               for item in result.outcomes)
    snapshot = financial_snapshot()
    snapshot.annual_financials[0].net_debt = 1_000_000
    result = simulate_financial_scenarios(snapshot, request(dcf=True))
    assert all(item.dcf.status == "unavailable" and "positive finite equity" in item.dcf.reason
               for item in result.outcomes)


def test_commodity_exposure_and_rate_bounds_are_explicit() -> None:
    snapshot = financial_snapshot()
    scenario = ScenarioAssumptions(key="central", revenue_change_percent=0,
                                   commodity_price_change_percent=-20,
                                   commodity_revenue_exposure_percent=50)
    scenarios = request().model_copy(deep=True)
    scenarios.scenarios[1] = scenario
    try:
        simulate_financial_scenarios(snapshot, scenarios)
        raise AssertionError("Non-mining commodity sensitivity must fail")
    except ValueError as error:
        assert "mining" in str(error)
    snapshot.sector = "Materials"
    snapshot.industry = "Gold Mining"
    result = simulate_financial_scenarios(snapshot, scenarios)
    assert result.outcomes[1].revenue.value == 1080
    with pytest.raises(ValidationError):
        DCFSettings(discount_rate_percent=3, terminal_growth_percent=2, forecast_fcf_growth_percent=0)
    with pytest.raises(ValidationError):
        ScenarioAssumptions(key="central", revenue_change_percent=0, commodity_price_change_percent=5)


def test_http_scenarios_endpoint_and_invalid_assumptions(monkeypatch) -> None:
    async def get_snapshot(_ticker):
        return financial_snapshot()

    monkeypatch.setattr("app.api.routes.fundamentals.fundamentals_service.get_snapshot", get_snapshot)
    client = TestClient(app)
    body = request(dcf=True).model_dump()
    response = client.post("/api/v1/stocks/TEST/fundamental-intelligence/scenarios", json=body)
    assert response.status_code == 200
    assert response.json()["outcomes"][1]["dcf"]["status"] == "calculated"
    body["scenarios"][0]["revenue_change_percent"] = -100
    assert client.post("/api/v1/stocks/TEST/fundamental-intelligence/scenarios", json=body).status_code == 422
