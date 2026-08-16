from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin

import httpx

from app.services.provincial_essential_policy import classify_essential_release


@dataclass(frozen=True, slots=True)
class StatisticalRelease:
    source: str
    region: str
    title: str
    summary: str
    url: str
    category: str
    importance_score: int
    published_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class PageSpec:
    source: str
    region: str
    category: str
    url: str


# Statistique Québec offre des pages d'indicateurs très stables et précises.
QUEBEC_PAGES: tuple[PageSpec, ...] = (
    PageSpec(
        "Statistique Québec",
        "QC",
        "PIB",
        "https://statistique.quebec.ca/fr/produit/publication/produit-interieur-brut-industrie",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Emploi",
        "https://statistique.quebec.ca/fr/document/resultats-de-lenquete-sur-la-population-active-pour-le-quebec/publication/resultats-enquete-population-active-quebec",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Inflation",
        "https://statistique.quebec.ca/fr/produit/publication/indice-prix-consommation",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Consommation",
        "https://statistique.quebec.ca/fr/produit/publication/ventes-detail",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Industrie",
        "https://statistique.quebec.ca/fr/produit/publication/ventes-biens-fabriques",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Commerce",
        "https://statistique.quebec.ca/fr/produit/publication/commerce-international-marchandises",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Logement",
        "https://statistique.quebec.ca/fr/produit/publication/mises-chantier",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Logement",
        "https://statistique.quebec.ca/fr/produit/publication/permis-batir",
    ),
    PageSpec(
        "Statistique Québec",
        "QC",
        "Salaires",
        "https://statistique.quebec.ca/fr/produit/publication/remuneration-hebdomadaire-moyenne",
    ),
)

ONTARIO_PAGES: tuple[PageSpec, ...] = (
    PageSpec(
        "Ontario Economic Accounts",
        "ON",
        "PIB",
        "https://www.ontario.ca/page/ontario-economic-accounts",
    ),
)


def page_specs_for_region(region: str) -> tuple[PageSpec, ...]:
    region = str(region or "").strip().upper()
    if region == "QC":
        return QUEBEC_PAGES
    if region == "ON":
        return ONTARIO_PAGES
    return ()


class _ArticleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._tag = ""
        self._skip = 0
        self.h1: list[str] = []
        self.paragraphs: list[str] = []
        self._current: list[str] = []
        self._current_tag = ""

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "nav", "footer"}:
            self._skip += 1
            return
        if self._skip:
            return
        if tag in {"h1", "p"}:
            self._current_tag = tag
            self._current = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "nav", "footer"} and self._skip:
            self._skip -= 1
            return
        if self._skip:
            return
        if tag == self._current_tag and self._current_tag:
            text = re.sub(r"\s+", " ", " ".join(self._current)).strip()
            if text:
                if tag == "h1":
                    self.h1.append(text)
                else:
                    self.paragraphs.append(text)
            self._current_tag = ""
            self._current = []

    def handle_data(self, data: str) -> None:
        if self._skip or not self._current_tag:
            return
        value = re.sub(r"\s+", " ", unescape(data or "")).strip()
        if value:
            self._current.append(value)


_DATE_PATTERNS = (
    re.compile(r"Mise à jour\s*:\s*(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})", re.I),
    re.compile(r"Diffusion\s*:\s*(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})", re.I),
)

_MONTHS_FR = {
    "janvier": 1,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "décembre": 12,
}


def _parse_explicit_date(text: str) -> datetime | None:
    for pattern in _DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        day, month_name, year = match.groups()
        month = _MONTHS_FR.get(month_name.casefold())
        if month:
            return datetime(int(year), month, int(day), 12, tzinfo=UTC)
    return None


def _parse_last_modified(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except (TypeError, ValueError, OverflowError):
        return None


def _clean_summary(paragraphs: list[str], source: str) -> str:
    ignored_starts = (
        "les faits saillants économiques permettent",
        "learn about ontario",
        "on this page",
        "skip to",
    )
    for paragraph in paragraphs:
        clean = re.sub(r"\s+", " ", paragraph).strip()
        if len(clean) < 55:
            continue
        lowered = clean.casefold()
        if any(lowered.startswith(prefix) for prefix in ignored_starts):
            continue
        return clean[:700]
    return ""


def parse_release_page(
    html_text: str,
    spec: PageSpec,
    *,
    last_modified: str | None = None,
) -> StatisticalRelease | None:
    parser = _ArticleParser()
    parser.feed(html_text)

    title = parser.h1[0].strip() if parser.h1 else ""
    summary = _clean_summary(parser.paragraphs, spec.source)
    if not title or not summary:
        return None

    whole = re.sub(r"\s+", " ", unescape(html_text))
    published_at = _parse_explicit_date(whole) or _parse_last_modified(last_modified)

    decision = classify_essential_release(
        title,
        summary,
        source_kind="statistics",
    )
    category = decision.category or spec.category
    score = max(decision.score, 82)

    return StatisticalRelease(
        source=spec.source,
        region=spec.region,
        title=title,
        summary=summary,
        url=spec.url,
        category=category,
        importance_score=score,
        published_at=published_at,
    )


async def _fetch_one(
    client: httpx.AsyncClient,
    spec: PageSpec,
) -> StatisticalRelease | None:
    response = await client.get(spec.url)
    response.raise_for_status()
    return parse_release_page(
        response.text,
        spec,
        last_modified=response.headers.get("last-modified"),
    )


async def fetch_primary_statistical_releases(
    region: str,
) -> list[StatisticalRelease]:
    specs = page_specs_for_region(region)
    if not specs:
        return []

    timeout = httpx.Timeout(connect=7.0, read=12.0, write=7.0, pool=7.0)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/150.0 Safari/537.36 Anatole/1.4.1"
        ),
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "Accept-Language": "fr-CA,fr;q=0.9,en-CA;q=0.7,en;q=0.6",
    }

    async with httpx.AsyncClient(
        timeout=timeout,
        headers=headers,
        follow_redirects=True,
    ) as client:
        results = await asyncio.gather(
            *(_fetch_one(client, spec) for spec in specs),
            return_exceptions=True,
        )

    releases = [
        result
        for result in results
        if isinstance(result, StatisticalRelease)
    ]
    releases.sort(
        key=lambda item: item.published_at or datetime(1970, 1, 1, tzinfo=UTC),
        reverse=True,
    )
    return releases
