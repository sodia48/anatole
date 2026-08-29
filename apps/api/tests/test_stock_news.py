import asyncio
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.stock_news import StockNewsService


def test_company_aliases_do_not_confuse_same_base_ticker() -> None:
    service = StockNewsService()
    payload = {
        "quotes": [
            {
                "symbol": "CNR",
                "longname": "Core Natural Resources, Inc.",
            },
            {
                "symbol": "CNR.TO",
                "longname": "Canadian National Railway Company",
            },
            {
                "symbol": "CNI",
                "longname": "Canadian National Railway Company",
            },
        ]
    }

    aliases = service._aliases(
        payload,
        symbol="CNR.TO",
        company="Canadian National Railway Company",
    )

    assert aliases == {"CNR.TO", "CNI"}
    assert "CNR" not in aliases


def test_news_parser_keeps_only_company_related_articles() -> None:
    service = StockNewsService()
    timestamp = int(datetime(2026, 8, 29, 14, tzinfo=UTC).timestamp())
    payload = {
        "news": [
            {
                "uuid": "wrong-company",
                "title": "Core Natural Resources reports quarterly results",
                "publisher": "Wire",
                "link": "https://example.com/core-natural",
                "providerPublishTime": timestamp,
                "relatedTickers": ["CNR"],
            },
            {
                "uuid": "right-company",
                "title": "Canadian National Railway opens logistics hub",
                "publisher": "Wire",
                "link": "https://example.com/cn-rail",
                "providerPublishTime": timestamp + 60,
                "relatedTickers": ["CNI"],
            },
            {
                "uuid": "unsafe-url",
                "title": "Canadian National Railway update",
                "publisher": "Unknown",
                "link": "javascript:alert(1)",
                "providerPublishTime": timestamp + 120,
                "relatedTickers": ["CNI"],
            },
            {
                "uuid": "generic-canada",
                "title": "News of the day: Canada GDP grows",
                "publisher": "Daily",
                "link": "https://example.com/canada-gdp",
                "providerPublishTime": timestamp + 180,
                "relatedTickers": [],
            },
        ]
    }

    items = service._parse_items(
        payload,
        aliases={"CNR.TO", "CNI"},
        company="Canadian National Railway Company",
    )

    assert [item.id for item in items] == ["right-company"]
    assert items[0].related_tickers == ["CNI"]


def test_french_empty_feed_falls_back_to_canadian_english(monkeypatch) -> None:
    service = StockNewsService()
    calls: list[str] = []
    timestamp = int(datetime(2026, 8, 29, 14, tzinfo=UTC).timestamp())

    async def search(*, query: str, language: str):
        assert query == "Royal Bank of Canada"
        calls.append(language)
        if language == "fr":
            return {"quotes": [], "news": []}
        return {
            "quotes": [{
                "symbol": "RY.TO",
                "quoteType": "EQUITY",
                "longname": "Royal Bank of Canada",
            }],
            "news": [{
                "uuid": "royal-bank",
                "title": "Royal Bank of Canada announces an investment",
                "publisher": "Wire",
                "link": "https://example.com/royal-bank",
                "providerPublishTime": timestamp,
                "relatedTickers": ["RY.TO"],
            }],
        }

    monkeypatch.setattr(service, "_search", search)

    snapshot = asyncio.run(
        service._load(
            symbol="RY.TO",
            company="Royal Bank of Canada",
            language="fr",
        )
    )

    assert calls == ["fr", "en"]
    assert [item.id for item in snapshot.items] == ["royal-bank"]


def test_stock_news_route_is_honest_in_demo_mode(monkeypatch) -> None:
    monkeypatch.setattr(settings, "market_data_provider", "demo")

    response = TestClient(app).get(
        "/api/v1/stocks/RY/news",
        params={"company": "Royal Bank of Canada", "lang": "fr"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ticker"] == "RY"
    assert payload["symbol"] == "RY.TO"
    assert payload["items"] == []
    assert payload["status"] == "unavailable"
