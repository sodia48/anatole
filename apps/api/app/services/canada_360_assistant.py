from __future__ import annotations

import re
import unicodedata

from app.schemas.canada_360 import (
    Canada360AssistantLink,
    Canada360AssistantResponse,
    Canada360Metric,
    Canada360Snapshot,
)
from app.services.canada_360 import canada_360_service

PROVINCES = {
    "QC": (
        "Québec",
        "Quebec",
        ("quebec",),
        "https://www.quebec.ca/en",
    ),
    "ON": (
        "Ontario",
        "Ontario",
        ("ontario",),
        "https://www.ontario.ca/",
    ),
    "BC": (
        "Colombie-Britannique",
        "British Columbia",
        ("british columbia", "colombie britannique"),
        "https://www2.gov.bc.ca/gov/content/home",
    ),
    "AB": (
        "Alberta",
        "Alberta",
        ("alberta",),
        "https://www.alberta.ca/",
    ),
    "SK": (
        "Saskatchewan",
        "Saskatchewan",
        ("saskatchewan",),
        "https://www.saskatchewan.ca/",
    ),
    "MB": (
        "Manitoba",
        "Manitoba",
        ("manitoba",),
        "https://www.gov.mb.ca/",
    ),
    "NB": (
        "Nouveau-Brunswick",
        "New Brunswick",
        ("new brunswick", "nouveau brunswick"),
        "https://www2.gnb.ca/content/gnb/en.html",
    ),
    "NS": (
        "Nouvelle-Écosse",
        "Nova Scotia",
        ("nova scotia", "nouvelle ecosse"),
        "https://novascotia.ca/",
    ),
    "PE": (
        "Île-du-Prince-Édouard",
        "Prince Edward Island",
        ("prince edward island", "ile du prince edouard"),
        "https://www.princeedwardisland.ca/en",
    ),
    "NL": (
        "Terre-Neuve-et-Labrador",
        "Newfoundland and Labrador",
        ("newfoundland and labrador", "terre neuve et labrador"),
        "https://www.gov.nl.ca/",
    ),
}

FEDERAL = {
    "services": (
        "Services du gouvernement du Canada",
        "Government of Canada services",
        "https://www.canada.ca/en/services.html",
    ),
    "benefits": (
        "Chercheur de prestations",
        "Benefits Finder",
        "https://www.canada.ca/en/services/benefits/finder.html",
    ),
    "taxes": (
        "Impôt sur le revenu — ARC",
        "Income tax — CRA",
        "https://www.canada.ca/en/services/taxes/income-tax.html",
    ),
    "immigration": (
        "Immigration et citoyenneté — IRCC",
        "Immigration and citizenship — IRCC",
        "https://www.canada.ca/en/services/immigration-citizenship.html",
    ),
    "health": (
        "Santé — Canada.ca",
        "Health — Canada.ca",
        "https://www.canada.ca/en/services/health.html",
    ),
    "jobs": (
        "Guichet-Emplois",
        "Job Bank",
        "https://www.jobbank.gc.ca/home",
    ),
    "business": (
        "Innovation Canada — aides aux entreprises",
        "Innovation Canada — business support",
        "https://innovation.canada.ca/",
    ),
    "education": (
        "Éducation et aide aux étudiants",
        "Education and student aid",
        "https://www.canada.ca/en/services/education.html",
    ),
    "statistics": (
        "Statistique Canada",
        "Statistics Canada",
        "https://www.statcan.gc.ca/en/start",
    ),
}

METRIC_ALIASES = {
    "real_gdp": ("pib", "gdp", "produit interieur", "gross domestic"),
    "unemployment_rate": ("chomage", "unemployment"),
    "inflation_yoy": ("inflation", "ipc", "cpi"),
    "employment": ("emploi", "employment", "emplois"),
    "retail_sales": ("ventes au detail", "retail sales"),
    "housing_starts": ("mises en chantier", "housing starts"),
    "population": ("population", "habitants"),
    "canada_2y": ("taux 2 ans", "2 year", "2-year"),
    "canada_10y": ("taux 10 ans", "10 year", "10-year"),
    "curve_10y_2y": ("courbe", "yield curve", "10y 2y"),
    "usd_cad": ("usd cad", "dollar canadien", "cad usd"),
    "tsx_composite": ("tsx", "tsx composite", "marche canadien"),
}

TOPICS = (
    (
        "benefits",
        (
            "prestation",
            "prestations",
            "benefit",
            "benefits",
            "aide financiere",
            "allocation",
            "subvention",
            "grant",
        ),
    ),
    (
        "taxes",
        ("impot", "taxe", "tax", "cra", "arc", "declaration"),
    ),
    (
        "immigration",
        (
            "immigration",
            "visa",
            "permis de travail",
            "work permit",
            "permis d etudes",
            "study permit",
            "residence permanente",
            "permanent residence",
            "citoyennete",
            "citizenship",
            "ircc",
        ),
    ),
    (
        "health",
        (
            "sante",
            "health",
            "assurance maladie",
            "health card",
            "medicare",
            "ramq",
        ),
    ),
    (
        "jobs",
        ("emploi", "job", "travail", "carriere", "career"),
    ),
    (
        "business",
        (
            "entreprise",
            "business",
            "pme",
            "startup",
            "demarrer",
            "start a business",
        ),
    ),
    (
        "education",
        (
            "education",
            "etudes",
            "student",
            "etudiant",
            "universite",
            "university",
            "pret etudiant",
            "student loan",
        ),
    ),
)


def _normalize(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode(
        "ascii",
        "ignore",
    ).decode("ascii")
    return re.sub(r"\s+", " ", ascii_value.lower().replace("'", " ")).strip()


def _metric_key(question: str) -> str | None:
    clean = _normalize(question)
    for key, aliases in METRIC_ALIASES.items():
        if any(_normalize(alias) in clean for alias in aliases):
            return key
    return None


def _named_provinces(question: str) -> list[str]:
    clean = _normalize(question)
    output: list[str] = []
    for code, (_fr, _en, aliases, _url) in PROVINCES.items():
        if any(
            re.search(rf"\b{re.escape(_normalize(alias))}\b", clean)
            for alias in aliases
        ):
            output.append(code)
    return output


def _format_number(value: float, unit: str, lang: str) -> str:
    if unit == "percent":
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        if lang == "fr":
            text = text.replace(".", ",")
        return f"{text} %"

    if unit in {"persons", "units", "currency"}:
        text = f"{value:,.0f}"
        if lang == "fr":
            text = text.replace(",", " ")
        return f"{text} CAD" if unit == "currency" else text

    if unit == "cad_per_usd":
        text = f"{value:.4f}".rstrip("0").rstrip(".")
        if lang == "fr":
            text = text.replace(".", ",")
        return f"{text} CAD"

    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",") if lang == "fr" else text


def _metric_link(metric: Canada360Metric) -> Canada360AssistantLink:
    return Canada360AssistantLink(
        label=metric.source_name,
        url=metric.source_url or FEDERAL["statistics"][2],
        level="statistics",
    )


def _province_label(code: str, lang: str) -> str:
    province = PROVINCES.get(code)
    if province is None:
        return code
    return province[1] if lang == "en" else province[0]


def _statistical_answer(
    *,
    question: str,
    metric_key: str,
    lang: str,
    jurisdiction: str,
    mode: str,
    snapshot: Canada360Snapshot,
) -> Canada360AssistantResponse | None:
    named = _named_provinces(question)
    targets = named or ([] if jurisdiction == "CA" else [jurisdiction])
    compare = mode == "compare" or len(targets) > 1

    if compare:
        provinces = (
            [
                province
                for province in snapshot.provinces
                if province.code in targets
            ]
            if targets
            else snapshot.provinces
        )
        rows = []
        for province in provinces:
            metric = next(
                (
                    item
                    for item in province.metrics
                    if item.key == metric_key and item.value is not None
                ),
                None,
            )
            if metric is not None:
                rows.append((province, metric))

        if not rows:
            return None

        answer = " · ".join(
            (
                f"{province.name}: "
                f"{_format_number(metric.value, metric.unit, lang)}"
                f"{f' ({metric.reference_period})' if metric.reference_period else ''}"
            )
            for province, metric in rows
            if metric.value is not None
        )

        links = []
        seen = set()
        for _province, metric in rows:
            link = _metric_link(metric)
            if link.url not in seen:
                seen.add(link.url)
                links.append(link)

        return Canada360AssistantResponse(
            answer=(
                f"Comparaison officielle — {rows[0][1].label}: {answer}."
                if lang == "fr"
                else f"Official comparison — {rows[0][1].label}: {answer}."
            ),
            links=links,
            source_line=(
                "Valeurs tirées du snapshot Canada 360 et de ses sources officielles."
                if lang == "fr"
                else "Values come from the Canada 360 snapshot and its official sources."
            ),
            mode=mode,
            jurisdiction=jurisdiction,
        )

    if targets:
        province = next(
            (
                item
                for item in snapshot.provinces
                if item.code == targets[0]
            ),
            None,
        )
        if province is None:
            return None

        metric = next(
            (
                item
                for item in province.metrics
                if item.key == metric_key and item.value is not None
            ),
            None,
        )
        if metric is None or metric.value is None:
            return None

        period = (
            f" pour {metric.reference_period}"
            if lang == "fr" and metric.reference_period
            else (
                f" for {metric.reference_period}"
                if metric.reference_period
                else ""
            )
        )

        return Canada360AssistantResponse(
            answer=(
                f"{province.name} — {metric.label}: "
                f"{_format_number(metric.value, metric.unit, lang)}{period}."
            ),
            links=[_metric_link(metric)],
            source_line=(
                f"{metric.source_name} · "
                f"{'source officielle' if metric.official else 'source publiée'} "
                f"· fraîcheur {metric.freshness}."
                if lang == "fr"
                else f"{metric.source_name} · "
                f"{'official source' if metric.official else 'published source'} "
                f"· freshness {metric.freshness}."
            ),
            mode=mode,
            jurisdiction=jurisdiction,
        )

    metric = next(
        (
            item
            for item in [
                *snapshot.macro,
                *snapshot.rates,
                *snapshot.markets,
            ]
            if item.key == metric_key and item.value is not None
        ),
        None,
    )
    if metric is None or metric.value is None:
        return None

    period = (
        f" pour {metric.reference_period}"
        if lang == "fr" and metric.reference_period
        else (
            f" for {metric.reference_period}"
            if metric.reference_period
            else ""
        )
    )

    return Canada360AssistantResponse(
        answer=(
            f"Canada — {metric.label}: "
            f"{_format_number(metric.value, metric.unit, lang)}{period}."
        ),
        links=[_metric_link(metric)],
        source_line=(
            f"{metric.source_name} · "
            f"{'source officielle' if metric.official else 'source publiée'}."
            if lang == "fr"
            else f"{metric.source_name} · "
            f"{'official source' if metric.official else 'published source'}."
        ),
        mode=mode,
        jurisdiction=jurisdiction,
    )


def _service_answer(
    *,
    question: str,
    lang: str,
    jurisdiction: str,
    mode: str,
) -> Canada360AssistantResponse:
    clean = _normalize(question)
    named = _named_provinces(question)
    province_code = named[0] if named else (
        jurisdiction if jurisdiction != "CA" else None
    )

    topic_key = "services"
    for key, words in TOPICS:
        if any(_normalize(word) in clean for word in words):
            topic_key = key
            break

    federal = FEDERAL[topic_key]
    links = [
        Canada360AssistantLink(
            label=federal[1] if lang == "en" else federal[0],
            url=federal[2],
            level="federal",
        )
    ]

    if province_code in PROVINCES:
        province = PROVINCES[province_code]
        links.append(
            Canada360AssistantLink(
                label=(
                    f"{province[1]} government"
                    if lang == "en"
                    else f"Gouvernement du {province[0]}"
                ),
                url=province[3],
                level="provincial",
            )
        )

    subject = federal[1] if lang == "en" else federal[0]

    if province_code:
        place = _province_label(province_code, lang)
        answer = (
            f"Pour {subject} au {place}, voici les portes d’entrée "
            "officielles fédérale et provinciale. Canada 360 ne déduit "
            "pas automatiquement ton admissibilité; la décision finale "
            "appartient à l’organisme public."
            if lang == "fr"
            else f"For {subject} in {place}, here are the official federal "
            "and provincial entry points. Canada 360 does not automatically "
            "determine eligibility; the public authority makes the final decision."
        )
    else:
        answer = (
            f"Voici la ressource fédérale officielle la plus pertinente "
            f"pour {subject}. Sélectionne une province dans Canada 360 "
            "pour ajouter le contexte provincial."
            if lang == "fr"
            else f"Here is the most relevant official federal resource for "
            f"{subject}. Select a province in Canada 360 to add provincial context."
        )

    return Canada360AssistantResponse(
        answer=answer,
        links=links,
        source_line=(
            "Liens officiels uniquement. Vérifie les critères et dates "
            "directement sur le site de l’organisme."
            if lang == "fr"
            else "Official links only. Verify criteria and dates directly "
            "on the public authority website."
        ),
        mode=mode,
        jurisdiction=jurisdiction,
    )


class Canada360AssistantService:
    async def answer(
        self,
        *,
        question: str,
        lang: str,
        jurisdiction: str,
        mode: str,
    ) -> Canada360AssistantResponse:
        metric_key = _metric_key(question)

        if metric_key is not None:
            snapshot = await canada_360_service.get_snapshot(
                lang=lang,
                force=False,
            )
            response = _statistical_answer(
                question=question,
                metric_key=metric_key,
                lang=lang,
                jurisdiction=jurisdiction,
                mode=mode,
                snapshot=snapshot,
            )
            if response is not None:
                return response

        if any(
            word in _normalize(question)
            for word in ("statistique", "statistics", "donnee", "data")
        ):
            federal = FEDERAL["statistics"]
            return Canada360AssistantResponse(
                answer=(
                    "Précise l’indicateur: inflation, chômage, population, "
                    "PIB réel, emploi, ventes au détail ou mises en chantier."
                    if lang == "fr"
                    else "Specify the indicator: inflation, unemployment, "
                    "population, real GDP, employment, retail sales or housing starts."
                ),
                links=[
                    Canada360AssistantLink(
                        label=federal[1] if lang == "en" else federal[0],
                        url=federal[2],
                        level="statistics",
                    )
                ],
                source_line=(
                    "Statistique Canada est la source nationale de référence."
                    if lang == "fr"
                    else "Statistics Canada is the national reference source."
                ),
                mode=mode,
                jurisdiction=jurisdiction,
            )

        return _service_answer(
            question=question,
            lang=lang,
            jurisdiction=jurisdiction,
            mode=mode,
        )


canada_360_assistant_service = Canada360AssistantService()
