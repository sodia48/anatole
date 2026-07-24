from __future__ import annotations

import asyncio
import hashlib
import html
import os
import re
from datetime import UTC, datetime
from html.parser import HTMLParser
from time import monotonic
from typing import Any
from urllib.parse import urljoin
from xml.etree import ElementTree

import httpx

from app.schemas.ipo_insiders import (
    IpoItem, IpoSnapshot, IpoSourceStatus, IpoSummary,
)


TMX_URL = "https://www.tsx.com/en/news/new-company-listings"
SEC_CURRENT_URL = "https://www.sec.gov/cgi-bin/browse-edgar"
CACHE_SECONDS = 1800
REQUEST_TIMEOUT_SECONDS = 18

INSTRUMENT_LABELS = {
    "company": "Société",
    "etf": "ETF",
    "cdr": "CDR",
    "fund": "Fonds",
    "other": "Autre",
}


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


def clean_text(value: Any) -> str:
    return " ".join(
        html.unescape(str(value or "")).replace("\xa0", " ").split()
    ).strip()


def parse_datetime(value: str) -> datetime | None:
    text = clean_text(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    except ValueError:
        pass
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def extract_company_symbols(value: str) -> tuple[str, list[str]]:
    text = clean_text(value)
    match = re.search(r"\(([^()]*)\)\s*$", text)
    if match is None:
        return text, []
    company = text[:match.start()].strip()
    symbols = [part.strip().upper() for part in match.group(1).split(",") if part.strip()]
    return company or text, symbols


def classify_instrument(company: str) -> str:
    text = f" {company.lower()} "
    if " cdr " in text or "cdr (" in text:
        return "cdr"
    if any(token in text for token in (" etf ", "exchange traded fund", "highshares", "coreshares")):
        return "etf"
    if any(token in text for token in (" fund ", " fonds ", " portfolio ", " pool ", " class ")):
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


def find_node(entry: ElementTree.Element, name: str) -> ElementTree.Element | None:
    namespace = "{http://www.w3.org/2005/Atom}"
    node = entry.find(f"{namespace}{name}")
    return node if node is not None else entry.find(name)


def sec_company_from_title(title: str, form: str) -> tuple[str, str]:
    text = clean_text(title)
    text = re.sub(rf"^\s*{re.escape(form)}\s*[-:]\s*", "", text, flags=re.I)
    text = re.sub(r"\s*\(CIK[^)]*\)\s*$", "", text, flags=re.I).strip()
    symbol_match = re.search(r"\(([A-Z][A-Z0-9.\-]{1,9})\)\s*$", text)
    symbol = ""
    if symbol_match is not None:
        symbol = symbol_match.group(1)
        text = text[:symbol_match.start()].strip()
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
            if link_node is not None else "https://www.sec.gov/search-filings"
        )
        output.append(
            IpoItem(
                id=item_id("sec", form, company, source_url),
                event_date=parse_datetime(updated_node.text if updated_node is not None else ""),
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


def deduplicate_ipo_items(items: list[IpoItem]) -> list[IpoItem]:
    output: list[IpoItem] = []
    seen: set[tuple[str, str, str, str]] = set()
    for item in sorted(
        items,
        key=lambda current: current.event_date or datetime.min.replace(tzinfo=UTC),
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

    @staticmethod
    def headers(sec: bool = False) -> dict[str, str]:
        if sec:
            return {
                "User-Agent": os.getenv(
                    "SEC_USER_AGENT",
                    "Anatole/0.5 https://github.com/sodia48/anatole",
                ),
                "Accept": "application/atom+xml,application/xml,text/xml,*/*",
            }
        return {
            "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/149 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
        }

    async def download_tmx(self, client):
        try:
            response = await client.get(TMX_URL, headers=self.headers())
            response.raise_for_status()
            items = parse_tmx_listings(response.text)
            return items, IpoSourceStatus(
                source="TMX",
                status="available" if items else "partial",
                count=len(items),
                detail=None if items else "Table vide ou structure modifiée.",
                url=TMX_URL,
            )
        except Exception as exc:
            return [], IpoSourceStatus(
                source="TMX", status="unavailable", count=0,
                detail=type(exc).__name__, url=TMX_URL,
            )

    async def download_sec(self, client, form: str):
        try:
            response = await client.get(
                SEC_CURRENT_URL,
                params={"action": "getcurrent", "type": form, "owner": "exclude", "count": "60", "output": "atom"},
                headers=self.headers(sec=True),
            )
            response.raise_for_status()
            items = parse_sec_atom(response.text, form)
            return items, IpoSourceStatus(
                source=f"SEC {form}",
                status="available" if items else "partial",
                count=len(items),
                detail=None if items else "Aucun dépôt récent dans le flux.",
                url="https://www.sec.gov/search-filings",
            )
        except Exception as exc:
            return [], IpoSourceStatus(
                source=f"SEC {form}", status="unavailable", count=0,
                detail=type(exc).__name__, url="https://www.sec.gov/search-filings",
            )

    async def snapshot(self, force_refresh: bool = False) -> IpoSnapshot:
        now = monotonic()
        if not force_refresh and self._cached and now - self._cached_at < CACHE_SECONDS:
            return self._cached
        async with self._lock:
            if not force_refresh and self._cached and monotonic() - self._cached_at < CACHE_SECONDS:
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
                    update={"sources": sources, "message": "Dernières données conservées; sources indisponibles."}
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
