from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_search_exact_symbol() -> None:
    response = client.get("/api/v1/search/symbols", params={"q": "RY"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] >= 1
    assert payload["items"][0]["symbol"] == "RY"


def test_search_company_name() -> None:
    response = client.get("/api/v1/search/symbols", params={"q": "Shopify"})
    assert response.status_code == 200
    assert any(item["symbol"] == "SHOP" for item in response.json()["items"])


def test_search_empty_query() -> None:
    response = client.get("/api/v1/search/symbols")
    assert response.status_code == 200
    assert response.json()["items"] == []
