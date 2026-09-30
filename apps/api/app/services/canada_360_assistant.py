from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.schemas.canada_360 import (
    Canada360AssistantLink,
    Canada360AssistantResponse,
    Canada360Metric,
    Canada360Snapshot,
)
from app.services.canada_360 import canada_360_service

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

PROVINCES = {
    "QC": (
        "Québec",
        "Quebec",
        ("quebec",),
        "https://www.quebec.ca/",
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

PROVINCE_TOPIC_SOURCES = {
    "QC": {
        "benefits": (
            "Aide financière — Gouvernement du Québec",
            "Financial assistance — Gouvernement du Québec",
            "https://www.quebec.ca/en/family-and-support-for-individuals/social-assistance-social-solidarity/how-to-apply",
        ),
        "business": (
            "Aides financières aux entreprises — Québec",
            "Business financial assistance — Quebec",
            "https://www.quebec.ca/entreprises-et-travailleurs-autonomes/rechercher-aide-financiere",
        ),
        "health": (
            "RAMQ",
            "RAMQ",
            "https://www.ramq.gouv.qc.ca/en/citizens/health-insurance",
        ),
        "taxes": (
            "Revenu Québec",
            "Revenu Québec",
            "https://www.revenuquebec.ca/en/citizens/income-tax-return/",
        ),
    },
}

FEDERAL_DOMAINS = (
    "canada.ca",
    "statcan.gc.ca",
    "bankofcanada.ca",
    "jobbank.gc.ca",
    "innovation.canada.ca",
)

PROVINCE_DOMAINS = {
    "QC": (
        "quebec.ca",
        "revenuquebec.ca",
        "ramq.gouv.qc.ca",
        "statistique.quebec.ca",
    ),
    "ON": ("ontario.ca",),
    "BC": ("gov.bc.ca",),
    "AB": ("alberta.ca",),
    "SK": ("saskatchewan.ca",),
    "MB": ("gov.mb.ca",),
    "NB": ("gnb.ca",),
    "NS": ("novascotia.ca",),
    "PE": ("princeedwardisland.ca",),
    "NL": ("gov.nl.ca",),
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

ANALYTICAL_CUES = (
    "pourquoi",
    "why",
    "explique",
    "explain",
    "cause",
    "causes",
    "raison",
    "reasons",
    "impact",
    "effet",
)

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

FALLBACK_ANSWERS = {
    "benefits": {
        "fr": (
            "Oui. Les aides publiques peuvent notamment concerner la retraite, "
            "la perte d’emploi ou l’incapacité de travailler, l’invalidité, la "
            "santé et les soins dentaires, les études, le logement, la famille "
            "et certains besoins liés à une entreprise. Au Québec, l’aide sociale "
            "et la solidarité sociale peuvent aussi s’appliquer selon les ressources "
            "et la situation de la personne. Si tu me précises ton âge, ta situation "
            "familiale, ton statut d’emploi et le type d’aide recherché, je peux "
            "réduire la réponse sans présumer de ton admissibilité."
        ),
        "en": (
            "Yes. Public support can cover retirement, job loss or inability to work, "
            "disability, health and dental needs, education, housing, family needs and "
            "some business-related support. Quebec also has social assistance and "
            "social solidarity programs that depend on a person’s resources and "
            "circumstances. If you give me your age, family situation, employment "
            "status and the kind of help you need, I can narrow the answer without "
            "assuming eligibility."
        ),
    },
    "taxes": {
        "fr": (
            "Je peux t’expliquer directement les règles et démarches fiscales "
            "publiées par l’ARC et, lorsqu’elles s’appliquent, par l’administration "
            "provinciale. Donne-moi la situation précise — déclaration, crédit, "
            "déduction, travail autonome ou autre — et je te répondrai à partir des "
            "règles officielles, sans supposer le résultat de ta déclaration."
        ),
        "en": (
            "I can explain the tax rules and filing steps published by the CRA and, "
            "where applicable, the provincial tax authority. Tell me the exact issue "
            "— filing, credit, deduction, self-employment or another topic — and I "
            "will answer from official rules without assuming the outcome of your return."
        ),
    },
    "immigration": {
        "fr": (
            "Je peux répondre directement sur les démarches d’immigration et de "
            "citoyenneté à partir des règles officielles d’IRCC et des sources "
            "provinciales pertinentes. Précise le type de démarche — visa, permis "
            "d’études, permis de travail, résidence permanente ou citoyenneté — ainsi "
            "que la province concernée."
        ),
        "en": (
            "I can answer immigration and citizenship questions directly from official "
            "IRCC rules and relevant provincial sources. Specify the process — visa, "
            "study permit, work permit, permanent residence or citizenship — and the "
            "province involved."
        ),
    },
    "health": {
        "fr": (
            "Pour les services publics de santé, la couverture et l’inscription "
            "dépendent surtout de la province ou du territoire. Je peux t’expliquer "
            "les démarches administratives publiées par le gouvernement et l’organisme "
            "provincial compétent; précise la province et le service recherché."
        ),
        "en": (
            "For public health services, coverage and registration mainly depend on "
            "the province or territory. I can explain the administrative steps published "
            "by government and the responsible provincial body; tell me the province "
            "and the service you need."
        ),
    },
    "jobs": {
        "fr": (
            "Je peux répondre sur les services publics liés à l’emploi, à la recherche "
            "d’emploi, à la formation et aux prestations associées en m’appuyant sur "
            "les sources gouvernementales. Dis-moi si ta question concerne une recherche "
            "d’emploi, une perte d’emploi, une formation ou un programme précis."
        ),
        "en": (
            "I can answer questions about public employment services, job search, "
            "training and related benefits using government sources. Tell me whether "
            "your question is about finding work, job loss, training or a specific program."
        ),
    },
    "business": {
        "fr": (
            "Les aides publiques aux entreprises peuvent prendre plusieurs formes, "
            "notamment subventions ou contributions, prêts ou garanties, soutien "
            "fiscal, accompagnement et programmes sectoriels. Je peux chercher les "
            "programmes qui correspondent à ton projet à partir de sources fédérales "
            "et provinciales officielles; précise la province, le secteur et le besoin."
        ),
        "en": (
            "Public business support can include grants or contributions, loans or "
            "guarantees, tax support, advisory services and sector programs. I can "
            "narrow the programs for your project using official federal and provincial "
            "sources; tell me the province, sector and need."
        ),
    },
    "education": {
        "fr": (
            "Je peux répondre sur l’aide financière aux études, les prêts et bourses "
            "et les autres services publics liés à l’éducation en m’appuyant sur les "
            "sources fédérales et provinciales. Précise la province, le niveau d’études "
            "et le type d’aide recherché."
        ),
        "en": (
            "I can answer questions about student financial aid, loans and grants and "
            "other public education services using federal and provincial sources. "
            "Specify the province, level of study and kind of support you need."
        ),
    },
    "services": {
        "fr": (
            "Pose-moi directement la question. Je peux expliquer des services publics, "
            "des programmes, des démarches, des statistiques et des ressources fédérales "
            "ou provinciales, puis afficher les sources gouvernementales utilisées sous "
            "la réponse."
        ),
        "en": (
            "Ask the question directly. I can explain public services, programs, steps, "
            "statistics and federal or provincial resources, then show the government "
            "sources used beneath the answer."
        ),
    },
}


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


def _has_analytical_cue(question: str) -> bool:
    clean = _normalize(question)
    return any(cue in clean for cue in ANALYTICAL_CUES)


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


def _topic_key(question: str) -> str:
    clean = _normalize(question)
    for key, words in TOPICS:
        if any(_normalize(word) in clean for word in words):
            return key
    return "services"


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


def _official_domains(
    *,
    question: str,
    jurisdiction: str,
) -> list[str]:
    domains = list(FEDERAL_DOMAINS)
    codes = _named_provinces(question)
    if not codes and jurisdiction != "CA":
        codes = [jurisdiction]

    for code in codes:
        domains.extend(PROVINCE_DOMAINS.get(code, ()))

    return list(dict.fromkeys(domains))


def _allowed_source(url: str, domains: list[str]) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return False

    return any(
        host == domain or host.endswith(f".{domain}")
        for domain in domains
    )


def _source_level(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if "statcan.gc.ca" in host or "bankofcanada.ca" in host:
        return "statistics"
    if any(
        host == domain or host.endswith(f".{domain}")
        for domain in FEDERAL_DOMAINS
    ):
        return "federal"
    return "provincial"


def _extract_model_response(
    payload: dict,
    *,
    domains: list[str],
) -> tuple[str, list[Canada360AssistantLink]]:
    text_parts: list[str] = []
    source_rows: list[tuple[str, str]] = []

    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue

        if item.get("type") == "message":
            for content in item.get("content", []):
                if not isinstance(content, dict):
                    continue
                text = content.get("text")
                if content.get("type") == "output_text" and isinstance(text, str):
                    text_parts.append(text.strip())

                for annotation in content.get("annotations", []):
                    if not isinstance(annotation, dict):
                        continue
                    url = annotation.get("url")
                    title = annotation.get("title")
                    if isinstance(url, str):
                        source_rows.append(
                            (
                                str(title or urlparse(url).hostname or "Source"),
                                url,
                            )
                        )

        if item.get("type") == "web_search_call":
            action = item.get("action")
            if not isinstance(action, dict):
                continue
            sources = action.get("sources", [])
            if not sources and isinstance(action.get("search"), dict):
                sources = action["search"].get("sources", [])

            for source in sources or []:
                if not isinstance(source, dict):
                    continue
                url = source.get("url")
                title = source.get("title")
                if isinstance(url, str):
                    source_rows.append(
                        (
                            str(title or urlparse(url).hostname or "Source"),
                            url,
                        )
                    )

    answer = "\n\n".join(part for part in text_parts if part).strip()

    links: list[Canada360AssistantLink] = []
    seen: set[str] = set()
    for title, url in source_rows:
        if url in seen or not _allowed_source(url, domains):
            continue
        seen.add(url)
        links.append(
            Canada360AssistantLink(
                label=title[:180],
                url=url,
                level=_source_level(url),
            )
        )
        if len(links) >= 6:
            break

    return answer, links


def _fallback_links(
    *,
    topic: str,
    province_code: str | None,
    lang: str,
) -> list[Canada360AssistantLink]:
    federal = FEDERAL[topic]
    links = [
        Canada360AssistantLink(
            label=federal[1] if lang == "en" else federal[0],
            url=federal[2],
            level="federal",
        )
    ]

    if province_code in PROVINCES:
        special = PROVINCE_TOPIC_SOURCES.get(province_code, {}).get(topic)
        if special is not None:
            links.append(
                Canada360AssistantLink(
                    label=special[1] if lang == "en" else special[0],
                    url=special[2],
                    level="provincial",
                )
            )
        else:
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

    return links


def _fallback_service_answer(
    *,
    question: str,
    lang: str,
    jurisdiction: str,
    mode: str,
) -> Canada360AssistantResponse:
    topic = _topic_key(question)
    named = _named_provinces(question)
    province_code = named[0] if named else (
        jurisdiction if jurisdiction != "CA" else None
    )

    answer = FALLBACK_ANSWERS[topic][lang]
    if province_code and topic not in {"benefits"}:
        place = _province_label(province_code, lang)
        prefix = f"Pour {place}, " if lang == "fr" else f"For {place}, "
        answer = prefix + answer[0].lower() + answer[1:]

    return Canada360AssistantResponse(
        answer=answer,
        links=_fallback_links(
            topic=topic,
            province_code=province_code,
            lang=lang,
        ),
        source_line=(
            "Réponse directe fondée sur des ressources gouvernementales officielles. "
            "Les sources sont affichées sous la réponse."
            if lang == "fr"
            else "Direct answer grounded in official government resources. "
            "Sources are shown below the answer."
        ),
        mode=mode,
        jurisdiction=jurisdiction,
    )


def _model_prompt(
    *,
    question: str,
    lang: str,
    jurisdiction: str,
    mode: str,
) -> str:
    language = "French" if lang == "fr" else "English"
    province_label = (
        _province_label(jurisdiction, lang)
        if jurisdiction != "CA"
        else "Canada"
    )

    return f"""You are Canada 360, a Canadian public-service and public-data assistant.

Answer the user's question directly in {language}. Do not make the user click a link to obtain the substance of the answer. Links are evidence, not the answer.

Jurisdiction context: {province_label}
Mode: {mode}
Question: {question}

Rules:
- Use only information found through the provided web search tool, which is restricted to official Canadian federal and provincial government domains.
- Lead with the answer. Then explain the most useful eligibility criteria, steps, amounts, dates, definitions, comparisons, or limitations supported by the official sources.
- Do not invent eligibility, amounts, deadlines, statistics, forms, programs, or legal requirements.
- When eligibility depends on personal facts that were not provided, explain which facts matter and say the public authority makes the final determination.
- For statistics, identify the reference period when available.
- For health questions, provide administrative/service information only; do not diagnose or prescribe treatment.
- For laws, public policy, elected officials, parties, elections or ballot questions, stay neutral and factual and do not recommend a political choice.
- Do not output raw URLs. The interface will display the official sources separately.
- Keep the answer concise but substantive: usually 2 to 6 short paragraphs or bullets.
- If the official sources are insufficient or conflicting, say what can and cannot be confirmed instead of guessing.
"""


async def _grounded_model_answer(
    *,
    question: str,
    lang: str,
    jurisdiction: str,
    mode: str,
) -> Canada360AssistantResponse | None:
    api_key = settings.openai_api_key.strip()
    if not api_key:
        return None

    domains = _official_domains(
        question=question,
        jurisdiction=jurisdiction,
    )

    payload = {
        "model": settings.canada360_assistant_model,
        "reasoning": {"effort": "low"},
        "tools": [
            {
                "type": "web_search",
                "search_context_size": "medium",
                "filters": {
                    "allowed_domains": domains,
                },
            }
        ],
        "include": ["web_search_call.action.sources"],
        "input": _model_prompt(
            question=question,
            lang=lang,
            jurisdiction=jurisdiction,
            mode=mode,
        ),
        "max_output_tokens": 900,
    }

    try:
        timeout = httpx.Timeout(
            settings.canada360_assistant_timeout_seconds,
            connect=min(
                8.0,
                settings.canada360_assistant_timeout_seconds,
            ),
        )
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OPENAI_RESPONSES_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        response.raise_for_status()
        answer, links = _extract_model_response(
            response.json(),
            domains=domains,
        )
    except (httpx.HTTPError, ValueError, TypeError):
        return None

    if not answer or not links:
        return None

    return Canada360AssistantResponse(
        answer=answer,
        links=links,
        source_line=(
            "Réponse synthétisée à partir de sources gouvernementales officielles "
            "uniquement. Les sources utilisées sont affichées ci-dessous."
            if lang == "fr"
            else "Answer synthesized only from official government sources. "
            "The sources used are shown below."
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

        if metric_key is not None and not _has_analytical_cue(question):
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

        grounded = await _grounded_model_answer(
            question=question,
            lang=lang,
            jurisdiction=jurisdiction,
            mode=mode,
        )
        if grounded is not None:
            return grounded

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
                    "Je peux répondre directement à partir des séries déjà chargées "
                    "dans Canada 360. Précise l’indicateur — inflation, chômage, "
                    "population, PIB réel, emploi, ventes au détail ou mises en chantier — "
                    "ainsi que la province ou la comparaison voulue."
                    if lang == "fr"
                    else "I can answer directly from series already loaded in Canada 360. "
                    "Specify the indicator — inflation, unemployment, population, real GDP, "
                    "employment, retail sales or housing starts — and the province or "
                    "comparison you want."
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

        return _fallback_service_answer(
            question=question,
            lang=lang,
            jurisdiction=jurisdiction,
            mode=mode,
        )


canada_360_assistant_service = Canada360AssistantService()
