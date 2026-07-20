import asyncio

import httpx
import pytest

from app.services.news import (
    FeedFormatError,
    NewsService,
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
