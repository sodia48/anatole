from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import re
import unicodedata
from datetime import UTC, datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

from app.core.config import settings
from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.stocks import StockNewsItem, StockNewsSnapshot
from app.services.session_quotes import session_quote_service


logger = logging.getLogger(__name__)

YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
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


def _safe_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return value.strip()


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


class StockNewsService:
    refresh_after_seconds = 900
    stale_seconds = 86_400
    minimum_items = 10
    max_items = 10
    summary_fresh_seconds = 21_600
    summary_stale_seconds = 604_800

    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, StockNewsSnapshot] = (
            AsyncStaleCache(max_entries=1000)
        )
        self._summary_cache: AsyncStaleCache[str, str] = AsyncStaleCache(
            max_entries=4000
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

    @staticmethod
    def _relevant(
        row: dict[str, Any],
        *,
        aliases: set[str],
        company: str,
    ) -> bool:
        related = {
            str(value).upper()
            for value in row.get("relatedTickers") or []
            if value
        }
        if related & aliases:
            return True

        title_tokens = _company_tokens(str(row.get("title") or ""))
        company_tokens = _company_tokens(company)
        if not company_tokens:
            return False
        required = 1 if len(company_tokens) == 1 else 2
        return len(title_tokens & company_tokens) >= required

    @classmethod
    def _parse_items(
        cls,
        payload: dict[str, Any],
        *,
        aliases: set[str],
        company: str,
    ) -> list[StockNewsItem]:
        items: list[StockNewsItem] = []
        seen: set[str] = set()
        seen_titles: set[str] = set()
        seen_urls: set[str] = set()

        for row in payload.get("news") or []:
            if not isinstance(row, dict) or not cls._relevant(
                row,
                aliases=aliases,
                company=company,
            ):
                continue
            title = str(row.get("title") or "").strip()
            url = _safe_url(row.get("link"))
            try:
                published_at = datetime.fromtimestamp(
                    int(row.get("providerPublishTime")),
                    UTC,
                )
            except (TypeError, ValueError, OSError, OverflowError):
                continue
            if not title or url is None:
                continue
            title_key = _normalise_text(title)
            url_key = url.casefold().rstrip("/")
            if title_key in seen_titles or url_key in seen_urls:
                continue

            identifier = str(row.get("uuid") or "").strip() or hashlib.sha1(
                f"{url}|{title.casefold()}".encode("utf-8")
            ).hexdigest()[:16]
            if identifier in seen:
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
                    publisher=str(row.get("publisher") or "Actualité").strip(),
                    published_at=published_at,
                    related_tickers=sorted(
                        {
                            str(value).upper()
                            for value in row.get("relatedTickers") or []
                            if value
                        }
                    ),
                )
            )

        items.sort(key=lambda item: item.published_at, reverse=True)
        return items[: cls.max_items]

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
                "newsCount": "10",
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

    @staticmethod
    def _fallback_summary(
        item: StockNewsItem,
        *,
        language: str,
    ) -> str:
        if language == "fr":
            return (
                f"Selon {item.publisher}, cette nouvelle porte sur : "
                f"« {item.title} »"
            )
        return f"According to {item.publisher}, this article covers: “{item.title}”"

    @staticmethod
    async def _load_article_summary(url: str) -> str:
        response = await shared_http_client.request(
            "GET",
            url,
            headers={"Accept": "text/html,application/xhtml+xml"},
            attempts=1,
        )
        content_type = response.headers.get("content-type", "").casefold()
        if "html" not in content_type:
            return ""
        return _description_from_html(response.text)

    async def _summary_for_item(
        self,
        item: StockNewsItem,
        *,
        language: str,
    ) -> str:
        if item.summary:
            return item.summary
        try:
            summary = await self._summary_cache.get_or_load(
                item.url,
                lambda: self._load_article_summary(item.url),
                fresh_seconds=float(self.summary_fresh_seconds),
                stale_seconds=float(self.summary_stale_seconds),
            )
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "stock_news_summary_unavailable url=%s exception=%s",
                item.url,
                type(exc).__name__,
            )
            summary = ""
        return summary or self._fallback_summary(item, language=language)

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
        )

    async def _load(
        self,
        *,
        symbol: str,
        company: str,
        language: str,
    ) -> StockNewsSnapshot:
        query = company or self._ticker(symbol)
        canadian = await self._search(
            query=query,
            language=language,
            region="CA",
        )
        if language == "fr" and not (canadian.get("news") or []):
            canadian = await self._search(
                query=query,
                language="en",
                region="CA",
            )
        payloads = [canadian]
        items = self._items_from_payloads(
            payloads,
            symbol=symbol,
            company=company,
        )
        if len(items) < self.minimum_items:
            payloads.append(
                await self._search(
                    query=query,
                    language="en",
                    region="US",
                )
            )
            items = self._items_from_payloads(
                payloads,
                symbol=symbol,
                company=company,
            )
        items = await self._enrich_summaries(items, language=language)
        return StockNewsSnapshot(
            ticker=self._ticker(symbol),
            symbol=symbol,
            company=company,
            items=items,
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
            return await self._cache.get_or_load(
                key,
                lambda: self._load(
                    symbol=symbol,
                    company=company,
                    language=language,
                ),
                fresh_seconds=float(self.refresh_after_seconds),
                stale_seconds=float(self.stale_seconds),
            )
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
