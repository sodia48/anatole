from datetime import UTC, datetime, timedelta
from time import monotonic

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.discovery import CalendarSnapshot, EconomicEvent, FeedStatus, NewsItem, NewsSnapshot
from app.services.calendar import calendar_service
from app.services.cockpit import cockpit_service
from app.services.etf import etf_service
from app.services.news import news_service
from app.services.psychology import psychology_service
from app.services.screener import screener_service

client = TestClient(app)


def test_screener_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    screener_service._cached = None
    screener_service._cached_at = 0
    try:
        response = client.get("/api/v1/discovery/screener?universe=tsx60")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["items"]) == 60
        assert payload["refresh_after_seconds"] == 45
        assert 0 <= payload["items"][0]["score"] <= 100
        assert payload["items"][0]["rsi_14"] is not None
    finally:
        settings.market_data_provider = original
        screener_service._cached = None
        screener_service._cached_at = 0


def test_etf_directory_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    etf_service._cached = None
    etf_service._cached_at = 0
    try:
        response = client.get("/api/v1/discovery/etfs")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["items"]) >= 25
        assert any(item["symbol"] == "XIC" for item in payload["items"])
        assert "Obligations" in payload["categories"]
    finally:
        settings.market_data_provider = original
        etf_service._cached = None
        etf_service._cached_at = 0


def test_psychology_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    psychology_service._cached = None
    psychology_service._cached_at = 0
    cockpit_service._cached = None
    cockpit_service._cached_at = 0
    try:
        response = client.get("/api/v1/discovery/psychology")
        assert response.status_code == 200
        payload = response.json()
        assert 0 <= payload["score"] <= 100
        assert len(payload["components"]) == 5
        assert payload["label"] in {"Peur extrême", "Peur", "Neutre", "Confiance", "Confiance extrême"}
    finally:
        settings.market_data_provider = original
        psychology_service._cached = None
        psychology_service._cached_at = 0
        cockpit_service._cached = None
        cockpit_service._cached_at = 0


def test_news_endpoint_uses_cached_snapshot() -> None:
    published = datetime.now(UTC)
    news_service._cached = NewsSnapshot(
        items=[NewsItem(id="test", title="Official release", summary="", url="https://example.com", source="Test", category="Macro", published_at=published, sentiment="Neutre", sentiment_score=0)],
        source_statuses=[FeedStatus(source="Test", status="ok")],
        generated_at=published,
    )
    news_service._cached_at = monotonic()
    try:
        response = client.get("/api/v1/discovery/news")
        assert response.status_code == 200
        assert response.json()["items"][0]["id"] == "test"
    finally:
        news_service._cached = None
        news_service._cached_at = 0


def test_calendar_endpoint_uses_cached_snapshot() -> None:
    starts_at = datetime.now(UTC) + timedelta(days=2)
    calendar_service._cached = CalendarSnapshot(
        events=[EconomicEvent(id="event", title="Policy rate", category="Banque centrale", importance="Très élevée", starts_at=starts_at, source="Test")],
        source_statuses=[FeedStatus(source="Test", status="ok")],
        generated_at=datetime.now(UTC),
    )
    calendar_service._cached_at = monotonic()
    try:
        response = client.get("/api/v1/discovery/calendar")
        assert response.status_code == 200
        assert response.json()["events"][0]["id"] == "event"
    finally:
        calendar_service._cached = None
        calendar_service._cached_at = 0
