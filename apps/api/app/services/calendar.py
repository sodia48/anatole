from __future__ import annotations

import asyncio
import hashlib
import html
import json
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
from app.services.regions import economic_regions

logger = logging.getLogger(__name__)

CALENDAR_LANGUAGES = ("fr", "en")

STATCAN_URLS = {
    "fr": "https://www150.statcan.gc.ca/n1/dai-quo/cal2-fra.htm",
    "en": "https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm",
}
STATCAN_JSON_URLS = {
    "fr": "https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-fra.json",
    "en": "https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-eng.json",
}
STATCAN_ANNUAL_SCHEDULE_URLS = {
    "fr": "https://www150.statcan.gc.ca/release-diffusion/2026-fra.pdf",
    "en": "https://www150.statcan.gc.ca/n1/en/release-diffusion/2026-eng.pdf",
}
BOC_URLS = {
    "fr": "https://www.banqueducanada.ca/medias/evenements-a-venir/",
    "en": "https://www.bankofcanada.ca/press/upcoming-events/",
}
TORONTO = ZoneInfo("America/Toronto")

# Dated safety net transcribed from Statistics Canada's official 2026-2027
# major economic release schedule (catalogue 11-001-X, modified 2026-06-10).
# It is used only when both live StatCan calendar channels fail, and expires
# with the source document so these dates can never silently roll forward.
STATCAN_ANNUAL_SCHEDULE_VALID_UNTIL = date(2027, 3, 31)
STATCAN_ANNUAL_SCHEDULE = (
    ("2026-08-17", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2026-09-14", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2026-10-19", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2026-11-16", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2026-12-14", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2027-01-18", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2027-02-16", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2027-03-15", "Consumer Price Index", "Indice des prix à la consommation"),
    ("2026-09-04", "Labour Force Survey", "Enquête sur la population active"),
    ("2026-10-09", "Labour Force Survey", "Enquête sur la population active"),
    ("2026-11-06", "Labour Force Survey", "Enquête sur la population active"),
    ("2026-12-04", "Labour Force Survey", "Enquête sur la population active"),
    ("2027-01-08", "Labour Force Survey", "Enquête sur la population active"),
    ("2027-02-05", "Labour Force Survey", "Enquête sur la population active"),
    ("2027-03-12", "Labour Force Survey", "Enquête sur la population active"),
    ("2026-08-27", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2026-09-24", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2026-10-29", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2026-11-26", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2026-12-23", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2027-01-28", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2027-02-25", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2027-03-31", "Payroll employment, earnings and hours, and job vacancies", "Emploi salarié, rémunération, heures travaillées et postes vacants"),
    ("2026-08-21", "Retail trade", "Commerce de détail"),
    ("2026-09-24", "Retail trade", "Commerce de détail"),
    ("2026-10-23", "Retail trade", "Commerce de détail"),
    ("2026-11-20", "Retail trade", "Commerce de détail"),
    ("2026-12-18", "Retail trade", "Commerce de détail"),
    ("2027-01-22", "Retail trade", "Commerce de détail"),
    ("2027-02-19", "Retail trade", "Commerce de détail"),
    ("2027-03-19", "Retail trade", "Commerce de détail"),
    ("2026-09-15", "Wholesale trade", "Commerce de gros"),
    ("2026-10-15", "Wholesale trade", "Commerce de gros"),
    ("2026-11-13", "Wholesale trade", "Commerce de gros"),
    ("2026-12-15", "Wholesale trade", "Commerce de gros"),
    ("2027-01-14", "Wholesale trade", "Commerce de gros"),
    ("2027-02-15", "Wholesale trade", "Commerce de gros"),
    ("2027-03-16", "Wholesale trade", "Commerce de gros"),
    ("2026-09-14", "Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
    ("2026-10-15", "Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
    ("2026-11-13", "Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
    ("2026-12-14", "Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
    ("2027-01-15", "Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
    ("2027-02-12", "Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
    ("2027-03-15", "Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
    ("2026-09-16", "Building permits", "Permis de bâtir"),
    ("2026-10-14", "Building permits", "Permis de bâtir"),
    ("2026-11-12", "Building permits", "Permis de bâtir"),
    ("2026-12-11", "Building permits", "Permis de bâtir"),
    ("2027-01-15", "Building permits", "Permis de bâtir"),
    ("2027-02-11", "Building permits", "Permis de bâtir"),
    ("2027-03-11", "Building permits", "Permis de bâtir"),
    ("2026-08-19", "Investment in building construction", "Investissement en construction de bâtiments"),
    ("2026-09-21", "Investment in building construction", "Investissement en construction de bâtiments"),
    ("2026-10-21", "Investment in building construction", "Investissement en construction de bâtiments"),
    ("2026-11-19", "Investment in building construction", "Investissement en construction de bâtiments"),
    ("2026-12-18", "Investment in building construction", "Investissement en construction de bâtiments"),
    ("2027-01-22", "Investment in building construction", "Investissement en construction de bâtiments"),
    ("2027-02-18", "Investment in building construction", "Investissement en construction de bâtiments"),
    ("2027-03-18", "Investment in building construction", "Investissement en construction de bâtiments"),
)

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
    "janvier": 1,
    "février": 2,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
    "decembre": 12,
}
_MONTH_PATTERN = "|".join(
    sorted(
        (re.escape(name) for name in _MONTHS),
        key=len,
        reverse=True,
    )
)
_FULL_DATE_MONTH_FIRST_RE = re.compile(
    rf"^({_MONTH_PATTERN})\s+(\d{{1,2}}),?\s+(\d{{4}})$",
    re.IGNORECASE,
)
_FULL_DATE_DAY_FIRST_RE = re.compile(
    rf"^(\d{{1,2}})\s+({_MONTH_PATTERN})\s+(\d{{4}})$",
    re.IGNORECASE,
)
_SHORT_DATE_MONTH_FIRST_RE = re.compile(
    rf"^({_MONTH_PATTERN})\s+(\d{{1,2}})$",
    re.IGNORECASE,
)
_SHORT_DATE_DAY_FIRST_RE = re.compile(
    rf"^(\d{{1,2}})\s+({_MONTH_PATTERN})$",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b(20\d{2})\b")
_TIME_RE = re.compile(
    r"\b([01]?\d|2[0-3])\s*(?::|h)\s*([0-5]\d)\b",
    re.IGNORECASE,
)
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
    "indice des prix à la consommation",
    "produit intérieur brut",
    "enquête sur la population active",
    "emploi salarié",
    "commerce de détail",
    "commerce international de marchandises",
    "annonce du taux directeur",
    "rapport sur la politique monétaire",
    "emploi",
    "chômage",
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
    "indice des prix des produits industriels",
    "indice des prix des matières brutes",
    "fabrication",
    "commerce de gros",
    "logement",
    "construction de bâtiments",
    "enquête sur les perspectives des entreprises",
    "enquête sur les attentes des consommateurs",
    "enquête auprès des participants au marché",
    "enquête auprès des responsables du crédit",
    "résumé des délibérations",
    "rapport sur la stabilité financière",
)

_CATEGORY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Inflation", ("consumer price", "price index", "inflation", "indice des prix", "prix à la consommation")),
    ("Travail", ("labour", "employment", "unemployment", "payroll", "earnings", "job vacanc", "travail", "emploi", "chômage", "rémunération", "salaire", "postes vacants", "population active")),
    ("Croissance", ("gross domestic product", "gdp", "economic accounts", "business openings", "productivity", "produit intérieur brut", "pib", "comptes économiques", "productivité")),
    ("Commerce", ("international trade", "merchandise trade", "retail trade", "wholesale trade", "exports", "imports", "commerce international", "commerce de marchandises", "commerce de détail", "commerce de gros", "exportations", "importations")),
    ("Logement", ("housing", "building construction", "condominium", "new home", "mortgage", "logement", "construction de bâtiments", "résidentiel", "hypothécaire")),
    ("Énergie", ("energy", "petroleum", "natural gas", "crude oil", "pipeline", "electricity", "énergie", "pétrole", "gaz naturel", "électricité", "oléoduc")),
    ("Industrie", ("manufacturing", "mineral production", "industrial product", "machinery and equipment", "fabrication", "production minérale", "produits industriels", "machines et matériel", "industries manufacturières", "industrie manufacturière")),
    ("Transport", ("transport", "railway", "airport", "aircraft", "transit", "freight rail", "ferroviaire", "aéroport", "aéronef")),
    ("Politique monétaire", ("interest rate", "monetary policy", "summary of deliberations", "taux directeur", "politique monétaire", "résumé des délibérations")),
    ("Enquêtes", ("survey", "consumer expectations", "market participants", "loan officer", "enquête", "attentes des consommateurs", "participants au marché", "responsables du crédit")),
    ("Stabilité financière", ("financial stability", "stabilité financière")),
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
    cleaned = _clean_text(value)

    match = _FULL_DATE_MONTH_FIRST_RE.match(cleaned)
    if match:
        month_name, day_value, year_value = match.groups()
        return date(
            int(year_value),
            _MONTHS[month_name.casefold()],
            int(day_value),
        )

    match = _FULL_DATE_DAY_FIRST_RE.match(cleaned)
    if match:
        day_value, month_name, year_value = match.groups()
        return date(
            int(year_value),
            _MONTHS[month_name.casefold()],
            int(day_value),
        )

    return None


def _parse_short_date(value: str, year: int) -> date | None:
    cleaned = _clean_text(value)

    match = _SHORT_DATE_MONTH_FIRST_RE.match(cleaned)
    if match:
        month_name, day_value = match.groups()
        return date(
            year,
            _MONTHS[month_name.casefold()],
            int(day_value),
        )

    match = _SHORT_DATE_DAY_FIRST_RE.match(cleaned)
    if match:
        day_value, month_name = match.groups()
        return date(
            year,
            _MONTHS[month_name.casefold()],
            int(day_value),
        )

    return None


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
    region_text = f"{title} {description or ''}"
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
        regions=(
            ["CA"]
            if source == "Banque du Canada"
            else economic_regions(region_text)
        ),
    )


def _strip_statcan_item(value: str) -> str:
    text = _NUMBER_PREFIX_RE.sub("", _clean_text(value))
    text = re.sub(r"^\(lockup\)\s*", "", text, flags=re.IGNORECASE)
    text = _PHONE_RE.sub("", text).strip(" -–—")
    return text


def _parse_statcan_html(
    content: str,
    *,
    now: datetime,
    language: str = "en",
    url: str | None = None,
) -> list[EconomicEvent]:
    blocks = _extract_blocks(content)
    source_url = url or STATCAN_URLS[language]
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
                url=source_url,
                description=(
                    "Publication prévue dans Le Quotidien à 8 h 30 (heure de l’Est)."
                    if language == "fr"
                    else "Scheduled for release in The Daily at 8:30 a.m. Eastern Time."
                ),
            )
        )

    cutoff = now.astimezone(TORONTO) - timedelta(hours=2)
    return [event for event in events if event.starts_at >= cutoff]


def _parse_statcan_json(
    content: str,
    *,
    now: datetime,
    language: str = "en",
    url: str | None = None,
) -> list[EconomicEvent]:
    """Parse StatCan's official JavaScript-array calendar service safely.

    The service documentation calls the response a JavaScript Array and its
    example uses unquoted object keys. Accept both that representation and
    strict JSON without evaluating remote code.
    """
    source_url = url or STATCAN_JSON_URLS[language]
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        normalized = re.sub(
            r"([,{]\s*)(date|type|title|description|url)\s*:",
            r'\1"\2":',
            content,
        )
        payload = json.loads(normalized)
    if not isinstance(payload, list):
        raise ValueError("Le calendrier JSON de StatCan n'est pas une liste")

    events: list[EconomicEvent] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        title = _clean_text(str(item.get("title") or ""))
        raw_date = str(item.get("date") or "").strip()
        if not title or len(raw_date) < 10:
            continue
        try:
            release_day = date.fromisoformat(raw_date[:10])
        except ValueError:
            continue

        raw_url = str(item.get("url") or "").strip()
        if raw_url.startswith("//"):
            event_url = f"https:{raw_url}"
        elif raw_url:
            event_url = urljoin(source_url, raw_url)
        else:
            event_url = source_url
        reference_period = _clean_text(str(item.get("description") or ""))
        release_note = (
            "Publication prévue dans Le Quotidien à 8 h 30 (heure de l’Est)."
            if language == "fr"
            else "Scheduled for release in The Daily at 8:30 a.m. Eastern Time."
        )
        description = (
            f"{reference_period}. {release_note}"
            if reference_period
            else release_note
        )
        events.append(
            _event(
                source="Statistique Canada",
                title=title,
                day=release_day,
                event_time=time(8, 30),
                url=event_url,
                description=description,
            )
        )

    cutoff = now.astimezone(TORONTO) - timedelta(hours=2)
    deduped = {
        (event.title.casefold(), event.starts_at): event
        for event in events
        if event.starts_at >= cutoff
    }
    return sorted(deduped.values(), key=lambda event: event.starts_at)


def _statcan_official_schedule_fallback(
    *,
    now: datetime,
    language: str,
) -> list[EconomicEvent]:
    today = now.astimezone(TORONTO).date()
    if today > STATCAN_ANNUAL_SCHEDULE_VALID_UNTIL:
        return []

    source_url = STATCAN_ANNUAL_SCHEDULE_URLS[language]
    description = (
        "Date du calendrier annuel officiel 2026-2027 de Statistique Canada, "
        "utilisée seulement lorsque les canaux live sont indisponibles."
        if language == "fr"
        else "Date from Statistics Canada's official 2026-2027 annual schedule, "
        "used only when the live channels are unavailable."
    )
    events: list[EconomicEvent] = []
    for raw_day, title_en, title_fr in STATCAN_ANNUAL_SCHEDULE:
        release_day = date.fromisoformat(raw_day)
        if release_day < today:
            continue
        events.append(
            _event(
                source="Statistique Canada",
                title=title_fr if language == "fr" else title_en,
                day=release_day,
                event_time=time(8, 30),
                url=source_url,
                description=description,
            )
        )
    return events


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
            "jour férié",
            "fête du travail",
            "action de grâce",
            "jour du souvenir",
            "noël",
            "lendemain de noël",
            "vérité et réconciliation",
        )
    )


def _parse_boc_html(
    content: str,
    *,
    now: datetime,
    url: str | None = None,
) -> list[EconomicEvent]:
    blocks = _extract_blocks(content)
    source_url = url or BOC_URLS["en"]
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
            if (
                candidate.tag == "p"
                and len(candidate.text) > 25
                and "content type" not in candidate.text.casefold()
                and "type(s) de contenu" not in candidate.text.casefold()
            ):
                description = candidate.text[:500]
                break

        href = title_block.href
        event_url = urljoin(source_url, href) if href else source_url
        events.append(
            _event(
                source="Banque du Canada",
                title=title,
                day=day,
                event_time=parsed_time,
                url=event_url,
                description=description,
            )
        )

    cutoff = now.astimezone(TORONTO) - timedelta(hours=2)
    deduped: dict[tuple[str, datetime], EconomicEvent] = {}
    for event in events:
        if event.starts_at >= cutoff:
            deduped[(event.title.casefold(), event.starts_at)] = event
    return list(deduped.values())


def _proxy_url(
    resource: str,
    language: str,
) -> str | None:
    base = os.getenv("STATCAN_PROXY_URL", "").strip()
    if not base:
        return None
    separator = "&" if "?" in base else "?"
    return (
        f"{base}{separator}"
        f"{urlencode({'resource': resource, 'lang': language})}"
    )


class CalendarService:
    cache_ttl_seconds = 1800.0
    failure_cache_ttl_seconds = 90.0
    max_attempts = 2
    retry_delays = (0.5,)

    def __init__(self) -> None:
        self._cached: dict[
            str,
            CalendarSnapshot,
        ] = {}
        self._cached_at: dict[
            str,
            float,
        ] = {}
        self._last_good_by_source: dict[
            str,
            list[EconomicEvent],
        ] = {}
        self._statcan_cached: dict[
            str,
            tuple[float, list[EconomicEvent], FeedStatus],
        ] = {}
        self._locks = {
            language: asyncio.Lock()
            for language in CALENDAR_LANGUAGES
        }
        self._statcan_locks = {
            language: asyncio.Lock()
            for language in CALENDAR_LANGUAGES
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
        statcan_unavailable = any(
            status.source.startswith("Statistique Canada")
            and status.status != "ok"
            for status in cached.source_statuses
        )
        ttl = (
            self.cache_ttl_seconds
            if cached.events and not statcan_unavailable
            else self.failure_cache_ttl_seconds
        )
        return now - cached_at < ttl

    async def _download_text(
        self,
        client: httpx.AsyncClient,
        *,
        source: str,
        url: str,
        proxy_resource: str | None = None,
        language: str = "fr",
        expected: str = "html",
    ) -> tuple[str, str, str | None]:
        candidates: list[tuple[str, str]] = []
        if proxy_resource:
            proxy = _proxy_url(proxy_resource, language)
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
                    if expected == "json":
                        if not text.lstrip().startswith(("[", "{")):
                            raise ValueError("Réponse non JSON")
                    elif (
                        "<html" not in text[:1000].casefold()
                        and "<!doctype html" not in text[:1000].casefold()
                    ):
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
        self,
        client: httpx.AsyncClient,
        now: datetime,
        language: str,
    ) -> tuple[list[EconomicEvent], FeedStatus]:
        source = "Statistique Canada — Indicateurs clés"
        statcan_url = STATCAN_URLS[language]
        statcan_json_url = STATCAN_JSON_URLS[language]
        json_result, html_result = await asyncio.gather(
            self._download_text(
                client,
                source=f"{source} JSON",
                url=statcan_json_url,
                proxy_resource="calendar-json",
                language=language,
                expected="json",
            ),
            self._download_text(
                client,
                source=f"{source} HTML",
                url=statcan_url,
                proxy_resource="calendar",
                language=language,
            ),
        )

        json_content, json_channel, json_error = json_result
        html_content, html_channel, html_error = html_result
        events: list[EconomicEvent] = []
        parse_errors: list[str] = []
        if not json_error:
            try:
                events.extend(
                    _parse_statcan_json(
                        json_content,
                        now=now,
                        language=language,
                        url=statcan_json_url,
                    )
                )
            except Exception as exc:
                parse_errors.append(f"JSON: {type(exc).__name__}")
        if not html_error:
            try:
                events.extend(
                    _parse_statcan_html(
                        html_content,
                        now=now,
                        language=language,
                        url=statcan_url,
                    )
                )
            except Exception as exc:
                parse_errors.append(f"HTML: {type(exc).__name__}")

        deduped = {
            (event.title.casefold(), event.starts_at): event
            for event in events
        }
        events = sorted(deduped.values(), key=lambda event: event.starts_at)
        if events:
            channels = ", ".join(
                label
                for label, channel, error in (
                    (f"JSON {json_channel}", json_channel, json_error),
                    (f"HTML {html_channel}", html_channel, html_error),
                )
                if channel != "none" and not error
            )
            detail = f"{len(events)} événements — canaux officiels {channels}"
            channel_errors = [
                label
                for label, error in (
                    (f"JSON: {json_error}", json_error),
                    (f"HTML: {html_error}", html_error),
                )
                if error
            ]
            if parse_errors or channel_errors:
                detail += f" ({'; '.join(channel_errors + parse_errors)})"
            return events, FeedStatus(source=source, status="ok", detail=detail)

        fallback = _statcan_official_schedule_fallback(
            now=now,
            language=language,
        )
        error_details = "; ".join(
            detail
            for detail in (json_error, html_error, *parse_errors)
            if detail
        )
        if fallback:
            detail = (
                "Secours officiel daté: calendrier annuel Statistique Canada "
                "2026-2027 (valide jusqu’au 31 mars 2027)."
            )
            if error_details:
                detail += f" Canaux live: {error_details}."
            return fallback, FeedStatus(
                source=source,
                status="unavailable",
                detail=detail,
            )
        return [], FeedStatus(
            source=source,
            status="unavailable",
            detail=(
                error_details
                or "Calendrier officiel reçu, mais aucun événement futur n’a été extrait"
            ),
        )

    async def get_statcan_events(
        self,
        language: str = "fr",
    ) -> tuple[list[EconomicEvent], FeedStatus]:
        """Return the shared StatCan feed without waiting for Bank of Canada."""
        language = self._normalize_language(language)
        now_mono = monotonic()
        cached = self._statcan_cached.get(language)
        if cached:
            cached_at, events, status = cached
            ttl = (
                self.cache_ttl_seconds
                if events and status.status == "ok"
                else self.failure_cache_ttl_seconds
            )
            if now_mono - cached_at < ttl:
                return events, status

        async with self._statcan_locks[language]:
            now_mono = monotonic()
            cached = self._statcan_cached.get(language)
            if cached:
                cached_at, events, status = cached
                ttl = (
                    self.cache_ttl_seconds
                    if events and status.status == "ok"
                    else self.failure_cache_ttl_seconds
                )
                if now_mono - cached_at < ttl:
                    return events, status

            now = datetime.now(UTC)
            timeout = httpx.Timeout(
                connect=8.0,
                read=15.0,
                write=8.0,
                pool=8.0,
            )
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/150.0 Safari/537.36 Anatole/1.5.2"
                ),
                "Accept": "application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
                "Accept-Language": (
                    "fr-CA,fr;q=1.0,en-CA;q=0.5,en;q=0.4"
                    if language == "fr"
                    else "en-CA,en;q=1.0,fr-CA;q=0.5,fr;q=0.4"
                ),
            }
            async with httpx.AsyncClient(
                timeout=timeout,
                headers=headers,
                follow_redirects=True,
            ) as client:
                events, status = self._restore_last_good(
                    f"{language}:statcan",
                    *await self._fetch_statcan(client, now, language),
                    now=now,
                )
            self._statcan_cached[language] = (monotonic(), events, status)
            return events, status

    async def _fetch_boc(
        self,
        client: httpx.AsyncClient,
        now: datetime,
        language: str,
    ) -> tuple[list[EconomicEvent], FeedStatus]:
        source = "Banque du Canada — événements"
        boc_url = BOC_URLS[language]
        content, _channel, error = await self._download_text(
            client,
            source=source,
            url=boc_url,
            language=language,
        )
        if error:
            return [], FeedStatus(source=source, status="unavailable", detail=error)
        events = _parse_boc_html(
            content,
            now=now,
            url=boc_url,
        )
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

    async def get_snapshot(
        self,
        language: str = "fr",
    ) -> CalendarSnapshot:
        language = self._normalize_language(
            language
        )
        cache_now = monotonic()
        if self._cache_is_fresh(
            language,
            cache_now,
        ):
            return self._cached[language]

        async with self._locks[language]:
            cache_now = monotonic()
            if self._cache_is_fresh(
                language,
                cache_now,
            ):
                return self._cached[language]

            now = datetime.now(UTC)
            timeout = httpx.Timeout(
                connect=8.0,
                read=15.0,
                write=10.0,
                pool=10.0,
            )
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/150.0 Safari/537.36 Anatole/1.3.9"
                ),
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
                "Accept-Language": (
                    "fr-CA,fr;q=1.0,en-CA;q=0.5,en;q=0.4"
                    if language == "fr"
                    else "en-CA,en;q=1.0,fr-CA;q=0.5,fr;q=0.4"
                ),
            }
            async with httpx.AsyncClient(
                timeout=timeout,
                headers=headers,
                follow_redirects=True,
            ) as client:
                statcan_result, boc_result = await asyncio.gather(
                    self.get_statcan_events(language),
                    self._fetch_boc(
                        client,
                        now,
                        language,
                    ),
                )

            statcan_events, statcan_status = statcan_result
            boc_events, boc_status = self._restore_last_good(
                f"{language}:boc",
                *boc_result,
                now=now,
            )

            events = statcan_events + boc_events
            deduped: dict[
                tuple[str, str, datetime],
                EconomicEvent,
            ] = {}
            for event in events:
                key = (
                    event.source.casefold(),
                    event.title.casefold(),
                    event.starts_at,
                )
                deduped[key] = event
            events = sorted(
                deduped.values(),
                key=lambda event:
                    event.starts_at,
            )

            snapshot = CalendarSnapshot(
                events=events[:120],
                source_statuses=[
                    statcan_status,
                    boc_status,
                ],
                generated_at=now,
                refresh_after_seconds=(
                    1800
                    if events and statcan_status.status == "ok"
                    else 90
                ),
            )
            self._cached[language] = snapshot
            self._cached_at[language] = monotonic()
            return snapshot



calendar_service = CalendarService()
