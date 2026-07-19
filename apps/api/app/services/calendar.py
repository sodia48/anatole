import asyncio
import hashlib
import re
from html import unescape
from datetime import UTC, datetime, time, timedelta
from email.utils import parsedate_to_datetime
from time import monotonic
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import httpx

from app.schemas.discovery import CalendarSnapshot, EconomicEvent, FeedStatus

STATCAN_URL = "https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-eng.json"
BOC_EVENTS_URL = "https://www.bankofcanada.ca/content_type/upcoming-events/feed/"
TORONTO = ZoneInfo("America/Toronto")

HIGH_KEYWORDS = ("consumer price", "cpi", "labour force", "employment", "gross domestic", "gdp", "interest rate", "monetary policy", "policy rate")
MEDIUM_KEYWORDS = ("retail", "trade", "manufacturing", "building permit", "investment", "payroll", "industrial", "housing", "energy")


def _importance(title: str) -> str:
    lowered = title.lower()
    if any(keyword in lowered for keyword in HIGH_KEYWORDS):
        return "Très élevée"
    if any(keyword in lowered for keyword in MEDIUM_KEYWORDS):
        return "Élevée"
    return "Moyenne"


def _category(title: str) -> str:
    lowered = title.lower()
    mapping = (
        (("consumer price", "cpi", "inflation"), "Inflation"),
        (("labour", "employment", "payroll", "earnings"), "Emploi"),
        (("gross domestic", "gdp", "economic accounts"), "Croissance"),
        (("interest rate", "monetary policy", "policy rate"), "Banque centrale"),
        (("trade", "transactions", "exports", "imports"), "Commerce"),
        (("housing", "building", "construction"), "Immobilier"),
        (("energy", "petroleum", "natural gas"), "Énergie"),
    )
    for keywords, category in mapping:
        if any(keyword in lowered for keyword in keywords):
            return category
    return "Économie"



def _plain_text(value: str | None, limit: int = 360) -> str | None:
    if not value:
        return None
    text = unescape(re.sub(r"<[^>]+>", " ", value))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] or None


def _parse_statcan_date(value: str) -> datetime:
    day = datetime.strptime(value[:10], "%Y-%m-%d").date()
    return datetime.combine(day, time(8, 30), tzinfo=TORONTO).astimezone(UTC)


def _parse_feed_date(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=TORONTO)
        return parsed.astimezone(UTC)
    except Exception:
        return datetime.now(UTC)


class CalendarService:
    cache_ttl_seconds = 1800.0

    def __init__(self) -> None:
        self._cached: CalendarSnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def _statcan(self, client: httpx.AsyncClient) -> tuple[list[EconomicEvent], FeedStatus]:
        try:
            response = await client.get(STATCAN_URL)
            response.raise_for_status()
            payload = response.json()
            now = datetime.now(UTC) - timedelta(days=1)
            horizon = now + timedelta(days=180)
            events: list[EconomicEvent] = []
            for raw in payload if isinstance(payload, list) else []:
                try:
                    starts_at = _parse_statcan_date(str(raw.get("date", "")))
                except Exception:
                    continue
                if starts_at < now or starts_at > horizon:
                    continue
                title = str(raw.get("title") or "").strip()
                if not title:
                    continue
                raw_url = str(raw.get("url") or "").strip()
                if raw_url.startswith("//"):
                    raw_url = f"https:{raw_url}"
                identifier = hashlib.sha1(f"statcan|{starts_at.isoformat()}|{title}".encode()).hexdigest()[:16]
                events.append(EconomicEvent(id=identifier, title=title, category=_category(title), importance=_importance(title), starts_at=starts_at, source="Statistique Canada", url=raw_url or "https://www150.statcan.gc.ca/n1/dai-quo/cal1-eng.htm", description=_plain_text(str(raw.get("description") or ""))))
            return events, FeedStatus(source="Statistique Canada — indicateurs clés", status="ok", detail=f"{len(events)} événements futurs")
        except Exception as exc:
            return [], FeedStatus(source="Statistique Canada — indicateurs clés", status="unavailable", detail=type(exc).__name__)

    async def _bank_of_canada(self, client: httpx.AsyncClient) -> tuple[list[EconomicEvent], FeedStatus]:
        try:
            response = await client.get(BOC_EVENTS_URL)
            response.raise_for_status()
            root = ElementTree.fromstring(response.content)
            now = datetime.now(UTC) - timedelta(days=1)
            events: list[EconomicEvent] = []
            for node in root.findall(".//item"):
                title = (node.findtext("title") or "").strip()
                url = (node.findtext("link") or "").strip()
                starts_at = _parse_feed_date(node.findtext("pubDate"))
                if not title or starts_at < now:
                    continue
                description = (node.findtext("description") or "").strip()
                identifier = hashlib.sha1(f"boc|{starts_at.isoformat()}|{title}".encode()).hexdigest()[:16]
                events.append(EconomicEvent(id=identifier, title=title, category=_category(title), importance=_importance(title), starts_at=starts_at, source="Banque du Canada", url=url or "https://www.bankofcanada.ca/press/upcoming-events/", description=_plain_text(description)))
            return events, FeedStatus(source="Banque du Canada — événements", status="ok", detail=f"{len(events)} événements futurs")
        except Exception as exc:
            return [], FeedStatus(source="Banque du Canada — événements", status="unavailable", detail=type(exc).__name__)

    async def get_snapshot(self) -> CalendarSnapshot:
        now = monotonic()
        if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
            return self._cached
        async with self._lock:
            now = monotonic()
            if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
                return self._cached
            headers = {"User-Agent": "Mozilla/5.0 Anatole/0.5", "Accept": "application/json, application/rss+xml, application/xml, text/xml"}
            async with httpx.AsyncClient(timeout=15.0, headers=headers, follow_redirects=True) as client:
                results = await asyncio.gather(self._statcan(client), self._bank_of_canada(client))
            events = [event for result, _ in results for event in result]
            statuses = [status for _, status in results]
            deduped = {event.id: event for event in events}
            snapshot = CalendarSnapshot(events=sorted(deduped.values(), key=lambda event: event.starts_at)[:120], source_statuses=statuses, generated_at=datetime.now(UTC), refresh_after_seconds=1800)
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot


calendar_service = CalendarService()
