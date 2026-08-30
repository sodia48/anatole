import asyncio
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.stock_news import StockNewsService, _description_from_html


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
                "uuid": "right-company-syndicated",
                "title": "Canadian National Railway opens logistics hub",
                "publisher": "Second Wire",
                "link": "https://example.com/cn-rail-syndicated",
                "providerPublishTime": timestamp + 90,
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


def test_article_description_is_cleaned_without_inventing_a_summary() -> None:
    page = """
        <html><head>
          <meta name="description" content="A short fallback description.">
          <meta property="og:description" content="Royal Bank reported higher quarterly earnings. The post Duplicate headline appeared first on Publisher.">
        </head></html>
    """

    assert _description_from_html(page) == (
        "Royal Bank reported higher quarterly earnings."
    )


def test_french_empty_feed_falls_back_to_canadian_english(monkeypatch) -> None:
    service = StockNewsService()
    calls: list[tuple[str, str]] = []
    timestamp = int(datetime(2026, 8, 29, 14, tzinfo=UTC).timestamp())

    async def search(*, query: str, language: str, region: str = "CA"):
        assert query == "Royal Bank of Canada"
        calls.append((language, region))
        if language == "fr":
            return {"quotes": [], "news": []}
        return {
            "quotes": [{
                "symbol": "RY.TO",
                "quoteType": "EQUITY",
                "longname": "Royal Bank of Canada",
            }],
            "news": [
                {
                    "uuid": f"royal-bank-{index}",
                    "title": f"Royal Bank of Canada update {index}",
                    "publisher": "Wire",
                    "link": f"https://example.com/royal-bank-{index}",
                    "providerPublishTime": timestamp + index,
                    "relatedTickers": ["RY.TO"],
                }
                for index in range(10)
            ],
        }

    async def enrich(items, *, language: str):
        assert language == "fr"
        return [
            item.model_copy(update={"summary": f"Résumé {item.id}"})
            for item in items
        ]

    monkeypatch.setattr(service, "_search", search)
    monkeypatch.setattr(service, "_enrich_summaries", enrich)

    snapshot = asyncio.run(
        service._load(
            symbol="RY.TO",
            company="Royal Bank of Canada",
            language="fr",
        )
    )

    assert calls == [("fr", "CA"), ("en", "CA")]
    assert len(snapshot.items) == 10
    assert all(item.summary.startswith("Résumé ") for item in snapshot.items)


def test_short_canadian_feed_is_completed_with_us_news(monkeypatch) -> None:
    service = StockNewsService()
    calls: list[tuple[str, str]] = []
    timestamp = int(datetime(2026, 8, 29, 14, tzinfo=UTC).timestamp())

    async def search(*, query: str, language: str, region: str = "CA"):
        assert query == "Agnico Eagle Mines Limited"
        calls.append((language, region))
        count = 4 if region == "CA" else 8
        prefix = region.casefold()
        return {
            "quotes": [{
                "symbol": "AEM",
                "quoteType": "EQUITY",
                "longname": "Agnico Eagle Mines Limited",
            }],
            "news": [
                {
                    "uuid": f"{prefix}-agnico-{index}",
                    "title": (
                        f"Agnico Eagle {region} operational update {index}"
                    ),
                    "publisher": "Wire",
                    "link": f"https://example.com/{prefix}-agnico-{index}",
                    "providerPublishTime": timestamp + index,
                    "relatedTickers": ["AEM"],
                }
                for index in range(count)
            ],
        }

    async def enrich(items, *, language: str):
        return [
            item.model_copy(update={"summary": f"Summary for {item.id}"})
            for item in items
        ]

    monkeypatch.setattr(service, "_search", search)
    monkeypatch.setattr(service, "_enrich_summaries", enrich)

    snapshot = asyncio.run(
        service._load(
            symbol="AEM.TO",
            company="Agnico Eagle Mines Limited",
            language="en",
        )
    )

    assert calls == [("en", "CA"), ("en", "US")]
    assert len(snapshot.items) == 10
    assert all(item.summary for item in snapshot.items)


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
