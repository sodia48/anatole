from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlparse

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

ELIGIBILITY_CUES = (
    "admissible",
    "admissibilite",
    "eligible",
    "eligibility",
    "droit a",
    "avoir droit",
    "qualify",
    "qualification",
)

AMOUNT_CUES = (
    "combien",
    "montant",
    "somme",
    "maximum",
    "minimum",
    "amount",
    "how much",
    "maximum",
    "minimum",
)

DEADLINE_CUES = (
    "date limite",
    "delai",
    "echeance",
    "quand",
    "deadline",
    "time limit",
    "when",
)

PROCEDURE_CUES = (
    "comment",
    "demande",
    "appliquer",
    "inscrire",
    "inscription",
    "how",
    "apply",
    "application",
    "register",
)

JOB_END_REASON_CUES = (
    "mis a pied",
    "mise a pied",
    "licencie",
    "licenciement",
    "manque de travail",
    "contrat termine",
    "fin de contrat",
    "demission",
    "quitte mon emploi",
    "laid off",
    "layoff",
    "shortage of work",
    "fired",
    "dismissed",
    "contract ended",
    "quit",
)

INCOME_CUES = (
    "revenu",
    "revenus",
    "salaire",
    "gagne",
    "income",
    "salary",
    "earn",
)

ASSET_CUES = (
    "actif",
    "actifs",
    "epargne",
    "épargne",
    "economies",
    "économies",
    "compte bancaire",
    "assets",
    "savings",
    "bank account",
)

UNSAFE_ELIGIBILITY_PATTERNS = (
    r"\btu\s+es\s+admissible\b",
    r"\bvous\s+etes\s+admissible\b",
    r"\bvous\s+êtes\s+admissible\b",
    r"\btu\s+as\s+droit\b",
    r"\bvous\s+avez\s+droit\b",
    r"\byou\s+are\s+eligible\b",
    r"\byou\s+qualify\b",
)


@dataclass(frozen=True)
class PrecisionAudit:
    accepted: bool
    reason: str
    source_count: int
    federal: bool
    provincial: bool
    detailed: bool

    def source_line(self, lang: str) -> str:
        if lang == "fr":
            coverage = []
            if self.federal:
                coverage.append("fédérale")
            if self.provincial:
                coverage.append("provinciale")
            label = " + ".join(coverage) or "gouvernementale"
            return (
                f"Vérification renforcée · {self.source_count} source(s) "
                f"officielle(s) · couverture {label}"
                f"{' · pages détaillées' if self.detailed else ''}."
            )

        coverage = []
        if self.federal:
            coverage.append("federal")
        if self.provincial:
            coverage.append("provincial")
        label = " + ".join(coverage) or "government"
        return (
            f"Enhanced verification · {self.source_count} official source(s) "
            f"· {label} coverage"
            f"{' · detailed pages' if self.detailed else ''}."
        )


def _normalize(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode(
        "ascii",
        "ignore",
    ).decode("ascii")
    return re.sub(
        r"\s+",
        " ",
        ascii_value.lower().replace("'", " "),
    ).strip()


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def _path_is_detailed(url: str) -> bool:
    try:
        path = urlparse(url).path.strip("/")
    except ValueError:
        return False

    if not path:
        return False

    generic = {
        "en",
        "fr",
        "home",
        "services",
        "residents",
        "citizens",
    }

    parts = [part for part in path.split("/") if part]
    return any(part.lower() not in generic for part in parts)


def _matches_domain(host: str, domain: str) -> bool:
    return host == domain or host.endswith(f".{domain}")


def _is_federal(url: str) -> bool:
    host = _host(url)
    return any(
        _matches_domain(host, domain)
        for domain in FEDERAL_DOMAINS
    )


def _is_provincial(
    url: str,
    jurisdiction: str,
) -> bool:
    if jurisdiction not in PROVINCE_DOMAINS:
        return False

    host = _host(url)
    return any(
        _matches_domain(host, domain)
        for domain in PROVINCE_DOMAINS[jurisdiction]
    )


def _history_text(
    history: list[object],
    question: str,
) -> str:
    rows = [question]

    for turn in history[-10:]:
        text = getattr(turn, "text", "")
        if isinstance(text, str):
            rows.append(text)

    return _normalize(" ".join(rows))


def _question_kind(
    question: str,
) -> str:
    clean = _normalize(question)

    if any(cue in clean for cue in ELIGIBILITY_CUES):
        return "eligibility"

    if any(cue in clean for cue in AMOUNT_CUES):
        return "amount"

    if any(cue in clean for cue in DEADLINE_CUES):
        return "deadline"

    if any(cue in clean for cue in PROCEDURE_CUES):
        return "procedure"

    return "general"


def missing_precision_facts(
    *,
    question: str,
    topic: str,
    jurisdiction: str,
    profile: object,
    history: list[object],
) -> list[str]:
    clean = _history_text(history, question)
    missing: list[str] = []

    profile_province = getattr(profile, "province", None)
    employment = getattr(profile, "employment_status", None)

    if jurisdiction == "CA" and not profile_province:
        missing.append("province or territory")

    if topic == "benefits" and employment == "unemployed":
        if not any(cue in clean for cue in JOB_END_REASON_CUES):
            missing.append("reason the last job ended")

        if not re.search(
            r"\b\d{2,4}\s*(?:heures|hours)\b",
            clean,
        ):
            missing.append("recent insurable hours")

        if not any(cue in clean for cue in INCOME_CUES):
            missing.append("current income")

        if not any(cue in clean for cue in ASSET_CUES):
            missing.append("savings/assets")

    if topic == "taxes":
        if not re.search(r"\b20\d{2}\b", clean):
            missing.append("tax year")

    if topic == "immigration":
        if not any(
            cue in clean
            for cue in (
                "citoyen",
                "resident permanent",
                "residence permanente",
                "permis",
                "visa",
                "citizen",
                "permanent resident",
                "permit",
            )
        ):
            missing.append("current immigration/status document")

    return missing


def build_precision_instructions(
    *,
    question: str,
    topic: str,
    jurisdiction: str,
    profile: object,
    history: list[object],
) -> str:
    kind = _question_kind(question)
    missing = missing_precision_facts(
        question=question,
        topic=topic,
        jurisdiction=jurisdiction,
        profile=profile,
        history=history,
    )

    rows = [
        f"Precision class: {kind}.",
        (
            "Every concrete claim about eligibility, amount, threshold, "
            "deadline, duration, age, income, hours, documents or required "
            "steps must be supported by an official source consulted in "
            "this search."
        ),
        (
            "Prefer the specific program, eligibility, amount or application "
            "page over a government homepage or generic services index."
        ),
        (
            "If current rules cannot be confirmed from official sources, "
            "say that explicitly and do not estimate."
        ),
    ]

    if jurisdiction != "CA":
        rows.append(
            "For a province-specific answer, consult at least one detailed "
            "official source from that province whenever the claim depends "
            "on provincial rules."
        )

    if topic == "benefits" and jurisdiction != "CA":
        rows.append(
            "For broad financial-assistance questions, check both federal "
            "and provincial programs so the answer does not omit an entire "
            "level of government."
        )

    if missing:
        rows.append(
            "Important facts still missing: "
            + ", ".join(missing)
            + ". Give a useful preliminary answer, then ask at most two "
            "of the most decision-relevant follow-up questions. Do not "
            "pretend these facts are known."
        )

    return "\n".join(f"- {row}" for row in rows)


def audit_grounded_answer(
    *,
    answer: str,
    source_urls: list[str],
    question: str,
    topic: str,
    jurisdiction: str,
    profile: object,
    history: list[object],
) -> PrecisionAudit:
    urls = list(dict.fromkeys(url for url in source_urls if url))

    federal = any(_is_federal(url) for url in urls)
    provincial = any(
        _is_provincial(url, jurisdiction)
        for url in urls
    )
    provincial_detailed = any(
        _is_provincial(url, jurisdiction) and _path_is_detailed(url)
        for url in urls
    )
    detailed = any(_path_is_detailed(url) for url in urls)

    if not urls:
        return PrecisionAudit(
            False,
            "no official source",
            0,
            False,
            False,
            False,
        )

    kind = _question_kind(question)
    precision_sensitive = (
        topic in {
            "benefits",
            "taxes",
            "immigration",
            "health",
            "business",
            "education",
        }
        or kind in {
            "eligibility",
            "amount",
            "deadline",
            "procedure",
        }
    )

    if precision_sensitive and not detailed:
        return PrecisionAudit(
            False,
            "only generic government landing pages were found",
            len(urls),
            federal,
            provincial,
            detailed,
        )

    personal_benefits = (
        topic == "benefits"
        and jurisdiction != "CA"
        and (
            getattr(profile, "employment_status", None) is not None
            or getattr(profile, "objective", None)
            == "financial_assistance"
        )
    )

    if personal_benefits and not (federal and provincial):
        return PrecisionAudit(
            False,
            "financial-assistance answer needs federal and provincial coverage",
            len(urls),
            federal,
            provincial,
            detailed,
        )

    if (
        jurisdiction != "CA"
        and topic in {
            "benefits",
            "health",
            "business",
            "education",
        }
        and not provincial
    ):
        return PrecisionAudit(
            False,
            "province-specific answer lacks a provincial official source",
            len(urls),
            federal,
            provincial,
            detailed,
        )

    if (
        precision_sensitive
        and jurisdiction != "CA"
        and topic in {
            "benefits",
            "health",
            "business",
            "education",
        }
        and not provincial_detailed
    ):
        return PrecisionAudit(
            False,
            "province-specific answer lacks a detailed provincial official source",
            len(urls),
            federal,
            provincial,
            detailed,
        )

    missing = missing_precision_facts(
        question=question,
        topic=topic,
        jurisdiction=jurisdiction,
        profile=profile,
        history=history,
    )

    clean_answer = _normalize(answer)
    if missing and any(
        re.search(pattern, clean_answer)
        for pattern in UNSAFE_ELIGIBILITY_PATTERNS
    ):
        return PrecisionAudit(
            False,
            "categorical eligibility claim with missing facts",
            len(urls),
            federal,
            provincial,
            detailed,
        )

    numeric_claim = re.search(
        r"\b\d[\d\s,.]*\s*(?:\$|cad|%|heures|hours|semaines|weeks|mois|months)\b",
        clean_answer,
    )

    if numeric_claim and not detailed:
        return PrecisionAudit(
            False,
            "numeric claim lacks a detailed official page",
            len(urls),
            federal,
            provincial,
            detailed,
        )

    return PrecisionAudit(
        True,
        "accepted",
        len(urls),
        federal,
        provincial,
        detailed,
    )
