from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.cockpit import cockpit_service


def test_tsx60_cockpit_with_demo_provider() -> None:
    original = settings.market_data_provider
    settings.market_data_provider = "demo"
    cockpit_service._cached = None
    cockpit_service._cached_at = 0
    try:
        response = TestClient(app).get("/api/v1/market/cockpit?universe=tsx60")
        assert response.status_code == 200
        payload = response.json()
        assert payload["universe"] == "S&P/TSX 60"
        assert len(payload["constituents"]) == 60
        assert payload["refresh_after_seconds"] == 15
        assert payload["breadth"]["advancers"] + payload["breadth"]["decliners"] + payload["breadth"]["unchanged"] == 60
        assert len(payload["top_gainers"]) == 5
        assert len(payload["sectors"]) >= 9
    finally:
        settings.market_data_provider = original
        cockpit_service._cached = None
        cockpit_service._cached_at = 0
