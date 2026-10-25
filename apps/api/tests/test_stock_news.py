import asyncio
from collections import Counter
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.stocks import StockNewsItem
from app.services.stock_news import (
    StockNewsService,
    _classification,
    _safe_url,
    _description_from_html,
    _thumbnail_url,
)


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
                "thumbnail": {"resolutions": [{"url": "https://images.example.com/cn-rail.jpg", "width": 240, "height": 160}]},
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
    assert items[0].image_url == "https://images.example.com/cn-rail.jpg"


def test_yahoo_thumbnail_uses_a_suitable_https_resolution() -> None:
    row = {
        "thumbnail": {
            "originalUrl": "https://images.example.com/original.jpg",
            "resolutions": [
                {"url": "https://images.example.com/120.jpg", "width": 120, "height": 80},
                {"url": "https://images.example.com/320.jpg", "width": 320, "height": 210},
                {"url": "https://images.example.com/640.jpg", "width": 640, "height": 420},
            ],
        }
    }

    assert _thumbnail_url(row) == "https://images.example.com/320.jpg"


def test_yahoo_thumbnail_falls_back_to_original_url() -> None:
    assert _thumbnail_url({"thumbnail": {"originalUrl": "https://images.example.com/original.jpg"}}) == (
        "https://images.example.com/original.jpg"
    )


def test_yahoo_thumbnail_rejects_invalid_or_insecure_urls() -> None:
    assert _thumbnail_url({"thumbnail": {"resolutions": [{"url": "javascript:alert(1)", "width": 240}]}}) is None
    assert _thumbnail_url({"thumbnail": {"originalUrl": "http://images.example.com/original.jpg"}}) is None


def test_yahoo_thumbnail_is_optional() -> None:
    assert _thumbnail_url({}) is None
    item = StockNewsItem(
        id="no-image",
        title="Company update",
        summary="",
        url="https://example.com/update",
        publisher="Wire",
        published_at=datetime(2026, 8, 29, 14, tzinfo=UTC),
    )
    assert item.image_url is None


def test_untrusted_publisher_links_reject_private_hosts_and_credentials() -> None:
    assert _safe_url("https://example.com/article") == "https://example.com/article"
    assert _safe_url("http://example.com/article") is None
    assert _safe_url("https://127.0.0.1/private") is None
    assert _safe_url("https://localhost/private") is None
    assert _safe_url("https://user@example.com/article") is None


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

    assert calls == [("fr", "CA"), ("en", "CA"), ("en", "US")]
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


def _news_row(title: str, publisher: str, index: int, *, ticker: str = "CNQ.TO") -> dict:
    return {
        "uuid": f"{publisher}-{index}", "title": title, "publisher": publisher,
        "link": f"https://example.com/{publisher.lower().replace(' ', '-')}/{index}",
        "providerPublishTime": int(datetime(2026, 10, 20, 14, tzinfo=UTC).timestamp()) + index,
        "relatedTickers": [ticker],
    }


def test_yahoo_ticker_hint_does_not_turn_a_generic_list_into_direct_news() -> None:
    row = _news_row("5 TSX dividend stocks for your TFSA, including CNQ", "The Motley Fool", 1)
    relevance, reason = _classification(row, aliases={"CNQ.TO"}, company="Canadian Natural Resources", symbol="CNQ.TO")
    assert relevance is None
    assert reason == "generalist"


def test_ten_generic_articles_from_one_publisher_are_excluded() -> None:
    payload = {"news": [_news_row(f"{index} top TSX dividend stocks for your TFSA", "The Motley Fool", index) for index in range(10)]}
    rejected = Counter()
    items = StockNewsService._parse_items(payload, aliases={"CNQ.TO"}, company="Canadian Natural Resources", symbol="CNQ.TO", rejected=rejected)
    assert items == []
    assert rejected["generalist"] == 10


def test_direct_release_and_sector_story_have_distinct_levels() -> None:
    payload = {"news": [
        _news_row("Canadian Natural Announces 2026 Third Quarter Results", "Newswire", 1),
        _news_row("Oil sands production expands in Alberta", "Energy Wire", 2),
        _news_row("Canadian Natural appears among ten dividend stocks", "Listicle", 3),
    ]}
    items = StockNewsService._parse_items(payload, aliases={"CNQ.TO"}, company="Canadian Natural Resources", symbol="CNQ.TO")
    assert [(item.publisher, item.relevance) for item in items] == [("Newswire", "direct"), ("Energy Wire", "sector")]


def test_selection_balances_publishers_without_demoting_direct_news() -> None:
    payload = {"news": [
        *[_news_row(f"Canadian Natural announces production update {index}", "Dominant Wire", index) for index in range(8)],
        _news_row("Canadian Natural reports quarterly earnings", "Second Wire", 20),
        _news_row("Canadian Natural raises annual guidance", "Third Wire", 21),
    ]}
    candidates = StockNewsService._parse_items(payload, aliases={"CNQ.TO"}, company="Canadian Natural Resources", symbol="CNQ.TO")
    selected = StockNewsService._rank_and_select(candidates, Counter())
    assert len(selected) == 10
    assert len({item.publisher for item in selected[:4]}) == 3
    assert all(item.relevance == "direct" for item in selected)


def test_same_announcement_from_two_publishers_is_grouped() -> None:
    payload = {"news": [
        _news_row("Canadian Natural reports quarterly earnings", "First Wire", 1),
        _news_row("Canadian Natural reports quarterly earnings today", "Second Wire", 2),
    ]}
    candidates = StockNewsService._parse_items(payload, aliases={"CNQ.TO"}, company="Canadian Natural Resources", symbol="CNQ.TO")
    rejected = Counter()
    selected = StockNewsService._rank_and_select(candidates, rejected)
    assert len(selected) == 1
    assert rejected["same_announcement"] == 1


def test_company_release_parser_uses_verified_public_pdf_dates(monkeypatch) -> None:
    class Response:
        headers = {"content-type": "text/html"}
        text = '<cnrl-tab title="2026"><cnrl-news-release-card link="/wp-content/uploads/results.pdf" day="6" month="8"><h1 slot="heading">Canadian Natural Announces Quarterly Results</h1></cnrl-news-release-card></cnrl-tab>'
        content = text.encode()
        def raise_for_status(self):
            pass

    async def request(*args, **kwargs):
        return Response()

    monkeypatch.setattr("app.services.stock_news.shared_http_client.request", request)
    releases = asyncio.run(StockNewsService._company_releases("CNQ.TO"))
    assert [(item.origin, item.published_at.date().isoformat()) for item in releases] == [("company_release", "2026-08-06")]
    assert releases[0].url == "https://www.cnrl.com/wp-content/uploads/results.pdf"


def test_secondary_source_failure_keeps_yahoo_direct_news(monkeypatch) -> None:
    service = StockNewsService()
    async def search(*, query: str, language: str, region: str = "CA"):
        return {"news": [_news_row("Canadian Natural reports quarterly earnings", "Independent Wire", 1)]}
    async def unavailable(symbol: str):
        raise RuntimeError("source offline")
    monkeypatch.setattr(service, "_search", search)
    monkeypatch.setattr(service, "_company_releases", unavailable)
    snapshot = asyncio.run(service._load(symbol="CNQ.TO", company="Canadian Natural Resources", language="en"))
    assert snapshot.status == "ok"
    assert len(snapshot.items) == 1
    assert snapshot.coverage_note == "Only one relevant publisher is available."


def test_no_direct_or_sector_news_is_honest(monkeypatch) -> None:
    service = StockNewsService()
    async def search(*, query: str, language: str, region: str = "CA"):
        return {"news": [_news_row("TFSA stocks to buy for retirement", "Listicle", 1)]}
    async def no_releases(symbol: str):
        return []
    monkeypatch.setattr(service, "_search", search)
    monkeypatch.setattr(service, "_company_releases", no_releases)
    snapshot = asyncio.run(service._load(symbol="CNQ.TO", company="Canadian Natural Resources", language="en"))
    assert snapshot.status == "partial"
    assert snapshot.items == []
