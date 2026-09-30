from __future__ import annotations

import asyncio
import re
import unicodedata
from time import monotonic
from urllib.parse import urlparse
from uuid import UUID, uuid4

import httpx

from app.core.config import settings
from app.core.distributed_cache import redis_snapshot_store
from app.schemas.canada_360 import (
    Canada360AssistantConversation,
    Canada360AssistantLink,
    Canada360AssistantProfile,
    Canada360AssistantResponse,
    Canada360AssistantTurn,
    Canada360Metric,
    Canada360Snapshot,
)
from app.services.canada_360 import canada_360_service

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
CONVERSATION_TTL_SECONDS = 2 * 60 * 60
MAX_HISTORY_TURNS = 16

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
        "https://www.gnb.ca/",
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

PROVINCIAL_INCOME_ASSISTANCE = {
    "QC": (
        "Programme d’aide sociale",
        "Social Assistance Program",
        "https://www.quebec.ca/en/family-and-support-for-individuals/social-assistance-social-solidarity",
    ),
    "ON": (
        "Ontario Works",
        "Ontario Works",
        "https://www.ontario.ca/page/ontario-works",
    ),
    "BC": (
        "Income Assistance",
        "Income Assistance",
        "https://www2.gov.bc.ca/gov/content/family-social-supports/income-assistance",
    ),
    "AB": (
        "Income Support",
        "Income Support",
        "https://www.alberta.ca/income-support",
    ),
    "SK": (
        "Saskatchewan Income Support",
        "Saskatchewan Income Support",
        "https://www.saskatchewan.ca/residents/family-and-social-support/financial-help/saskatchewan-income-support-sis",
    ),
    "MB": (
        "Employment and Income Assistance (EIA)",
        "Employment and Income Assistance (EIA)",
        "https://www.gov.mb.ca/fs/eia/",
    ),
    "NB": (
        "Programme d’aide sociale",
        "Social Assistance Program",
        "https://www.gnb.ca/en/org/social-development.html",
    ),
    "NS": (
        "Income Assistance",
        "Income Assistance",
        "https://novascotia.ca/coms/employment/income_assistance/",
    ),
    "PE": (
        "Social Assistance Program",
        "Social Assistance Program",
        "https://www.princeedwardisland.ca/en/information/social-development-and-seniors/social-assistance-program",
    ),
    "NL": (
        "Income Support",
        "Income Support",
        "https://www.gov.nl.ca/sswb/income-support/overview/",
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
    "ei": (
        "Assurance-emploi — prestations régulières",
        "Employment Insurance — regular benefits",
        "https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html",
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

STATISTICAL_CUES = (
    "quel est",
    "quelle est",
    "quels sont",
    "quelles sont",
    "combien",
    "taux",
    "niveau",
    "evolution",
    "historique",
    "variation",
    "statistique",
    "donnee",
    "chiffre",
    "compare",
    "comparaison",
    "what is",
    "how many",
    "rate",
    "level",
    "trend",
    "history",
    "data",
    "statistic",
    "compare",
)

PERSONAL_CUES = (
    "je suis",
    "j ai",
    "jai ",
    "mon revenu",
    "mes revenus",
    "je gagne",
    "je vis",
    "je cherche",
    "ma situation",
    "sans emploi",
    "au chomage",
    "celibataire",
    "marie",
    "conjoint de fait",
    "i am",
    "i m",
    "i have",
    "my income",
    "i earn",
    "i live",
    "i need",
    "unemployed",
    "single",
    "married",
    "common law",
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
            "income assistance",
            "social assistance",
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


def _valid_conversation_id(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
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


def _province_label(code: str, lang: str) -> str:
    province = PROVINCES.get(code)
    if province is None:
        return code
    return province[1] if lang == "en" else province[0]


def _metric_key(question: str) -> str | None:
    clean = _normalize(question)
    for key, aliases in METRIC_ALIASES.items():
        if any(_normalize(alias) in clean for alias in aliases):
            return key
    return None


def _has_personal_cue(question: str) -> bool:
    clean = _normalize(question)
    return any(cue in clean for cue in PERSONAL_CUES)


def _explicit_statistical_intent(
    question: str,
    metric_key: str | None,
    mode: str,
) -> bool:
    if metric_key is None:
        return False

    clean = _normalize(question)

    if _has_personal_cue(question):
        return False

    if mode == "compare":
        return True

    if any(cue in clean for cue in STATISTICAL_CUES):
        return True

    words = clean.split()
    return len(words) <= 6 and "?" not in question and metric_key != "employment"


def _topic_key(question: str) -> str:
    clean = _normalize(question)
    for key, words in TOPICS:
        if any(_normalize(word) in clean for word in words):
            return key
    return "services"


def _resolve_topic(
    question: str,
    previous_topic: str,
) -> str:
    detected = _topic_key(question)

    if (
        previous_topic != "services"
        and _has_personal_cue(question)
        and detected in {"services", "jobs"}
    ):
        return previous_topic

    if (
        previous_topic != "services"
        and detected == "services"
        and len(_normalize(question).split()) <= 36
    ):
        return previous_topic

    return detected


def _update_profile(
    current: Canada360AssistantProfile,
    question: str,
    jurisdiction: str,
) -> Canada360AssistantProfile:
    data = current.model_dump()

    named = _named_provinces(question)
    if named:
        data["province"] = named[0]
    elif jurisdiction != "CA":
        data["province"] = jurisdiction

    clean = _normalize(question)

    age_match = re.search(
        r"\b(?:j ai|jai|i am|i m)\s+(\d{1,3})\s*(?:ans|years old)?\b",
        clean,
    )
    if age_match:
        age = int(age_match.group(1))
        if 13 <= age <= 120:
            data["age"] = age

    family_terms = (
        ("celibataire", "single"),
        ("single", "single"),
        ("marie", "married"),
        ("married", "married"),
        ("conjoint de fait", "common_law"),
        ("common law", "common_law"),
        ("divorce", "divorced"),
        ("divorced", "divorced"),
        ("veuf", "widowed"),
        ("widow", "widowed"),
    )
    for needle, value in family_terms:
        if needle in clean:
            data["family_status"] = value
            break

    employment_terms = (
        ("sans emploi", "unemployed"),
        ("au chomage", "unemployed"),
        ("unemployed", "unemployed"),
        ("sans travail", "unemployed"),
        ("etudiant", "student"),
        ("student", "student"),
        ("travailleur autonome", "self_employed"),
        ("self employed", "self_employed"),
        ("je travaille", "employed"),
        ("i work", "employed"),
        ("employed", "employed"),
    )
    for needle, value in employment_terms:
        if needle in clean:
            data["employment_status"] = value
            break

    children_match = re.search(
        r"\b(\d{1,2})\s+(?:enfant|enfants|child|children)\b",
        clean,
    )
    if children_match:
        data["children"] = min(20, int(children_match.group(1)))
    elif "sans enfant" in clean or "no children" in clean:
        data["children"] = 0

    if any(
        needle in clean
        for needle in (
            "aide financiere",
            "prestation",
            "prestations",
            "benefit",
            "benefits",
            "income assistance",
            "social assistance",
        )
    ):
        data["objective"] = "financial_assistance"

    return Canada360AssistantProfile.model_validate(data)


def _intent_key(
    *,
    question: str,
    metric_key: str | None,
    mode: str,
    has_history: bool,
) -> str:
    if _explicit_statistical_intent(question, metric_key, mode):
        return "statistics"

    if has_history and _has_personal_cue(question):
        return "followup"

    if mode == "compare":
        return "compare"

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
                f"{'source officielle' if metric.official else 'source publiée'}."
                if lang == "fr"
                else f"{metric.source_name} · "
                f"{'official source' if metric.official else 'published source'}."
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

    return Canada360AssistantResponse(
        answer=(
            f"Canada — {metric.label}: "
            f"{_format_number(metric.value, metric.unit, lang)}"
            f"{f' pour {metric.reference_period}' if lang == 'fr' and metric.reference_period else f' for {metric.reference_period}' if metric.reference_period else ''}."
        ),
        links=[_metric_link(metric)],
        source_line=metric.source_name,
        mode=mode,
        jurisdiction=jurisdiction,
    )


class _ConversationStore:
    def __init__(self) -> None:
        self._memory: dict[
            str,
            tuple[float, Canada360AssistantConversation],
        ] = {}
        self._lock = asyncio.Lock()
        self._remote = redis_snapshot_store.namespace(
            "canada360-assistant-conversation-v1"
        )

    async def load(
        self,
        conversation_id: str | None,
        *,
        lang: str,
        jurisdiction: str,
    ) -> Canada360AssistantConversation:
        clean_id = _valid_conversation_id(conversation_id) or str(uuid4())
        now = monotonic()

        async with self._lock:
            cached = self._memory.get(clean_id)
            if cached and now - cached[0] <= CONVERSATION_TTL_SECONDS:
                state = cached[1]
                return self._with_context(
                    state,
                    lang=lang,
                    jurisdiction=jurisdiction,
                )

        remote = await self._remote.read(clean_id)
        if (
            remote is not None
            and isinstance(remote.value, Canada360AssistantConversation)
            and remote.age_seconds <= CONVERSATION_TTL_SECONDS
        ):
            state = self._with_context(
                remote.value,
                lang=lang,
                jurisdiction=jurisdiction,
            )
            async with self._lock:
                self._memory[clean_id] = (now, state)
            return state

        return Canada360AssistantConversation(
            conversation_id=clean_id,
            lang=lang,
            jurisdiction=jurisdiction,
        )

    async def save(
        self,
        state: Canada360AssistantConversation,
    ) -> None:
        now = monotonic()
        async with self._lock:
            self._memory[state.conversation_id] = (now, state)

        await self._remote.write(
            state.conversation_id,
            state,
            ttl_seconds=CONVERSATION_TTL_SECONDS,
        )

    @staticmethod
    def _with_context(
        state: Canada360AssistantConversation,
        *,
        lang: str,
        jurisdiction: str,
    ) -> Canada360AssistantConversation:
        profile = state.profile
        if jurisdiction != "CA" and profile.province is None:
            profile = profile.model_copy(
                update={"province": jurisdiction}
            )

        return state.model_copy(
            update={
                "lang": lang,
                "jurisdiction": jurisdiction,
                "profile": profile,
            }
        )


conversation_store = _ConversationStore()


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
                                str(
                                    title
                                    or urlparse(url).hostname
                                    or "Source"
                                ),
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
                            str(
                                title
                                or urlparse(url).hostname
                                or "Source"
                            ),
                            url,
                        )
                    )

    answer = "\n\n".join(
        part for part in text_parts if part
    ).strip()

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


def _profile_summary(
    profile: Canada360AssistantProfile,
    lang: str,
) -> str:
    parts: list[str] = []

    if profile.age is not None:
        parts.append(
            f"{profile.age} ans"
            if lang == "fr"
            else f"{profile.age} years old"
        )

    family = {
        "single": ("célibataire", "single"),
        "married": ("marié", "married"),
        "common_law": ("conjoint de fait", "common-law"),
        "divorced": ("divorcé", "divorced"),
        "widowed": ("veuf/veuve", "widowed"),
    }
    if profile.family_status in family:
        parts.append(
            family[profile.family_status][0 if lang == "fr" else 1]
        )

    employment = {
        "unemployed": ("sans emploi", "unemployed"),
        "employed": ("en emploi", "employed"),
        "student": ("étudiant", "student"),
        "self_employed": (
            "travailleur autonome",
            "self-employed",
        ),
    }
    if profile.employment_status in employment:
        parts.append(
            employment[profile.employment_status][
                0 if lang == "fr" else 1
            ]
        )

    if profile.children is not None:
        parts.append(
            f"{profile.children} enfant(s)"
            if lang == "fr"
            else f"{profile.children} child(ren)"
        )

    if profile.province:
        parts.append(_province_label(profile.province, lang))

    return ", ".join(parts)


def _fallback_benefits_answer(
    *,
    profile: Canada360AssistantProfile,
    jurisdiction: str,
    lang: str,
) -> tuple[str, list[Canada360AssistantLink]]:
    province_code = profile.province or (
        jurisdiction if jurisdiction != "CA" else None
    )
    summary = _profile_summary(profile, lang)

    links = [
        Canada360AssistantLink(
            label=FEDERAL["benefits"][1 if lang == "en" else 0],
            url=FEDERAL["benefits"][2],
            level="federal",
        )
    ]

    if profile.employment_status == "unemployed":
        links.append(
            Canada360AssistantLink(
                label=FEDERAL["ei"][1 if lang == "en" else 0],
                url=FEDERAL["ei"][2],
                level="federal",
            )
        )

    program = None
    if province_code in PROVINCIAL_INCOME_ASSISTANCE:
        program = PROVINCIAL_INCOME_ASSISTANCE[province_code]
        links.append(
            Canada360AssistantLink(
                label=program[1 if lang == "en" else 0],
                url=program[2],
                level="provincial",
            )
        )

    if lang == "fr":
        intro = (
            f"En tenant compte de ce que tu m’as déjà indiqué ({summary}), "
            if summary
            else "Voici les pistes que je vérifierais en priorité : "
        )

        rows: list[str] = []

        if profile.employment_status == "unemployed":
            rows.append(
                "1. Assurance-emploi — prestations régulières : à vérifier "
                "si tu as récemment perdu un emploi assurable. Le droit dépend "
                "notamment de la raison de la cessation d’emploi et du nombre "
                "d’heures assurables."
            )

        if program is not None:
            rows.append(
                f"{len(rows) + 1}. {program[0]} : programme provincial à "
                "vérifier lorsque les revenus et ressources ne suffisent pas "
                "aux besoins essentiels. L’admissibilité dépend notamment de "
                "la résidence, des revenus, des actifs et de la composition "
                "du ménage."
            )

        rows.append(
            f"{len(rows) + 1}. Prestations et crédits fondés sur le revenu : "
            "certaines aides fédérales ou provinciales dépendent du revenu "
            "déclaré; produire une déclaration de revenus peut rester important "
            "même avec peu ou pas de revenu."
        )

        missing = (
            "Pour affiner vraiment la liste, les informations les plus utiles "
            "sont : la raison de la fin du dernier emploi, les heures assurables "
            "récentes, le revenu actuel, l’épargne/les actifs et la situation "
            "de logement."
            if profile.employment_status == "unemployed"
            else
            "Pour affiner la liste, indique ton âge, ta situation familiale, "
            "ton statut d’emploi, tes revenus/actifs et la province concernée."
        )

        return "\n".join([intro, *rows, "", missing]), links

    intro = (
        f"Based on what you already told me ({summary}), "
        if summary
        else "Here are the options I would check first: "
    )

    rows_en: list[str] = []

    if profile.employment_status == "unemployed":
        rows_en.append(
            "1. Employment Insurance regular benefits: worth checking if you "
            "recently lost insurable employment. Eligibility depends in part on "
            "why the job ended and the number of insurable hours."
        )

    if program is not None:
        rows_en.append(
            f"{len(rows_en) + 1}. {program[1]}: a provincial program to check "
            "when income and resources do not cover basic needs. Eligibility "
            "generally depends on residence, income, assets and household composition."
        )

    rows_en.append(
        f"{len(rows_en) + 1}. Income-tested benefits and credits: some federal "
        "and provincial support depends on reported income, so filing a tax return "
        "can remain important even with little or no income."
    )

    missing_en = (
        "To narrow this properly, the most useful details are why your last job "
        "ended, recent insurable hours, current income, savings/assets and housing."
        if profile.employment_status == "unemployed"
        else
        "To narrow the list, provide your age, family situation, employment status, "
        "income/assets and province."
    )

    return "\n".join(
        [intro, *rows_en, "", missing_en]
    ), links


def _fallback_service_answer(
    *,
    topic: str,
    profile: Canada360AssistantProfile,
    jurisdiction: str,
    lang: str,
    mode: str,
) -> Canada360AssistantResponse:
    if topic == "benefits":
        answer, links = _fallback_benefits_answer(
            profile=profile,
            jurisdiction=jurisdiction,
            lang=lang,
        )
        return Canada360AssistantResponse(
            answer=answer,
            links=links,
            source_line=(
                "Réponse directe fondée sur des ressources gouvernementales "
                "officielles; l’organisme public décide de l’admissibilité."
                if lang == "fr"
                else "Direct answer grounded in official government resources; "
                "the public authority makes the eligibility decision."
            ),
            mode=mode,
            jurisdiction=jurisdiction,
        )

    federal = FEDERAL.get(topic, FEDERAL["services"])
    links = [
        Canada360AssistantLink(
            label=federal[1 if lang == "en" else 0],
            url=federal[2],
            level="federal",
        )
    ]

    province_code = profile.province or (
        jurisdiction if jurisdiction != "CA" else None
    )
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

    answer = (
        "Je peux répondre directement sur ce sujet à partir des règles et "
        "ressources publiques fédérales et provinciales. Précise le service, "
        "le programme ou la démarche que tu veux vérifier et je conserverai "
        "le contexte déjà donné dans cette conversation."
        if lang == "fr"
        else "I can answer this directly from federal and provincial public "
        "rules and resources. Specify the service, program or process you want "
        "to verify and I will keep the context already provided in this conversation."
    )

    return Canada360AssistantResponse(
        answer=answer,
        links=links,
        source_line=(
            "Sources gouvernementales officielles uniquement."
            if lang == "fr"
            else "Official government sources only."
        ),
        mode=mode,
        jurisdiction=jurisdiction,
    )


def _history_for_prompt(
    history: list[Canada360AssistantTurn],
) -> str:
    if not history:
        return "(no previous turns)"

    rows = []
    for turn in history[-10:]:
        role = "User" if turn.role == "user" else "Canada 360"
        rows.append(f"{role}: {turn.text[:1200]}")
    return "\n".join(rows)


def _model_prompt(
    *,
    question: str,
    lang: str,
    jurisdiction: str,
    mode: str,
    topic: str,
    profile: Canada360AssistantProfile,
    history: list[Canada360AssistantTurn],
) -> str:
    language = "French" if lang == "fr" else "English"
    place = (
        _province_label(jurisdiction, lang)
        if jurisdiction != "CA"
        else "Canada"
    )
    profile_json = profile.model_dump(exclude_none=True)

    return f"""You are Canada 360, a conversational Canadian public-service and public-data assistant.

Answer the current user message directly in {language}. Continue the conversation instead of treating each message as unrelated.

Current jurisdiction: {place}
Current mode: {mode}
Current topic: {topic}
Structured session context: {profile_json}

Recent conversation:
{_history_for_prompt(history)}

Current user message:
{question}

Critical routing rule:
- A personal statement such as "je suis sans emploi", "I am unemployed", "j'ai 25 ans", or "I am single" is PROFILE CONTEXT, not a request for an employment/population statistic.
- Use statistical data only when the user explicitly asks for a statistic, number, rate, trend, comparison, history or similar measurement.

Answer rules:
- Use only information found through the provided web search tool, which is restricted to official Canadian federal and provincial government domains.
- Search the relevant province as well as federal sources when the question depends on province.
- Lead with the answer, not with links.
- For benefits or services, enumerate the most relevant programs/options and explain why each may matter given the conversation context.
- Ask at most 1 or 2 targeted follow-up questions when important eligibility facts are still missing.
- Never say that the user is definitely eligible unless an official source makes that determination from all required facts. Explain what appears potentially relevant and what still needs verification.
- For statistics, identify the reference period when available.
- For health questions, provide administrative/service information only; do not diagnose or prescribe treatment.
- For laws, public policy, elected officials, parties, elections or ballot questions, stay neutral and factual and do not recommend a political choice.
- Do not output raw URLs. The interface displays official sources below the answer.
- If official sources are insufficient or conflicting, say what can and cannot be confirmed instead of guessing.
"""


async def _grounded_model_answer(
    *,
    question: str,
    lang: str,
    jurisdiction: str,
    mode: str,
    topic: str,
    profile: Canada360AssistantProfile,
    history: list[Canada360AssistantTurn],
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
            topic=topic,
            profile=profile,
            history=history,
        ),
        "max_output_tokens": 1000,
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
            "Réponse synthétisée uniquement à partir de sources "
            "gouvernementales officielles."
            if lang == "fr"
            else "Answer synthesized only from official government sources."
        ),
        mode=mode,
        jurisdiction=jurisdiction,
    )


class Canada360AssistantService:
    async def get_conversation(
        self,
        *,
        conversation_id: str | None,
        lang: str,
        jurisdiction: str,
    ) -> Canada360AssistantConversation:
        return await conversation_store.load(
            conversation_id,
            lang=lang,
            jurisdiction=jurisdiction,
        )

    async def answer(
        self,
        *,
        question: str,
        lang: str,
        jurisdiction: str,
        mode: str,
        conversation_id: str | None = None,
    ) -> Canada360AssistantResponse:
        state = await conversation_store.load(
            conversation_id,
            lang=lang,
            jurisdiction=jurisdiction,
        )

        profile = _update_profile(
            state.profile,
            question,
            jurisdiction,
        )

        effective_jurisdiction = (
            profile.province
            or (jurisdiction if jurisdiction != "CA" else state.jurisdiction)
            or "CA"
        )
        if effective_jurisdiction not in PROVINCES and effective_jurisdiction != "CA":
            effective_jurisdiction = "CA"

        topic = _resolve_topic(
            question,
            state.topic,
        )

        metric_key = _metric_key(question)
        intent = _intent_key(
            question=question,
            metric_key=metric_key,
            mode=mode,
            has_history=bool(state.history),
        )

        base_response: Canada360AssistantResponse | None = None

        if intent == "statistics" and metric_key is not None:
            snapshot = await canada_360_service.get_snapshot(
                lang=lang,
                force=False,
            )
            base_response = _statistical_answer(
                question=question,
                metric_key=metric_key,
                lang=lang,
                jurisdiction=effective_jurisdiction,
                mode=mode,
                snapshot=snapshot,
            )

        if base_response is None:
            base_response = await _grounded_model_answer(
                question=question,
                lang=lang,
                jurisdiction=effective_jurisdiction,
                mode=mode,
                topic=topic,
                profile=profile,
                history=state.history,
            )

        if base_response is None:
            base_response = _fallback_service_answer(
                topic=topic,
                profile=profile,
                jurisdiction=effective_jurisdiction,
                lang=lang,
                mode=mode,
            )

        user_turn = Canada360AssistantTurn(
            role="user",
            text=question,
        )
        assistant_turn = Canada360AssistantTurn(
            role="assistant",
            text=base_response.answer,
            links=base_response.links,
            source_line=base_response.source_line,
        )

        history = [
            *state.history,
            user_turn,
            assistant_turn,
        ][-MAX_HISTORY_TURNS:]

        next_state = Canada360AssistantConversation(
            conversation_id=state.conversation_id,
            lang=lang,
            jurisdiction=effective_jurisdiction,
            topic=topic,
            profile=profile,
            history=history,
        )

        await conversation_store.save(next_state)

        return base_response.model_copy(
            update={
                "jurisdiction": effective_jurisdiction,
                "conversation_id": next_state.conversation_id,
                "history": history,
                "profile": profile,
                "intent": intent,
            }
        )


canada_360_assistant_service = Canada360AssistantService()
