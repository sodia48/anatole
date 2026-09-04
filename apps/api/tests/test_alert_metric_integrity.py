from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.schemas.workspace import AlertRule
from app.services.alerts import (
    AlertService,
    _momentum,
    _relative_volume,
    analysis_service,
    earnings_calendar_service,
    insider_service,
    stock_news_service,
)


def test_alert_metrics_never_fabricate_zero_for_missing_history():
    candles = [SimpleNamespace(close=100.0) for _ in range(20)]
    assert _momentum(candles, sessions=20) is None
    candles.append(SimpleNamespace(close=101.0))
    assert _momentum(candles, sessions=20) == pytest.approx(1.0)


def test_alert_relative_volume_keeps_unavailable_distinct_from_zero():
    assert _relative_volume(100.0, 0.0) is None
    assert _relative_volume(0.0, 100.0) == 0.0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "expected_triggered"),
    [
        ("terminal_anomaly", True),
        ("terminal_regime", False),
        ("earnings_upcoming", True),
        ("insider_unusual", True),
        ("company_news", True),
    ],
)
async def test_event_alerts_use_sourced_engines(
    monkeypatch: pytest.MonkeyPatch,
    event_type: str,
    expected_triggered: bool,
):
    now = datetime(2026, 9, 3, 14, tzinfo=UTC)

    async def terminal():
        return SimpleNamespace(
            regime="Constructif",
            anomalies=[SimpleNamespace(symbol="RY", source="Terminal Pro", detail="Volume observé.")],
        )

    async def earnings(_universe):
        return SimpleNamespace(events=[SimpleNamespace(ticker="RY", starts_at=now + timedelta(days=1), source="Calendrier public")])

    async def insiders(**_kwargs):
        return SimpleNamespace(trades=[SimpleNamespace(unusual=True, source_name="SEDI")], sources=[])

    async def news(_symbol, *, language):
        assert language == "fr"
        return SimpleNamespace(items=[SimpleNamespace(published_at=now - timedelta(hours=1), publisher="Issuer IR", title="Publication officielle")])

    monkeypatch.setattr(analysis_service, "terminal", terminal)
    monkeypatch.setattr(earnings_calendar_service, "get_snapshot", earnings)
    monkeypatch.setattr(insider_service, "snapshot", insiders)
    monkeypatch.setattr(stock_news_service, "get_snapshot", news)
    result = await AlertService()._evaluate_event(
        AlertRule(id="event", symbol="RY", kind="event", event_type=event_type),
        now,
    )
    assert result.triggered is expected_triggered
    assert result.status == ("triggered" if expected_triggered else "monitoring")
    assert result.source
