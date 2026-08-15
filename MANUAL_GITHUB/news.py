from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from time import monotonic
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from xml.etree import ElementTree

import httpx

from app.schemas.discovery import FeedStatus, NewsItem, NewsSnapshot
from app.services.regions import economic_regions, province_region

logger = logging.getLogger(__name__)

NEWS_LANGUAGES = ("fr", "en")

BANK_FEEDS = {
    "fr": (
        (
            "Banque du Canada",
            "Politique monétaire",
            "https://www.banqueducanada.ca/utility/nouvelles/feed/",
        ),
        (
            "Banque du Canada",
            "Communiqués",
            "https://www.banqueducanada.ca/content_type/communiques/feed/",
        ),
    ),
    "en": (
        (
            "Banque du Canada",
            "Politique monétaire",
            "https://www.bankofcanada.ca/utility/news/feed/",
        ),
        (
            "Banque du Canada",
            "Communiqués",
            "https://www.bankofcanada.ca/content_type/press-releases/feed/",
        ),
    ),
}

STATCAN_SOURCE = "Statistique Canada"
STATCAN_URLS = {
    "fr": "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-fra.atom",
    "en": "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom",
}
STATCAN_CATEGORIES = (
    "Comptes économiques",
    "Travail",
    "Commerce international",
    "Énergie",
)


def _statcan_proxy_url(
    resource: str,
    language: str,
) -> str | None:
    """Return the whitelisted StatCan relay URL when configured."""
    base = os.getenv("STATCAN_PROXY_URL", "").strip()
    if not base:
        return None
    separator = "&" if "?" in base else "?"
    return (
        f"{base}{separator}"
        f"{urlencode({'resource': resource, 'lang': language})}"
    )

CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Comptes économiques": (
        "economic accounts",
        "national accounts",
        "gross domestic product",
        "gdp",
        "productivity",
        "balance sheet",
        "input-output",
        "income and expenditure accounts",
        "economic and social reports",
        "comptes économiques",
        "comptes nationaux",
        "produit intérieur brut",
        "pib",
        "productivité",
        "bilan national",
        "comptes des revenus et dépenses",
        "entrées-sorties",
    ),
    "Travail": (
        "labour",
        "labor",
        "employment",
        "unemployment",
        "payroll",
        "job vacancy",
        "job vacancies",
        "wage",
        "wages",
        "earnings",
        "work hours",
        "travail",
        "emploi",
        "chômage",
        "population active",
        "enquête sur la population active",
        "postes vacants",
        "rémunération",
        "salaires",
        "gains",
        "heures travaillées",
    ),
    "Commerce international": (
        "international trade",
        "merchandise trade",
        "trade balance",
        "exports",
        "imports",
        "export",
        "import",
        "commerce international",
        "commerce de marchandises",
        "balance commerciale",
        "exportations",
        "importations",
        "exportation",
        "importation",
    ),
    "Énergie": (
        "energy",
        "electricity",
        "natural gas",
        "crude oil",
        "petroleum",
        "pipeline",
        "coal",
        "renewable",
        "refined petroleum",
        "énergie",
        "électricité",
        "gaz naturel",
        "pétrole brut",
        "produits pétroliers",
        "oléoduc",
        "pipeline",
        "charbon",
        "renouvelable",
    ),
}

# Public, official provincial feeds. These are additive to the federal feeds.
# Feeds that are already economic/finance-specific still pass through the
# economic classifier so Anatole does not flood the page with unrelated news.
PROVINCIAL_RSS_FEEDS = (
    (
        "QC",
        "Gouvernement du Québec",
        "https://www.quebec.ca/fil-de-presse.rss",
        ("fr",),
    ),
    (
        "SK",
        "Gouvernement de la Saskatchewan",
        "https://www.saskatchewan.ca/Feeds/NewsFeed.ashx",
        ("en",),
    ),
    (
        "NS",
        "Nouvelle-Écosse — Économie",
        "https://novascotia.ca/news/rss/rss.asp?dept=135",
        ("en",),
    ),
    (
        "NS",
        "Nouvelle-Écosse — Finances",
        "https://novascotia.ca/news/rss/rss.asp?dept=10",
        ("en",),
    ),
    (
        "PE",
        "Île-du-Prince-Édouard — Développement économique",
        "https://www.princeedwardisland.ca/en/department/news/1656/rss.xml",
        ("en",),
    ),
    (
        "PE",
        "Île-du-Prince-Édouard — Finances",
        "https://www.princeedwardisland.ca/en/department/news/1607/rss.xml",
        ("en",),
    ),
    (
        "BC",
        "Colombie-Britannique — Économie",
        "https://news.gov.bc.ca/sectors/economy/feed",
        ("en",),
    ),
    (
        "BC",
        "Colombie-Britannique — Finances",
        "https://news.gov.bc.ca/ministries/finance/feed",
        ("en",),
    ),
    (
        "BC",
        "Colombie-Britannique — Emploi et croissance",
        "https://news.gov.bc.ca/ministries/jobs-and-economic-growth/feed",
        ("en",),
    ),
    (
        "NL",
        "Terre-Neuve-et-Labrador",
        "https://www.releases.gov.nl.ca/rss/all-gnl-releases.xml",
        ("en",),
    ),
)

PROVINCIAL_ECONOMIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Finances publiques": (
        "budget", "fiscal", "tax", "taxes", "public accounts", "deficit",
        "surplus", "revenues", "revenue", "finances", "impot", "impôt",
        "comptes publics", "déficit", "excédent", "recettes",
    ),
    "Investissement": (
        "investment", "investing", "funding", "economic development",
        "business", "businesses", "productivity", "innovation", "trade mission",
        "investissement", "financement", "développement économique",
        "entreprise", "entreprises", "productivité", "innovation",
    ),
    "Travail": CATEGORY_KEYWORDS["Travail"],
    "Commerce": CATEGORY_KEYWORDS["Commerce international"] + (
        "interprovincial trade", "commerce interprovincial", "tariff", "tariffs",
        "tarif", "tarifs", "retail", "wholesale", "commerce de détail",
        "commerce de gros",
    ),
    "Énergie et ressources": CATEGORY_KEYWORDS["Énergie"] + (
        "mining", "mine", "critical mineral", "minerals", "forestry", "forest",
        "agriculture", "fishery", "fisheries", "aquaculture", "mines",
        "minier", "minéraux critiques", "foresterie", "forêt", "pêches",
    ),
    "Logement et construction": (
        "housing", "homebuilding", "home building", "construction", "infrastructure",
        "building", "logement", "habitation", "construction", "infrastructure",
    ),
    "Comptes économiques": CATEGORY_KEYWORDS["Comptes économiques"],
}


POSITIVE_WORDS = {
    "growth",
    "increase",
    "increased",
    "gain",
    "gains",
    "strong",
    "improve",
    "improved",
    "surplus",
    "croissance",
    "hausse",
    "progression",
    "solide",
    "amélioration",
    "excédent",
    "rebound",
    "reprise",
}
NEGATIVE_WORDS = {
    "decline",
    "declined",
    "decrease",
    "decreased",
    "loss",
    "weak",
    "slowdown",
    "deficit",
    "risk",
    "risks",
    "baisse",
    "recul",
    "perte",
    "faible",
    "ralentissement",
    "déficit",
    "risque",
    "risques",
    "contraction",
}

_ALLOWED_CONTENT_TYPES = (
    "application/rss+xml",
    "application/atom+xml",
    "application/xml",
    "text/xml",
)
_RETRYABLE_NETWORK_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadError,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
)
_TRACKING_QUERY_KEYS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
}
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


class FeedFormatError(ValueError):
    """Raised when an HTTP 200 response is not a usable RSS/Atom feed."""


@dataclass(frozen=True, slots=True)
class ParsedEntry:
    title: str
    summary: str
    url: str
    published_at: datetime
    subjects: tuple[str, ...] = ()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].split(":", 1)[-1].lower()


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html.unescape(value or ""))
    return re.sub(r"\s+", " ", text).strip()


def _normalise_text(value: str) -> str:
    return re.sub(r"\s+", " ", _strip_html(value).casefold()).strip()


def _normalise_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
        query = urlencode(
            [
                (key, val)
                for key, val in parse_qsl(parts.query, keep_blank_values=True)
                if key.casefold() not in _TRACKING_QUERY_KEYS
            ],
            doseq=True,
        )
        return urlunsplit(
            (
                parts.scheme.casefold(),
                parts.netloc.casefold(),
                parts.path.rstrip("/") or "/",
                query,
                "",
            )
        )
    except ValueError:
        return raw.casefold()


def _parse_datetime(value: str | None, *, source: str, title: str) -> datetime:
    raw = (value or "").strip()
    if not raw:
        logger.warning(
            "news_date_invalid source=%r title=%r reason=missing",
            source,
            title[:120],
        )
        return _EPOCH

    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except (TypeError, ValueError, OverflowError):
        pass

    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except (TypeError, ValueError, OverflowError):
        logger.warning(
            "news_date_invalid source=%r title=%r value=%r",
            source,
            title[:120],
            raw[:120],
        )
        return _EPOCH


def _sentiment(title: str, summary: str) -> tuple[str, float]:
    tokens = re.findall(r"[A-Za-zÀ-ÿ']+", f"{title} {summary}".lower())
    positive = sum(token in POSITIVE_WORDS for token in tokens)
    negative = sum(token in NEGATIVE_WORDS for token in tokens)
    score = max(-100.0, min(100.0, (positive - negative) * 18.0))
    label = "Positif" if score >= 18 else "Négatif" if score <= -18 else "Neutre"
    return label, score


def _child_text(node: ElementTree.Element, *names: str) -> str:
    wanted = {name.casefold() for name in names}
    for child in node:
        if _local_name(child.tag) in wanted:
            return "".join(child.itertext()).strip()
    return ""


def _entry_link(node: ElementTree.Element) -> str:
    fallback = ""
    for child in node:
        if _local_name(child.tag) != "link":
            continue
        href = (child.attrib.get("href") or "").strip()
        text = "".join(child.itertext()).strip()
        candidate = href or text
        if not candidate:
            continue
        rel = (child.attrib.get("rel") or "alternate").casefold()
        if rel == "alternate":
            return candidate
        if not fallback:
            fallback = candidate

    if fallback:
        return fallback

    guid = _child_text(node, "guid", "id")
    return guid if guid.startswith(("http://", "https://")) else ""


def _entry_subjects(node: ElementTree.Element) -> tuple[str, ...]:
    values: list[str] = []
    for child in node:
        if _local_name(child.tag) != "category":
            continue
        value = (
            child.attrib.get("label")
            or child.attrib.get("term")
            or "".join(child.itertext())
        ).strip()
        if value:
            values.append(value)
    return tuple(values)


def _parse_entries(
    content: bytes,
    *,
    content_type: str,
    source: str,
) -> list[ParsedEntry]:
    prefix = content.lstrip()[:64].lower()
    media_type = content_type.split(";", 1)[0].strip().casefold()

    if prefix.startswith(b"<!doctype html") or prefix.startswith(b"<html"):
        raise FeedFormatError("Réponse HTML reçue au lieu d’un flux")

    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise FeedFormatError("XML invalide") from exc

    root_name = _local_name(root.tag)
    if root_name in {"html", "body"}:
        raise FeedFormatError("Réponse HTML reçue au lieu d’un flux")
    if root_name not in {"rss", "rdf", "feed"}:
        raise FeedFormatError(f"Racine XML non reconnue: {root_name}")

    if media_type and not any(media_type.startswith(item) for item in _ALLOWED_CONTENT_TYPES):
        logger.warning(
            "news_content_type_unexpected source=%r content_type=%r root=%r",
            source,
            content_type,
            root_name,
        )

    wanted = "entry" if root_name == "feed" else "item"
    entries: list[ParsedEntry] = []
    for node in root.iter():
        if _local_name(node.tag) != wanted:
            continue

        title = _strip_html(_child_text(node, "title"))
        summary = _strip_html(
            _child_text(node, "summary", "content", "description", "encoded")
        )
        url = _entry_link(node)
        published_raw = _child_text(
            node,
            "published",
            "updated",
            "pubdate",
            "date",
            "dc:date",
        )
        if not title or not url:
            continue

        entries.append(
            ParsedEntry(
                title=title,
                summary=summary,
                url=url,
                published_at=_parse_datetime(
                    published_raw,
                    source=source,
                    title=title,
                ),
                subjects=_entry_subjects(node),
            )
        )

    if not entries:
        raise FeedFormatError("Flux vide ou format non reconnu")
    return entries


def _classify_statcan(entry: ParsedEntry) -> str | None:
    subject_text = " ".join(entry.subjects)
    haystack = _normalise_text(
        f"{subject_text} {entry.title} {entry.summary} {entry.url}"
    )

    scores: dict[str, int] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            normalised_keyword = keyword.casefold()
            if normalised_keyword in _normalise_text(subject_text):
                score += 5
            if normalised_keyword in haystack:
                score += 1
        scores[category] = score

    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def _classify_provincial(entry: ParsedEntry) -> str | None:
    haystack = _normalise_text(
        f"{' '.join(entry.subjects)} {entry.title} {entry.summary}"
    )
    scores: dict[str, int] = {}
    for category, keywords in PROVINCIAL_ECONOMIC_KEYWORDS.items():
        scores[category] = sum(
            1
            for keyword in keywords
            if _normalise_text(keyword) in haystack
        )
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def _to_news_item(
    entry: ParsedEntry,
    *,
    source: str,
    category: str,
    regions: list[str] | None = None,
) -> NewsItem:
    sentiment, score = _sentiment(entry.title, entry.summary)
    normalised_url = _normalise_url(entry.url)
    identifier = hashlib.sha1(
        f"{source}|{normalised_url}|{entry.title.casefold()}".encode("utf-8")
    ).hexdigest()[:16]
    return NewsItem(
        id=identifier,
        title=entry.title,
        summary=entry.summary[:480],
        url=entry.url,
        source=source,
        category=category,
        published_at=entry.published_at,
        sentiment=sentiment,
        sentiment_score=score,
        regions=(
            regions
            if regions is not None
            else economic_regions(
                f"{entry.title} {entry.summary} {' '.join(entry.subjects)}"
            )
        ),
    )


def _deduplicate(items: list[NewsItem]) -> list[NewsItem]:
    output: list[NewsItem] = []
    seen_urls: set[str] = set()
    seen_titles: set[tuple[str, str]] = set()
    for item in items:
        url_key = _normalise_url(item.url)
        title_key = (item.source.casefold(), _normalise_text(item.title))
        if url_key and url_key in seen_urls:
            continue
        if title_key in seen_titles:
            continue
        if url_key:
            seen_urls.add(url_key)
        seen_titles.add(title_key)
        output.append(item)
    return output


class NewsService:
    cache_ttl_seconds = 900.0
    failure_cache_ttl_seconds = 60.0
    max_attempts = 3
    retry_delays = (0.75, 1.5)

    def __init__(self) -> None:
        self._cached: dict[
            str,
            NewsSnapshot,
        ] = {}
        self._cached_at: dict[
            str,
            float,
        ] = {}
        self._last_good: dict[
            str,
            NewsSnapshot,
        ] = {}
        self._locks = {
            language: asyncio.Lock()
            for language in NEWS_LANGUAGES
        }

    @staticmethod
    def _normalize_language(
        language: str,
    ) -> str:
        return (
            "en"
            if language.strip().lower() == "en"
            else "fr"
        )

    def _cache_is_fresh(
        self,
        language: str,
        now: float,
    ) -> bool:
        cached = self._cached.get(language)
        cached_at = self._cached_at.get(
            language,
            0.0,
        )
        if cached is None:
            return False
        ttl = (
            self.cache_ttl_seconds
            if cached.items
            else self.failure_cache_ttl_seconds
        )
        return now - cached_at < ttl

    async def _download(
        self,
        client: httpx.AsyncClient,
        *,
        source_label: str,
        url: str,
    ) -> tuple[list[ParsedEntry], str | None]:
        last_error: Exception | None = None

        for attempt in range(1, self.max_attempts + 1):
            started = monotonic()
            try:
                response = await client.get(url)
                duration_ms = round((monotonic() - started) * 1000)
                content_type = response.headers.get("content-type", "")
                size = len(response.content)

                retryable_status = response.status_code == 429 or 500 <= response.status_code < 600
                logger.info(
                    "news_feed_http source=%r url=%r attempt=%d duration_ms=%d "
                    "status_code=%d content_type=%r size_bytes=%d",
                    source_label,
                    url,
                    attempt,
                    duration_ms,
                    response.status_code,
                    content_type,
                    size,
                )

                if retryable_status:
                    response.raise_for_status()
                response.raise_for_status()

                entries = _parse_entries(
                    response.content,
                    content_type=content_type,
                    source=source_label,
                )
                logger.info(
                    "news_feed_parsed source=%r url=%r attempt=%d items=%d",
                    source_label,
                    url,
                    attempt,
                    len(entries),
                )
                return entries, None

            except httpx.HTTPStatusError as exc:
                last_error = exc
                status_code = exc.response.status_code
                retryable = status_code == 429 or 500 <= status_code < 600
                logger.warning(
                    "news_feed_error source=%r url=%r attempt=%d exception=%s "
                    "status_code=%d retryable=%s",
                    source_label,
                    url,
                    attempt,
                    type(exc).__name__,
                    status_code,
                    retryable,
                )
                if not retryable:
                    break
            except _RETRYABLE_NETWORK_ERRORS as exc:
                last_error = exc
                logger.warning(
                    "news_feed_error source=%r url=%r attempt=%d exception=%s retryable=true",
                    source_label,
                    url,
                    attempt,
                    type(exc).__name__,
                )
            except (FeedFormatError, ElementTree.ParseError) as exc:
                last_error = exc
                logger.warning(
                    "news_feed_error source=%r url=%r attempt=%d exception=%s detail=%r retryable=false",
                    source_label,
                    url,
                    attempt,
                    type(exc).__name__,
                    str(exc),
                )
                break
            except Exception as exc:  # Defensive: do not make the discovery route fail.
                last_error = exc
                logger.exception(
                    "news_feed_error source=%r url=%r attempt=%d exception=%s retryable=false",
                    source_label,
                    url,
                    attempt,
                    type(exc).__name__,
                )
                break

            if attempt < self.max_attempts:
                await asyncio.sleep(self.retry_delays[attempt - 1])

        if isinstance(last_error, FeedFormatError):
            return [], str(last_error)
        if isinstance(last_error, httpx.HTTPStatusError):
            return [], f"HTTP {last_error.response.status_code}"
        if last_error is not None:
            return [], f"{type(last_error).__name__} après {self.max_attempts} tentatives"
        return [], "Source indisponible"

    async def _fetch_bank_feed(
        self,
        client: httpx.AsyncClient,
        source: str,
        category: str,
        url: str,
    ) -> tuple[list[NewsItem], list[FeedStatus]]:
        source_label = f"{source} — {category}"
        entries, error = await self._download(
            client,
            source_label=source_label,
            url=url,
        )
        if error:
            return [], [
                FeedStatus(source=source_label, status="unavailable", detail=error)
            ]

        items = [_to_news_item(entry, source=source, category=category) for entry in entries]
        if not items:
            return [], [
                FeedStatus(
                    source=source_label,
                    status="unavailable",
                    detail="Flux vide ou format non reconnu",
                )
            ]
        return items, [
            FeedStatus(source=source_label, status="ok", detail=f"{len(items)} éléments")
        ]

    async def _fetch_provincial_feed(
        self,
        client: httpx.AsyncClient,
        province: str,
        source: str,
        url: str,
    ) -> tuple[list[NewsItem], list[FeedStatus]]:
        source_label = f"{source} — Économie provinciale"
        entries, error = await self._download(
            client,
            source_label=source_label,
            url=url,
        )
        if error:
            return [], [
                FeedStatus(
                    source=source_label,
                    status="unavailable",
                    detail=error,
                )
            ]

        items: list[NewsItem] = []
        for entry in entries:
            category = _classify_provincial(entry)
            if category is None:
                continue
            items.append(
                _to_news_item(
                    entry,
                    source=source,
                    category=category,
                    regions=province_region(province),
                )
            )

        items = items[:12]
        return items, [
            FeedStatus(
                source=source_label,
                status="ok" if items else "unavailable",
                detail=(
                    f"{len(items)} éléments économiques"
                    if items
                    else "Aucune publication économique récente dans le flux"
                ),
            )
        ]

    async def _fetch_provincial_feed_safe(
        self,
        client: httpx.AsyncClient,
        province: str,
        source: str,
        url: str,
    ) -> tuple[list[NewsItem], list[FeedStatus]]:
        source_label = f"{source} — Économie provinciale"
        try:
            return await asyncio.wait_for(
                self._fetch_provincial_feed(
                    client,
                    province,
                    source,
                    url,
                ),
                timeout=8.0,
            )
        except TimeoutError:
            logger.warning(
                "news_provincial_timeout source=%r url=%r",
                source_label,
                url,
            )
            return [], [
                FeedStatus(
                    source=source_label,
                    status="unavailable",
                    detail="Délai dépassé — la couverture Statistique Canada reste active",
                )
            ]

    async def _fetch_statcan(
        self,
        client: httpx.AsyncClient,
        language: str,
    ) -> tuple[list[NewsItem], list[FeedStatus]]:
        source_label = f"{STATCAN_SOURCE} — Tous les sujets"
        statcan_url = STATCAN_URLS[language]
        proxy_url = _statcan_proxy_url(
            "news",
            language,
        )
        channel = "direct"

        if proxy_url:
            channel = "proxy"
            entries, error = await self._download(
                client,
                source_label=source_label,
                url=proxy_url,
            )
            if error:
                logger.warning(
                    "news_statcan_proxy_failed url=%r detail=%r fallback=direct",
                    proxy_url,
                    error,
                )
                channel = "direct"
                entries, error = await self._download(
                    client,
                    source_label=source_label,
                    url=statcan_url,
                )
        else:
            entries, error = await self._download(
                client,
                source_label=source_label,
                url=statcan_url,
            )

        if error:
            return [], [
                FeedStatus(
                    source=f"{STATCAN_SOURCE} — {category}",
                    status="unavailable",
                    detail=error,
                )
                for category in STATCAN_CATEGORIES
            ]

        grouped: dict[str, list[NewsItem]] = {category: [] for category in STATCAN_CATEGORIES}
        unclassified = 0
        for entry in entries:
            category = _classify_statcan(entry)
            if category is None:
                unclassified += 1
                continue
            grouped[category].append(
                _to_news_item(entry, source=STATCAN_SOURCE, category=category)
            )

        logger.info(
            "news_statcan_classified total=%d unclassified=%d counts=%r",
            len(entries),
            unclassified,
            {category: len(values) for category, values in grouped.items()},
        )

        items: list[NewsItem] = []
        statuses: list[FeedStatus] = []
        for category in STATCAN_CATEGORIES:
            category_items = grouped[category]
            items.extend(category_items)
            if category_items:
                statuses.append(
                    FeedStatus(
                        source=f"{STATCAN_SOURCE} — {category}",
                        status="ok",
                        detail=f"{len(category_items)} éléments",
                    )
                )
            else:
                statuses.append(
                    FeedStatus(
                        source=f"{STATCAN_SOURCE} — {category}",
                        status="unavailable",
                        detail="Aucune publication pertinente dans le flux officiel",
                    )
                )
        return items, statuses

    @staticmethod
    def _status_item_key(status_source: str) -> tuple[str, str] | None:
        if " — " not in status_source:
            return None
        source, category = status_source.rsplit(" — ", 1)
        return source, category

    def _merge_last_good_for_failed_sources(
        self,
        language: str,
        items: list[NewsItem],
        statuses: list[FeedStatus],
    ) -> tuple[list[NewsItem], list[FeedStatus]]:
        last_good = self._last_good.get(
            language
        )
        if last_good is None:
            return items, statuses

        failed_keys = {
            key
            for status in statuses
            if status.status != "ok"
            for key in [self._status_item_key(status.source)]
            if key is not None
        }
        if not failed_keys:
            return items, statuses

        failed_sources = {source for source, _category in failed_keys}
        cached_items = [
            item
            for item in last_good.items
            if (item.source, item.category) in failed_keys
            or item.source in failed_sources
        ]
        if not cached_items:
            return items, statuses

        merged_statuses: list[FeedStatus] = []
        cached_keys = {(item.source, item.category) for item in cached_items}
        cached_sources = {item.source for item in cached_items}
        for status in statuses:
            key = self._status_item_key(status.source)
            if status.status != "ok" and key is not None and (key in cached_keys or key[0] in cached_sources):
                detail = "Données en cache — source temporairement indisponible"
                if status.detail:
                    detail = f"{detail} ({status.detail})"
                merged_statuses.append(
                    FeedStatus(source=status.source, status="unavailable", detail=detail)
                )
            else:
                merged_statuses.append(status)

        return items + cached_items, merged_statuses

    async def get_snapshot(
        self,
        language: str = "fr",
    ) -> NewsSnapshot:
        language = self._normalize_language(
            language
        )
        now = monotonic()

        if self._cache_is_fresh(
            language,
            now,
        ):
            return self._cached[language]

        async with self._locks[language]:
            now = monotonic()

            if self._cache_is_fresh(
                language,
                now,
            ):
                return self._cached[
                    language
                ]

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/150.0 Safari/537.36 Anatole/1.3.9"
                ),
                "Accept": (
                    "application/rss+xml, application/atom+xml, application/xml, "
                    "text/xml;q=0.9, */*;q=0.1"
                ),
                "Accept-Language": (
                    "fr-CA,fr;q=1.0,en-CA;q=0.5,en;q=0.4"
                    if language == "fr"
                    else
                    "en-CA,en;q=1.0,fr-CA;q=0.5,fr;q=0.4"
                ),
            }
            timeout = httpx.Timeout(
                connect=25.0,
                read=30.0,
                write=10.0,
                pool=10.0,
            )

            async with httpx.AsyncClient(
                timeout=timeout,
                headers=headers,
                follow_redirects=True,
            ) as client:
                bank_tasks = [
                    self._fetch_bank_feed(
                        client,
                        source,
                        category,
                        url,
                    )
                    for (
                        source,
                        category,
                        url,
                    ) in BANK_FEEDS[language]
                ]
                provincial_tasks = [
                    self._fetch_provincial_feed_safe(
                        client,
                        province,
                        source,
                        url,
                    )
                    for (
                        province,
                        source,
                        url,
                        languages,
                    ) in PROVINCIAL_RSS_FEEDS
                    if language in languages
                ]
                results = await asyncio.gather(
                    *bank_tasks,
                    self._fetch_statcan(
                        client,
                        language,
                    ),
                    *provincial_tasks,
                )

            items: list[NewsItem] = []
            statuses: list[FeedStatus] = []

            for (
                feed_items,
                feed_statuses,
            ) in results:
                items.extend(feed_items)
                statuses.extend(
                    feed_statuses
                )

            items, statuses = (
                self._merge_last_good_for_failed_sources(
                    language,
                    items,
                    statuses,
                )
            )
            items = _deduplicate(items)
            items.sort(
                key=lambda item:
                    item.published_at,
                reverse=True,
            )

            snapshot = NewsSnapshot(
                items=items[:80],
                source_statuses=statuses,
                generated_at=datetime.now(
                    UTC
                ),
                refresh_after_seconds=(
                    900
                    if items
                    else 60
                ),
            )
            self._cached[language] = snapshot
            self._cached_at[
                language
            ] = monotonic()

            if snapshot.items:
                self._last_good[
                    language
                ] = snapshot

            return snapshot



news_service = NewsService()
