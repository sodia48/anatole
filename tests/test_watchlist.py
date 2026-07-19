from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.watchlist import watchlist_service


def test_watchlist_snapshot_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    watchlist_service._cache.clear()
    try:
        response = TestClient(app).post(
            "/api/v1/market/watchlist",
            json={"tickers": ["RY", "TD", "SHOP", "RY"]},
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["items"]) == 3
        assert payload["items"][0]["ticker"] == "RY.TO"
        assert payload["refresh_after_seconds"] == 20
        summary = payload["summary"]
        assert summary["advancers"] + summary["decliners"] + summary["unchanged"] == 3
    finally:
        settings.market_data_provider = original
        watchlist_service._cache.clear()


def test_watchlist_rejects_invalid_ticker() -> None:
    response = TestClient(app).post(
        "/api/v1/market/watchlist",
        json={"tickers": ["RY", "BAD TICKER"]},
    )
    assert response.status_code == 422
