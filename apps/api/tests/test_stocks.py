from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_focus_snapshot_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    try:
        response = TestClient(app).get("/api/v1/stocks/RY/focus?range=1y&interval=1d")
        assert response.status_code == 200
        payload = response.json()
        assert payload["quote"]["ticker"] == "RY.TO"
        assert len(payload["history"]) >= 200
        assert payload["technicals"]["sma_20"] is not None
    finally:
        settings.market_data_provider = original


def test_quote_websocket() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    try:
        with TestClient(app).websocket_connect("/ws/v1/quotes/RY") as websocket:
            payload = websocket.receive_json()
            assert payload["ticker"] == "RY.TO"
            assert payload["price"] > 0
    finally:
        settings.market_data_provider = original
