from __future__ import annotations

import asyncio
import hashlib
import html
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
from time import monotonic
from typing import Any
from urllib.parse import urljoin
from xml.etree import ElementTree

import httpx

from app.schemas.ipo_insiders import (
    IpoItem,
    IpoSnapshot,
    IpoSourceStatus,
    IpoSummary,
)


TMX_URL = "https://www.tsx.com/en/news/new-company-listings"
SEC_CURRENT_URL = "https://www.sec.gov/cgi-bin/browse-edgar"
CACHE_SECONDS = 1800
REQUEST_TIMEOUT_SECONDS = 22
PRICE_ENRICHMENT_LIMIT = int(os.getenv("IPO_PRICE_ENRICHMENT_LIMIT", "90"))
PRICE_CONCURRENCY = max(2, int(os.getenv("IPO_PRICE_CONCURRENCY", "8")))

INSTRUMENT_LABELS = {
    "company": "Société",
    "etf": "ETF",
    "cdr": "CDR",
    "fund": "Fonds",
    "other": "Autre",
}


@dataclass(frozen=True)
class PriceData:
    status: str = "not_published"
    price: float | None = None
    low: float | None = None
    high: float | None = None
    currency: str = ""
    label: str = "Prix non publié"
    source_url: str | None = None

    @property
    def published(self) -> bool:
        return self.status != "not_published"


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[dict[str, str]]] = []
        self._row: list[dict[str, str]] | None = None
        self._cell: dict[str, str] | None = None
        self._parts: list[str] = []
        self._href = ""

    def handle_starttag(self, tag, attrs) -> None:
        tag = tag.lower()
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = {"text": "", "href": ""}
            self._parts = []
            self._href = ""
        elif tag == "a" and self._cell is not None:
            self._href = str(dict(attrs).get("href") or "")

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self._cell is not None:
            self._cell["text"] = " ".join(" ".join(self._parts).split())
            self._cell["href"] = self._href
            if self._row is not None:
                self._row.append(self._cell)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None


class PlainTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        cleaned = clean_text(data)
        if cleaned:
            self.parts.append(cleaned)

    def text(self) -> str:
        return " ".join(self.parts)


def clean_text(value: Any) -> str:
    return " ".join(
        html.unescape(str(value or "")).replace("\xa0", " ").split()
    ).strip()


def html_to_text(value: str) -> str:
    parser = PlainTextParser()
    parser.feed(value)
    return parser.text()


def parse_datetime(value: str) -> datetime | None:
    text = clean_text(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return (
            parsed.replace(tzinfo=UTC)
            if parsed.tzinfo is None
            else parsed.astimezone(UTC)
        )
    except ValueError:
        pass
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def parse_number(value: str) -> float | None:
    try:
        return float(value.replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def normalize_currency(token: str, default: str) -> str:
    value = clean_text(token).upper().replace(" ", "")
    if value in {"C$", "CAD", "CAD$", "CDN$", "CDN"}:
        return "CAD"
    if value in {"US$", "USD", "USD$"}:
        return "USD"
    if value == "$":
        return default
    return default


def price_label(
    status: str,
    *,
    price: float | None = None,
    low: float | None = None,
    high: float | None = None,
    currency: str = "",
) -> str:
    suffix = f" {currency}" if currency else ""
    if status == "final" and price is not None:
        return f"{price:,.2f}{suffix}"
    if status == "range" and low is not None and high is not None:
        return f"{low:,.2f}–{high:,.2f}{suffix}"
    if status == "reference" and price is not None:
        return f"≈ {price:,.2f}{suffix}"
    return "Prix non publié"


def extract_company_symbols(value: str) -> tuple[str, list[str]]:
    text = clean_text(value)
    match = re.search(r"\(([^()]*)\)\s*$", text)
    if match is None:
        return text, []
    company = text[: match.start()].strip()
    symbols = [
        part.strip().upper()
        for part in match.group(1).split(",")
        if part.strip()
    ]
    return company or text, symbols


def classify_instrument(company: str) -> str:
    text = f" {company.lower()} "
    if " cdr " in text or "cdr (" in text:
        return "cdr"
    if any(
        token in text
        for token in (" etf ", "exchange traded fund", "highshares", "coreshares")
    ):
        return "etf"
    if any(
        token in text
        for token in (" fund ", " fonds ", " portfolio ", " pool ", " class ")
    ):
        return "fund"
    if any(token in text for token in (" warrant", " debenture", " notes ")):
        return "other"
    return "company"


def item_id(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:18]


def parse_tmx_listings(html_text: str) -> list[IpoItem]:
    parser = TableParser()
    parser.feed(html_text)
    output: list[IpoItem] = []
    for row in parser.rows:
        if len(row) < 2:
            continue
        date_text = clean_text(row[0].get("text"))
        company_text = clean_text(row[1].get("text"))
        if not date_text or not company_text or date_text.lower() == "date":
            continue
        event_date = parse_datetime(date_text)
        if event_date is None:
            continue
        company, symbols = extract_company_symbols(company_text)
        instrument_type = classify_instrument(company)
        symbol = symbols[0] if symbols else ""
        output.append(
            IpoItem(
                id=item_id("tmx", event_date.date().isoformat(), company, symbol),
                event_date=event_date,
                company=company,
                symbol=symbol,
                symbols=symbols,
                exchange="TSX / TSXV",
                country="Canada",
                event_type="Nouvelle inscription",
                status="Cotée",
                instrument_type=instrument_type,
                instrument_label=INSTRUMENT_LABELS[instrument_type],
                source_name="TMX — nouvelles inscriptions",
                source_url=urljoin(TMX_URL, row[1].get("href") or TMX_URL),
                official=True,
                confidence_score=95,
                focus_available=instrument_type == "company" and bool(symbol),
            )
        )
    return output


def parse_tmx_issue_price(html_text: str, source_url: str = "") -> PriceData:
    text = html_to_text(html_text)
    trading_currency_match = re.search(
        r"Trading currency\s*:?\s*(CDN\$|CAD\$?|C\$|USD\$?|US\$)",
        text,
        flags=re.IGNORECASE,
    )
    default_currency = normalize_currency(
        trading_currency_match.group(1) if trading_currency_match else "CAD",
        "CAD",
    )
    match = re.search(
        r"Issue price per security\s*:?\s*"
        r"(?P<currency>CDN\$|CAD\$?|C\$|USD\$?|US\$|\$)?\s*"
        r"(?P<price>[0-9][0-9,]*(?:\.[0-9]+)?)",
        text,
        flags=re.IGNORECASE,
    )
    if match is None:
        match = re.search(
            r"(?:Initial public offering|Offering) price(?: per security)?\s*:?\s*"
            r"(?P<currency>CDN\$|CAD\$?|C\$|USD\$?|US\$|\$)?\s*"
            r"(?P<price>[0-9][0-9,]*(?:\.[0-9]+)?)",
            text,
            flags=re.IGNORECASE,
        )
    if match is None:
        return PriceData(source_url=source_url or None)
    price = parse_number(match.group("price"))
    if price is None:
        return PriceData(source_url=source_url or None)
    currency = normalize_currency(match.group("currency") or "", default_currency)
    return PriceData(
        status="final",
        price=price,
        currency=currency,
        label=price_label("final", price=price, currency=currency),
        source_url=source_url or None,
    )


def find_node(entry: ElementTree.Element, name: str) -> ElementTree.Element | None:
    namespace = "{http://www.w3.org/2005/Atom}"
    node = entry.find(f"{namespace}{name}")
    return node if node is not None else entry.find(name)


def sec_company_from_title(title: str, form: str) -> tuple[str, str]:
    text = clean_text(title)
    text = re.sub(
        r"^\s*(?:S-1MEF|S-1/A|S-1|F-1/A|F-1|424B4)\s*[-:]\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\s*\(\d{7,12}\)\s*\(Filer\)\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\s*\(CIK[^)]*\)\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()
    symbol_match = re.search(r"\(([A-Z][A-Z0-9.\-]{1,9})\)\s*$", text)
    symbol = ""
    if symbol_match is not None:
        symbol = symbol_match.group(1)
        text = text[: symbol_match.start()].strip()
    return text, symbol


def parse_sec_atom(xml_text: str, form: str) -> list[IpoItem]:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return []
    namespace = "{http://www.w3.org/2005/Atom}"
    entries = root.findall(f"{namespace}entry") or root.findall("entry")
    output: list[IpoItem] = []
    for entry in entries:
        title_node = find_node(entry, "title")
        updated_node = find_node(entry, "updated")
        link_node = find_node(entry, "link")
        company, symbol = sec_company_from_title(
            title_node.text if title_node is not None else "", form
        )
        if not company:
            continue
        source_url = (
            str(link_node.attrib.get("href") or "")
            if link_node is not None
            else "https://www.sec.gov/search-filings"
        )
        output.append(
            IpoItem(
                id=item_id("sec", form, company, source_url),
                event_date=parse_datetime(
                    updated_node.text if updated_node is not None else ""
                ),
                company=company,
                symbol=symbol,
                symbols=[symbol] if symbol else [],
                exchange="NYSE / Nasdaq à confirmer",
                country="États-Unis",
                event_type=f"Dépôt réglementaire {form}",
                status="Dossier déposé",
                instrument_type="company",
                instrument_label="Société",
                source_name=f"SEC EDGAR — formulaire {form}",
                source_url=source_url,
                official=True,
                confidence_score=85,
                focus_available=False,
            )
        )
    return output


def extract_sec_primary_document_url(index_html: str, index_url: str) -> str | None:
    for row_match in re.finditer(
        r"<tr[^>]*>(?P<row>.*?)</tr>",
        index_html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        row = row_match.group("row")
        if not re.search(
            r">\s*(?:S-1MEF|S-1/A|S-1|F-1/A|F-1|424B4)\s*<",
            row,
            flags=re.IGNORECASE,
        ):
            continue
        href_match = re.search(
            r'href=["\'](?P<href>[^"\']+\.(?:htm|html))["\']',
            row,
            flags=re.IGNORECASE,
        )
        if href_match:
            return urljoin(index_url, href_match.group("href"))
    for href in re.findall(
        r'href=["\']([^"\']+\.(?:htm|html))["\']',
        index_html,
        flags=re.IGNORECASE,
    ):
        if "-index." not in href.lower() and "/ixviewer/" not in href.lower():
            return urljoin(index_url, href)
    return None


def _currency_and_number(match: re.Match[str], default: str = "USD") -> tuple[str, float | None]:
    currency = normalize_currency(match.groupdict().get("currency") or "", default)
    value = parse_number(match.group("price"))
    return currency, value


def parse_sec_offer_price(html_text: str, source_url: str = "") -> PriceData:
    text = html_to_text(html_text)

    range_patterns = (
        r"(?:initial public offering price|public offering price|offering price|price range)"
        r".{0,180}?(?:between|from)\s*"
        r"(?P<currency>US\$|USD\$?|C\$|CAD\$?|\$)?\s*"
        r"(?P<low>[0-9][0-9,]*(?:\.[0-9]+)?)\s*"
        r"(?:and|to|through|-)\s*"
        r"(?P<currency2>US\$|USD\$?|C\$|CAD\$?|\$)?\s*"
        r"(?P<high>[0-9][0-9,]*(?:\.[0-9]+)?)",
        r"(?:between|from)\s*"
        r"(?P<currency>US\$|USD\$?|C\$|CAD\$?|\$)?\s*"
        r"(?P<low>[0-9][0-9,]*(?:\.[0-9]+)?)\s*"
        r"(?:and|to|through|-)\s*"
        r"(?P<currency2>US\$|USD\$?|C\$|CAD\$?|\$)?\s*"
        r"(?P<high>[0-9][0-9,]*(?:\.[0-9]+)?)"
        r".{0,100}?(?:per share|per unit|initial public offering)",
    )
    for pattern in range_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match is None:
            continue
        low = parse_number(match.group("low"))
        high = parse_number(match.group("high"))
        if low is None or high is None or low <= 0 or high < low:
            continue
        currency = normalize_currency(
            match.group("currency") or match.group("currency2") or "",
            "USD",
        )
        return PriceData(
            status="range",
            low=low,
            high=high,
            currency=currency,
            label=price_label("range", low=low, high=high, currency=currency),
            source_url=source_url or None,
        )

    reference_match = re.search(
        r"(?:assumed|estimated)\s+(?:initial\s+)?public offering price"
        r".{0,80}?(?:of|is|at)\s*"
        r"(?P<currency>US\$|USD\$?|C\$|CAD\$?|\$)?\s*"
        r"(?P<price>[0-9][0-9,]*(?:\.[0-9]+)?)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if reference_match is not None:
        currency, value = _currency_and_number(reference_match)
        if value is not None and value > 0:
            return PriceData(
                status="reference",
                price=value,
                currency=currency,
                label=price_label("reference", price=value, currency=currency),
                source_url=source_url or None,
            )

    final_patterns = (
        r"(?:initial public offering price|public offering price|offering price)"
        r"(?:\s+(?:for|of)\s+.{0,100}?)?\s*"
        r"(?:is|was|will be|of|at)\s*"
        r"(?P<currency>US\$|USD\$?|C\$|CAD\$?|\$)?\s*"
        r"(?P<price>[0-9][0-9,]*(?:\.[0-9]+)?)"
        r"(?:\s+per\s+(?:share|unit|ADS|common share))?",
        r"(?:we are offering|we are offering to sell).{0,220}?"
        r"(?:at an offering price of|at a price to the public of)\s*"
        r"(?P<currency>US\$|USD\$?|C\$|CAD\$?|\$)?\s*"
        r"(?P<price>[0-9][0-9,]*(?:\.[0-9]+)?)",
        r"Public offering price\s*(?:per\s+[^$]{0,60})?\s*"
        r"(?P<currency>US\$|USD\$?|C\$|CAD\$?|\$)\s*"
        r"(?P<price>[0-9][0-9,]*(?:\.[0-9]+)?)",
    )
    for pattern in final_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match is None:
            continue
        currency, value = _currency_and_number(match)
        if value is None or value <= 0:
            continue
        return PriceData(
            status="final",
            price=value,
            currency=currency,
            label=price_label("final", price=value, currency=currency),
            source_url=source_url or None,
        )

    return PriceData(source_url=source_url or None)


def apply_price(item: IpoItem, price: PriceData) -> IpoItem:
    if not price.published:
        return item
    confidence = item.confidence_score
    if price.status == "final":
        confidence = max(confidence, 97)
    elif price.status == "range":
        confidence = max(confidence, 92)
    elif price.status == "reference":
        confidence = max(confidence, 78)
    return item.model_copy(
        update={
            "offer_price": price.price,
            "offer_price_low": price.low,
            "offer_price_high": price.high,
            "offer_currency": price.currency,
            "offer_price_status": price.status,
            "offer_price_label": price.label,
            "price_source_url": price.source_url,
            "confidence_score": confidence,
        }
    )


def deduplicate_ipo_items(items: list[IpoItem]) -> list[IpoItem]:
    output: list[IpoItem] = []
    seen: set[tuple[str, str, str, str]] = set()
    for item in sorted(
        items,
        key=lambda current: current.event_date
        or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    ):
        key = (
            item.country,
            item.symbol,
            re.sub(r"[^a-z0-9]+", "", item.company.lower()),
            item.event_type.split()[-1],
        )
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def summarize_ipo(items: list[IpoItem]) -> IpoSummary:
    return IpoSummary(
        total=len(items),
        canada=sum(item.country == "Canada" for item in items),
        united_states=sum(item.country == "États-Unis" for item in items),
        companies=sum(item.instrument_type == "company" for item in items),
        newly_listed=sum(item.status == "Cotée" for item in items),
        regulatory_filings=sum(item.status == "Dossier déposé" for item in items),
    )


class IpoService:
    def __init__(self) -> None:
        self._cached: IpoSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()
        self._price_cache: dict[str, tuple[float, PriceData]] = {}

    @staticmethod
    def headers(sec: bool = False) -> dict[str, str]:
        if sec:
            return {
                "User-Agent": os.getenv(
                    "SEC_USER_AGENT",
                    "Anatole/0.5.2 https://github.com/sodia48/anatole",
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml,text/xml,*/*",
            }
        return {
            "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/149 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
        }

    async def cached_price(self, key: str) -> PriceData | None:
        cached = self._price_cache.get(key)
        if cached and monotonic() - cached[0] < CACHE_SECONDS * 4:
            return cached[1]
        return None

    async def tmx_price(
        self,
        client: httpx.AsyncClient,
        item: IpoItem,
    ) -> PriceData:
        cached = await self.cached_price(item.source_url)
        if cached is not None:
            return cached
        if not item.source_url or item.source_url.rstrip("/") == TMX_URL.rstrip("/"):
            return PriceData()
        try:
            response = await client.get(item.source_url, headers=self.headers())
            response.raise_for_status()
            price = parse_tmx_issue_price(response.text, item.source_url)
        except Exception:
            price = PriceData(source_url=item.source_url)
        self._price_cache[item.source_url] = (monotonic(), price)
        return price

    async def sec_price(
        self,
        client: httpx.AsyncClient,
        item: IpoItem,
    ) -> PriceData:
        cached = await self.cached_price(item.source_url)
        if cached is not None:
            return cached
        if not item.source_url:
            return PriceData()
        document_url = item.source_url
        try:
            response = await client.get(item.source_url, headers=self.headers(sec=True))
            response.raise_for_status()
            source_text = response.text
            if "-index." in item.source_url.lower() or "Filing Detail" in source_text:
                primary = extract_sec_primary_document_url(source_text, item.source_url)
                if primary:
                    document_url = primary
                    document_response = await client.get(
                        primary,
                        headers=self.headers(sec=True),
                    )
                    document_response.raise_for_status()
                    source_text = document_response.text
            price = parse_sec_offer_price(source_text, document_url)
        except Exception:
            price = PriceData(source_url=document_url)
        self._price_cache[item.source_url] = (monotonic(), price)
        return price

    async def enrich_prices(
        self,
        client: httpx.AsyncClient,
        items: list[IpoItem],
    ) -> list[IpoItem]:
        candidates = [
            item
            for item in items
            if item.instrument_type == "company"
        ][:PRICE_ENRICHMENT_LIMIT]
        candidate_ids = {item.id for item in candidates}
        semaphore = asyncio.Semaphore(PRICE_CONCURRENCY)

        async def enrich(item: IpoItem) -> IpoItem:
            if item.id not in candidate_ids:
                return item
            async with semaphore:
                price = (
                    await self.tmx_price(client, item)
                    if item.country == "Canada"
                    else await self.sec_price(client, item)
                )
                return apply_price(item, price)

        return list(await asyncio.gather(*(enrich(item) for item in items)))

    async def download_tmx(self, client: httpx.AsyncClient):
        try:
            response = await client.get(TMX_URL, headers=self.headers())
            response.raise_for_status()
            items = parse_tmx_listings(response.text)
            items = await self.enrich_prices(client, items)
            price_count = sum(item.offer_price_status != "not_published" for item in items)
            return items, IpoSourceStatus(
                source="TMX",
                status="available" if items else "partial",
                count=len(items),
                detail=(
                    f"{price_count} prix d’émission officiels récupérés."
                    if items
                    else "Table vide ou structure modifiée."
                ),
                url=TMX_URL,
            )
        except Exception as exc:
            return [], IpoSourceStatus(
                source="TMX",
                status="unavailable",
                count=0,
                detail=type(exc).__name__,
                url=TMX_URL,
            )

    async def download_sec(self, client: httpx.AsyncClient, form: str):
        try:
            response = await client.get(
                SEC_CURRENT_URL,
                params={
                    "action": "getcurrent",
                    "type": form,
                    "owner": "exclude",
                    "count": "60",
                    "output": "atom",
                },
                headers=self.headers(sec=True),
            )
            response.raise_for_status()
            items = parse_sec_atom(response.text, form)
            items = await self.enrich_prices(client, items)
            price_count = sum(item.offer_price_status != "not_published" for item in items)
            return items, IpoSourceStatus(
                source=f"SEC {form}",
                status="available" if items else "partial",
                count=len(items),
                detail=(
                    f"{price_count} prix ou fourchettes publiés dans les prospectus."
                    if items
                    else "Aucun dépôt récent dans le flux."
                ),
                url="https://www.sec.gov/search-filings",
            )
        except Exception as exc:
            return [], IpoSourceStatus(
                source=f"SEC {form}",
                status="unavailable",
                count=0,
                detail=type(exc).__name__,
                url="https://www.sec.gov/search-filings",
            )

    async def snapshot(self, force_refresh: bool = False) -> IpoSnapshot:
        now = monotonic()
        if (
            not force_refresh
            and self._cached
            and now - self._cached_at < CACHE_SECONDS
        ):
            return self._cached
        async with self._lock:
            if (
                not force_refresh
                and self._cached
                and monotonic() - self._cached_at < CACHE_SECONDS
            ):
                return self._cached
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(REQUEST_TIMEOUT_SECONDS, connect=10),
                follow_redirects=True,
            ) as client:
                results = await asyncio.gather(
                    self.download_tmx(client),
                    self.download_sec(client, "S-1"),
                    self.download_sec(client, "F-1"),
                )
            items: list[IpoItem] = []
            sources: list[IpoSourceStatus] = []
            for source_items, source_status in results:
                items.extend(source_items)
                sources.append(source_status)
            items = deduplicate_ipo_items(items)
            if not items and self._cached is not None:
                return self._cached.model_copy(
                    update={
                        "sources": sources,
                        "message": "Dernières données conservées; sources indisponibles.",
                    }
                )
            snapshot = IpoSnapshot(
                items=items,
                summary=summarize_ipo(items),
                sources=sources,
                generated_at=datetime.now(UTC),
                message=None if items else "Aucun événement officiel récupéré.",
            )
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot


ipo_service = IpoService()
