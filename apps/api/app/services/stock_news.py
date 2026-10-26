from __future__ import annotations

import asyncio
import hashlib
import html
import ipaddress
import json
import logging
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from typing import Any, Callable
from urllib.parse import parse_qs, urljoin, urlparse

from app.core.config import settings
from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.stocks import StockNewsItem, StockNewsSnapshot, StockNewsSource
from app.services.session_quotes import session_quote_service


logger = logging.getLogger(__name__)

YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
CNQ_RELEASES_URL = "https://www.cnrl.com/investors/news-releases/"
ENB_RELEASES_URL = "https://www.enbridge.com/media-center/news"
VNP_RELEASES_URL = "https://www.5nplus.com/en/news/press-releases/"
_GENERIC = re.compile(r"\b(?:TFSA|RRSP|CELI|REER|best stocks?|top \d+|stocks? to buy|dividend stocks?|passive income|portfolio strateg|retirement|watchlist|millionaire|wealth building|buy and hold|where I.d put|I keep coming back|what you should know|fully priced|can the run continue|vs\.)\b", re.I)
_EVENT = re.compile(r"\b(?:results?|earnings?|revenue|profit|dividend|production|guidance|forecast|budget|acquisition|merger|sale|transaction|contract|appoint|CEO|quarter|annual|financing|notes|debt|buyback|issuer bid|operat\w*|announce\w*|report\w*|update|upgrade|downgrade|price target|open\w*|launch\w*|expand\w*|résultats?|bénéfices?|revenus?|dividende|production|prévisions?|acquisition|direction|trimestre|annonce|rachat|objectif de cours|ouvre|lance)\b", re.I)
_DIVIDEND_ACTION = re.compile(r"\b(?:announc\w*|declar\w*|rais\w*|increas\w*|cut\w*|boost\w*|hik\w*|pay\w*|record date|déclar\w*|annonce\w*|hausse|verse\w*)\b", re.I)
_SECTOR_TERMS = {
    "CNQ": re.compile(r"\b(?:oil sands?|crude oil|natural gas|energy sector|petroleum|bitumen|pétrole|gaz naturel|sables bitumineux)\b", re.I),
    "ENB": re.compile(r"\b(?:pipeline|natural gas|crude oil|energy infrastructure|pétrole|gaz naturel|oléoduc|gazoduc)\b", re.I),
    "AEM": re.compile(r"\b(?:gold|mining|minerals?|mines?|minier)\b", re.I),
    "RY": re.compile(r"\b(?:banks?|banking|financial sector|banques?|bancaire)\b", re.I),
    "TD": re.compile(r"\b(?:banks?|banking|financial sector|banques?|bancaire)\b", re.I),
    "VNP": re.compile(r"\b(?:specialty semiconductors?|critical minerals?|gallium arsenide|advanced materials?|semi-conducteurs?|minéraux critiques)\b", re.I),
}
_MARKET_TERMS = {
    "TD": re.compile(r"\b(?:Bank of Canada|Banque du Canada)\b.{0,70}\b(?:interest rates?|policy rate|taux directeur|taux d.intérêt)\b", re.I),
    "CNQ": re.compile(r"\b(?:WTI|Brent)\b.{0,50}\b(?:crude oil|oil prices?|pétrole|prix du brut)\b", re.I),
    "ENB": re.compile(r"\b(?:natural gas prices?|prix du gaz naturel)\b.{0,50}\b(?:Canada|North America|Amérique du Nord)\b", re.I),
}
_RELEASE_YEAR = re.compile(r'<cnrl-tab\s+title="((?:19|20)\d{2})"[^>]*>(.*?)</cnrl-tab>', re.I | re.S)
_RELEASE_CARD = re.compile(r'<cnrl-news-release-card\s+link="([^"]+)"\s+day="(\d{1,2})"\s+month="(\d{1,2})"[^>]*>\s*<h1[^>]*>(.*?)</h1>', re.I | re.S)


def _event_type(title: str) -> str:
    checks = (("results", r"\b(?:results?|earnings?|résultats?)\b"),
              ("dividend", r"\b(?:dividend|dividende)\b"),
              ("acquisition", r"\b(?:acqui\w*|merger|joint venture)\b"),
              ("financing", r"\b(?:offering|debt|notes|financ\w*|equity)\b"),
              ("leadership", r"\b(?:CEO|president|appoint\w*|retire\w*)\b"),
              ("operations", r"\b(?:pipeline|production|project|operat\w*)\b"))
    return next((kind for kind, pattern in checks if re.search(pattern, title, re.I)), "other")


class _EnbridgeIndexParser(HTMLParser):
    """Read only the public release cards; fail closed if their structure changes."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.cards: list[dict[str, str]] = []
        self.card: dict[str, str] | None = None
        self.depth = 0
        self.field = ""
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if tag == "div" and "news-feed-item" in classes and self.card is None:
            self.card, self.depth = {}, 1
            return
        if self.card is None:
            return
        if tag == "div":
            self.depth += 1
        if tag == "p" and "news-feed-date" in classes:
            self.field, self.parts = "date", []
        elif tag == "h3" and "news-item-title" in classes:
            self.field, self.parts = "title", []
        elif tag == "p" and "news-feed-intro" in classes:
            self.field, self.parts = "summary", []
        elif tag == "a" and values.get("href", "").startswith("/media-center/news/details?"):
            self.card["url"] = values["href"] or ""

    def handle_data(self, data: str) -> None:
        if self.card is not None and self.field:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.card is None:
            return
        if (tag == "h3" and self.field == "title") or (tag == "p" and self.field in {"date", "summary"}):
            self.card[self.field] = " ".join(self.parts).strip()
            self.field = ""
            self.parts = []
        if tag == "div":
            self.depth -= 1
            if self.depth == 0:
                self.cards.append(self.card)
                self.card = None


class _FiveNIndexParser(HTMLParser):
    """Read the visible press-release list, never article bodies or other site news."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.cards: list[dict[str, str]] = []
        self.card: dict[str, str] | None = None
        self.depth = 0
        self.field = ""
        self.parts: list[str] = []
        self.div_classes: list[set[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if tag == "div" and "news-list__list-el" in classes and self.card is None:
            self.card, self.depth = {}, 1
            self.div_classes = [set(classes)]
            return
        if self.card is None:
            return
        if tag == "div":
            self.depth += 1
            self.div_classes.append(set(classes))
        if tag == "h2" and any("news-list__title" in group for group in self.div_classes):
            self.field, self.parts = "title", []
        elif tag == "strong" and any("news-list__info" in group for group in self.div_classes):
            self.field, self.parts = "date", []
        elif tag == "p" and any("news-list__text" in group for group in self.div_classes):
            self.field, self.parts = "summary", []
        elif tag == "a" and self.field == "title":
            self.card["url"] = values.get("href") or ""

    def handle_data(self, data: str) -> None:
        if self.card is not None and self.field:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.card is None:
            return
        if (tag == "h2" and self.field == "title") or (tag == "strong" and self.field == "date") or (tag == "p" and self.field == "summary"):
            self.card[self.field] = " ".join(self.parts).strip()
            self.field, self.parts = "", []
        if tag == "div":
            self.depth -= 1
            self.div_classes.pop()
            if self.depth == 0:
                self.cards.append(self.card)
                self.card = None


@dataclass(frozen=True)
class OfficialReleaseSource:
    index_url: str
    publisher: str
    parse: Callable[[str, str], list[StockNewsItem]]
LEGAL_WORDS = {
    "and",
    "class",
    "company",
    "corp",
    "corporation",
    "de",
    "des",
    "du",
    "et",
    "inc",
    "incorporated",
    "la",
    "le",
    "limited",
    "ltd",
    "of",
    "plc",
    "the",
}


def _normalise_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(
        character
        for character in decomposed
        if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.casefold()).strip()


def _company_tokens(value: str) -> set[str]:
    return {
        token
        for token in _normalise_text(value).split()
        if token not in LEGAL_WORDS and len(token) > 1
    }


def _company_matches(left: str, right: str) -> bool:
    left_tokens = _company_tokens(left)
    right_tokens = _company_tokens(right)
    if not left_tokens or not right_tokens:
        return False
    common = left_tokens & right_tokens
    return len(common) / min(len(left_tokens), len(right_tokens)) >= 0.75


def _classification(row: dict[str, Any], *, aliases: set[str], company: str, symbol: str) -> tuple[str | None, str]:
    title = str(row.get("title") or "")
    if not title:
        return None, "missing_title"
    if _GENERIC.search(title):
        return None, "generalist"
    if re.search(r"\b(?:dividend|dividende)\b", title, re.I) and not _DIVIDEND_ACTION.search(title) and not re.search(r"\b(?:earnings?|results?|revenue|profit|bénéfices?|résultats?)\b", title, re.I):
        return None, "dividend_commentary"
    title_tokens = _company_tokens(title)
    company_tokens = _company_tokens(company)
    direct_name = bool(company_tokens) and len(title_tokens & company_tokens) >= (1 if len(company_tokens) == 1 else 2)
    if symbol.upper().removesuffix(".TO") == "TD":
        direct_name = direct_name or bool(re.search(r"\bTD Bank(?: Group)?\b", title, re.I))
    if symbol.upper().removesuffix(".TO") == "VNP":
        direct_name = direct_name or bool(re.search(r"\b5N\+|\b5N\s+Plus\b", title, re.I))
    ticker_aliases = {alias.upper().removesuffix(".TO") for alias in aliases if len(alias.removesuffix(".TO")) >= 3}
    direct_ticker = any(re.search(rf"(?<![A-Z0-9]){re.escape(alias)}(?![A-Z0-9])", title.upper()) for alias in ticker_aliases)
    if (direct_name or direct_ticker) and _EVENT.search(title):
        return "direct", "direct_title"
    sector = _SECTOR_TERMS.get(symbol.upper().removesuffix(".TO"))
    if sector and sector.search(title) and _EVENT.search(title):
        return "sector", "sector_title"
    market = _MARKET_TERMS.get(symbol.upper().removesuffix(".TO"))
    if market and market.search(title):
        return "market", "market_title"
    # A Yahoo relatedTicker is a search hint, never proof of a company event.
    return None, "no_direct_evidence"


def _near_duplicate(left: StockNewsItem, right: StockNewsItem) -> bool:
    if abs((left.published_at - right.published_at).total_seconds()) > 3 * 86400:
        return False
    if re.findall(r"\d+(?:[.,]\d+)?", left.title) != re.findall(r"\d+(?:[.,]\d+)?", right.title):
        return False
    period = re.compile(r"\b(?:first|second|third|fourth|1st|2nd|3rd|4th|Q[1-4]|T[1-4]|premier|deuxième|troisième|quatrième)\b", re.I)
    if [value.casefold() for value in period.findall(left.title)] != [value.casefold() for value in period.findall(right.title)]:
        return False
    a, b = _company_tokens(left.title), _company_tokens(right.title)
    return bool(a and b) and len(a & b) / len(a | b) >= 0.72


def _priority(item: StockNewsItem) -> float:
    age_days = max(0.0, (datetime.now(UTC) - item.published_at).total_seconds() / 86400)
    event = bool(_EVENT.search(item.title))
    return ((100 if item.relevance == "direct" else 35 if item.relevance == "sector" else 0) +
            (20 if item.origin == "company_release" else 0) +
            (12 if event else 0) + max(0, 20 - age_days / 3))


def _safe_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = urlparse(value.strip())
        host = (parsed.hostname or "").lower().rstrip(".")
        port = parsed.port
    except ValueError:
        return None
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or port not in {None, 443}:
        return None
    if host == "localhost" or host.endswith(".localhost") or (address is not None and not address.is_global):
        return None
    return value.strip()


def _safe_image_url(value: Any) -> str | None:
    url = _safe_url(value)
    if url is None or urlparse(url).scheme.casefold() != "https":
        return None
    return url


def _thumbnail_url(row: dict[str, Any]) -> str | None:
    thumbnail = row.get("thumbnail")
    if not isinstance(thumbnail, dict):
        return None

    resolutions: list[tuple[str, int]] = []
    for resolution in thumbnail.get("resolutions") or []:
        if not isinstance(resolution, dict):
            continue
        url = _safe_image_url(resolution.get("url"))
        if url is None:
            continue
        try:
            width = max(0, int(resolution.get("width") or 0))
            height = max(0, int(resolution.get("height") or 0))
        except (TypeError, ValueError):
            width = height = 0
        resolutions.append((url, max(width, height)))

    if resolutions:
        # Prefer a reasonably sharp thumbnail without selecting the largest
        # editorial asset. If every dimension is missing, preserve feed order.
        return min(
            resolutions,
            key=lambda candidate: (
                candidate[1] < 160,
                abs(candidate[1] - 240) if candidate[1] else 10_000,
            ),
        )[0]

    return _safe_image_url(thumbnail.get("originalUrl"))


def _clean_summary(value: str) -> str:
    summary = re.sub(r"\s+", " ", html.unescape(value or "")).strip()
    boilerplate = re.search(r"\s+The post .+ appeared first on .+$", summary, re.I)
    if boilerplate and boilerplate.start() >= 40:
        summary = summary[: boilerplate.start()].rstrip()
    return summary[:520].rstrip()


class _DescriptionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.descriptions: dict[str, str] = {}

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag.casefold() != "meta":
            return
        values = {
            key.casefold(): value or ""
            for key, value in attrs
        }
        marker = (
            values.get("property") or values.get("name") or ""
        ).casefold()
        if marker in {"og:description", "description", "twitter:description"}:
            content = _clean_summary(values.get("content", ""))
            if content:
                self.descriptions.setdefault(marker, content)

    @property
    def summary(self) -> str:
        for marker in ("og:description", "description", "twitter:description"):
            if value := self.descriptions.get(marker):
                return value
        return ""


def _description_from_html(value: str) -> str:
    parser = _DescriptionParser()
    try:
        parser.feed(value[:250_000])
        parser.close()
    except (ValueError, TypeError):
        return ""
    return parser.summary


def _parse_cnq_releases(page: str, symbol: str) -> list[StockNewsItem]:
    releases: list[StockNewsItem] = []
    for tab in _RELEASE_YEAR.finditer(page):
        year = int(tab.group(1))
        for card in _RELEASE_CARD.finditer(tab.group(2)):
            url = urljoin(CNQ_RELEASES_URL, html.unescape(card.group(1)))
            parsed = urlparse(url)
            if parsed.scheme != "https" or parsed.hostname != "www.cnrl.com" or not parsed.path.lower().endswith(".pdf"):
                continue
            try:
                published = datetime(year, int(card.group(3)), int(card.group(2)), tzinfo=UTC)
            except ValueError:
                continue
            title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", card.group(4)))).strip()
            if title:
                releases.append(StockNewsItem(
                    id=hashlib.sha1(url.encode()).hexdigest()[:16], title=title,
                    summary="", url=url, publisher="Canadian Natural Resources",
                    published_at=published, related_tickers=[symbol],
                    relevance="direct", origin="company_release", event_type=_event_type(title),
                ))
    if not releases:
        raise ValueError("official_release_structure_changed")
    return releases[:30]


def _parse_enbridge_releases(page: str, symbol: str) -> list[StockNewsItem]:
    parser = _EnbridgeIndexParser()
    parser.feed(page)
    releases: list[StockNewsItem] = []
    for card in parser.cards:
        url = urljoin(ENB_RELEASES_URL, html.unescape(card.get("url", "")))
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        if (parsed.scheme != "https" or parsed.hostname != "www.enbridge.com"
                or parsed.path.lower() != "/media-center/news/details"
                or not query.get("id", [""])[0].isdigit()):
            continue
        try:
            published = datetime.strptime(card["date"].strip(), "%B %d, %Y").replace(tzinfo=UTC)
        except (KeyError, ValueError):
            continue
        title = re.sub(r"\s+", " ", html.unescape(card.get("title", ""))).strip()
        if not title or "enbridge" not in title.casefold():
            continue
        summary = _clean_summary(card.get("summary", ""))
        releases.append(StockNewsItem(
            id=hashlib.sha1(url.encode()).hexdigest()[:16], title=title,
            summary=summary, url=url, publisher="Enbridge Inc.",
            published_at=published, related_tickers=[symbol],
            relevance="direct", origin="company_release", event_type=_event_type(title),
        ))
    if not releases:
        raise ValueError("official_release_structure_changed")
    return releases[:30]


def _parse_five_n_releases(page: str, symbol: str) -> list[StockNewsItem]:
    parser = _FiveNIndexParser()
    parser.feed(page)
    releases: list[StockNewsItem] = []
    for card in parser.cards:
        url = urljoin(VNP_RELEASES_URL, html.unescape(card.get("url", "")))
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "www.5nplus.com" or not parsed.path.startswith("/en/news/"):
            continue
        try:
            published = datetime.strptime(card.get("date", "").split("|")[0].strip(), "%B %d, %Y").replace(tzinfo=UTC)
        except ValueError:
            continue
        title = re.sub(r"\s+", " ", card.get("title", "")).strip()
        if not title:
            continue
        releases.append(StockNewsItem(
            id=hashlib.sha1(url.encode()).hexdigest()[:16], title=title,
            summary=_clean_summary(card.get("summary", "")), url=url,
            publisher="5N Plus", published_at=published, related_tickers=[symbol],
            relevance="direct", origin="company_release", event_type=_event_type(title),
        ))
    if not releases:
        raise ValueError("official_release_structure_changed")
    return releases[:30]


OFFICIAL_RELEASE_SOURCES: dict[str, OfficialReleaseSource] = {
    "CNQ.TO": OfficialReleaseSource(CNQ_RELEASES_URL, "Canadian Natural Resources", _parse_cnq_releases),
    "ENB.TO": OfficialReleaseSource(ENB_RELEASES_URL, "Enbridge Inc.", _parse_enbridge_releases),
    "VNP.TO": OfficialReleaseSource(VNP_RELEASES_URL, "5N Plus", _parse_five_n_releases),
}


class StockNewsService:
    refresh_after_seconds = 900
    stale_seconds = 86_400
    max_items = 72

    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, StockNewsSnapshot] = (
            AsyncStaleCache(max_entries=1000)
        )

    @staticmethod
    def _ticker(symbol: str) -> str:
        return symbol.removesuffix(".TO").replace("-", ".")

    @staticmethod
    def _aliases(
        payload: dict[str, Any],
        *,
        symbol: str,
        company: str,
    ) -> set[str]:
        aliases = {symbol}
        for quote in payload.get("quotes") or []:
            if not isinstance(quote, dict):
                continue
            quote_type = str(quote.get("quoteType") or "").upper()
            if quote_type and quote_type != "EQUITY":
                continue
            quote_symbol = str(quote.get("symbol") or "").upper()
            quote_name = str(
                quote.get("longname") or quote.get("shortname") or ""
            )
            if quote_symbol and _company_matches(company, quote_name):
                aliases.add(quote_symbol)
        return aliases

    @classmethod
    def _parse_items(
        cls,
        payload: dict[str, Any],
        *,
        aliases: set[str],
        company: str,
        symbol: str = "",
        rejected: Counter[str] | None = None,
    ) -> list[StockNewsItem]:
        items: list[StockNewsItem] = []
        seen: set[str] = set()
        seen_titles: set[str] = set()
        seen_urls: set[str] = set()

        for row in payload.get("news") or []:
            if not isinstance(row, dict):
                if rejected is not None:
                    rejected["invalid_row"] += 1
                continue
            relevance, reason = _classification(row, aliases=aliases, company=company, symbol=symbol)
            if relevance is None:
                if rejected is not None:
                    rejected[reason] += 1
                continue
            title = str(row.get("title") or "").strip()
            url = _safe_url(row.get("link"))
            try:
                published_at = datetime.fromtimestamp(
                    int(row.get("providerPublishTime")),
                    UTC,
                )
            except (TypeError, ValueError, OSError, OverflowError):
                if rejected is not None:
                    rejected["invalid_date"] += 1
                continue
            if not title or url is None:
                if rejected is not None:
                    rejected["invalid_url_or_title"] += 1
                continue
            publisher = str(row.get("publisher") or "Actualité").strip()
            title_key = f"{_normalise_text(title)}|{published_at.date().isoformat()}|{_normalise_text(publisher)}"
            url_key = url.casefold().rstrip("/")
            if title_key in seen_titles or url_key in seen_urls:
                if rejected is not None:
                    rejected["duplicate"] += 1
                continue

            identifier = str(row.get("uuid") or "").strip() or hashlib.sha1(
                f"{url}|{title.casefold()}".encode("utf-8")
            ).hexdigest()[:16]
            if identifier in seen:
                if rejected is not None:
                    rejected["duplicate"] += 1
                continue
            seen.add(identifier)
            seen_titles.add(title_key)
            seen_urls.add(url_key)
            items.append(
                StockNewsItem(
                    id=identifier,
                    title=title,
                    summary=_clean_summary(
                        str(row.get("summary") or row.get("description") or "")
                    ),
                    url=url,
                    publisher=publisher,
                    published_at=published_at,
                    related_tickers=sorted(
                        {
                            str(value).upper()
                            for value in row.get("relatedTickers") or []
                            if value
                        }
                    ),
                    image_url=_thumbnail_url(row),
                    relevance=relevance,
                    event_type=_event_type(title),
                )
            )
        return items

    async def _search(
        self,
        *,
        query: str,
        language: str,
        region: str = "CA",
    ) -> dict[str, Any]:
        region = "US" if region.strip().upper() == "US" else "CA"
        response = await shared_http_client.request(
            "GET",
            YAHOO_SEARCH_URL,
            params={
                "q": query,
                "quotesCount": "10",
                "newsCount": "50",
                "enableFuzzyQuery": "false",
                "quotesQueryId": "tss_match_phrase_query",
                "newsQueryId": "news_cie_vespa",
                "lang": (
                    "en-US"
                    if region == "US"
                    else "fr-CA" if language == "fr" else "en-CA"
                ),
                "region": region,
            },
            attempts=2,
        )
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Stock news payload is invalid")
        return payload

    async def _summary_for_item(
        self,
        item: StockNewsItem,
        *,
        language: str,
    ) -> str:
        # Yahoo's supplied excerpt is the only publisher text we possess.
        # Do not crawl arbitrary links from an untrusted search response.
        return item.summary

    async def _enrich_summaries(
        self,
        items: list[StockNewsItem],
        *,
        language: str,
    ) -> list[StockNewsItem]:
        summaries = await asyncio.gather(
            *(
                self._summary_for_item(item, language=language)
                for item in items
            )
        )
        return [
            item.model_copy(update={"summary": summary})
            for item, summary in zip(items, summaries, strict=True)
        ]

    @classmethod
    def _items_from_payloads(
        cls,
        payloads: list[dict[str, Any]],
        *,
        symbol: str,
        company: str,
        rejected: Counter[str] | None = None,
    ) -> list[StockNewsItem]:
        aliases = {symbol}
        for payload in payloads:
            aliases.update(
                cls._aliases(payload, symbol=symbol, company=company)
            )
        return cls._parse_items(
            {
                "news": [
                    row
                    for payload in payloads
                    for row in payload.get("news") or []
                ]
            },
            aliases=aliases,
            company=company,
            symbol=symbol,
            rejected=rejected,
        )

    @staticmethod
    async def _company_releases(symbol: str) -> list[StockNewsItem]:
        """Only explicit, verified sources can enter this registry."""
        source = OFFICIAL_RELEASE_SOURCES.get(symbol.upper())
        if source is None:
            return []
        response = await shared_http_client.request("GET", source.index_url, attempts=1, follow_redirects=False)
        response.raise_for_status()
        if "html" not in response.headers.get("content-type", "").casefold() or len(response.content) > 600_000:
            raise ValueError("invalid_official_release_index")
        return source.parse(response.text, symbol)

    @classmethod
    def _rank_and_select(cls, candidates: list[StockNewsItem], rejected: Counter[str]) -> list[StockNewsItem]:
        cutoff = datetime.now(UTC) - timedelta(days=120)
        fresh = [item for item in candidates if item.published_at >= cutoff]
        rejected["outside_recent_window"] += len(candidates) - len(fresh)
        ranked = sorted(fresh, key=lambda item: (_priority(item), item.published_at), reverse=True)
        unique: list[StockNewsItem] = []
        seen_urls: set[str] = set()
        for item in ranked:
            url = item.url.casefold().rstrip("/")
            if url in seen_urls:
                rejected["duplicate_url"] += 1
                continue
            seen_urls.add(url)
            match_index = next((index for index, existing in enumerate(unique) if item.event_type == existing.event_type and _near_duplicate(item, existing)), None)
            if match_index is not None:
                primary = unique[match_index]
                event_published_at = max(primary.event_published_at or primary.published_at, item.published_at)
                if item.publisher.casefold() != primary.publisher.casefold() and all(item.publisher.casefold() != source.publisher.casefold() for source in primary.related_sources):
                    source = StockNewsSource(title=item.title, url=item.url, publisher=item.publisher,
                                             published_at=item.published_at, origin=item.origin)
                    unique[match_index] = primary.model_copy(update={"related_sources": [*primary.related_sources, source],
                                                              "event_published_at": event_published_at})
                else:
                    unique[match_index] = primary.model_copy(update={"event_published_at": event_published_at})
                rejected["same_announcement"] += 1
                continue
            unique.append(item)
        ordered: list[StockNewsItem] = []
        for tier in ("direct", "sector", "market"):
            pool = [item for item in unique if item.relevance == tier]
            selected_ids: set[str] = set()
            publisher_count: Counter[str] = Counter()
            for item in pool:
                publisher = item.publisher.casefold()
                if len(ordered) < 6 and publisher_count[publisher] >= 2 and len({row.publisher.casefold() for row in pool}) > 1:
                    continue
                ordered.append(item)
                selected_ids.add(item.id)
                publisher_count[publisher] += 1
                if len(ordered) >= cls.max_items:
                    return ordered
            for item in pool:
                if item.id not in selected_ids:
                    ordered.append(item)
                    if len(ordered) >= cls.max_items:
                        return ordered
        return ordered

    async def _load(
        self,
        *,
        symbol: str,
        company: str,
        language: str,
    ) -> StockNewsSnapshot:
        query = company or self._ticker(symbol)
        queries = [(query, language, "CA"), (query, "en", "US")]
        if language == "fr":
            queries.insert(1, (query, "en", "CA"))
        payloads: list[dict[str, Any]] = []
        provider_counts: dict[str, int] = {}
        rejected: Counter[str] = Counter()
        for search_query, search_language, region in queries:
            key = f"yahoo:{search_language}:{region}"
            try:
                payload = await self._search(query=search_query, language=search_language, region=region)
                payloads.append(payload)
                provider_counts[key] = len(payload.get("news") or [])
            except Exception as exc:  # noqa: BLE001
                provider_counts[key] = 0
                rejected[f"{key}_unavailable"] += 1
                logger.info("stock_news_provider_unavailable provider=%s error=%s", key, type(exc).__name__)
        initial_items = self._items_from_payloads(payloads, symbol=symbol, company=company)
        if len(initial_items) < 8:
            ticker_query = self._ticker(symbol)
            for region in ("CA", "US"):
                key = f"yahoo:ticker:{region}"
                try:
                    payload = await self._search(query=ticker_query, language="en", region=region)
                    payloads.append(payload)
                    provider_counts[key] = len(payload.get("news") or [])
                except Exception as exc:  # noqa: BLE001
                    provider_counts[key] = 0
                    rejected[f"{key}_unavailable"] += 1
                    logger.info("stock_news_provider_unavailable provider=%s error=%s", key, type(exc).__name__)
        items = self._items_from_payloads(payloads, symbol=symbol, company=company, rejected=rejected)
        yahoo_accepted = len(items)
        try:
            official = await self._company_releases(symbol)
            official_available = symbol.upper() in OFFICIAL_RELEASE_SOURCES
        except Exception as exc:  # noqa: BLE001
            official = []
            official_available = False
            rejected["company_release_unavailable"] += 1
            logger.info("stock_news_provider_unavailable provider=company_release error=%s", type(exc).__name__)
        provider_counts["company_release"] = len(official)
        items = self._rank_and_select([*items, *official], rejected)
        items = await self._enrich_summaries(items, language=language)
        publishers = dict(Counter(item.publisher for item in items))
        coverage_note = ("La couverture récente est limitée aux sources disponibles." if len(items) <= 3 and language == "fr" else
                         "Recent coverage is limited to available sources." if len(items) <= 3 else
                         "Une seule source pertinente est disponible." if len(publishers) == 1 and language == "fr" else
                         "Only one relevant publisher is available." if len(publishers) == 1 else None)
        logger.info("stock_news_selection %s", json.dumps({
            "symbol": symbol, "providers": provider_counts,
            "yahoo_accepted": yahoo_accepted, "accepted": len(items), "rejected": dict(rejected),
            "with_excerpt": sum(bool(item.summary) for item in items),
            "public_release_pages": sum(item.origin == "company_release" and urlparse(item.url).hostname == "www.enbridge.com" for item in items),
            "publishers": publishers,
            "latest_published_at": max((item.published_at.isoformat() for item in items), default=None),
        }, sort_keys=True))
        return StockNewsSnapshot(
            ticker=self._ticker(symbol),
            symbol=symbol,
            company=company,
            items=items,
            status="ok" if items else "partial" if payloads or official_available else "unavailable",
            detail=None if items or payloads or official_available else "All stock news sources are temporarily unavailable",
            coverage_note=coverage_note,
            generated_at=datetime.now(UTC),
            refresh_after_seconds=self.refresh_after_seconds,
        )

    @staticmethod
    def _empty(
        *,
        symbol: str,
        company: str,
        detail: str,
    ) -> StockNewsSnapshot:
        return StockNewsSnapshot(
            ticker=StockNewsService._ticker(symbol),
            symbol=symbol,
            company=company,
            items=[],
            status="unavailable",
            detail=detail,
            generated_at=datetime.now(UTC),
            refresh_after_seconds=60,
        )

    async def get_snapshot(
        self,
        ticker: str,
        *,
        company: str | None = None,
        language: str = "fr",
    ) -> StockNewsSnapshot:
        symbol = session_quote_service.normalize_ticker(ticker)
        language = "en" if language.strip().lower() == "en" else "fr"
        company = (company or self._ticker(symbol)).strip()

        if settings.market_data_provider.strip().lower() == "demo":
            return self._empty(
                symbol=symbol,
                company=company,
                detail="Live stock news is disabled in demo mode",
            )

        key = f"{language}|{symbol}|{_normalise_text(company)}"
        try:
            snapshot = await self._cache.get_or_load(
                key,
                lambda: self._load(
                    symbol=symbol,
                    company=company,
                    language=language,
                ),
                fresh_seconds=float(self.refresh_after_seconds),
                stale_seconds=float(self.stale_seconds),
            )
            if (datetime.now(UTC) - snapshot.generated_at).total_seconds() > snapshot.refresh_after_seconds:
                return snapshot.model_copy(update={"stale": True})
            return snapshot
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "stock_news_unavailable symbol=%s exception=%s",
                symbol,
                type(exc).__name__,
            )
            return self._empty(
                symbol=symbol,
                company=company,
                detail="Stock news is temporarily unavailable",
            )


stock_news_service = StockNewsService()
