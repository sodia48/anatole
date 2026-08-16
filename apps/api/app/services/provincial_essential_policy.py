from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True, slots=True)
class ProvincialSource:
    region: str
    source: str
    source_fr: str
    source_en: str
    url: str
    tier: int
    kind: str


PROVINCIAL_SOURCES: tuple[ProvincialSource, ...] = (
    ProvincialSource(
        "QC",
        "Statistique Québec",
        "Statistique Québec",
        "Québec Statistics",
        "https://statistique.quebec.ca/fr/produit/publication/faits-saillants-economiques",
        1,
        "statistics",
    ),
    ProvincialSource(
        "QC",
        "Gouvernement du Québec — Économie et finances",
        "Gouvernement du Québec — Économie et finances",
        "Government of Québec — Economy and finance",
        "https://www.quebec.ca/nouvelles",
        2,
        "government",
    ),
    ProvincialSource(
        "ON",
        "Ontario Economic Accounts",
        "Ontario Economic Accounts — Ministère des Finances",
        "Ontario Economic Accounts — Ministry of Finance",
        "https://www.ontario.ca/page/ontario-economic-accounts",
        1,
        "statistics",
    ),
    ProvincialSource(
        "ON",
        "Ontario Ministry of Finance",
        "Ministère des Finances de l’Ontario",
        "Ontario Ministry of Finance",
        "https://www.ontario.ca/page/ministry-finance",
        2,
        "government",
    ),
    ProvincialSource(
        "BC",
        "BC Stats",
        "BC Stats",
        "BC Stats",
        "https://www2.gov.bc.ca/gov/content/data/statistics",
        1,
        "statistics",
    ),
    ProvincialSource(
        "AB",
        "Alberta Office of Statistics and Information",
        "Alberta — Office of Statistics and Information",
        "Alberta Office of Statistics and Information",
        "https://www.alberta.ca/office-statistics-information",
        1,
        "statistics",
    ),
    ProvincialSource(
        "SK",
        "Saskatchewan Bureau of Statistics",
        "Saskatchewan Bureau of Statistics",
        "Saskatchewan Bureau of Statistics",
        "https://www.saskatchewan.ca/government/government-data/bureau-of-statistics",
        1,
        "statistics",
    ),
    ProvincialSource(
        "MB",
        "Manitoba Bureau of Statistics",
        "Manitoba Bureau of Statistics",
        "Manitoba Bureau of Statistics",
        "https://www.gov.mb.ca/mbs/",
        1,
        "statistics",
    ),
    ProvincialSource(
        "NB",
        "New Brunswick Finance — Statistics",
        "Finances Nouveau-Brunswick — Statistiques",
        "New Brunswick Finance — Statistics",
        "https://www2.gnb.ca/content/gnb/en/departments/finance/statistics.html",
        1,
        "statistics",
    ),
    ProvincialSource(
        "NS",
        "Nova Scotia Economics and Statistics",
        "Nouvelle-Écosse — Economics and Statistics",
        "Nova Scotia Economics and Statistics",
        "https://novascotia.ca/finance/statistics/",
        1,
        "statistics",
    ),
    ProvincialSource(
        "PE",
        "PEI Statistics Bureau",
        "PEI Statistics Bureau",
        "PEI Statistics Bureau",
        "https://www.princeedwardisland.ca/en/topic/economics-and-statistics",
        1,
        "statistics",
    ),
    ProvincialSource(
        "NL",
        "Newfoundland and Labrador Statistics Agency",
        "Newfoundland and Labrador Statistics Agency",
        "Newfoundland and Labrador Statistics Agency",
        "https://www.stats.gov.nl.ca/",
        1,
        "statistics",
    ),
)


REGION_ALIASES = {
    "qc": "QC",
    "quebec": "QC",
    "québec": "QC",
    "on": "ON",
    "ontario": "ON",
    "bc": "BC",
    "british columbia": "BC",
    "colombie britannique": "BC",
    "ab": "AB",
    "alberta": "AB",
    "sk": "SK",
    "saskatchewan": "SK",
    "mb": "MB",
    "manitoba": "MB",
    "nb": "NB",
    "new brunswick": "NB",
    "nouveau brunswick": "NB",
    "ns": "NS",
    "nova scotia": "NS",
    "nouvelle ecosse": "NS",
    "pe": "PE",
    "pei": "PE",
    "prince edward island": "PE",
    "ile du prince edouard": "PE",
    "nl": "NL",
    "newfoundland and labrador": "NL",
    "terre neuve et labrador": "NL",
}


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def normalize_region(value: object) -> str:
    raw = str(value or "").strip()
    if raw.upper() in {s.region for s in PROVINCIAL_SOURCES}:
        return raw.upper()
    return REGION_ALIASES.get(_norm(raw), raw.upper())


# Catégories que le fil macro doit réellement privilégier.
ESSENTIAL_RULES: tuple[tuple[str, int, tuple[str, ...]], ...] = (
    (
        "PIB",
        100,
        (
            "produit interieur brut",
            "pib reel",
            "pib par industrie",
            "gross domestic product",
            "real gdp",
            "gdp by industry",
            "economic accounts",
            "comptes economiques",
        ),
    ),
    (
        "Emploi",
        100,
        (
            "marche du travail",
            "emploi",
            "chomage",
            "taux de chomage",
            "employment",
            "unemployment",
            "labour force",
            "labor force",
            "payroll employment",
        ),
    ),
    (
        "Inflation",
        100,
        (
            "indice des prix a la consommation",
            "ipc",
            "inflation",
            "consumer price index",
            "cpi",
        ),
    ),
    (
        "Salaires",
        88,
        (
            "remuneration hebdomadaire",
            "remuneration moyenne",
            "salaires",
            "gains hebdomadaires",
            "average weekly earnings",
            "weekly earnings",
            "wages",
        ),
    ),
    (
        "Consommation",
        88,
        (
            "ventes au detail",
            "retail sales",
            "consumer spending",
            "depenses de consommation",
        ),
    ),
    (
        "Industrie",
        84,
        (
            "ventes de biens fabriques",
            "ventes manufacturieres",
            "fabrication",
            "manufacturing sales",
            "manufacturing",
            "industrial production",
        ),
    ),
    (
        "Commerce",
        84,
        (
            "commerce international",
            "exportations",
            "importations",
            "balance commerciale",
            "international trade",
            "exports",
            "imports",
            "trade balance",
        ),
    ),
    (
        "Logement",
        84,
        (
            "mises en chantier",
            "permis de batir",
            "housing starts",
            "building permits",
            "residential construction",
        ),
    ),
    (
        "Finances publiques",
        92,
        (
            "budget",
            "mise a jour economique",
            "mise a jour financiere",
            "finances publiques",
            "deficit",
            "surplus",
            "dette nette",
            "dette publique",
            "fiscal update",
            "fiscal outlook",
            "public accounts",
            "deficit",
            "surplus",
            "net debt",
        ),
    ),
    (
        "Fiscalité",
        82,
        (
            "impot",
            "taxe",
            "credit d impot",
            "fiscalite",
            "tax measure",
            "tax credit",
            "corporate tax",
            "income tax",
        ),
    ),
    (
        "Population",
        74,
        (
            "population",
            "demographie",
            "migration interprovinciale",
            "demographic",
            "interprovincial migration",
        ),
    ),
    (
        "Investissement",
        76,
        (
            "depenses en immobilisations",
            "investissement des entreprises",
            "capital expenditures",
            "business investment",
            "capital spending",
            "private investment",
        ),
    ),
)


# Bruit à exclure même si certains communiqués contiennent un mot économique.
HARD_EXCLUSIONS: tuple[str, ...] = (
    "agenda public",
    "avis aux medias",
    "avis aux médias",
    "horaire de la premiere ministre",
    "horaire de la première ministre",
    "listeria",
    "rappel d aliment",
    "rappel alimentaire",
    "food recall",
    "salubrite alimentaire",
    "salubrité alimentaire",
    "mise en garde a la population",
    "mise en garde à la population",
    "securite publique",
    "sécurité publique",
    "alerte amber",
    "fermeture de route",
    "travaux routiers",
    "road closure",
    "culture et communications",
    "sports et loisirs",
    "ceremonie",
    "cérémonie",
    "journee nationale",
    "journée nationale",
    "nomination",
    "appointment",
    "condoleances",
    "condoléances",
)


# "Investissement" seul est trop large. Pour les communiqués gouvernementaux,
# une annonce de projet doit contenir une dimension macro observable.
MATERIAL_INVESTMENT_CONTEXT: tuple[str, ...] = (
    "emplois",
    "jobs",
    "millions",
    "milliards",
    "million",
    "billion",
    "capital",
    "usine",
    "plant",
    "productivite",
    "productivité",
    "export",
    "manufacturier",
    "manufacturing",
    "construction",
    "infrastructure",
)


@dataclass(frozen=True, slots=True)
class EssentialDecision:
    allowed: bool
    category: str | None
    score: int
    reason: str


def _contains_any(text: str, patterns: Iterable[str]) -> bool:
    return any(_norm(pattern) in text for pattern in patterns)


def classify_essential_release(
    title: object,
    summary: object = "",
    *,
    source_kind: str = "statistics",
) -> EssentialDecision:
    text = _norm(f"{title or ''} {summary or ''}")

    if _contains_any(text, HARD_EXCLUSIONS):
        return EssentialDecision(
            allowed=False,
            category=None,
            score=0,
            reason="exclusion_non_macro",
        )

    best_category: str | None = None
    best_score = 0
    hit_count = 0

    for category, score, patterns in ESSENTIAL_RULES:
        hits = sum(1 for pattern in patterns if _norm(pattern) in text)
        if hits:
            hit_count += hits
            adjusted = min(100, score + min(6, max(0, hits - 1) * 2))
            if adjusted > best_score:
                best_category = category
                best_score = adjusted

    if best_category is None:
        return EssentialDecision(
            allowed=False,
            category=None,
            score=0,
            reason="aucun_indicateur_essentiel",
        )

    # Un communiqué gouvernemental doit passer un seuil plus strict.
    if source_kind == "government":
        if best_category == "Investissement" and not _contains_any(
            text,
            MATERIAL_INVESTMENT_CONTEXT,
        ):
            return EssentialDecision(
                allowed=False,
                category=None,
                score=0,
                reason="investissement_non_materiel",
            )
        if best_score < 82:
            return EssentialDecision(
                allowed=False,
                category=best_category,
                score=best_score,
                reason="communique_gouvernemental_trop_faible",
            )

    # Les instituts statistiques sont autorisés à partir du moment où ils
    # traitent réellement d'un indicateur macro essentiel.
    return EssentialDecision(
        allowed=True,
        category=best_category,
        score=best_score,
        reason="indicateur_macro_essentiel",
    )


def source_options_for_region(
    region: object,
    language: str = "fr",
) -> list[str]:
    code = normalize_region(region)
    language = "en" if str(language).lower().startswith("en") else "fr"

    local = [
        source
        for source in PROVINCIAL_SOURCES
        if source.region == code
    ]
    local.sort(key=lambda source: (source.tier, source.source))

    labels = ["Toutes" if language == "fr" else "All"]
    labels.extend(
        source.source_en if language == "en" else source.source_fr
        for source in local
    )
    labels.extend(
        [
            "Statistique Canada" if language == "fr" else "Statistics Canada",
            "Banque du Canada" if language == "fr" else "Bank of Canada",
        ]
    )
    return labels


def preferred_source_labels(
    region: object,
    language: str = "fr",
) -> list[str]:
    code = normalize_region(region)
    language = "en" if str(language).lower().startswith("en") else "fr"
    sources = sorted(
        (s for s in PROVINCIAL_SOURCES if s.region == code),
        key=lambda s: (s.tier, s.source),
    )
    return [
        s.source_en if language == "en" else s.source_fr
        for s in sources
    ]
