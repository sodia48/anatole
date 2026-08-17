from __future__ import annotations

import asyncio
import hashlib
import html
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from time import monotonic
from typing import Any, Iterable
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import httpx

from app.schemas.provincial_macro import (
    ProvincialMacroEvent,
    ProvincialMacroRelease,
    ProvincialMacroSnapshot,
    ProvincialMacroSource,
)

TORONTO = ZoneInfo("America/Toronto")


@dataclass(frozen=True, slots=True)
class PageSpec:
    key: str
    source: str
    kind: str
    url: str
    category: str
    mode: str = "page"
    title_override_fr: str | None = None
    title_override_en: str | None = None


@dataclass(frozen=True, slots=True)
class ProvinceConfig:
    code: str
    fr: str
    en: str
    pages: tuple[PageSpec, ...]
    calendar_kind: str = "statcan"
    calendar_url: str | None = None


QC_PAGES = (
    PageSpec(
        "qc-highlights",
        "Statistique Québec",
        "statistics",
        "https://statistique.quebec.ca/fr/produit/publication/faits-saillants-economiques",
        "Vue d’ensemble",
    ),
    PageSpec(
        "qc-cpi",
        "Statistique Québec",
        "statistics",
        "https://statistique.quebec.ca/fr/produit/publication/indice-prix-consommation",
        "Inflation",
    ),
    PageSpec(
        "qc-labour",
        "Statistique Québec",
        "statistics",
        "https://statistique.quebec.ca/fr/document/resultats-de-lenquete-sur-la-population-active-pour-le-quebec",
        "Emploi",
    ),
    PageSpec(
        "qc-gdp-industry",
        "Statistique Québec",
        "statistics",
        "https://statistique.quebec.ca/fr/produit/publication/produit-interieur-brut-par-industrie-au-quebec",
        "PIB",
    ),
    PageSpec(
        "qc-gdp-quarterly",
        "Statistique Québec",
        "economic_accounts",
        "https://statistique.quebec.ca/fr/produit/publication/comptes-economiques-quebec-trimestriels",
        "PIB",
    ),
    PageSpec(
        "qc-retail",
        "Statistique Québec",
        "statistics",
        "https://statistique.quebec.ca/fr/produit/publication/ventes-detail",
        "Consommation",
    ),
    PageSpec(
        "qc-manufacturing",
        "Statistique Québec",
        "statistics",
        "https://statistique.quebec.ca/fr/produit/publication/ventes-biens-fabriques",
        "Industrie",
    ),
    PageSpec(
        "qc-housing-starts",
        "Statistique Québec",
        "statistics",
        "https://statistique.quebec.ca/fr/produit/publication/mises-chantier",
        "Logement",
    ),
)

ON_PAGES = (
    PageSpec(
        "on-economic-accounts",
        "Ontario Economic Accounts",
        "economic_accounts",
        "https://www.ontario.ca/page/ontario-economic-accounts",
        "PIB",
    ),
    PageSpec(
        "on-economic-accounts-data",
        "Ontario Data Catalogue — Economic Accounts",
        "economic_accounts",
        "https://data.ontario.ca/dataset/ontario-economic-accounts",
        "PIB",
    ),
    PageSpec(
        "on-budget",
        "Ontario Ministry of Finance",
        "finance",
        "https://budget.ontario.ca/2026/brief.html",
        "Finances publiques",
        title_override_fr="Ontario — perspectives économiques et financières",
        title_override_en="Ontario — economic and fiscal outlook",
    ),
)

BC_PAGES = (
    PageSpec(
        "bc-economy",
        "BC Stats",
        "statistics",
        "https://www2.gov.bc.ca/gov/content/data/statistics/economy",
        "Vue d’ensemble",
    ),
    PageSpec(
        "bc-cpi",
        "BC Stats",
        "statistics",
        "https://www2.gov.bc.ca/gov/content/data/statistics/economy/consumer-price-index",
        "Inflation",
    ),
    PageSpec(
        "bc-labour",
        "BC Stats",
        "statistics",
        "https://www2.gov.bc.ca/gov/content/data/statistics/economy/labour-market-statistics",
        "Emploi",
    ),
    PageSpec(
        "bc-gdp",
        "BC Stats",
        "economic_accounts",
        "https://www2.gov.bc.ca/gov/content/data/statistics/economy/bc-economic-accounts-gdp",
        "PIB",
    ),
    PageSpec(
        "bc-housing",
        "BC Stats",
        "statistics",
        "https://www2.gov.bc.ca/gov/content/data/statistics/economy/housing-building-permits",
        "Logement",
    ),
)

AB_PAGES = (
    PageSpec(
        "ab-dashboard",
        "Alberta Economic Dashboard",
        "dashboard",
        "https://economicdashboard.alberta.ca/",
        "Vue d’ensemble",
    ),
    PageSpec(
        "ab-unemployment",
        "Alberta Economic Dashboard",
        "dashboard",
        "https://economicdashboard.alberta.ca/dashboard/unemployment-rate/",
        "Emploi",
    ),
    PageSpec(
        "ab-labour-force",
        "Alberta Economic Dashboard",
        "dashboard",
        "https://economicdashboard.alberta.ca/dashboard/labour-force",
        "Emploi",
    ),
    PageSpec(
        "ab-wholesale",
        "Alberta Economic Dashboard",
        "dashboard",
        "https://economicdashboard.alberta.ca/dashboard/wholesale-trade",
        "Commerce",
    ),
)

SK_PAGES = (
    PageSpec(
        "sk-reports",
        "Saskatchewan Bureau of Statistics",
        "statistics",
        "https://www.saskatchewan.ca/government/government-data/bureau-of-statistics/economic-reports-and-statistics",
        "Vue d’ensemble",
        mode="anchors",
    ),
    PageSpec(
        "sk-unemployment",
        "Saskatchewan Dashboard",
        "dashboard",
        "https://dashboard.saskatchewan.ca/business-economy/employment-labour-market/unemployment-rate",
        "Emploi",
    ),
    PageSpec(
        "sk-employment",
        "Saskatchewan Dashboard",
        "dashboard",
        "https://dashboard.saskatchewan.ca/business-economy/employment-labour-market/employment",
        "Emploi",
    ),
)

MB_PAGES = (
    PageSpec(
        "mb-mbs",
        "Manitoba Bureau of Statistics",
        "statistics",
        "https://www.gov.mb.ca/mbs/",
        "Vue d’ensemble",
    ),
    PageSpec(
        "mb-weekly",
        "Manitoba Bureau of Statistics — MBS Weekly",
        "statistics",
        "https://www.gov.mb.ca/mbs/moreinfo.html?id=31",
        "Vue d’ensemble",
    ),
    PageSpec(
        "mb-dashboard",
        "Manitoba Finance — Economic Dashboard",
        "dashboard",
        "https://gov.mb.ca/finance/economicdashboard/index.html",
        "Vue d’ensemble",
    ),
)

NB_PAGES = (
    PageSpec(
        "nb-dashboard",
        "New Brunswick Economic Dashboard",
        "dashboard",
        "https://www3.gnb.ca/FTB-FCT/?lang=en",
        "Vue d’ensemble",
    ),
    PageSpec(
        "nb-cpi",
        "New Brunswick Finance — Economic and Social Indicators",
        "statistics",
        "https://www2.gnb.ca/content/gnb/en/departments/finance/esi/prices.html",
        "Inflation",
    ),
    PageSpec(
        "nb-investor",
        "New Brunswick Finance — Investor Relations",
        "finance",
        "https://www.gnb.ca/en/topic/your-gov/budget-finance/investor-relations.html",
        "Finances publiques",
    ),
)

NS_PAGES = (
    PageSpec(
        "ns-daily",
        "Nova Scotia Economics and Statistics",
        "statistics",
        "https://novascotia.ca/finance/statistics/default.asp",
        "Vue d’ensemble",
        mode="anchors",
    ),
    PageSpec(
        "ns-labour",
        "Nova Scotia Economics and Statistics",
        "statistics",
        "https://novascotia.ca/finance/statistics/topic.asp?fto=20t",
        "Emploi",
    ),
    PageSpec(
        "ns-cpi",
        "Nova Scotia Economics and Statistics",
        "statistics",
        "https://novascotia.ca/finance/statistics/topic.asp?fto=21u",
        "Inflation",
    ),
)

PE_PAGES = (
    PageSpec(
        "pe-economics",
        "PEI Economics and Statistics",
        "statistics",
        "https://www.princeedwardisland.ca/en/topic/economics-and-statistics",
        "Vue d’ensemble",
        mode="anchors",
    ),
    PageSpec(
        "pe-indicators",
        "PEI Department of Finance — Economic Indicators",
        "statistics",
        "https://www.princeedwardisland.ca/en/topic/economic-indicators",
        "Vue d’ensemble",
    ),
    PageSpec(
        "pe-cpi",
        "PEI Department of Finance",
        "statistics",
        "https://www.princeedwardisland.ca/en/information/finance-and-affordability/consumer-price-index-monthly",
        "Inflation",
    ),
)

NL_PAGES = (
    PageSpec(
        "nl-stats",
        "Newfoundland & Labrador Statistics Agency",
        "statistics",
        "https://www.stats.gov.nl.ca/",
        "Vue d’ensemble",
    ),
)

PROVINCES: dict[str, ProvinceConfig] = {
    "QC": ProvinceConfig(
        "QC", "Québec", "Quebec", QC_PAGES, "quebec",
        "https://statistique.quebec.ca/fr/produit/tableau/calendrier-de-diffusion-principaux-indicateurs-economiques",
    ),
    "ON": ProvinceConfig(
        "ON", "Ontario", "Ontario", ON_PAGES, "ontario",
        "https://budget.ontario.ca/2026/chapter-2.html",
    ),
    "BC": ProvinceConfig(
        "BC", "Colombie-Britannique", "British Columbia", BC_PAGES,
        "british_columbia",
        "https://www2.gov.bc.ca/gov/content/data/statistics/bc-stats",
    ),
    "AB": ProvinceConfig(
        "AB", "Alberta", "Alberta", AB_PAGES,
        "alberta",
        "https://www.alberta.ca/labour-market-highlights",
    ),
    "SK": ProvinceConfig(
        "SK", "Saskatchewan", "Saskatchewan", SK_PAGES, "saskatchewan",
        "https://publications.saskatchewan.ca/api/v1/products/86689/formats/156260/download",
    ),
    "MB": ProvinceConfig("MB", "Manitoba", "Manitoba", MB_PAGES),
    "NB": ProvinceConfig("NB", "Nouveau-Brunswick", "New Brunswick", NB_PAGES),
    "NS": ProvinceConfig("NS", "Nouvelle-Écosse", "Nova Scotia", NS_PAGES),
    "PE": ProvinceConfig("PE", "Île-du-Prince-Édouard", "Prince Edward Island", PE_PAGES),
    "NL": ProvinceConfig("NL", "Terre-Neuve-et-Labrador", "Newfoundland and Labrador", NL_PAGES),
}

REGION_ALIASES = {
    "qc": "QC", "quebec": "QC",
    "on": "ON", "ontario": "ON",
    "bc": "BC", "british columbia": "BC", "colombie britannique": "BC",
    "ab": "AB", "alberta": "AB",
    "sk": "SK", "saskatchewan": "SK",
    "mb": "MB", "manitoba": "MB",
    "nb": "NB", "new brunswick": "NB", "nouveau brunswick": "NB",
    "ns": "NS", "nova scotia": "NS", "nouvelle ecosse": "NS",
    "pe": "PE", "pei": "PE", "prince edward island": "PE", "ile du prince edouard": "PE",
    "nl": "NL", "newfoundland and labrador": "NL", "terre neuve et labrador": "NL",
}

# These are deliberately narrow. A province view is not a generic press-release feed.
ESSENTIAL_RULES: tuple[tuple[str, int, tuple[str, ...]], ...] = (
    ("Inflation", 100, (
        "consumer price index", "indice des prix a la consommation", "inflation", " cpi ", " ipc ",
    )),
    ("Emploi", 100, (
        "labour force survey", "enquete sur la population active", "employment", "unemployment",
        "labour force statistics", "emploi", "chomage", "payroll employment",
        "earnings and hours", "weekly earnings",
    )),
    ("PIB", 100, (
        "gross domestic product", "produit interieur brut", "economic accounts", "comptes economiques",
        "gdp", "pib",
    )),
    ("Consommation", 88, (
        "retail trade", "retail sales", "ventes au detail", "commerce de detail",
    )),
    ("Industrie", 86, (
        "manufacturing", "manufacturing sales", "ventes de biens fabriques", "fabrication",
        "industries manufacturieres",
    )),
    ("Commerce", 84, (
        "international merchandise exports", "international merchandise trade",
        "exports", "imports", "exportations", "importations", "wholesale trade",
        "commerce de gros",
    )),
    ("Logement", 84, (
        "building permits", "permis de batir", "housing starts", "mises en chantier",
        "investment in building construction", "investissement en construction de batiments",
    )),
    ("Population", 82, (
        "quarterly population", "population estimates", "estimations demographiques",
        "population",
    )),
    ("Investissement", 78, (
        "capital expenditures", "capital investment", "business investment",
        "depenses en immobilisations", "investissement des entreprises",
    )),
    ("Finances publiques", 92, (
        "budget", "fiscal update", "quarter finances", "quarterly report",
        "deficit", "surplus", "net debt", "public accounts",
        "mise a jour financiere", "finances publiques", "dette nette",
    )),
)

HARD_EXCLUSIONS = (
    "agenda public", "avis aux medias", "avis aux médias",
    "media advisory", "listeria", "food recall", "rappel alimentaire",
    "mise en garde a la population", "mise en garde à la population",
    "public safety", "securite publique", "sécurité publique",
    "road closure", "fermeture de route", "appointment", "nomination",
    "ceremony", "ceremonie", "cérémonie", "sports and recreation",
    "culture et communications",
)

# Events that truly have province-level output and may safely be "provincialised".
STATCAN_PROVINCIAL_EVENT_PATTERNS = (
    "consumer price index",
    "indice des prix a la consommation",
    "labour force survey",
    "enquete sur la population active",
    "payroll employment, earnings and hours",
    "employment, earnings and hours",
    "survey of employment, payrolls and hours",
    "emploi salarie, remuneration, heures travaillees",
    "emploi, remuneration et heures de travail",
    "retail trade",
    "retail sales",
    "commerce de detail",
    "ventes au detail",
    "wholesale trade",
    "commerce de gros",
    "monthly survey of manufacturing",
    "manufacturing sales",
    "enquete mensuelle sur les industries manufacturieres",
    "ventes de biens fabriques",
    "average weekly earnings",
    "remuneration hebdomadaire moyenne",
    "building permits",
    "permis de batir",
    "investment in building construction",
    "investissement en construction de batiments",
    "quarterly demographic estimates",
    "estimations demographiques trimestrielles",
    "population estimates",
    "estimations de la population",
    "gross domestic product by industry: provinces",
    "gross domestic product by industry, provinces",
    "gross domestic product by industry: provinces and territories",
    "produit interieur brut par industrie : provinces",
    "international merchandise trade by province",
    "international merchandise exports by province",
    "commerce international de marchandises par province",
    "exportations internationales de marchandises par province",
)

# Dated safety net copied from Statistique Québec's official main-indicator
# release calendar, updated 2026-08-14. It is used ONLY if live parsing fails
# and only through 2026-09-30, so Anatole never carries these dates forward
# indefinitely. The live official page remains the primary source.
QC_RELEASE_SCHEDULE_SNAPSHOT = (
    ("2026-08-17", "Indice des prix à la consommation (Québec, Canada)", "Inflation", 100),
    ("2026-08-18", "Exportations et importations internationales réelles de marchandises ($ de 2017)", "Commerce", 92),
    ("2026-08-18", "Mises en chantier (Québec, Canada)", "Logement", 88),
    ("2026-08-21", "Ventes au détail (Québec, Canada)", "Consommation", 92),
    ("2026-08-27", "Rémunération hebdomadaire moyenne, incluant le temps supplémentaire (Québec, Canada)", "Emploi", 88),
    ("2026-09-04", "Enquête sur la population active (EPA) (Québec, Canada)", "Emploi", 100),
    ("2026-09-14", "Ventes de biens fabriqués (Québec, Canada)", "Industrie", 88),
    ("2026-09-15", "Ventes en gros (Québec, Canada)", "Commerce", 86),
    ("2026-09-16", "Permis de bâtir (Québec, Canada)", "Logement", 88),
    ("2026-09-23", "Comptes économiques trimestriels — Québec", "PIB", 100),
)
QC_RELEASE_SCHEDULE_SNAPSHOT_VALID_UNTIL = date(2026, 9, 30)

# Saskatchewan's own published 2026-27 report-release schedule.
SK_RELEASE_SCHEDULE = (
    ("2026-08-17", "Inflation Report (Consumer Price Index) — July 2026", "Inflation", 100),
    ("2026-09-04", "Labour Force Survey — August 2026", "Emploi", 100),
    ("2026-09-08", "Monthly Statistical Review — September 2026", "Vue d’ensemble", 86),
    ("2026-09-14", "Inflation Report (Consumer Price Index) — August 2026", "Inflation", 100),
    ("2026-09-23", "Quarterly Population — Q2 2026 (population July 1, 2026)", "Population", 82),
    ("2026-10-09", "Labour Force Survey — September 2026", "Emploi", 100),
    ("2026-10-13", "Monthly Statistical Review — October 2026", "Vue d’ensemble", 86),
    ("2026-10-19", "Inflation Report (Consumer Price Index) — September 2026", "Inflation", 100),
    ("2026-11-06", "Labour Force Survey — October 2026", "Emploi", 100),
    ("2026-11-10", "Monthly Statistical Review — November 2026", "Vue d’ensemble", 86),
    ("2026-11-16", "Inflation Report (Consumer Price Index) — October 2026", "Inflation", 100),
    ("2026-12-04", "Labour Force Survey — November 2026", "Emploi", 100),
    ("2026-12-08", "Monthly Statistical Review — December 2026", "Vue d’ensemble", 86),
    ("2026-12-14", "Inflation Report (Consumer Price Index) — November 2026", "Inflation", 100),
    ("2026-12-17", "Quarterly Population — Q3 2026 (population October 1, 2026)", "Population", 82),
    ("2027-01-08", "Labour Force Survey — December 2026", "Emploi", 100),
    ("2027-01-12", "Monthly Statistical Review — January 2027", "Vue d’ensemble", 86),
    ("2027-01-18", "Inflation Report (Consumer Price Index) — December 2026", "Inflation", 100),
    ("2027-02-05", "Labour Force Survey — January 2027", "Emploi", 100),
    ("2027-02-09", "Monthly Statistical Review — February 2027", "Vue d’ensemble", 86),
    ("2027-02-16", "Inflation Report (Consumer Price Index) — January 2027", "Inflation", 100),
    ("2027-03-12", "Labour Force Survey — February 2027", "Emploi", 100),
    ("2027-03-12", "Monthly Statistical Review — March 2027", "Vue d’ensemble", 86),
    ("2027-03-15", "Inflation Report (Consumer Price Index) — February 2027", "Inflation", 100),
    ("2027-03-17", "Quarterly Population — Q4 2026 (population January 1, 2027)", "Population", 82),
)

FR_MONTHS = {
    "janvier": 1, "fevrier": 2, "février": 2, "mars": 3, "avril": 4, "mai": 5,
    "juin": 6, "juillet": 7, "aout": 8, "août": 8, "septembre": 9,
    "octobre": 10, "novembre": 11, "decembre": 12, "décembre": 12,
}
EN_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def normalize_region(value: object) -> str:
    raw = str(value or "").strip()
    if raw.upper() in PROVINCES:
        return raw.upper()
    return REGION_ALIASES.get(_norm(raw), "")


def province_name(code: str, lang: str = "fr") -> str:
    config = PROVINCES[code]
    return config.en if str(lang).lower().startswith("en") else config.fr


def classify_macro(text: object) -> tuple[str | None, int]:
    haystack = f" {_norm(text)} "
    if any(_norm(pattern) in haystack for pattern in HARD_EXCLUSIONS):
        return None, 0
    best_category: str | None = None
    best_score = 0
    for category, score, patterns in ESSENTIAL_RULES:
        hits = sum(1 for pattern in patterns if f" {_norm(pattern)} " in haystack or _norm(pattern) in haystack)
        if hits:
            adjusted = min(100, score + min(4, max(0, hits - 1) * 2))
            if adjusted > best_score:
                best_category = category
                best_score = adjusted
    return best_category, best_score


def importance_label(score: int) -> str:
    if score >= 88:
        return "Élevée"
    if score >= 72:
        return "Moyenne"
    return "Faible"


def _id(*parts: object) -> str:
    payload = "|".join(str(part or "").strip().casefold() for part in parts)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:18]


def _parse_http_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except Exception:
        return None


_DATE_ISO = re.compile(r"\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b")
_DATE_FR = re.compile(
    r"\b([0-3]?\d)\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(20\d{2})\b",
    re.I,
)
_DATE_EN = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+([0-3]?\d),?\s+(20\d{2})\b",
    re.I,
)


def _dates_in_text(text: str) -> list[date]:
    output: list[date] = []
    for year, month, day in _DATE_ISO.findall(text):
        try:
            output.append(date(int(year), int(month), int(day)))
        except ValueError:
            pass
    for day, month_name, year in _DATE_FR.findall(text):
        try:
            output.append(date(int(year), FR_MONTHS[month_name.casefold()], int(day)))
        except (ValueError, KeyError):
            pass
    for month_name, day, year in _DATE_EN.findall(text):
        try:
            output.append(date(int(year), EN_MONTHS[month_name.casefold()], int(day)))
        except (ValueError, KeyError):
            pass
    return output


class ContentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[tuple[str, str]] = []
        self.anchors: list[tuple[str, str]] = []
        self.rows: list[list[str]] = []
        self._skip = 0
        self._tag = ""
        self._parts: list[str] = []
        self._href = ""
        self._anchor_parts: list[str] = []
        self._row: list[str] | None = None
        self._cell_parts: list[str] | None = None

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.casefold()
        if tag in {"script", "style", "svg", "noscript"}:
            self._skip += 1
            return
        if self._skip:
            return
        if tag in {"h1", "h2", "h3", "p", "li"}:
            self._tag = tag
            self._parts = []
        if tag == "a":
            self._href = str(dict(attrs).get("href") or "")
            self._anchor_parts = []
        if tag == "tr":
            self._row = []
        if tag in {"td", "th"} and self._row is not None:
            self._cell_parts = []

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        clean = re.sub(r"\s+", " ", html.unescape(data or "")).strip()
        if not clean:
            return
        if self._tag:
            self._parts.append(clean)
        if self._href or self._anchor_parts:
            self._anchor_parts.append(clean)
        if self._cell_parts is not None:
            self._cell_parts.append(clean)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag in {"script", "style", "svg", "noscript"}:
            self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return
        if tag == self._tag and self._tag:
            text = re.sub(r"\s+", " ", " ".join(self._parts)).strip()
            if text:
                self.blocks.append((tag, text))
            self._tag = ""
            self._parts = []
        if tag == "a":
            text = re.sub(r"\s+", " ", " ".join(self._anchor_parts)).strip()
            if text and self._href:
                self.anchors.append((text, self._href))
            self._href = ""
            self._anchor_parts = []
        if tag in {"td", "th"} and self._cell_parts is not None:
            text = re.sub(r"\s+", " ", " ".join(self._cell_parts)).strip()
            if self._row is not None:
                self._row.append(text)
            self._cell_parts = None
        if tag == "tr" and self._row is not None:
            if any(self._row):
                self.rows.append(self._row)
            self._row = None


def _best_title(parser: ContentParser, fallback: str) -> str:
    for tag, text in parser.blocks:
        if tag == "h1" and 4 <= len(text) <= 180:
            return text
    for tag, text in parser.blocks:
        if tag in {"h2", "h3"} and 4 <= len(text) <= 180:
            return text
    return fallback


def _best_summary(parser: ContentParser, category: str) -> str:
    category_norm = _norm(category)
    candidates: list[tuple[int, str]] = []
    for tag, text in parser.blocks:
        if tag not in {"p", "h2", "h3"}:
            continue
        clean = re.sub(r"\s+", " ", text).strip()
        if len(clean) < 45 or len(clean) > 1400:
            continue
        norm = _norm(clean)
        score = 0
        if category_norm and category_norm in norm:
            score += 3
        detected_category, detected_score = classify_macro(clean)
        if detected_category:
            score += max(2, detected_score // 25)
        if re.search(r"\d", clean):
            score += 2
        if "cookie" in norm or "privacy" in norm or "contact us" in norm:
            score -= 10
        candidates.append((score, clean))
    if not candidates:
        return ""
    candidates.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
    return candidates[0][1][:720]


def _extract_page_release(
    html_text: str,
    *,
    spec: PageSpec,
    region: str,
    lang: str,
    base_url: str,
    last_modified: str | None = None,
) -> list[ProvincialMacroRelease]:
    parser = ContentParser()
    parser.feed(html_text)

    province = province_name(region, lang)
    page_date = _parse_http_date(last_modified)
    all_text = " ".join(text for _, text in parser.blocks)
    explicit_dates = _dates_in_text(all_text)
    if explicit_dates:
        newest = max(explicit_dates)
        if newest <= date.today() + timedelta(days=7):
            page_date = datetime.combine(newest, time(12), tzinfo=TORONTO).astimezone(UTC)

    if spec.mode == "anchors":
        output: list[ProvincialMacroRelease] = []
        seen: set[str] = set()
        for anchor_text, href in parser.anchors:
            category, score = classify_macro(anchor_text)
            if not category or score < 72:
                continue
            key = _norm(anchor_text)
            if key in seen or len(anchor_text) < 8:
                continue
            seen.add(key)
            url = urljoin(base_url, href)
            output.append(
                ProvincialMacroRelease(
                    id=_id(region, spec.source, url, anchor_text),
                    region=region,
                    province=province,
                    title=anchor_text[:220],
                    summary=(
                        f"Publication économique officielle concernant {province}. "
                        "Ouvrir la source pour les chiffres, la période de référence et les révisions."
                        if lang == "fr"
                        else f"Official economic release concerning {province}. "
                        "Open the source for figures, reference period and revisions."
                    ),
                    category=category,
                    importance=importance_label(score),
                    importance_score=score,
                    source=spec.source,
                    source_kind=spec.kind,
                    source_url=url,
                    published_at=page_date,
                    official=True,
                    specificity="fiscal-direct" if spec.kind == "finance" else "province-direct",
                )
            )
            if len(output) >= 8:
                break
        if output:
            return output

    title = (
        spec.title_override_en if lang == "en" else spec.title_override_fr
    ) or _best_title(parser, f"{province} — {spec.category}")

    summary = _best_summary(parser, spec.category)
    if not summary:
        summary = (
            f"Source économique officielle pour {province}. "
            "Consulter la publication pour les données détaillées."
            if lang == "fr"
            else f"Official economic source for {province}. "
            "Open the publication for detailed data."
        )

    detected_category, detected_score = classify_macro(f"{title} {summary}")
    category = detected_category or spec.category
    base_scores = {
        "Inflation": 100, "Emploi": 100, "PIB": 100, "Finances publiques": 92,
        "Consommation": 88, "Industrie": 86, "Commerce": 84, "Logement": 84,
        "Population": 82, "Investissement": 78, "Vue d’ensemble": 82,
    }
    score = max(detected_score, base_scores.get(category, 76))

    return [
        ProvincialMacroRelease(
            id=_id(region, spec.source, spec.url, title),
            region=region,
            province=province,
            title=title[:220],
            summary=summary,
            category=category,
            importance=importance_label(score),
            importance_score=score,
            source=spec.source,
            source_kind=spec.kind,
            source_url=spec.url,
            published_at=page_date,
            official=True,
            specificity="fiscal-direct" if spec.kind == "finance" else "province-direct",
        )
    ]


def _quebec_calendar_snapshot_fallback(
    *,
    now: datetime,
    lang: str,
    source_url: str,
) -> list[ProvincialMacroEvent]:
    today = now.astimezone(TORONTO).date()
    if today > QC_RELEASE_SCHEDULE_SNAPSHOT_VALID_UNTIL:
        return []
    province = province_name("QC", lang)
    output: list[ProvincialMacroEvent] = []
    for raw_day, title_fr, category, score in QC_RELEASE_SCHEDULE_SNAPSHOT:
        release_day = date.fromisoformat(raw_day)
        if release_day < today:
            continue
        title_base = title_fr
        if lang == "en":
            translations = {
                "Indice des prix à la consommation (Québec, Canada)": "Consumer Price Index (Quebec, Canada)",
                "Exportations et importations internationales réelles de marchandises ($ de 2017)": "Real international merchandise exports and imports (2017 dollars)",
                "Mises en chantier (Québec, Canada)": "Housing starts (Quebec, Canada)",
                "Ventes au détail (Québec, Canada)": "Retail sales (Quebec, Canada)",
                "Rémunération hebdomadaire moyenne, incluant le temps supplémentaire (Québec, Canada)": "Average weekly earnings, including overtime (Quebec, Canada)",
                "Enquête sur la population active (EPA) (Québec, Canada)": "Labour Force Survey (Quebec, Canada)",
                "Ventes de biens fabriqués (Québec, Canada)": "Manufacturing sales (Quebec, Canada)",
                "Ventes en gros (Québec, Canada)": "Wholesale sales (Quebec, Canada)",
                "Permis de bâtir (Québec, Canada)": "Building permits (Quebec, Canada)",
                "Comptes économiques trimestriels — Québec": "Quarterly economic accounts — Quebec",
            }
            title_base = translations.get(title_fr, title_fr)
        if not _norm(title_base).startswith(_norm(province)):
            title = f"{province} — {title_base}"
        else:
            title = title_base
        starts_at = datetime.combine(release_day, time(9, 0), tzinfo=TORONTO)
        output.append(
            ProvincialMacroEvent(
                id=_id("QC", "official-snapshot", title, starts_at.isoformat()),
                region="QC",
                province=province,
                title=title[:240],
                description=(
                    "Date publiée dans le calendrier officiel des principaux indicateurs économiques de Statistique Québec; copie de secours datée du 14 août 2026 utilisée uniquement si la lecture live échoue."
                    if lang == "fr"
                    else "Date published in Québec Statistics' official main economic indicators calendar; dated Aug. 14, 2026 fallback used only if live parsing fails."
                ),
                category=category,
                importance=importance_label(score),
                importance_score=score,
                starts_at=starts_at,
                time_is_estimated=True,
                source="Statistique Québec",
                source_kind="statistics",
                source_url=source_url,
                official=True,
                specificity="province-direct",
            )
        )
    return output


def _translate_statcan_title(title: str, lang: str) -> str:
    clean = re.sub(r"^\s*\((?:huis clos|lockup)\)\s*", "", title, flags=re.I)
    clean = re.sub(
        r"\s*\([A-Za-zÀ-ÿ .'-]+,\s*(?:\+?1[-.\s]?)?\d{3}[-.\s]\d{3}[-.\s]\d{4}\)\s*$",
        "",
        clean,
    ).strip()
    if lang != "fr":
        return clean
    replacements = (
        ("Consumer Price Index", "Indice des prix à la consommation"),
        ("Labour Force Survey", "Enquête sur la population active"),
        ("Retail trade", "Commerce de détail"),
        ("Retail sales", "Ventes au détail"),
        ("Wholesale trade", "Commerce de gros"),
        ("Monthly Survey of Manufacturing", "Enquête mensuelle sur les industries manufacturières"),
        ("Manufacturing sales", "Ventes de biens fabriqués"),
        ("Building permits", "Permis de bâtir"),
        ("Quarterly demographic estimates", "Estimations démographiques trimestrielles"),
        ("Population estimates", "Estimations de la population"),
        ("Survey of Employment, Payrolls and Hours", "Enquête sur l’emploi, la rémunération et les heures de travail"),
        ("Employment, Earnings and Hours", "Emploi, rémunération et heures de travail"),
        ("Average weekly earnings", "Rémunération hebdomadaire moyenne"),
    )
    for english, french in replacements:
        clean = re.sub(re.escape(english), french, clean, flags=re.I)
    return clean


def _quebec_calendar_events(
    html_text: str,
    *,
    now: datetime,
    lang: str,
    source_url: str,
) -> list[ProvincialMacroEvent]:
    parser = ContentParser()
    parser.feed(html_text)
    province = province_name("QC", lang)
    current_indicator = ""
    events: list[ProvincialMacroEvent] = []
    today = now.astimezone(TORONTO).date()

    for row in parser.rows:
        cells = [re.sub(r"\s+", " ", cell).strip() for cell in row if cell.strip()]
        if not cells:
            continue
        joined = " | ".join(cells)
        norm = _norm(joined)
        if "quebec" not in norm:
            # A header/indicator row may be separate; remember it.
            first = cells[0]
            if not _dates_in_text(joined) and len(first) > 5:
                current_indicator = first
            continue

        first = cells[0]
        if _norm(first) not in {"quebec", "canada"} and not first.startswith("–"):
            current_indicator = first

        dates = _dates_in_text(joined)
        future_dates = [item for item in dates if item >= today]
        if not future_dates:
            continue
        release_day = max(future_dates)

        title_base = current_indicator or cells[0]
        category, score = classify_macro(title_base)
        if not category:
            # Québec's own main-indicator calendar is already curated.
            category, score = "Vue d’ensemble", 82

        title = (
            f"{province} — {title_base}"
            if not _norm(title_base).startswith(_norm(province))
            else title_base
        )
        starts_at = datetime.combine(release_day, time(9, 0), tzinfo=TORONTO)
        events.append(
            ProvincialMacroEvent(
                id=_id("QC", title, starts_at.isoformat()),
                region="QC",
                province=province,
                title=title[:240],
                description=(
                    "Date de prochaine diffusion publiée par Statistique Québec."
                    if lang == "fr"
                    else "Next release date published by Québec Statistics."
                ),
                category=category,
                importance=importance_label(score),
                importance_score=score,
                starts_at=starts_at,
                time_is_estimated=True,
                source="Statistique Québec",
                source_kind="statistics",
                source_url=source_url,
                official=True,
                specificity="province-direct",
            )
        )

    return _dedupe_events(events)


def _ontario_calendar_events(
    html_text: str,
    *,
    now: datetime,
    lang: str,
    source_url: str,
) -> list[ProvincialMacroEvent]:
    parser = ContentParser()
    parser.feed(html_text)
    province = province_name("ON", lang)
    today = now.astimezone(TORONTO).date()
    events: list[ProvincialMacroEvent] = []

    for row in parser.rows:
        joined = " | ".join(cell for cell in row if cell.strip())
        norm = _norm(joined)
        if "quarter" not in norm and "trimestre" not in norm:
            continue
        dates = _dates_in_text(joined)
        if not dates:
            continue
        # Ontario's OEA deadline is the last date in each table row.
        release_day = dates[-1]
        if release_day < today:
            continue
        reference = row[0].strip() if row else "Ontario Economic Accounts"
        title = (
            f"Ontario Economic Accounts — {reference}"
            if "ontario economic accounts" not in _norm(reference)
            else reference
        )
        starts_at = datetime.combine(release_day, time(10, 0), tzinfo=TORONTO)
        events.append(
            ProvincialMacroEvent(
                id=_id("ON", title, starts_at.isoformat()),
                region="ON",
                province=province,
                title=title[:240],
                description=(
                    "Échéance officielle de publication des comptes économiques de l’Ontario."
                    if lang == "fr"
                    else "Official Ontario Economic Accounts release deadline."
                ),
                category="PIB",
                importance="Élevée",
                importance_score=100,
                starts_at=starts_at,
                time_is_estimated=True,
                source="Ontario Economic Accounts",
                source_kind="economic_accounts",
                source_url=source_url,
                official=True,
                specificity="province-direct",
            )
        )
    return _dedupe_events(events)


def _british_columbia_calendar_events(
    html_text: str,
    *,
    now: datetime,
    lang: str,
    source_url: str,
) -> list[ProvincialMacroEvent]:
    parser = ContentParser()
    parser.feed(html_text)
    schedule_year: int | None = None
    for tag, text in parser.blocks:
        if tag not in {"h2", "h3"} or "release schedule" not in _norm(text):
            continue
        year_match = re.search(r"\b(20\d{2})\b", text)
        if year_match:
            schedule_year = int(year_match.group(1))
            break
    if schedule_year is None:
        return []

    header: list[str] | None = None
    for row in parser.rows:
        if row and _norm(row[0]) == str(schedule_year):
            header = row
            break
    if not header or len(header) < 2:
        return []

    province = province_name("BC", lang)
    today = now.astimezone(TORONTO).date()
    events: list[ProvincialMacroEvent] = []
    for row in parser.rows:
        if not row:
            continue
        month = EN_MONTHS.get(_norm(row[0]))
        if not month:
            continue
        for index, raw_day in enumerate(row[1:], start=1):
            if index >= len(header):
                break
            day_match = re.fullmatch(r"\s*([0-3]?\d)\s*", raw_day)
            if not day_match:
                continue
            try:
                release_day = date(schedule_year, month, int(day_match.group(1)))
            except ValueError:
                continue
            if release_day < today:
                continue
            indicator = header[index].strip()
            category, score = classify_macro(indicator)
            if not category:
                continue
            localized_indicator = _translate_statcan_title(indicator, lang)
            title = f"{province} — {localized_indicator}"
            starts_at = datetime.combine(release_day, time(12, 0), tzinfo=TORONTO)
            events.append(
                ProvincialMacroEvent(
                    id=_id("BC", title, starts_at.isoformat()),
                    region="BC",
                    province=province,
                    title=title[:240],
                    description=(
                        "Date publiée dans le calendrier officiel de BC Stats."
                        if lang == "fr"
                        else "Date published in BC Stats' official release schedule."
                    ),
                    category=category,
                    importance=importance_label(score),
                    importance_score=score,
                    starts_at=starts_at,
                    time_is_estimated=True,
                    source="BC Stats",
                    source_kind="statistics",
                    source_url=source_url,
                    official=True,
                    specificity="province-direct",
                )
            )
    return _dedupe_events(events)


def _alberta_calendar_events(
    html_text: str,
    *,
    now: datetime,
    lang: str,
    source_url: str,
) -> list[ProvincialMacroEvent]:
    parser = ContentParser()
    parser.feed(html_text)
    marker_index: int | None = None
    for index, (_tag, text) in enumerate(parser.blocks):
        if "labour force survey release dates" in _norm(text):
            marker_index = index
            break
    if marker_index is None:
        return []

    province = province_name("AB", lang)
    today = now.astimezone(TORONTO).date()
    title_base = (
        "Enquête sur la population active"
        if lang == "fr"
        else "Labour Force Survey"
    )
    title = f"{province} — {title_base}"
    events: list[ProvincialMacroEvent] = []
    for tag, text in parser.blocks[marker_index + 1 :]:
        normalized = _norm(text)
        if tag == "h2" or "following statistics are available" in normalized:
            break
        for release_day in _dates_in_text(text):
            if release_day < today:
                continue
            starts_at = datetime.combine(release_day, time(12, 0), tzinfo=TORONTO)
            events.append(
                ProvincialMacroEvent(
                    id=_id("AB", title, starts_at.isoformat()),
                    region="AB",
                    province=province,
                    title=title,
                    description=(
                        "Date de diffusion de l’EPA publiée par le gouvernement de l’Alberta; "
                        "l’heure n’est pas affichée comme heure exacte."
                        if lang == "fr"
                        else "LFS release date published by the Government of Alberta; "
                        "the time is not presented as an exact release time."
                    ),
                    category="Emploi",
                    importance="Élevée",
                    importance_score=100,
                    starts_at=starts_at,
                    time_is_estimated=True,
                    source="Alberta Labour Market Information",
                    source_kind="statistics",
                    source_url=source_url,
                    official=True,
                    specificity="province-direct",
                )
            )
    return _dedupe_events(events)


def _saskatchewan_calendar_events(
    *,
    now: datetime,
    lang: str,
    source_url: str,
) -> list[ProvincialMacroEvent]:
    province = province_name("SK", lang)
    today = now.astimezone(TORONTO).date()
    output: list[ProvincialMacroEvent] = []
    for raw_day, title_base, category, score in SK_RELEASE_SCHEDULE:
        release_day = date.fromisoformat(raw_day)
        if release_day < today:
            continue
        title = f"{province} — {title_base}"
        starts_at = datetime.combine(release_day, time(8, 30), tzinfo=TORONTO)
        output.append(
            ProvincialMacroEvent(
                id=_id("SK", title, starts_at.isoformat()),
                region="SK",
                province=province,
                title=title,
                description=(
                    "Date publiée par le Saskatchewan Bureau of Statistics."
                    if lang == "fr"
                    else "Date published by the Saskatchewan Bureau of Statistics."
                ),
                category=category,
                importance=importance_label(score),
                importance_score=score,
                starts_at=starts_at,
                time_is_estimated=True,
                source="Saskatchewan Bureau of Statistics",
                source_kind="statistics",
                source_url=source_url,
                official=True,
                specificity="province-direct",
            )
        )
    return output


def _is_statcan_provincial_event(title: str) -> bool:
    haystack = _norm(title)
    return any(_norm(pattern) in haystack for pattern in STATCAN_PROVINCIAL_EVENT_PATTERNS)


def provincialize_statcan_events(
    events: Iterable[Any],
    *,
    region: str,
    lang: str,
    now: datetime,
) -> list[ProvincialMacroEvent]:
    province = province_name(region, lang)
    output: list[ProvincialMacroEvent] = []
    cutoff = now.astimezone(TORONTO) - timedelta(hours=2)

    for event in events:
        title = str(getattr(event, "title", "") or "")
        source = str(getattr(event, "source", "") or "")
        starts_at = getattr(event, "starts_at", None)
        if not title or not isinstance(starts_at, datetime):
            continue
        if starts_at.tzinfo is None:
            starts_at = starts_at.replace(tzinfo=TORONTO)
        if starts_at < cutoff:
            continue
        if "statistique canada" not in _norm(source) and "statistics canada" not in _norm(source):
            continue
        if not _is_statcan_provincial_event(title):
            continue

        category, score = classify_macro(title)
        if not category:
            continue
        clean_title = _translate_statcan_title(title, lang)
        prefixed = f"{province} — {clean_title}"
        url = str(getattr(event, "url", "") or "https://www.statcan.gc.ca/")
        description = (
            f"Publication de Statistique Canada comprenant une donnée pour {province}. "
            "Anatole affiche ici le volet provincial, et non un événement national générique."
            if lang == "fr"
            else f"Statistics Canada release containing a {province} data point. "
            "Anatole shows the provincial component rather than a generic national event."
        )
        output.append(
            ProvincialMacroEvent(
                id=_id(region, "statcan-provincial", prefixed, starts_at.isoformat()),
                region=region,
                province=province,
                title=prefixed[:240],
                description=description,
                category=category,
                importance=importance_label(score),
                importance_score=score,
                starts_at=starts_at,
                source=f"Statistique Canada — {province}" if lang == "fr" else f"Statistics Canada — {province}",
                source_kind="statcan",
                source_url=url,
                official=True,
                specificity="province-normalized",
            )
        )
    return _dedupe_events(output)


def _dedupe_events(events: list[ProvincialMacroEvent]) -> list[ProvincialMacroEvent]:
    direct_keys = {
        (event.category, event.starts_at.date())
        for event in events
        if event.specificity in {"province-direct", "fiscal-direct"}
    }
    seen: set[tuple[str, str]] = set()
    output: list[ProvincialMacroEvent] = []
    for event in sorted(events, key=lambda item: (item.starts_at, -item.importance_score)):
        if (
            event.specificity == "province-normalized"
            and (event.category, event.starts_at.date()) in direct_keys
        ):
            continue
        key = (_norm(event.title), event.starts_at.date().isoformat())
        if key in seen:
            continue
        seen.add(key)
        output.append(event)
    return output


def _dedupe_releases(items: list[ProvincialMacroRelease]) -> list[ProvincialMacroRelease]:
    seen: set[str] = set()
    output: list[ProvincialMacroRelease] = []
    for item in items:
        key = _norm(f"{item.source}|{item.title}")
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    output.sort(
        key=lambda item: (
            item.published_at or datetime(1970, 1, 1, tzinfo=UTC),
            item.importance_score,
        ),
        reverse=True,
    )
    return output


class ProvincialMacroService:
    cache_ttl_seconds = 900.0
    failure_cache_ttl_seconds = 90.0

    def __init__(self) -> None:
        self._cache: dict[tuple[str, str], tuple[float, ProvincialMacroSnapshot]] = {}
        self._calendar_cache: dict[tuple[str, str], tuple[float, ProvincialMacroSnapshot]] = {}
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}

    def _lock_for(self, key: tuple[str, str]) -> asyncio.Lock:
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]

    async def _fetch_page(
        self,
        client: httpx.AsyncClient,
        *,
        spec: PageSpec,
        region: str,
        lang: str,
    ) -> tuple[list[ProvincialMacroRelease], ProvincialMacroSource]:
        try:
            response = await client.get(spec.url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "pdf" in content_type.casefold():
                raise ValueError("PDF not parsed in direct-release layer")
            releases = _extract_page_release(
                response.text,
                spec=spec,
                region=region,
                lang=lang,
                base_url=str(response.url),
                last_modified=response.headers.get("last-modified"),
            )
            return releases, ProvincialMacroSource(
                key=spec.key,
                label=spec.source,
                region=region,
                kind=spec.kind,
                url=spec.url,
                status="available" if releases else "partial",
                count=len(releases),
                detail=None if releases else "Page officielle accessible, aucun élément macro distinct extrait.",
            )
        except Exception as exc:
            return [], ProvincialMacroSource(
                key=spec.key,
                label=spec.source,
                region=region,
                kind=spec.kind,
                url=spec.url,
                status="unavailable",
                count=0,
                detail=type(exc).__name__,
            )

    async def _direct_calendar(
        self,
        client: httpx.AsyncClient,
        *,
        config: ProvinceConfig,
        lang: str,
        now: datetime,
    ) -> tuple[list[ProvincialMacroEvent], ProvincialMacroSource | None]:
        if config.calendar_kind == "saskatchewan" and config.calendar_url:
            events = _saskatchewan_calendar_events(
                now=now,
                lang=lang,
                source_url=config.calendar_url,
            )
            return events, ProvincialMacroSource(
                key="calendar-sk",
                label="Saskatchewan Bureau of Statistics — calendrier",
                region=config.code,
                kind="statistics",
                url=config.calendar_url,
                status="available",
                count=len(events),
                detail="Calendrier officiel 2026-27 intégré et daté.",
            )

        if not config.calendar_url:
            return [], None

        try:
            response = await client.get(config.calendar_url)
            response.raise_for_status()
            if config.calendar_kind == "quebec":
                events = _quebec_calendar_events(
                    response.text,
                    now=now,
                    lang=lang,
                    source_url=config.calendar_url,
                )
                used_snapshot_fallback = False
                if not events:
                    events = _quebec_calendar_snapshot_fallback(
                        now=now,
                        lang=lang,
                        source_url=config.calendar_url,
                    )
                    used_snapshot_fallback = bool(events)
                label = "Statistique Québec — calendrier"
                kind = "statistics"
            elif config.calendar_kind == "ontario":
                events = _ontario_calendar_events(
                    response.text,
                    now=now,
                    lang=lang,
                    source_url=config.calendar_url,
                )
                label = "Ontario Economic Accounts — calendrier"
                kind = "economic_accounts"
            elif config.calendar_kind == "british_columbia":
                events = _british_columbia_calendar_events(
                    response.text,
                    now=now,
                    lang=lang,
                    source_url=config.calendar_url,
                )
                label = "BC Stats — release schedule"
                kind = "statistics"
            elif config.calendar_kind == "alberta":
                events = _alberta_calendar_events(
                    response.text,
                    now=now,
                    lang=lang,
                    source_url=config.calendar_url,
                )
                label = "Alberta Labour Market Information — calendrier"
                kind = "statistics"
            else:
                events = []
                label = f"{province_name(config.code, lang)} — calendrier"
                kind = "statistics"

            return events, ProvincialMacroSource(
                key=f"calendar-{config.code.lower()}",
                label=label,
                region=config.code,
                kind=kind,
                url=config.calendar_url,
                status="available" if events else "partial",
                count=len(events),
                detail=(
                    "Secours officiel daté du 14 août 2026; lecture live à retester."
                    if config.calendar_kind == "quebec" and locals().get("used_snapshot_fallback", False)
                    else None
                    if events
                    else (
                        "Calendrier officiel accessible, mais aucune date future valide n’y est publiée."
                        if lang == "fr"
                        else "Official schedule accessible, but it publishes no valid future date."
                    )
                ),
            )
        except Exception as exc:
            if config.calendar_kind == "quebec" and config.calendar_url:
                fallback_events = _quebec_calendar_snapshot_fallback(
                    now=now,
                    lang=lang,
                    source_url=config.calendar_url,
                )
                if fallback_events:
                    return fallback_events, ProvincialMacroSource(
                        key="calendar-qc",
                        label="Statistique Québec — calendrier",
                        region=config.code,
                        kind="statistics",
                        url=config.calendar_url,
                        status="partial",
                        count=len(fallback_events),
                        detail=(
                            "Source live temporairement indisponible; secours officiel daté du 14 août 2026. "
                            f"Cause: {type(exc).__name__}."
                        ),
                    )
            return [], ProvincialMacroSource(
                key=f"calendar-{config.code.lower()}",
                label=f"{province_name(config.code, lang)} — calendrier",
                region=config.code,
                kind="statistics",
                url=config.calendar_url,
                status="unavailable",
                count=0,
                detail=type(exc).__name__,
            )

    async def _statcan_calendar_fallback(
        self,
        *,
        region: str,
        lang: str,
        now: datetime,
    ) -> tuple[list[ProvincialMacroEvent], ProvincialMacroSource]:
        try:
            from app.services.calendar import calendar_service

            national_events, feed_status = await calendar_service.get_statcan_events(lang)
            events = provincialize_statcan_events(
                national_events,
                region=region,
                lang=lang,
                now=now,
            )
            province = province_name(region, lang)
            status = (
                "available"
                if events and feed_status.status == "ok"
                else "partial"
                if events
                else "unavailable"
            )
            policy_detail = (
                "Seules les diffusions qui comportent une ventilation provinciale essentielle sont conservées."
                if lang == "fr"
                else "Only essential releases with provincial breakdowns are retained."
            )
            detail = policy_detail
            if feed_status.detail:
                detail = f"{policy_detail} {feed_status.detail}"
            source_url = (
                str(getattr(national_events[0], "url", "") or "")
                if national_events
                else ""
            ) or "https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm"
            return events, ProvincialMacroSource(
                key=f"statcan-{region.lower()}",
                label=f"Statistique Canada — {province}" if lang == "fr" else f"Statistics Canada — {province}",
                region=region,
                kind="statcan",
                url=source_url,
                status=status,
                count=len(events),
                detail=detail,
            )
        except Exception as exc:
            province = province_name(region, lang)
            return [], ProvincialMacroSource(
                key=f"statcan-{region.lower()}",
                label=f"Statistique Canada — {province}" if lang == "fr" else f"Statistics Canada — {province}",
                region=region,
                kind="statcan",
                url="https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm",
                status="unavailable",
                count=0,
                detail=type(exc).__name__,
            )

    async def get_calendar_snapshot(
        self, region: object, lang: str = "fr"
    ) -> ProvincialMacroSnapshot:
        """Fast province-first calendar path.

        This intentionally skips the news/release pages used by get_snapshot().
        Calendrier only needs upcoming dates, so direct provincial calendars and
        the narrow StatCan provincial fallback are fetched concurrently.
        """
        code = normalize_region(region)
        if code not in PROVINCES:
            raise ValueError(
                "region doit être une province canadienne: QC, ON, BC, AB, SK, MB, NB, NS, PE ou NL"
            )
        language = "en" if str(lang).lower().startswith("en") else "fr"
        cache_key = (code, language)
        cached = self._calendar_cache.get(cache_key)
        now_mono = monotonic()
        if cached:
            age = now_mono - cached[0]
            ttl = self.cache_ttl_seconds if cached[1].upcoming_events else self.failure_cache_ttl_seconds
            if age < ttl:
                return cached[1]

        lock = self._lock_for((f"calendar:{code}", language))
        async with lock:
            cached = self._calendar_cache.get(cache_key)
            now_mono = monotonic()
            if cached and now_mono - cached[0] < self.cache_ttl_seconds:
                return cached[1]

            config = PROVINCES[code]
            now = datetime.now(UTC)
            timeout = httpx.Timeout(connect=4.5, read=9.0, write=5.0, pool=5.0)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/150.0 Safari/537.36 Anatole/1.5.1"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.1",
                "Accept-Language": "fr-CA,fr;q=0.9,en-CA;q=0.8,en;q=0.7",
                "Cache-Control": "no-cache",
            }

            async with httpx.AsyncClient(
                timeout=timeout, headers=headers, follow_redirects=True
            ) as client:
                direct_result, statcan_result = await asyncio.gather(
                    self._direct_calendar(
                        client, config=config, lang=language, now=now
                    ),
                    self._statcan_calendar_fallback(
                        region=code, lang=language, now=now
                    ),
                    return_exceptions=True,
                )

            sources: list[ProvincialMacroSource] = []
            direct_events: list[ProvincialMacroEvent] = []
            statcan_events: list[ProvincialMacroEvent] = []

            if not isinstance(direct_result, Exception):
                direct_events, direct_source = direct_result
                if direct_source is not None:
                    sources.append(direct_source)

            if not isinstance(statcan_result, Exception):
                statcan_events, statcan_source = statcan_result
                sources.append(statcan_source)

            events = _dedupe_events(direct_events + statcan_events)
            message = None
            if not events:
                message = (
                    "Aucune date provinciale essentielle n'a pu être chargée pour le moment. "
                    "Anatole n'invente aucune date et réessaiera automatiquement."
                    if language == "fr"
                    else "No essential provincial date could be loaded right now. "
                    "Anatole does not invent dates and will retry automatically."
                )

            snapshot = ProvincialMacroSnapshot(
                region=code,
                province=province_name(code, language),
                language=language,
                latest_releases=[],
                upcoming_events=events[:80],
                sources=sources,
                generated_at=now,
                refresh_after_seconds=900 if events else 90,
                message=message,
            )
            self._calendar_cache[cache_key] = (monotonic(), snapshot)
            return snapshot


    async def get_snapshot(self, region: object, lang: str = "fr") -> ProvincialMacroSnapshot:
        code = normalize_region(region)
        if code not in PROVINCES:
            raise ValueError(
                "region doit être une province canadienne: QC, ON, BC, AB, SK, MB, NB, NS, PE ou NL"
            )
        language = "en" if str(lang).lower().startswith("en") else "fr"
        cache_key = (code, language)
        cached = self._cache.get(cache_key)
        now_mono = monotonic()
        if cached:
            age = now_mono - cached[0]
            ttl = self.cache_ttl_seconds if (
                cached[1].latest_releases or cached[1].upcoming_events
            ) else self.failure_cache_ttl_seconds
            if age < ttl:
                return cached[1]

        async with self._lock_for(cache_key):
            cached = self._cache.get(cache_key)
            now_mono = monotonic()
            if cached and now_mono - cached[0] < self.cache_ttl_seconds:
                return cached[1]

            config = PROVINCES[code]
            now = datetime.now(UTC)
            timeout = httpx.Timeout(connect=7.0, read=13.0, write=7.0, pool=7.0)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/150.0 Safari/537.36 Anatole/1.5"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.1",
                "Accept-Language": "fr-CA,fr;q=0.9,en-CA;q=0.8,en;q=0.7",
                "Cache-Control": "no-cache",
            }

            async with httpx.AsyncClient(
                timeout=timeout,
                headers=headers,
                follow_redirects=True,
            ) as client:
                page_tasks = [
                    self._fetch_page(client, spec=spec, region=code, lang=language)
                    for spec in config.pages
                ]
                direct_calendar_task = self._direct_calendar(
                    client,
                    config=config,
                    lang=language,
                    now=now,
                )
                results = await asyncio.gather(
                    *page_tasks,
                    direct_calendar_task,
                    return_exceptions=True,
                )

            releases: list[ProvincialMacroRelease] = []
            sources: list[ProvincialMacroSource] = []
            for result in results[:-1]:
                if isinstance(result, Exception):
                    continue
                page_releases, source_status = result
                releases.extend(page_releases)
                sources.append(source_status)

            direct_calendar_result = results[-1]
            if isinstance(direct_calendar_result, Exception):
                direct_events: list[ProvincialMacroEvent] = []
            else:
                direct_events, direct_source = direct_calendar_result
                if direct_source is not None:
                    sources.append(direct_source)

            statcan_events, statcan_source = await self._statcan_calendar_fallback(
                region=code,
                lang=language,
                now=now,
            )
            sources.append(statcan_source)

            # Province-direct events take precedence on identical dates/categories.
            events = _dedupe_events(direct_events + statcan_events)
            releases = _dedupe_releases(releases)

            message = None
            if not releases and not events:
                message = (
                    "Les sources provinciales sont temporairement indisponibles. "
                    "Anatole n’invente aucune donnée et réessaiera au prochain rafraîchissement."
                    if language == "fr"
                    else "Provincial sources are temporarily unavailable. "
                    "Anatole does not fabricate data and will retry on refresh."
                )

            snapshot = ProvincialMacroSnapshot(
                region=code,
                province=province_name(code, language),
                language=language,
                latest_releases=releases[:30],
                upcoming_events=events[:80],
                sources=sources,
                generated_at=now,
                refresh_after_seconds=900 if (releases or events) else 90,
                message=message,
            )
            self._cache[cache_key] = (monotonic(), snapshot)
            return snapshot


provincial_macro_service = ProvincialMacroService()
