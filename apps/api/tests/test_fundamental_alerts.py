from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.workspace import AlertEvaluateRequest, AlertRule
from app.services.alerts import AlertService
from app.services.fundamental_alerts import evaluate_fundamental_event
from test_fundamental_intelligence import sample_snapshot


def recent_snapshot():
    snapshot = sample_snapshot()
    now = datetime.now(UTC)
    for index, row in enumerate(snapshot.annual_financials):
        row.period_end = datetime(now.year - index - 1, 12, 31, tzinfo=UTC)
        assert row.source is not None
        row.source = row.source.model_copy(deep=True)
        row.source.filed_at = now - timedelta(days=2 + index * 365)
    snapshot.annual_financials[0].operating_income = 100
    snapshot.annual_financials[0].total_debt = 180
    return snapshot


@pytest.mark.parametrize(
    ("event_type", "threshold", "triggered"),
    [
        ("fundamental_margin_drop", 3, True),
        ("fundamental_debt_rise", 0.25, True),
        ("fundamental_fcf_drop", 20, True),
        ("fundamental_results", None, True),
        ("fundamental_margin_drop", 20, False),
    ],
)
def test_official_fundamental_events_have_stable_provenance(event_type, threshold, triggered):
    rule = AlertRule(id="r1", symbol="TEST", kind="event", event_type=event_type, threshold=threshold)
    snapshot = recent_snapshot()
    first = evaluate_fundamental_event(rule, snapshot, datetime.now(UTC))
    second = evaluate_fundamental_event(rule, snapshot, datetime.now(UTC) + timedelta(minutes=5))
    assert first.triggered is triggered
    if triggered:
        assert first.source == "https://issuer.example/reports/2025.pdf"
    assert first.event_fingerprint == second.event_fingerprint
    if triggered:
        assert snapshot.annual_financials[0].period_end.date().isoformat() in first.message
        assert first.event_fingerprint


@pytest.mark.parametrize("change", ["stale", "secondary", "currency", "old_filing", "missing_prior", "bank"])
def test_unverifiable_changes_never_trigger(change):
    snapshot = recent_snapshot()
    if change == "stale":
        snapshot.stale = True
    elif change == "secondary":
        snapshot.annual_financials[0].source.confidence = "secondary"
    elif change == "currency":
        snapshot.annual_financials[1].currency = "USD"
    elif change == "old_filing":
        snapshot.annual_financials[0].source.filed_at = datetime.now(UTC) - timedelta(days=100)
    elif change == "missing_prior":
        snapshot.annual_financials = snapshot.annual_financials[:1]
    else:
        snapshot.sector = "Financial Services, Banks"
    event = "fundamental_debt_rise" if change == "bank" else "fundamental_margin_drop"
    result = evaluate_fundamental_event(
        AlertRule(id="r1", symbol="TEST", kind="event", event_type=event),
        snapshot, datetime.now(UTC),
    )
    assert result.triggered is False
    assert result.event_fingerprint is None


def test_fundamental_threshold_bounds():
    with pytest.raises(ValueError):
        AlertRule(id="r1", symbol="TEST", kind="event", event_type="fundamental_fcf_drop", threshold=0)
    with pytest.raises(ValueError):
        AlertRule(id="r1", symbol="TEST", kind="event", event_type="fundamental_fcf_drop", threshold=101)


def test_recent_official_quarterly_results_need_no_annual_history():
    snapshot = recent_snapshot()
    quarter = snapshot.annual_financials[0].model_copy(deep=True)
    quarter.period_type = "quarterly"
    quarter.period_end = datetime(datetime.now(UTC).year, 6, 30, tzinfo=UTC)
    snapshot.annual_financials = []
    snapshot.quarterly_financials = [quarter]
    result = evaluate_fundamental_event(
        AlertRule(id="results", symbol="TEST", kind="event", event_type="fundamental_results"),
        snapshot, datetime.now(UTC),
    )
    assert result.triggered
    assert "trimestriel" in result.message
    assert ":quarterly:" in result.event_fingerprint


@pytest.mark.asyncio
async def test_event_only_evaluation_does_not_require_market_quotes(monkeypatch):
    async def get_snapshot(_symbol):
        return recent_snapshot()

    async def should_not_fetch(_symbols):
        raise AssertionError("Market quotes are unrelated to fundamental events")

    monkeypatch.setattr("app.services.alerts.fundamentals_service.get_snapshot", get_snapshot)
    monkeypatch.setattr("app.services.alerts.market_data_service.get_quotes", should_not_fetch)
    request = AlertEvaluateRequest(rules=[AlertRule(id="r1", symbol="TEST", kind="event", event_type="fundamental_margin_drop")])
    result = await AlertService().evaluate(request)
    assert result.triggered_count == 1


def test_http_fundamental_alert_evaluation(monkeypatch):
    async def get_snapshot(_symbol):
        return recent_snapshot()

    monkeypatch.setattr("app.services.alerts.fundamentals_service.get_snapshot", get_snapshot)
    response = TestClient(app).post("/api/v1/workspace/alerts/evaluate", json={"rules": [
        {"id": "r1", "symbol": "TEST", "kind": "event", "event_type": "fundamental_margin_drop", "threshold": 3}
    ]})
    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["triggered"] is True
