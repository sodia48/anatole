from __future__ import annotations

import asyncio
import logging
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
    Canada360Province,
    Canada360Snapshot,
)
from app.services.canada_360 import _from_statcan, canada_360_service
from app.services.canada_360_precision import (
    _path_is_detailed,
    audit_grounded_answer,
    build_precision_instructions,
)
from app.services.provincial_statistics import provincial_statistics_service

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_ASSISTANT_MODEL = "gpt-5.4-mini"
CONVERSATION_TTL_SECONDS = 2 * 60 * 60
MAX_HISTORY_TURNS = 16
logger = logging.getLogger(__name__)

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
    return re.sub(
        r"\s+", " ", ascii_value.lower().replace("'", " ").replace("-", " ")
    ).strip()


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
) -> bool:
    if metric_key is None:
        return False

    clean = _normalize(question)

    if _has_personal_cue(question):
        return False

    if any(cue in clean for cue in STATISTICAL_CUES):
        return True

    words = clean.split()
    return len(words) <= 6 and "?" not in question and metric_key != "employment"


def _comparison_requested(question: str) -> bool:
    return bool(re.search(r"\b(?:compar\w*|versus|vs)\b", _normalize(question)))


def _last_statistical_metric(
    history: list[Canada360AssistantTurn],
) -> str | None:
    for turn in reversed(history):
        if turn.role != "user":
            continue
        metric_key = _metric_key(turn.text)
        if _explicit_statistical_intent(turn.text, metric_key):
            return metric_key
    return None


def _metric_followup(
    question: str,
    history: list[Canada360AssistantTurn],
) -> bool:
    if not history or not _named_provinces(question) or _has_personal_cue(question):
        return False
    clean = _normalize(question)
    return (
        len(clean.split()) <= 12
        and (
            clean.startswith(("et ", "what about ", "how about "))
            or _comparison_requested(question)
        )
        and _last_statistical_metric(history) is not None
    )


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
    history: list[Canada360AssistantTurn],
) -> str:
    if _explicit_statistical_intent(question, metric_key) or _metric_followup(
        question, history
    ):
        return (
            "comparison"
            if _comparison_requested(question) or len(_named_provinces(question)) > 1
            else "statistics"
        )

    if history and _has_personal_cue(question):
        return "followup"

    if _comparison_requested(question):
        return "comparison"

    if history and _normalize(question).startswith(
        ("pourquoi ", "why ", "comment expliquer ")
    ):
        return "explanation"

    if history and _normalize(question).startswith(
        ("et ", "what about ", "how about ")
    ):
        return "followup"

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
    url = metric.source_url or ""
    return Canada360AssistantLink(
        label=metric.source_name,
        url=url,
        level=_source_level(url),
    )


def _trusted_metric(metric: Canada360Metric, jurisdiction: str) -> bool:
    url = metric.source_url or ""
    domains = [*FEDERAL_DOMAINS, *PROVINCE_DOMAINS.get(jurisdiction, ())]
    return bool(
        metric.official
        and metric.value is not None
        and url
        and _allowed_source(url, domains)
        and _path_is_detailed(url)
    )


def _metric_subject(metric_key: str, label: str, lang: str) -> str:
    subjects = {
        "unemployment_rate": ("Le taux de chômage", "The unemployment rate"),
        "inflation_yoy": ("L'inflation", "Inflation"),
        "population": ("La population", "The population"),
    }
    named = subjects.get(metric_key)
    if named:
        return named[0 if lang == "fr" else 1]
    return f"La valeur « {label} »" if lang == "fr" else f"The {label} value"


def _statistical_answer(
    *,
    metric_key: str,
    lang: str,
    jurisdiction: str,
    mode: str,
    targets: list[str],
    comparison: bool,
    snapshot: Canada360Snapshot,
) -> Canada360AssistantResponse | None:
    if targets:
        rows: list[tuple[Canada360Province, Canada360Metric]] = []
        for code in targets:
            province = next(
                (item for item in snapshot.provinces if item.code == code), None
            )
            if province is None:
                return None
            metric = next(
                (
                    item for item in province.metrics
                    if item.key == metric_key and _trusted_metric(item, code)
                ), None,
            )
            if metric is None:
                return None
            rows.append((province, metric))

        if comparison and len(rows) < 2:
            return None

        subject = _metric_subject(metric_key, rows[0][1].label, lang)
        pieces = [
            f"{_format_number(metric.value, metric.unit, lang)} en {province.name}"
            if lang == "fr" else
            f"{_format_number(metric.value, metric.unit, lang)} in {province.name}"
            for province, metric in rows if metric.value is not None
        ]
        if len(rows) > 1:
            pieces = [
                f"{piece} ({metric.reference_period})"
                if metric.reference_period else piece
                for piece, (_province, metric) in zip(pieces, rows)
            ]
        period = rows[0][1].reference_period if len(rows) == 1 else None
        answer = (
            f"{subject} est de {' et '.join(pieces)}"
            if lang == "fr" else
            f"{subject} is {' and '.join(pieces)}"
        )
        if period:
            answer += f" pour {period}" if lang == "fr" else f" for {period}"
        links: list[Canada360AssistantLink] = []
        seen_urls: set[str] = set()
        for _province, metric in rows:
            link = _metric_link(metric)
            if link.url not in seen_urls:
                seen_urls.add(link.url)
                links.append(link)
        return Canada360AssistantResponse(
            answer=f"{answer}.",
            links=links,
            source_line=" · ".join(dict.fromkeys(metric.source_name for _, metric in rows)),
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
            if item.key == metric_key and _trusted_metric(item, "CA")
        ),
        None,
    )
    if metric is None or metric.value is None:
        return None

    subject = _metric_subject(metric_key, metric.label, lang)
    answer = (
        f"Au Canada, {subject[0].lower() + subject[1:]} est de "
        if lang == "fr" else
        f"In Canada, {subject[0].lower() + subject[1:]} is "
    ) + _format_number(metric.value, metric.unit, lang)
    if metric.reference_period:
        answer += (
            f" pour {metric.reference_period}"
            if lang == "fr" else f" for {metric.reference_period}"
        )
    return Canada360AssistantResponse(
        answer=f"{answer}.",
        links=[_metric_link(metric)],
        source_line=metric.source_name,
        mode=mode,
        jurisdiction=jurisdiction,
    )


async def _hydrate_province_metrics(
    snapshot: Canada360Snapshot,
    *,
    targets: list[str],
    metric_key: str,
    lang: str,
) -> Canada360Snapshot:
    missing = [
        code for code in targets
        if not any(
            province.code == code
            and any(
                metric.key == metric_key and _trusted_metric(metric, code)
                for metric in province.metrics
            )
            for province in snapshot.provinces
        )
    ]
    if not missing:
        return snapshot

    async def load(code: str) -> Canada360Province | None:
        try:
            fresh = await asyncio.wait_for(
                provincial_statistics_service.get_snapshot(
                    region=code, lang=lang, force=False
                ),
                timeout=18.0,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "canada360_stat_source_unavailable province=%s error=%s",
                code, type(exc).__name__,
            )
            return None
        profile = next(
            (province for province in fresh.provinces if province.code == code),
            None,
        )
        if profile is None:
            return None
        source_name = (
            "Statistics Canada — WDS" if lang == "en" else "Statistique Canada — WDS"
        )
        return Canada360Province(
            code=code,
            name=_province_label(code, lang),
            status="partial",
            metrics=[
                _from_statcan(metric, source_name=source_name)
                for metric in profile.metrics
            ],
            source_name=profile.official_source_name,
            source_url=profile.official_source_url,
        )

    hydrated = await asyncio.gather(*(load(code) for code in missing))
    replacements = {province.code: province for province in hydrated if province}
    if not replacements:
        return snapshot
    provinces = [
        replacements.pop(province.code, province)
        for province in snapshot.provinces
    ]
    provinces.extend(replacements.values())
    return snapshot.model_copy(update={"provinces": provinces})


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
    history: list[Canada360AssistantTurn] | None = None,
) -> list[str]:
    domains = list(FEDERAL_DOMAINS)
    codes = _named_provinces(question)

    for turn in (history or [])[-10:]:
        if turn.role == "user":
            codes.extend(_named_provinces(turn.text))

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
    precision_instructions = build_precision_instructions(
        question=question,
        topic=topic,
        jurisdiction=jurisdiction,
        profile=profile,
        history=history,
    )

    return f"""You are Canada 360, a conversational Canadian public-service and public-data assistant.

Answer the current user message directly in {language}. Continue the conversation instead of treating each message as unrelated.

Current jurisdiction: {place}
Current topic: {topic}
Structured session context: {profile_json}

Recent conversation:
{_history_for_prompt(history)}

Current user message:
{question}

Precision protocol:
{precision_instructions}

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
        history=history,
    )

    payload = {
        "model": settings.canada360_assistant_model,
        "reasoning": {"effort": "low"},
        "tools": [
            {
                "type": "web_search",
                "search_context_size": "high",
                "filters": {
                    "allowed_domains": domains,
                },
            }
        ],
        "tool_choice": "required",
        "include": ["web_search_call.action.sources"],
        "input": _model_prompt(
            question=question,
            lang=lang,
            jurisdiction=jurisdiction,
            topic=topic,
            profile=profile,
            history=history,
        ),
        "max_output_tokens": 1200,
        "store": False,
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
            models = [settings.canada360_assistant_model]
            if models[0] != DEFAULT_ASSISTANT_MODEL:
                models.append(DEFAULT_ASSISTANT_MODEL)
            for index, model in enumerate(models):
                payload["model"] = model
                response = await client.post(
                    OPENAI_RESPONSES_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                error = response.json().get("error", {}) if response.is_error else {}
                error_code = error.get("code") if isinstance(error, dict) else None
                if (
                    index + 1 < len(models)
                    and response.status_code in {400, 404}
                    and error_code in {"model_not_found", "invalid_model"}
                ):
                    logger.warning(
                        "canada360_model_unavailable configured_model=%s status=%s",
                        model, response.status_code,
                    )
                    continue
                break

        response.raise_for_status()
        answer, links = _extract_model_response(
            response.json(),
            domains=domains,
        )
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "canada360_model_request_failed status=%s",
            exc.response.status_code,
        )
        return None
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.warning(
            "canada360_model_request_failed error=%s", type(exc).__name__
        )
        return None

    if not answer or not links:
        return None

    audit = audit_grounded_answer(
        answer=answer,
        source_urls=[link.url for link in links],
        question=question,
        topic=topic,
        jurisdiction=jurisdiction,
        profile=profile,
        history=history,
    )

    if not audit.accepted:
        logger.info(
            "canada360_path=rejected_by_precision_audit reason=%s",
            audit.reason,
        )
        return None

    return Canada360AssistantResponse(
        answer=answer,
        links=links,
        source_line=audit.source_line(lang),
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
        mode: str = "ask",
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
        if metric_key is None and _metric_followup(question, state.history):
            metric_key = _last_statistical_metric(state.history)
        intent = _intent_key(
            question=question,
            metric_key=metric_key,
            history=state.history,
        )

        base_response: Canada360AssistantResponse | None = None

        if intent in {"statistics", "comparison"} and metric_key is not None:
            targets = _named_provinces(question)
            previous_province = state.profile.province or (
                state.jurisdiction if state.jurisdiction != "CA" else None
            )
            if intent == "comparison" and previous_province:
                if previous_province not in targets:
                    targets.insert(0, previous_province)
            if not targets and effective_jurisdiction != "CA":
                targets = [effective_jurisdiction]
            try:
                snapshot = await canada_360_service.get_snapshot(
                    lang=lang, force=False,
                )
                snapshot = await _hydrate_province_metrics(
                    snapshot,
                    targets=targets,
                    metric_key=metric_key,
                    lang=lang,
                )
                base_response = _statistical_answer(
                    metric_key=metric_key,
                    lang=lang,
                    jurisdiction=effective_jurisdiction,
                    mode=mode,
                    targets=targets,
                    comparison=intent == "comparison",
                    snapshot=snapshot,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "canada360_stat_source_unavailable error=%s",
                    type(exc).__name__,
                )
            if base_response is not None:
                logger.info("canada360_path=structured_stat_answer")

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
            if base_response is not None:
                logger.info("canada360_path=grounded_model_answer")

        if base_response is None:
            logger.info("canada360_path=conservative_unavailable")
            base_response = Canada360AssistantResponse(
                answer=(
                    "Je ne peux pas vérifier cette réponse en profondeur pour "
                    "le moment. Réessaie dans quelques instants."
                    if lang == "fr" else
                    "I can't verify this answer in depth right now. "
                    "Please try again in a moment."
                ),
                jurisdiction=effective_jurisdiction,
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
