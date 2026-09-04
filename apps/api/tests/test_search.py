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


def test_search_etf_metadata_without_quote_fanout() -> None:
    response = client.get("/api/v1/search/symbols", params={"q": "ZEB"})
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["symbol"] == "ZEB"
    assert item["instrument_type"] == "etf"
    assert item["provider"] == "BMO"


def test_search_sector_and_etf_exposure() -> None:
    response = client.get("/api/v1/search/symbols", params={"q": "banques", "limit": 20})
    assert response.status_code == 200
    assert any(item["instrument_type"] == "etf" for item in response.json()["items"])
