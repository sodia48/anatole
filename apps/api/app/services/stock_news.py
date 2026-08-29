from __future__ import annotations

import hashlib
import logging
import re
import unicodedata
from datetime import UTC, datetime
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


class StockNewsService:
    refresh_after_seconds = 900
    stale_seconds = 86_400
    max_items = 8

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

            identifier = str(row.get("uuid") or "").strip() or hashlib.sha1(
                f"{url}|{title.casefold()}".encode("utf-8")
            ).hexdigest()[:16]
            if identifier in seen:
                continue
            seen.add(identifier)
            items.append(
                StockNewsItem(
                    id=identifier,
                    title=title,
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
    ) -> dict[str, Any]:
        response = await shared_http_client.request(
            "GET",
            YAHOO_SEARCH_URL,
            params={
                "q": query,
                "quotesCount": "10",
                "newsCount": "12",
                "enableFuzzyQuery": "false",
                "quotesQueryId": "tss_match_phrase_query",
                "newsQueryId": "news_cie_vespa",
                "lang": "fr-CA" if language == "fr" else "en-CA",
                "region": "CA",
            },
            attempts=2,
        )
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Stock news payload is invalid")
        return payload

    async def _load(
        self,
        *,
        symbol: str,
        company: str,
        language: str,
    ) -> StockNewsSnapshot:
        query = company or self._ticker(symbol)
        payload = await self._search(query=query, language=language)
        if language == "fr" and not (payload.get("news") or []):
            payload = await self._search(query=query, language="en")
        aliases = self._aliases(
            payload,
            symbol=symbol,
            company=company,
        )
        items = self._parse_items(
            payload,
            aliases=aliases,
            company=company,
        )
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
