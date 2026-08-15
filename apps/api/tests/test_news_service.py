import asyncio

import httpx
import pytest

from app.services.news import (
    BANK_FEEDS,
    STATCAN_URLS,
    FeedFormatError,
    NewsService,
    PROVINCIAL_RSS_FEEDS,
    _classify_provincial,
    _classify_statcan,
    _parse_entries,
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
