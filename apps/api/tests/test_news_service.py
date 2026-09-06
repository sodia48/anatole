import asyncio
from datetime import UTC, datetime

import httpx
import pytest

from app.schemas.discovery import FeedStatus, NewsSnapshot
from app.services.news import (
    BANK_FEEDS,
    STATCAN_URLS,
    FeedFormatError,
    NewsService,
    PROVINCIAL_RSS_FEEDS,
    ParsedEntry,
    _classify_provincial,
    _classify_statcan,
    _deduplicate,
    _parse_entries,
    _to_news_item,
)

RSS_SAMPLE = b"""<?xml version='1.0' encoding='UTF-8'?>
<rss version='2.0'>
  <channel>
    <item>
      <title>Bank of Canada maintains the policy rate</title>
      <link>https://www.bankofcanada.ca/2026/07/policy-rate/</link>
      <description>Growth is improving while risks remain.</description>
      <pubDate>Wed, 15 Jul 2026 14:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""

ATOM_SAMPLE = b"""<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom'>
  <entry>
    <title>Labour Force Survey, June 2026</title>
    <summary>Employment increased and unemployment declined.</summary>
    <link rel='self' href='https://example.test/self'/>
    <link rel='alternate' href='https://www150.statcan.gc.ca/labour'/>
    <published>2026-07-10T12:30:00Z</published>
    <category term='Labour'/>
  </entry>
</feed>
"""


def test_parse_valid_rss() -> None:
    entries = _parse_entries(
        RSS_SAMPLE,
        content_type="application/rss+xml",
        source="Banque du Canada",
    )
    assert len(entries) == 1
    assert entries[0].title.startswith("Bank of Canada")


def test_parse_atom_namespace_and_alternate_link() -> None:
    entries = _parse_entries(
        ATOM_SAMPLE,
        content_type="application/atom+xml",
        source="Statistique Canada",
    )
    assert len(entries) == 1
    assert entries[0].url == "https://www150.statcan.gc.ca/labour"
    assert _classify_statcan(entries[0]) == "Travail"
    assert entries[0].image_url is None


@pytest.mark.parametrize(
    ("metadata", "expected"),
    [
        (
            "<media:thumbnail url='https://images.example.test/thumb.jpg'/>",
            "https://images.example.test/thumb.jpg",
        ),
        (
            "<media:content url='https://images.example.test/content.jpg' type='image/jpeg'/>",
            "https://images.example.test/content.jpg",
        ),
        (
            "<enclosure url='https://images.example.test/enclosure.jpg' type='image/webp'/>",
            "https://images.example.test/enclosure.jpg",
        ),
        (
            "<image><url>https://images.example.test/item.jpg</url></image>",
            "https://images.example.test/item.jpg",
        ),
        (
            "<description><![CDATA[<p>Summary</p><img src='https://images.example.test/html.jpg'>]]></description>",
            "https://images.example.test/html.jpg",
        ),
    ],
)
def test_parse_rss_editorial_images(metadata: str, expected: str) -> None:
    xml = f"""<rss version='2.0' xmlns:media='http://search.yahoo.com/mrss/'><channel><item>
    <title>Canadian economic update</title><link>https://example.test/update</link>
    <description>Official release.</description>{metadata}
    <pubDate>Wed, 15 Jul 2026 14:00:00 GMT</pubDate>
    </item></channel></rss>""".encode()

    entry = _parse_entries(xml, content_type="application/rss+xml", source="Test")[0]

    assert entry.image_url == expected


def test_parse_rss_rejects_invalid_image_url() -> None:
    xml = b"""<rss version='2.0' xmlns:media='http://search.yahoo.com/mrss/'><channel><item>
    <title>Canadian economic update</title><link>https://example.test/update</link>
    <media:thumbnail url='javascript:alert(1)'/><description>Official release.</description>
    <pubDate>Wed, 15 Jul 2026 14:00:00 GMT</pubDate>
    </item></channel></rss>"""

    entry = _parse_entries(xml, content_type="application/rss+xml", source="Test")[0]

    assert entry.image_url is None


def test_article_without_summary_or_image_remains_valid() -> None:
    xml = b"""<rss version='2.0'><channel><item>
    <title>Canadian economic update</title><link>https://example.test/update</link>
    <pubDate>Wed, 15 Jul 2026 14:00:00 GMT</pubDate>
    </item></channel></rss>"""

    entry = _parse_entries(xml, content_type="application/rss+xml", source="Test")[0]
    item = _to_news_item(entry, source="Test", category="Économie")

    assert item.summary == ""
    assert item.image_url is None


def test_atom_text_content_is_not_confused_with_media_content() -> None:
    xml = b"""<feed xmlns='http://www.w3.org/2005/Atom' xmlns:media='http://search.yahoo.com/mrss/'><entry>
    <title>Labour update</title><content type='html'>&lt;p&gt;Employment increased.&lt;/p&gt;</content>
    <media:content url='https://images.example.test/labour.jpg' type='image/jpeg'/>
    <link rel='alternate' href='https://example.test/labour'/><published>2026-07-10T12:30:00Z</published>
    </entry></feed>"""

    entry = _parse_entries(xml, content_type="application/atom+xml", source="Test")[0]

    assert entry.summary == "Employment increased."
    assert entry.image_url == "https://images.example.test/labour.jpg"


def test_deduplication_enriches_the_kept_article_with_a_real_image() -> None:
    base = ParsedEntry(
        title="Canadian economic update",
        summary="Official release.",
        url="https://example.test/update?utm_source=feed",
        published_at=datetime(2026, 7, 15, 14, tzinfo=UTC),
    )
    richer = ParsedEntry(
        title=base.title,
        summary=base.summary,
        url="https://example.test/update",
        published_at=base.published_at,
        image_url="https://images.example.test/update.jpg",
    )

    items = _deduplicate([
        _to_news_item(base, source="Test", category="Économie"),
        _to_news_item(richer, source="Test", category="Économie"),
    ])

    assert len(items) == 1
    assert items[0].image_url == "https://images.example.test/update.jpg"


def test_news_source_failure_is_isolated() -> None:
    async def fail():
        raise RuntimeError("feed failed")

    items, statuses = asyncio.run(NewsService._fetch_source_safe("Broken feed", fail()))

    assert items == []
    assert statuses[0].status == "unavailable"


def test_failed_source_reuses_last_good_items_with_stale_status() -> None:
    service = NewsService()
    item = _to_news_item(
        ParsedEntry(
            title="Canadian economic update",
            summary="Official release.",
            url="https://example.test/update",
            published_at=datetime(2026, 7, 15, 14, tzinfo=UTC),
        ),
        source="Test",
        category="Économie",
    )
    service._last_good["fr"] = NewsSnapshot(
        items=[item],
        source_statuses=[],
        generated_at=datetime(2026, 7, 15, 14, tzinfo=UTC),
    )

    items, statuses = service._merge_last_good_for_failed_sources(
        "fr",
        [],
        [FeedStatus(source="Test — Économie", status="unavailable", detail="timeout")],
    )

    assert items == [item]
    assert statuses[0].status == "stale"


def test_reject_html_response() -> None:
    with pytest.raises(FeedFormatError, match="HTML"):
        _parse_entries(
            b"<html><body>temporarily unavailable</body></html>",
            content_type="text/html",
            source="Test",
        )


def test_reject_empty_feed() -> None:
    with pytest.raises(FeedFormatError, match="vide"):
        _parse_entries(
            b"<rss version='2.0'><channel/></rss>",
            content_type="application/rss+xml",
            source="Test",
        )


def test_connect_timeout_then_success() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectTimeout("timeout", request=request)
        return httpx.Response(
            200,
            content=RSS_SAMPLE,
            headers={"content-type": "application/rss+xml"},
            request=request,
        )

    async def run() -> None:
        service = NewsService()
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            entries, error = await service._download(
                client,
                source_label="Test",
                url="https://example.test/feed",
            )
        assert error is None
        assert len(entries) == 1

    asyncio.run(run())
    assert calls == 2


@pytest.mark.parametrize(
    ("title", "subject", "expected"),
    [
        ("Gross domestic product by industry", "Economic accounts", "Comptes économiques"),
        ("Labour Force Survey", "Labour", "Travail"),
        ("Canadian international merchandise trade", "International trade", "Commerce international"),
        ("Crude oil and natural gas", "Energy", "Énergie"),
    ],
)
def test_statcan_classification(title: str, subject: str, expected: str) -> None:
    xml = f"""<feed xmlns='http://www.w3.org/2005/Atom'><entry>
    <title>{title}</title><summary>Official release.</summary>
    <link rel='alternate' href='https://example.test/item'/>
    <published>2026-07-10T12:30:00Z</published><category term='{subject}'/>
    </entry></feed>""".encode()
    entry = _parse_entries(
        xml,
        content_type="application/atom+xml",
        source="Statistique Canada",
    )[0]
    assert _classify_statcan(entry) == expected



@pytest.mark.parametrize(
    ("title", "subject", "expected"),
    [
        (
            "Produit intérieur brut par industrie",
            "Comptes économiques",
            "Comptes économiques",
        ),
        (
            "Enquête sur la population active, juillet 2026",
            "Travail",
            "Travail",
        ),
        (
            "Commerce international de marchandises du Canada",
            "Commerce international",
            "Commerce international",
        ),
        (
            "Pétrole brut et gaz naturel",
            "Énergie",
            "Énergie",
        ),
    ],
)
def test_french_statcan_classification(
    title: str,
    subject: str,
    expected: str,
) -> None:
    xml = f"""<feed xmlns='http://www.w3.org/2005/Atom'><entry>
    <title>{title}</title><summary>Communiqué officiel.</summary>
    <link rel='alternate' href='https://example.test/item'/>
    <published>2026-08-13T12:30:00Z</published><category term='{subject}'/>
    </entry></feed>""".encode()

    entry = _parse_entries(
        xml,
        content_type="application/atom+xml",
        source="Statistique Canada",
    )[0]

    assert (
        _classify_statcan(entry)
        == expected
    )


def test_official_language_feed_maps() -> None:
    assert STATCAN_URLS["fr"].endswith(
        "/0-fra.atom"
    )
    assert STATCAN_URLS["en"].endswith(
        "/0-eng.atom"
    )
    assert "banqueducanada.ca" in (
        BANK_FEEDS["fr"][0][2]
    )
    assert "bankofcanada.ca" in (
        BANK_FEEDS["en"][0][2]
    )


def test_language_cache_is_separate() -> None:
    service = NewsService()

    assert (
        service._normalize_language("fr")
        == "fr"
    )
    assert (
        service._normalize_language("en")
        == "en"
    )
    assert (
        service._normalize_language("FR")
        == "fr"
    )
    assert (
        service._normalize_language("xx")
        == "fr"
    )


def test_provincial_economic_feed_classification() -> None:
    xml = b"""<rss version='2.0'><channel><item>
    <title>Province invests $25 million in critical minerals</title>
    <link>https://example.test/mining</link>
    <description>New investment supports jobs and mining development.</description>
    <pubDate>Thu, 13 Aug 2026 15:00:00 GMT</pubDate>
    </item></channel></rss>"""
    entry = _parse_entries(
        xml,
        content_type="application/rss+xml",
        source="Province",
    )[0]
    assert _classify_provincial(entry) in {
        "Investissement",
        "Énergie et ressources",
    }


def test_direct_provincial_feed_registry_covers_multiple_provinces() -> None:
    provinces = {item[0] for item in PROVINCIAL_RSS_FEEDS}
    assert {"QC", "BC", "SK", "NS", "PE", "NL"}.issubset(provinces)


def test_provincial_feed_language_is_respected() -> None:
    french_provinces = {
        province
        for province, _source, _url, languages in PROVINCIAL_RSS_FEEDS
        if "fr" in languages
    }
    english_provinces = {
        province
        for province, _source, _url, languages in PROVINCIAL_RSS_FEEDS
        if "en" in languages
    }

    # Quebec's official feed is French. English-only provincial feeds are not
    # mixed into the French edition; French StatCan coverage remains available
    # for all ten provinces through regional tagging.
    assert "QC" in french_provinces
    assert {"BC", "SK", "NS", "PE", "NL"}.issubset(english_provinces)
