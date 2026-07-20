from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import os
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from html.parser import HTMLParser
from time import monotonic
from urllib.parse import urlencode, urljoin
from zoneinfo import ZoneInfo

import httpx

from app.schemas.discovery import CalendarSnapshot, EconomicEvent, FeedStatus

logger = logging.getLogger(__name__)

STATCAN_URL = "https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm"
BOC_URL = "https://www.bankofcanada.ca/press/upcoming-events/"
TORONTO = ZoneInfo("America/Toronto")

_MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
_MONTH_PATTERN = "|".join(name.title() for name in _MONTHS)
_FULL_DATE_RE = re.compile(
    rf"^({_MONTH_PATTERN})\s+(\d{{1,2}}),\s+(\d{{4}})$",
    re.IGNORECASE,
)
_SHORT_DATE_RE = re.compile(
    rf"^({_MONTH_PATTERN})\s+(\d{{1,2}})$",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b(20\d{2})\b")
_TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
_PHONE_RE = re.compile(r"\([A-Za-zÀ-ÿ .'-]+,\s*(?:\+?1[-.\s]?)?\d{3}[-.\s]\d{3}[-.\s]\d{4}\)\s*$")
_NUMBER_PREFIX_RE = re.compile(r"^\s*\d+\.\s*")

_BLOCK_TAGS = {
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "p",
    "time",
    "article",
    "div",
    "span",
}
_SKIP_TAGS = {"script", "style", "svg", "noscript"}

_RETRYABLE_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadError,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
)

_HIGH_KEYWORDS = (
    "consumer price index",
    "gross domestic product",
    "labour force survey",
    "payroll employment",
    "retail trade",
    "international merchandise trade",
    "interest rate announcement",
    "monetary policy report",
    "employment",
    "unemployment",
)
_MEDIUM_KEYWORDS = (
    "industrial product",
    "raw materials price",
    "manufacturing",
    "wholesale trade",
    "housing price",
    "building construction",
    "business outlook survey",
    "consumer expectations",
    "market participants survey",
    "senior loan officer survey",
    "summary of deliberations",
    "financial stability report",
)

_CATEGORY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Inflation", ("consumer price", "price index", "inflation")),
    ("Travail", ("labour", "employment", "unemployment", "payroll", "earnings", "job vacanc")),
    ("Croissance", ("gross domestic product", "gdp", "economic accounts", "business openings", "productivity")),
    ("Commerce", ("international trade", "merchandise trade", "retail trade", "wholesale trade", "exports", "imports")),
    ("Logement", ("housing", "building construction", "condominium", "new home", "mortgage")),
    ("Énergie", ("energy", "petroleum", "natural gas", "crude oil", "pipeline", "electricity")),
    ("Industrie", ("manufacturing", "mineral production", "industrial product", "machinery and equipment")),
    ("Transport", ("transport", "railway", "airport", "aircraft", "transit", "freight rail")),
    ("Politique monétaire", ("interest rate", "monetary policy", "summary of deliberations")),
    ("Enquêtes", ("survey", "consumer expectations", "market participants", "loan officer")),
    ("Stabilité financière", ("financial stability",)),
)


@dataclass(frozen=True, slots=True)
class HtmlBlock:
    tag: str
    text: str
    href: str | None = None


class _BlockParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[HtmlBlock] = []
        self._stack: list[dict[str, object]] = []
        self._skip_depth = 0
        self._anchor_href: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "a":
            self._anchor_href = dict(attrs).get("href")
            if self._anchor_href:
                for frame in self._stack:
                    if not frame.get("href"):
                        frame["href"] = self._anchor_href
        if tag in _BLOCK_TAGS:
            self._stack.append({"tag": tag, "parts": [], "href": self._anchor_href})

    def handle_data(self, data: str) -> None:
        if self._skip_depth or not self._stack:
            return
        for frame in self._stack:
            parts = frame["parts"]
            assert isinstance(parts, list)
            parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag in _SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag == "a":
            self._anchor_href = None
        if tag not in _BLOCK_TAGS:
            return
        for index in range(len(self._stack) - 1, -1, -1):
            frame = self._stack[index]
            if frame["tag"] != tag:
                continue
            self._stack.pop(index)
            parts = frame["parts"]
            assert isinstance(parts, list)
            text = _clean_text(" ".join(str(part) for part in parts))
            if text:
                href = frame.get("href")
                self.blocks.append(
                    HtmlBlock(tag=tag, text=text, href=str(href) if href else None)
                )
            break


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def _extract_blocks(content: str) -> list[HtmlBlock]:
    parser = _BlockParser()
    parser.feed(content)
    output: list[HtmlBlock] = []
    previous: tuple[str, str] | None = None
    for block in parser.blocks:
        key = (block.tag, block.text)
        if key == previous:
            continue
        previous = key
        output.append(block)
    return output


def _parse_full_date(value: str) -> date | None:
    match = _FULL_DATE_RE.match(_clean_text(value))
    if not match:
        return None
    month_name, day_value, year_value = match.groups()
    return date(int(year_value), _MONTHS[month_name.casefold()], int(day_value))


def _parse_short_date(value: str, year: int) -> date | None:
    match = _SHORT_DATE_RE.match(_clean_text(value))
    if not match:
        return None
    month_name, day_value = match.groups()
    return date(year, _MONTHS[month_name.casefold()], int(day_value))


def _importance(title: str) -> str:
    lowered = title.casefold()
    if any(keyword in lowered for keyword in _HIGH_KEYWORDS):
        return "Élevée"
    if any(keyword in lowered for keyword in _MEDIUM_KEYWORDS):
        return "Moyenne"
    return "Faible"


def _category(title: str) -> str:
    lowered = title.casefold()
    for category, keywords in _CATEGORY_RULES:
        if any(keyword in lowered for keyword in keywords):
            return category
    return "Autre"


def _event_id(source: str, title: str, starts_at: datetime) -> str:
    payload = f"{source}|{title.casefold()}|{starts_at.isoformat()}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def _event(
    *,
    source: str,
    title: str,
    day: date,
    event_time: time,
    url: str,
    description: str | None = None,
) -> EconomicEvent:
    starts_at = datetime.combine(day, event_time, tzinfo=TORONTO)
    return EconomicEvent(
        id=_event_id(source, title, starts_at),
        title=title,
        country="Canada",
        currency="CAD",
        category=_category(title),
        importance=_importance(title),
        starts_at=starts_at,
        source=source,
        url=url,
        description=description,
    )


def _strip_statcan_item(value: str) -> str:
    text = _NUMBER_PREFIX_RE.sub("", _clean_text(value))
    text = re.sub(r"^\(lockup\)\s*", "", text, flags=re.IGNORECASE)
    text = _PHONE_RE.sub("", text).strip(" -–—")
    return text


def _parse_statcan_html(content: str, *, now: datetime) -> list[EconomicEvent]:
    blocks = _extract_blocks(content)
    year = now.astimezone(TORONTO).year
    for block in blocks:
        if block.tag in {"h1", "h2"} and "upcoming releases" not in block.text.casefold():
            year_match = _YEAR_RE.search(block.text)
            if year_match:
                year = int(year_match.group(1))
                break

    current_day: date | None = None
    events: list[EconomicEvent] = []
    for block in blocks:
        parsed_day = _parse_short_date(block.text, year)
        if parsed_day is not None and block.tag in {"h2", "h3", "h4"}:
            current_day = parsed_day
            continue
        if current_day is None or block.tag != "li":
            continue
        title = _strip_statcan_item(block.text)
        if not title or title.casefold().startswith("contact"):
            continue
        if re.fullmatch(r"\([^)]*\)", title):
            continue
        if len(title) < 5:
            continue
        events.append(
            _event(
                source="Statistique Canada",
                title=title,
                day=current_day,
                event_time=time(8, 30),
                url=STATCAN_URL,
                description="Publication prévue dans Le Quotidien à 8 h 30 (heure de l’Est).",
            )
        )

    cutoff = now.astimezone(TORONTO) - timedelta(hours=2)
    return [event for event in events if event.starts_at >= cutoff]


def _is_boc_holiday(title: str) -> bool:
    lowered = title.casefold()
    return any(
        keyword in lowered
        for keyword in (
            "holiday",
            "civic holiday",
            "labour day",
            "thanksgiving day",
            "remembrance day",
            "christmas day",
            "boxing day",
            "truth and reconciliation",
        )
    )


def _parse_boc_html(content: str, *, now: datetime) -> list[EconomicEvent]:
    blocks = _extract_blocks(content)
    events: list[EconomicEvent] = []
    for index, block in enumerate(blocks):
        day = _parse_full_date(block.text)
        if day is None:
            continue

        title_block: HtmlBlock | None = None
        for candidate in blocks[index + 1 : index + 6]:
            if _parse_full_date(candidate.text) is not None:
                break
            if candidate.tag in {"h2", "h3", "h4", "h5"} and candidate.text:
                title_block = candidate
                break
        if title_block is None:
            continue
        title = title_block.text
        if _is_boc_holiday(title):
            continue

        parsed_time = time(10, 0)
        description: str | None = None
        for candidate in blocks[index + 1 : index + 10]:
            if candidate is title_block:
                continue
            if _parse_full_date(candidate.text) is not None:
                break
            time_match = _TIME_RE.search(candidate.text)
            if time_match:
                parsed_time = time(int(time_match.group(1)), int(time_match.group(2)))
                continue
            if candidate.tag == "p" and len(candidate.text) > 25 and "content type" not in candidate.text.casefold():
                description = candidate.text[:500]
                break

        href = title_block.href
        url = urljoin(BOC_URL, href) if href else BOC_URL
        events.append(
            _event(
                source="Banque du Canada",
                title=title,
                day=day,
                event_time=parsed_time,
                url=url,
                description=description,
            )
        )

    cutoff = now.astimezone(TORONTO) - timedelta(hours=2)
    deduped: dict[tuple[str, datetime], EconomicEvent] = {}
    for event in events:
        if event.starts_at >= cutoff:
            deduped[(event.title.casefold(), event.starts_at)] = event
    return list(deduped.values())


def _proxy_url(resource: str) -> str | None:
    base = os.getenv("STATCAN_PROXY_URL", "").strip()
    if not base:
        return None
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}{urlencode({'resource': resource})}"


class CalendarService:
    cache_ttl_seconds = 1800.0
    failure_cache_ttl_seconds = 90.0
    max_attempts = 3
    retry_delays = (0.75, 1.5)

    def __init__(self) -> None:
        self._cached: CalendarSnapshot | None = None
        self._cached_at = 0.0
        self._last_good_by_source: dict[str, list[EconomicEvent]] = {}
        self._lock = asyncio.Lock()

    def _cache_is_fresh(self, now: float) -> bool:
        if self._cached is None:
            return False
        ttl = self.cache_ttl_seconds if self._cached.events else self.failure_cache_ttl_seconds
        return now - self._cached_at < ttl

    async def _download_text(
        self,
        client: httpx.AsyncClient,
        *,
        source: str,
        url: str,
        proxy_resource: str | None = None,
    ) -> tuple[str, str, str | None]:
        candidates: list[tuple[str, str]] = []
        if proxy_resource:
            proxy = _proxy_url(proxy_resource)
            if proxy:
                candidates.append(("proxy", proxy))
        candidates.append(("direct", url))

        last_error: Exception | None = None
        for channel, candidate_url in candidates:
            for attempt in range(1, self.max_attempts + 1):
                started = monotonic()
                try:
                    response = await client.get(candidate_url)
                    duration_ms = round((monotonic() - started) * 1000)
                    retryable_status = response.status_code == 429 or 500 <= response.status_code < 600
                    logger.info(
                        "calendar_feed_http source=%r channel=%s attempt=%d duration_ms=%d "
                        "status_code=%d content_type=%r size_bytes=%d",
                        source,
                        channel,
                        attempt,
                        duration_ms,
                        response.status_code,
                        response.headers.get("content-type", ""),
                        len(response.content),
                    )
                    response.raise_for_status()
                    text = response.text
                    if "<html" not in text[:1000].casefold() and "<!doctype html" not in text[:1000].casefold():
                        raise ValueError("Réponse non HTML")
                    return text, channel, None
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    status = exc.response.status_code
                    retryable = status == 429 or 500 <= status < 600
                    logger.warning(
                        "calendar_feed_error source=%r channel=%s attempt=%d exception=%s status_code=%d retryable=%s",
                        source,
                        channel,
                        attempt,
                        type(exc).__name__,
                        status,
                        retryable,
                    )
                    if not retryable:
                        break
                except _RETRYABLE_ERRORS as exc:
                    last_error = exc
                    logger.warning(
                        "calendar_feed_error source=%r channel=%s attempt=%d exception=%s retryable=true",
                        source,
                        channel,
                        attempt,
                        type(exc).__name__,
                    )
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "calendar_feed_error source=%r channel=%s attempt=%d exception=%s detail=%r retryable=false",
                        source,
                        channel,
                        attempt,
                        type(exc).__name__,
                        str(exc),
                    )
                    break
                if attempt < self.max_attempts:
                    await asyncio.sleep(self.retry_delays[attempt - 1])

        if isinstance(last_error, httpx.HTTPStatusError):
            return "", "none", f"HTTP {last_error.response.status_code}"
        if last_error is not None:
            return "", "none", f"{type(last_error).__name__} après {self.max_attempts} tentatives"
        return "", "none", "Source indisponible"

    async def _fetch_statcan(
        self, client: httpx.AsyncClient, now: datetime
    ) -> tuple[list[EconomicEvent], FeedStatus]:
        source = "Statistique Canada — Indicateurs clés"
        content, channel, error = await self._download_text(
            client,
            source=source,
            url=STATCAN_URL,
            proxy_resource="calendar",
        )
        if error:
            return [], FeedStatus(source=source, status="unavailable", detail=error)
        events = _parse_statcan_html(content, now=now)
        if not events:
            return [], FeedStatus(
                source=source,
                status="unavailable",
                detail="Calendrier officiel reçu, mais aucun événement futur n’a été extrait",
            )
        detail = f"{len(events)} événements"
        if channel == "proxy":
            detail += " — relayés par Vercel"
        return events, FeedStatus(source=source, status="ok", detail=detail)

    async def _fetch_boc(
        self, client: httpx.AsyncClient, now: datetime
    ) -> tuple[list[EconomicEvent], FeedStatus]:
        source = "Banque du Canada — événements"
        content, _channel, error = await self._download_text(
            client,
            source=source,
            url=BOC_URL,
        )
        if error:
            return [], FeedStatus(source=source, status="unavailable", detail=error)
        events = _parse_boc_html(content, now=now)
        if not events:
            return [], FeedStatus(
                source=source,
                status="unavailable",
                detail="Page officielle reçue, mais aucun événement futur n’a été extrait",
            )
        return events, FeedStatus(source=source, status="ok", detail=f"{len(events)} événements")

    def _restore_last_good(
        self,
        source_key: str,
        events: list[EconomicEvent],
        status: FeedStatus,
        *,
        now: datetime,
    ) -> tuple[list[EconomicEvent], FeedStatus]:
        if events:
            self._last_good_by_source[source_key] = events
            return events, status
        cached = [
            event
            for event in self._last_good_by_source.get(source_key, [])
            if event.starts_at >= now.astimezone(TORONTO) - timedelta(hours=2)
        ]
        if not cached:
            return events, status
        detail = "Données en cache — source temporairement indisponible"
        if status.detail:
            detail += f" ({status.detail})"
        return cached, FeedStatus(source=status.source, status="unavailable", detail=detail)

    async def get_snapshot(self) -> CalendarSnapshot:
        cache_now = monotonic()
        if self._cache_is_fresh(cache_now):
            assert self._cached is not None
            return self._cached

        async with self._lock:
            cache_now = monotonic()
            if self._cache_is_fresh(cache_now):
                assert self._cached is not None
                return self._cached

            now = datetime.now(UTC)
            timeout = httpx.Timeout(connect=25.0, read=35.0, write=10.0, pool=10.0)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/150.0 Safari/537.36 Anatole/0.6"
                ),
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
                "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8,fr;q=0.7",
            }
            async with httpx.AsyncClient(
                timeout=timeout,
                headers=headers,
                follow_redirects=True,
            ) as client:
                statcan_result, boc_result = await asyncio.gather(
                    self._fetch_statcan(client, now),
                    self._fetch_boc(client, now),
                )

            statcan_events, statcan_status = self._restore_last_good(
                "statcan", *statcan_result, now=now
            )
            boc_events, boc_status = self._restore_last_good(
                "boc", *boc_result, now=now
            )

            events = statcan_events + boc_events
            deduped: dict[tuple[str, str, datetime], EconomicEvent] = {}
            for event in events:
                key = (event.source.casefold(), event.title.casefold(), event.starts_at)
                deduped[key] = event
            events = sorted(deduped.values(), key=lambda event: event.starts_at)

            snapshot = CalendarSnapshot(
                events=events[:120],
                source_statuses=[statcan_status, boc_status],
                generated_at=now,
                refresh_after_seconds=1800 if events else 90,
            )
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot


calendar_service = CalendarService()
