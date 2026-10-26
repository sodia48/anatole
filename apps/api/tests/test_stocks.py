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


def test_focus_max_demo_history_is_longer_than_one_year() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    try:
        client = TestClient(app)
        yearly = client.get("/api/v1/stocks/RY/focus?range=1y&interval=1d")
        five_year = client.get("/api/v1/stocks/RY/focus?range=5y&interval=1wk")
        maximum = client.get("/api/v1/stocks/RY/focus?range=max&interval=1wk")
        assert yearly.status_code == five_year.status_code == maximum.status_code == 200
        assert 250 <= len(five_year.json()["history"]) <= 261
        five_year_history = five_year.json()["history"]
        assert 4.8 * 365 * 86400 <= five_year_history[-1]["time"] - five_year_history[0]["time"] <= 5.2 * 365 * 86400
        assert len(maximum.json()["history"]) > len(yearly.json()["history"])
        for response in (yearly, five_year, maximum):
            payload = response.json()
            assert payload["quote"]["price"] == payload["history"][-1]["close"]
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
