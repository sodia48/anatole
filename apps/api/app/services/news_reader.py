"""Conservative article facts and event extraction for the shared news reader.

Public access is not a republication licence. This module returns bounded facts
and event metadata; the UI never receives or renders the scraped article body.
"""
from __future__ import annotations

import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.schemas.discovery import NewsArticle, NewsArticleEvent, NewsBriefRequest

_MONTHS = {
    "janvier": 1, "january": 1, "février": 2, "february": 2,
    "mars": 3, "march": 3, "avril": 4, "april": 4,
    "mai": 5, "may": 5, "juin": 6, "june": 6,
    "juillet": 7, "july": 7, "août": 8, "august": 8,
    "septembre": 9, "september": 9, "octobre": 10, "october": 10,
    "novembre": 11, "november": 11, "décembre": 12, "december": 12,
}
_MONTH = "|".join(sorted(_MONTHS, key=len, reverse=True))
_DATE = re.compile(
    rf"\b(?:(?P<day1>\d{{1,2}})\s+(?P<month1>{_MONTH})|"
    rf"(?P<month2>{_MONTH})\s+(?P<day2>\d{{1,2}}))"
    r"(?:\s*,?\s*(?P<year>20\d{2}))?\b", re.I,
)
_TIME = re.compile(r"\b(?P<hour>\d{1,2})\s*(?:h\s*(?P<minute>\d{2})?|:(?P<colon>\d{2})\s*(?P<ampm>a\.?m\.?|p\.?m\.?)?)\b", re.I)
_RESULTS = re.compile(r"\b(?:results?|earnings?|résultats?)\b", re.I)
_FUTURE = re.compile(r"\b(?:to release|will (?:report|release|publish|announce)|scheduled|upcoming|announces? (?:the )?(?:date|timing)|publiera|prévoit publier|paraîtront|seront publiés|annoncera)\b", re.I)
_CALL = re.compile(r"\b(?:conference call|conférence téléphonique|webcast|webdiffusion)\b", re.I)
_REPLAY = re.compile(r"\b(?:replay|recording|enregistrement|rediffusion)\b", re.I)
_PHONE = re.compile(r"(?<!\d)(?:1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?){2}\d{4}(?!\d)")
_CODE = re.compile(r"\b(?:access code|conference number|code d.accès|numéro de la conférence|code)\s*(?:(?:is|est|:)?\s*(?:le|the)?\s*)?(\d{4,8})\b", re.I)
_FINANCIAL = re.compile(r"\b(?:revenue|revenus?|sales|ventes|earnings per share|EPS|BPA|marge|margin|net income|bénéfice net|cash flow|flux de trésorerie)\b", re.I)
_BOILERPLATE = re.compile(r"^(?:about |à propos de |contact|relations investisseurs|investor relations|source |©)", re.I)
_EASTERN = ZoneInfo("America/Toronto")
_MONTH_NAMES = {
    "fr": ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"),
    "en": ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"),
}


def _readable_date(value: datetime, language: str) -> str:
    month = _MONTH_NAMES[language][value.month - 1]
    return f"{value.day} {month} {value.year}" if language == "fr" else f"{month} {value.day}, {value.year}"


def _date_in(value: str, year: int) -> tuple[datetime | None, re.Match[str] | None]:
    for match in _DATE.finditer(value):
        month = _MONTHS[(match.group("month1") or match.group("month2")).casefold()]
        day = int(match.group("day1") or match.group("day2"))
        try:
            return datetime(int(match.group("year") or year), month, day, tzinfo=_EASTERN), match
        except ValueError:
            continue
    return None, None


def calendar_dates(value: str) -> list[tuple[int, int, str]]:
    """Compare translated month names as well as numeric day and year."""
    return sorted((
        _MONTHS[(match.group("month1") or match.group("month2")).casefold()],
        int(match.group("day1") or match.group("day2")),
        match.group("year") or "",
    ) for match in _DATE.finditer(value))


def _time_in(value: str) -> tuple[int, int] | None:
    match = _TIME.search(value)
    if not match:
        return None
    hour = int(match.group("hour"))
    minute = int(match.group("minute") or match.group("colon") or 0)
    meridiem = (match.group("ampm") or "").lower().replace(".", "")
    if meridiem == "pm" and hour < 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    return (hour, minute) if hour < 24 and minute < 60 else None


def _kind(title: str, text: str) -> str:
    if _RESULTS.search(title):
        if _FUTURE.search(title) or (_FUTURE.search(text[:800]) and not _FINANCIAL.search(text[:800])):
            return "results_schedule"
        return "results_report"
    if re.search(r"\b(?:dividend|dividende)\b", title, re.I):
        return "dividend"
    if re.search(r"\b(?:acqui\w*|fusion|merger)\b", title, re.I):
        return "acquisition"
    if re.search(r"\b(?:project|projet|production|expansion|agrandissement)\b", title, re.I):
        return "operations"
    return "other"


def build_article(request: NewsBriefRequest, text: str, *, source_url: str,
                  coverage: str, language: str) -> NewsArticle:
    blocks = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    blocks = [line for line in blocks if line and not _BOILERPLATE.search(line)]
    published = request.published_at
    if not published and len(blocks) > 1:
        published, _ = _date_in(blocks[1], datetime.now(UTC).year)
    year = published.year if published else datetime.now(UTC).year
    kind = _kind(request.title, " ".join(blocks))
    events: list[NewsArticleEvent] = []
    if kind == "results_schedule":
        candidates: list[tuple[int, datetime, str]] = []
        for block in blocks:
            if _RESULTS.search(block) and _FUTURE.search(block):
                date, _ = _date_in(block, year)
                if date and (not published or date.date() != published.date()):
                    timing = "after_close" if re.search(r"after (?:market )?clos|après la fermeture|après la clôture", block, re.I) else ""
                    candidates.append((int(bool(timing)) * 2 + int(len(block) > 130), date, timing))
        if candidates:
            _, date, timing = max(candidates, key=lambda row: row[0])
            events.append(NewsArticleEvent(kind="results_scheduled", label="Publication des résultats" if request.language == "fr" else "Results release", starts_at=date,
                                           timing=timing, timezone="America/Toronto"))
    for index, block in enumerate(blocks):
        if not _CALL.search(block):
            continue
        # Press releases often put the date in the first bullet following a section heading.
        call_start = _CALL.search(block)
        detail = block[call_start.start():] if call_start else block
        detail = " ".join([detail, *blocks[index + 1:index + 3]])
        date, _ = _date_in(detail, year)
        if not date or (published and date.date() == published.date()):
            continue
        time = _time_in(detail)
        if time:
            date = date.replace(hour=time[0], minute=time[1])
        call = NewsArticleEvent(kind="conference", label="Conférence téléphonique" if request.language == "fr" else "Conference call", starts_at=date,
                                timing="confirmed" if time else "date_only", timezone="America/Toronto")
        tail = " ".join(blocks[index:index + 6])
        call.phone_numbers = list(dict.fromkeys(_PHONE.findall(tail)))[:4]
        code = _CODE.search(tail)
        call.access_code = code.group(1) if code else None
        replay = next((part for part in blocks[index:index + 8] if _REPLAY.search(part)), "")
        call.replay_until, _ = _date_in(replay, year)
        events.append(call)
        break
    # Two short source passages are enough for non-event stories; never expose a
    # scraped full body as a licensed article by inference.
    facts: list[str] = []
    if kind == "results_schedule" and events:
        result = next((event for event in events if event.kind == "results_scheduled"), None)
        call = next((event for event in events if event.kind == "conference"), None)
        subject = request.company or ("L’entreprise" if request.language == "fr" else "The company")
        if result and result.starts_at:
            day = _readable_date(result.starts_at, request.language)
            after_close = result.timing == "after_close"
            facts.append(
                f"{subject} prévoit publier ses résultats le {day}{' après la clôture' if after_close else ''}."
                if request.language == "fr" else
                f"{subject} plans to release results on {day}{' after market close' if after_close else ''}."
            )
        if call and call.starts_at:
            day = _readable_date(call.starts_at, request.language)
            at = ""
            if call.timing == "confirmed":
                if request.language == "fr":
                    clock = f"{call.starts_at.hour} h {call.starts_at.minute:02d}" if call.starts_at.minute else f"{call.starts_at.hour} h"
                    at = f" à {clock}, heure de l’Est"
                else:
                    at = f" at {call.starts_at.hour}:{call.starts_at.minute:02d} Eastern Time"
            facts.append(
                f"Une conférence téléphonique suivra le {day}{at}." if request.language == "fr" else
                f"A conference call will follow on {day}{at}."
            )
    else:
        for block in blocks[1:]:
            if len(block) >= 35 and block.casefold() != request.title.casefold():
                facts.append(block[:240].rstrip())
            if len(facts) == 2:
                break
    limitations: list[str] = []
    if kind == "results_schedule":
        limitations.append("Les résultats financiers ne figurent pas dans cette annonce." if request.language == "fr"
                           else "Financial results are not included in this announcement.")
    if coverage in {"excerpt", "title_only", "inaccessible"}:
        limitations.append("Contenu limité aux informations accessibles." if request.language == "fr"
                           else "Content is limited to available information.")
    notes = {"structured": ("Lecture structurée du communiqué · texte intégral chez l’éditeur", "Structured release · full text at publisher"),
             "excerpt": ("Extrait de l’éditeur", "Publisher excerpt"),
             "title_only": ("Informations limitées", "Limited information"),
             "inaccessible": ("Source inaccessible", "Source unavailable")}
    note = notes.get(coverage, notes["title_only"])[0 if request.language == "fr" else 1]
    return NewsArticle(kind=kind, coverage=coverage, coverage_note=note, title=request.title,
                       published_at=published, facts=facts, events=events,
                       limitations=limitations, source_url=source_url,
                       original_url=request.url, language=language)
