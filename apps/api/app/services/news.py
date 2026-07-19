import asyncio
import hashlib
import html
import re
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from time import monotonic
from xml.etree import ElementTree

import httpx

from app.schemas.discovery import FeedStatus, NewsItem, NewsSnapshot


FEEDS = (
    ("Banque du Canada", "Politique monétaire", "https://www.bankofcanada.ca/utility/news/feed/"),
    ("Banque du Canada", "Communiqués", "https://www.bankofcanada.ca/content_type/press-releases/feed/"),
    ("Statistique Canada", "Comptes économiques", "https://www150.statcan.gc.ca/n1/rss/dai-quo/36-eng.atom"),
    ("Statistique Canada", "Travail", "https://www150.statcan.gc.ca/n1/rss/dai-quo/14-eng.atom"),
    ("Statistique Canada", "Commerce international", "https://www150.statcan.gc.ca/n1/rss/dai-quo/12-eng.atom"),
    ("Statistique Canada", "Énergie", "https://www150.statcan.gc.ca/n1/rss/dai-quo/25-eng.atom"),
)

POSITIVE_WORDS = {
    "growth", "increase", "increased", "gain", "gains", "strong", "improve", "improved", "surplus",
    "croissance", "hausse", "progression", "solide", "amélioration", "excédent", "rebound", "reprise",
}
NEGATIVE_WORDS = {
    "decline", "declined", "decrease", "decreased", "loss", "weak", "slowdown", "deficit", "risk", "risks",
    "baisse", "recul", "perte", "faible", "ralentissement", "déficit", "risque", "risques", "contraction",
}


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html.unescape(value or ""))
    return re.sub(r"\s+", " ", text).strip()


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except Exception:
        return datetime.now(UTC)


def _sentiment(title: str, summary: str) -> tuple[str, float]:
    tokens = re.findall(r"[A-Za-zÀ-ÿ']+", f"{title} {summary}".lower())
    positive = sum(token in POSITIVE_WORDS for token in tokens)
    negative = sum(token in NEGATIVE_WORDS for token in tokens)
    score = max(-100.0, min(100.0, (positive - negative) * 18.0))
    label = "Positif" if score >= 18 else "Négatif" if score <= -18 else "Neutre"
    return label, score


def _rss_items(root: ElementTree.Element, source: str, category: str) -> list[NewsItem]:
    items: list[NewsItem] = []
    for node in root.findall(".//item"):
        title = _strip_html(node.findtext("title") or "")
        url = (node.findtext("link") or "").strip()
        summary = _strip_html(node.findtext("description") or "")
        published_at = _parse_datetime(node.findtext("pubDate") or node.findtext("date"))
        if not title or not url:
            continue
        sentiment, score = _sentiment(title, summary)
        identifier = hashlib.sha1(f"{source}|{url}|{title}".encode("utf-8")).hexdigest()[:16]
        items.append(NewsItem(id=identifier, title=title, summary=summary[:480], url=url, source=source, category=category, published_at=published_at, sentiment=sentiment, sentiment_score=score))
    return items


def _atom_items(root: ElementTree.Element, source: str, category: str) -> list[NewsItem]:
    namespace = {"atom": "http://www.w3.org/2005/Atom"}
    items: list[NewsItem] = []
    for node in root.findall("atom:entry", namespace):
        title = _strip_html(node.findtext("atom:title", default="", namespaces=namespace))
        summary = _strip_html(node.findtext("atom:summary", default="", namespaces=namespace) or node.findtext("atom:content", default="", namespaces=namespace))
        link_node = node.find("atom:link", namespace)
        url = (link_node.attrib.get("href", "") if link_node is not None else "").strip()
        published_at = _parse_datetime(node.findtext("atom:published", default="", namespaces=namespace) or node.findtext("atom:updated", default="", namespaces=namespace))
        if not title or not url:
            continue
        sentiment, score = _sentiment(title, summary)
        identifier = hashlib.sha1(f"{source}|{url}|{title}".encode("utf-8")).hexdigest()[:16]
        items.append(NewsItem(id=identifier, title=title, summary=summary[:480], url=url, source=source, category=category, published_at=published_at, sentiment=sentiment, sentiment_score=score))
    return items


class NewsService:
    cache_ttl_seconds = 900.0

    def __init__(self) -> None:
        self._cached: NewsSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def _fetch_feed(self, client: httpx.AsyncClient, source: str, category: str, url: str) -> tuple[list[NewsItem], FeedStatus]:
        try:
            response = await client.get(url)
            response.raise_for_status()
            root = ElementTree.fromstring(response.content)
            items = _rss_items(root, source, category)
            if not items:
                items = _atom_items(root, source, category)
            return items, FeedStatus(source=f"{source} — {category}", status="ok", detail=f"{len(items)} éléments")
        except Exception as exc:
            return [], FeedStatus(source=f"{source} — {category}", status="unavailable", detail=type(exc).__name__)

    async def get_snapshot(self) -> NewsSnapshot:
        now = monotonic()
        if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
            return self._cached
        async with self._lock:
            now = monotonic()
            if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
                return self._cached
            headers = {"User-Agent": "Mozilla/5.0 Anatole/0.5", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"}
            async with httpx.AsyncClient(timeout=12.0, headers=headers, follow_redirects=True) as client:
                results = await asyncio.gather(*(self._fetch_feed(client, *feed) for feed in FEEDS))
            items: list[NewsItem] = []
            statuses: list[FeedStatus] = []
            seen: set[str] = set()
            for feed_items, status in results:
                statuses.append(status)
                for item in feed_items:
                    key = item.url.lower() or item.title.lower()
                    if key in seen:
                        continue
                    seen.add(key)
                    items.append(item)
            items.sort(key=lambda item: item.published_at, reverse=True)
            snapshot = NewsSnapshot(items=items[:80], source_statuses=statuses, generated_at=datetime.now(UTC), refresh_after_seconds=900)
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot


news_service = NewsService()
