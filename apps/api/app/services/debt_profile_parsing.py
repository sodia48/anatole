"""Bounded extraction of labelled observations from official issuer HTML."""

from __future__ import annotations

import asyncio
import math
import re
from datetime import UTC, datetime
from html.parser import HTMLParser

from app.core.data_hub import shared_data_hub
from app.core.resilience import shared_http_client

MAX_HTML = 1_000_000
_pages = shared_data_hub.cache("official-debt-profile-pages", max_entries=32)


class Document(HTMLParser):
    """Keep visible text, accessible image descriptions and separate closed tables."""

    def __init__(self, html: str) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.tables: list[list[list[str]]] = []
        self.table: list[list[str]] | None = None
        self.row: list[str] | None = None
        self.cell: list[str] | None = None
        self.hidden = 0
        if len(html) <= MAX_HTML:
            self.feed(html)
        self.text = " ".join(" ".join(self.parts).split())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self.hidden += 1
        if self.hidden:
            return
        if tag == "img":
            self.parts.append(dict(attrs).get("alt") or "")
        if tag == "table":
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []

    def handle_data(self, data: str) -> None:
        if self.hidden:
            return
        self.parts.append(data)
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        if self.hidden:
            return
        if tag in {"td", "th"} and self.cell is not None and self.row is not None:
            self.row.append(" ".join(" ".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None and self.table is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def number(raw: str, *, french: bool = False) -> float | None:
    value = re.sub(r"\s", "", raw)
    pattern = r"\d+(?:,\d+)?" if french else r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?"
    if not re.fullmatch(pattern, value):
        return None
    result = float(value.replace(",", "." if french else ""))
    return result if math.isfinite(result) and 0 <= result <= 1_000_000_000_000 else None


def dated(raw: str) -> datetime | None:
    value = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", raw.strip())
    months = {"janvier": "January", "février": "February", "mars": "March", "avril": "April",
              "mai": "May", "juin": "June", "juillet": "July", "août": "August",
              "septembre": "September", "octobre": "October", "novembre": "November", "décembre": "December"}
    for fr, en in months.items():
        value = re.sub(rf"\b{fr}\b", en, value, flags=re.I)
    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%d %B %Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def fiscal(raw: str) -> str | None:
    match = re.fullmatch(r"(20\d{2})[–/-](\d{2}|20\d{2})", raw)
    if not match:
        return None
    start, end = int(match[1]), int(match[2][-2:])
    return f"{start}-{end:02d}" if (start + 1) % 100 == end else None


async def official_html(url: str) -> str | None:
    """Only called with registry URLs; cache successful responses, never fabricate a date."""
    async def load() -> str:
        async with asyncio.timeout(4):
            response = await shared_http_client.request("GET", url, attempts=1, timeout=3.0)
        response.raise_for_status()
        if len(response.content) > MAX_HTML:
            return ""  # Accessible source, but deliberately not parsed beyond our bound.
        if "verifying your browser before proceeding" in response.text.lower():
            raise ValueError("Official content is behind a browser verification page")
        return response.text

    try:
        return await _pages.get_or_load(url, load, fresh_seconds=900, stale_seconds=900)
    except Exception:
        return None
