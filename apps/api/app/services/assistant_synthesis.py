"""Grounded, bounded synthesis of minimized financial evidence."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from decimal import Decimal

from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.schemas.assistant_context import AnatoleEvidenceBundle

logger = logging.getLogger(__name__)
NUMBERS = re.compile(r"(?<![A-Za-z])[-+]?\d+(?:[.,]\d+)?(?![A-Za-z])")
UNSAFE_LINK = re.compile(r"https?://|www\.|\[[^\]]+\]\([^)]*\)", re.I)
TRADING = re.compile(r"\b(?:acheter|achetez|achète|vendre|vendez|vends|alléger|renforcer|"
                     r"rééquilibrer|rebalancer|buy|sell|dca|buy the dip|target allocation)\b", re.I)
PRIVATE_PORTFOLIO = re.compile(r"co[uû]t|cost|quantit|average|basis|prix d.achat|account|email|user.id", re.I)
PORTFOLIO_GROUPS = {"allocation", "lookthrough", "performance", "contribution", "sector",
                    "currency", "stress"}
PORTFOLIO_FACT = re.compile(r"poids|weight|couverture|coverage|rendement|performance|"
                            r"contribution|[eé]cart|exposition|choc|impact", re.I)
MONEY_VALUE = re.compile(r"\$|\b(?:CAD|USD|EUR|GBP)\b", re.I)


class SynthesisDraft(BaseModel):
    answer_markdown: str = Field(min_length=1, max_length=4500)
    used_fact_ids: list[str] = Field(min_length=1, max_length=60)
    used_source_ids: list[str] = Field(default_factory=list, max_length=30)
    missing_data_ids: list[str] = Field(default_factory=list, max_length=20)
    follow_up_prompts: list[str] = Field(default_factory=list, max_length=3)


@dataclass(frozen=True)
class SynthesisOutcome:
    answer: str
    provider: str | None = None
    model: str | None = None
    mode: str = "deterministic"
    validated: bool = False
    follow_up_prompts: tuple[str, ...] = ()


def evidence_payload(bundle: AnatoleEvidenceBundle, question: str,
                     conversation: dict[str, object] | None = None) -> dict[str, object]:
    portfolio = bundle.skill == "portfolio_analysis"
    permitted_portfolio_facts = {id(fact) for group, rows in bundle.metric_groups.items()
                                 if group in PORTFOLIO_GROUPS for fact in rows}
    facts = [fact for fact in bundle.facts
             if not portfolio or (id(fact) in permitted_portfolio_facts
                                  and PORTFOLIO_FACT.search(fact.label)
                                  and not PRIVATE_PORTFOLIO.search(f"{fact.label} {fact.value}")
                                  and not MONEY_VALUE.search(fact.value))][:100]
    fact_ids = {id(fact): f"F{index}" for index, fact in enumerate(facts, 1)}
    payload = {
        "skill": bundle.skill,
        "question": (f"Sujet portefeuille : {bundle.portfolio_focus or 'overview'}" if portfolio else
                     re.sub(r"[\w.+-]+@[\w.-]+", "[email masqué]", question[:300])),
        "entities": bundle.entities[:5],
        "facts": [{"id": fact_ids[id(fact)], "label": fact.label[:120],
                   "value": fact.value[:240], "source": fact.source[:120],
                   "freshness": fact.freshness} for fact in facts],
        "metric_groups": {group: [fact_ids[id(fact)] for fact in rows if id(fact) in fact_ids]
                          for group, rows in bundle.metric_groups.items()},
        "sources": [{"id": f"S{index}", "label": source.label[:120],
                     "type": source.type[:40], "freshness": source.freshness[:30],
                     "timestamp": source.timestamp.isoformat() if source.timestamp else None}
                    for index, source in enumerate(bundle.sources[:30], 1)],
        "missing": [{"id": f"M{index}", "text": value[:240]}
                    for index, value in enumerate([item for item in bundle.missing_data + bundle.limitations
                                                   if not portfolio or not PRIVATE_PORTFOLIO.search(item)][:30], 1)],
        "conversation": ({key: (conversation or {}).get(key) for key in ("last_skill", "portfolio_focus")}
                         if portfolio else conversation or {}),
    }
    if portfolio:
        payload["portfolio"] = {
            "focus": bundle.portfolio_focus,
            "xray": bundle.portfolio_xray.model_dump(include={
                "quote_coverage_percent", "top_position_percent",
                "top_three_percent", "top_five_percent", "sector_coverage_percent", "currency_coverage_percent",
                "history_coverage_percent", "etf_lookthrough_coverage_percent",
                "risk_contribution_coverage_percent", "attribution_coverage_percent",
                "correlation_coverage_percent", "stress_coverage_percent",
            }) if bundle.portfolio_xray else None,
            "risk_contributions": {
                "items": [row.model_dump(include={"symbol", "portfolio_weight_percent",
                                                  "risk_contribution_percent"})
                          for row in bundle.risk_contributions.items],
                "coverage_percent": bundle.risk_contributions.coverage.coverage_percent,
            } if bundle.risk_contributions else None,
            "attribution": [row.model_dump() for row in bundle.attribution[:6]],
            "clusters": [row.model_dump(include={"symbols", "combined_weight_percent", "coverage_percent"})
                         for row in bundle.correlation_clusters[:8]],
            "lookthrough": {
                "holdings": [row.model_dump(include={"symbol", "direct_weight_percent",
                                                      "indirect_observed_weight_percent",
                                                      "combined_observed_weight_percent",
                                                      "source_etfs", "holdings_coverage_percent"})
                             for row in bundle.lookthrough.holdings[:20]],
                "coverage_percent": bundle.lookthrough.holdings_coverage_percent,
            } if bundle.lookthrough else None,
            "concentration": bundle.concentration_map.model_dump(include={
                "direct_top_three_percent", "sector_weights", "currency_weights",
                "top_cluster_weight_percent", "coverage",
            }) if bundle.concentration_map else None,
            "scenarios": [row.model_dump() for row in bundle.scenarios[:4]],
            "watchtower": {
                "previous_available": bundle.watchtower.previous_available,
                "changes": {key: value for key, value in bundle.watchtower.changes.items()
                            if key in {"top_position_weight_percent", "top_three_percent"}
                            or key.startswith(("benchmark_gap_", "coverage_"))},
            } if bundle.watchtower else None,
        }
    return payload


def _numeric_values(text: str) -> set[Decimal]:
    return {Decimal(value.replace(",", ".")) for value in NUMBERS.findall(text)}


def validate_draft(raw: str, payload: dict[str, object]) -> SynthesisDraft:
    draft = SynthesisDraft.model_validate(json.loads(raw))
    facts = {row["id"] for row in payload["facts"]}
    sources = {row["id"] for row in payload["sources"]}
    missing = {row["id"] for row in payload["missing"]}
    if (not set(draft.used_fact_ids) <= facts or not set(draft.used_source_ids) <= sources
            or not set(draft.missing_data_ids) <= missing):
        raise ValueError("unknown_evidence_id")
    answer = draft.answer_markdown
    if UNSAFE_LINK.search(answer) or any(mark in answer for mark in ("```", "<", ">", "|", "![")):
        raise ValueError("unsafe_markdown_or_url")
    if TRADING.search(answer):
        raise ValueError("transactional_language")
    if any(line.startswith("#") and not line.startswith("## ") or len(line) > 600
           for line in answer.splitlines()):
        raise ValueError("unsupported_markdown")
    if not set(re.findall(r"\bS\d+\b", answer)) <= set(draft.used_source_ids):
        raise ValueError("unknown_source_reference")
    trusted = json.dumps({key: value for key, value in payload.items()
                          if key not in {"question", "conversation"}}, ensure_ascii=False, default=str)
    if not _numeric_values(answer) <= _numeric_values(trusted):
        raise ValueError("unsupported_number")
    if payload.get("skill") == "fixed_income":
        stated_cusips = set(re.findall(r"\b[A-Z0-9]{9}\b", answer))
        known_cusips = set(re.findall(r"\b[A-Z0-9]{9}\b", trusted))
        if not stated_cusips <= known_cusips:
            raise ValueError("unsupported_cusip")
    if any(len(prompt) > 160 or UNSAFE_LINK.search(prompt) or TRADING.search(prompt)
           for prompt in draft.follow_up_prompts):
        raise ValueError("unsafe_follow_up")
    return draft


async def synthesize_from_evidence(bundle: AnatoleEvidenceBundle, question: str,
                                   fallback: str, provider_router: object,
                                   *, conversation: dict[str, object] | None = None) -> SynthesisOutcome:
    if not bundle.facts and not (bundle.skill == "portfolio_analysis" and bundle.portfolio_xray):
        return SynthesisOutcome(fallback)
    payload = evidence_payload(bundle, question, conversation)
    prompt = (
        "Tu es la couche de synthèse d'Anatole. Explique uniquement les faits du JSON. "
        "Réponds directement à la question; pour un suivi ciblé, 2 à 4 sections utiles suffisent. "
        "N'invente aucun chiffre, lien, source, causalité ou conseil transactionnel. "
        "Cite seulement les IDs de faits F, sources S et limites M fournis. "
        "Retourne uniquement un objet JSON avec answer_markdown, used_fact_ids, "
        "used_source_ids, missing_data_ids et follow_up_prompts. "
        "Markdown: paragraphes, titres ## et listes -; aucun lien.\nEvidence: "
        + json.dumps(payload, ensure_ascii=False, default=str)
    )
    if bundle.skill == "fixed_income":
        prompt += "\nObligations: ne crée aucun CUSIP, émission, rendement, spread ou valeur N/D. Le coupon n'est jamais un rendement de marché."
    timeout = settings.anatole_assistant_synthesis_timeout_seconds
    for attempt in range(2):
        try:
            result = await asyncio.wait_for(provider_router.generate_internal_evidence(
                prompt=prompt, max_output_tokens=1700,
                provider_order=settings.anatole_assistant_provider_order,
                model_overrides={"anthropic": settings.anatole_assistant_anthropic_model},
                timeout_seconds=min(7.0, timeout / 3),
            ), timeout=timeout)
            if result is None or not result.success:
                break
            draft = validate_draft(result.answer, payload)
            return SynthesisOutcome(draft.answer_markdown.strip(), result.provider, result.model,
                                    "internal_evidence", True, tuple(draft.follow_up_prompts))
        except (ValueError, ValidationError, json.JSONDecodeError) as exc:
            logger.info("assistant_synthesis_rejected skill=%s category=%s attempt=%s",
                        bundle.skill, type(exc).__name__, attempt + 1)
            prompt += "\nCorrection: sortie invalide. Respecte les IDs, nombres et schéma JSON fournis."
        except Exception as exc:  # noqa: BLE001
            logger.info("assistant_synthesis_unavailable skill=%s category=%s", bundle.skill, type(exc).__name__)
            break
    return SynthesisOutcome(fallback)
