"""Grounded answers to focused public-company fundamental questions.

The assistant reuses the same calculations as Focus. It does not infer causes
from a correlation or turn illustrative sensitivities into forecasts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.schemas.assistant_context import AnatoleEvidenceBundle, EvidenceFact, EvidenceSource
from app.schemas.fundamentals import FundamentalSnapshot
from app.schemas.fundamental_scenarios import ScenarioAssumptions, ScenarioRequest
from app.services.fundamental_documents import research_official_documents
from app.services.fundamental_intelligence import build_fundamental_diagnostic
from app.services.fundamental_peers import peer_comparison
from app.services.fundamental_scenarios import simulate_financial_scenarios


FundamentalTopic = str


def fundamental_question_kind(question: str) -> FundamentalTopic | None:
    text = question.casefold()
    if any(cue in text for cue in ("si les revenus", "si le revenu", "revenus diminu", "revenus baiss", "revenue fell", "revenue drop", "simulate", "simule", "scénario de revenus")):
        return "scenario"
    if any(cue in text for cue in ("dernier rapport annuel", "rapport précédent", "rapports annuels", "last annual report", "previous annual report")):
        return "documents"
    if any(cue in text for cue in ("concurrents", "pairs du secteur", "comparables", "sector peers", "competitors")):
        return "peers"
    if any(cue in text for cue in ("bénéfices progress", "bénéfice progress", "bénéfices augment", "flux de trésorerie diminu", "earnings rise", "cash flow fall", "conversion du bénéfice", "diagnostic fondamental")):
        return "diagnostic"
    return None


FOCUS_VIEW: dict[str, str] = {
    "diagnostic": "diagnostic", "peers": "peers", "scenario": "scenarios", "documents": "documents",
}


@dataclass
class FundamentalAnswer:
    text: str
    view: str
    facts: list[EvidenceFact] = field(default_factory=list)
    sources: list[EvidenceSource] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


def _number(value: float, unit: str, currency: str | None = None) -> str:
    rendered = f"{value:,.2f}".replace(",", " ")
    return rendered + (" %" if unit == "percent" else f" {currency}" if unit == "money" and currency else "")


def _attach_observation(result: FundamentalAnswer, label: str, observation, stale: bool) -> str:
    value = _number(observation.value, observation.unit, observation.currency)
    date = observation.period_end.date().isoformat()
    freshness = "stale" if stale else "delayed"
    result.facts.append(EvidenceFact(label=f"{label} · {date}", value=value,
                                     source=observation.source_name, timestamp=observation.period_end,
                                     freshness=freshness,
                                     confidence="high" if observation.source_confidence == "official" else "medium"))
    if not any(item.label == observation.source_name and item.url == observation.source_url for item in result.sources):
        result.sources.append(EvidenceSource(label=observation.source_name, type="fundamental_report",
                                              freshness=freshness, timestamp=observation.filed_at or observation.period_end,
                                              url=observation.source_url))
    nature = "calcul" if observation.nature == "calculated" else "fait publié"
    formula = f"; méthode : {observation.formula}" if observation.formula else ""
    return f"{label} ({date}) : {value} [{nature}; {observation.source_name}{formula}]"


def _diagnostic_answer(snapshot: FundamentalSnapshot, *, divergence: bool) -> FundamentalAnswer:
    diagnostic = build_fundamental_diagnostic(snapshot)
    measures = {item.key: item for item in diagnostic.measures}
    result = FundamentalAnswer(text="", view="diagnostic")
    keys = ("net_income", "operating_cash_flow", "free_cash_flow", "cash_conversion") if divergence else (
        "revenue_growth", "net_income_growth", "operating_margin", "free_cash_flow_margin", "debt_to_equity")
    lines = ["## Faits et calculs observés"]
    for key in keys:
        measure = measures.get(key)
        if not measure or not measure.observations:
            result.missing.append(f"{key} : donnée comparable indisponible")
            continue
        for observation in measure.observations[:2]:
            lines.append("- " + _attach_observation(result, measure.label_fr, observation, snapshot.stale))
    if divergence:
        income = measures["net_income"].observations
        cash = measures["operating_cash_flow"].observations
        comparable = (len(income) >= 2 and len(cash) >= 2
                      and income[0].period_end == cash[0].period_end
                      and income[1].period_end == cash[1].period_end
                      and income[0].currency == income[1].currency == cash[0].currency == cash[1].currency
                      and 300 <= (income[0].period_end - income[1].period_end).days <= 430)
        observed = comparable and income[0].value > income[1].value and cash[0].value < cash[1].value
        lines.extend(["", "## Interprétation", (
            "La divergence est observée sur deux exercices comparables, mais elle ne prouve pas sa cause. "
            if observed else "La divergence suggérée n'est pas confirmée par deux exercices comparables. ")
            + "Vérifier le fonds de roulement, les éléments non monétaires et les investissements dans les rapports officiels."])
    else:
        lines.extend(["", "## Interprétation", "Ce diagnostic décrit des variations observées; il ne constitue pas une recommandation."])
    if snapshot.stale:
        lines.extend(["", "Instantané périmé : les chiffres peuvent avoir changé depuis la dernière actualisation."])
    if result.missing:
        lines.extend(["", "## Données manquantes", *[f"- {item}" for item in result.missing]])
    result.text = "\n".join(lines)
    return result


_PERCENT = re.compile(r"(?<!\d)(\d{1,3}(?:[.,]\d+)?)\s*%")


def _scenario_answer(snapshot: FundamentalSnapshot, question: str) -> FundamentalAnswer:
    match = _PERCENT.search(question)
    result = FundamentalAnswer(text="", view="scenarios")
    if not match:
        result.text = "## Scénario\nIndique un choc de revenus explicite en %, par exemple « revenus en baisse de 15 % ». Aucune hypothèse n'est devinée."
        result.missing.append("Choc de revenus en % non fourni")
        return result
    shock = float(match.group(1).replace(",", "."))
    if shock > 80:
        result.text = "## Scénario\nLe choc demandé dépasse la plage du simulateur (baisse maximale de 80 %)."
        result.missing.append("Choc hors plage")
        return result
    if not any(cue in question.casefold() for cue in ("baiss", "diminu", "drop", "fall", "recul")):
        result.text = "## Scénario\nPrécise si les revenus augmentent ou diminuent; aucun signe n'est déduit du pourcentage seul."
        result.missing.append("Sens du choc non précisé")
        return result
    request = ScenarioRequest(scenarios=[ScenarioAssumptions(key=key, revenue_change_percent=-shock)
                                         for key in ("prudent", "central", "optimistic")])
    simulation = simulate_financial_scenarios(snapshot, request)
    outcome = simulation.outcomes[0]
    result.text = (f"## Scénario illustratif : revenus −{shock:g} %\n"
                   "Même choc dans les trois emplacements requis par le simulateur; aucune autre hypothèse modifiée. "
                   "Il ne s'agit ni d'une prévision ni d'un conseil.\n\n## Calculs")
    if simulation.baseline_period_end:
        result.text += f"\nExercice de référence : {simulation.baseline_period_end.date().isoformat()} ({simulation.currency or 'devise inconnue'})."
    result.sources.append(EvidenceSource(label=simulation.baseline_source or snapshot.source,
                                          type="fundamental_report", freshness="stale" if snapshot.stale else "delayed",
                                          timestamp=simulation.baseline_filed_at or simulation.baseline_period_end,
                                          url=simulation.baseline_source_url))
    for label, metric in (("Revenus simulés", outcome.revenue), ("Résultat opérationnel simulé", outcome.operating_income),
                          ("Bénéfice net simulé", outcome.net_income), ("Flux opérationnel simulé", outcome.operating_cash_flow),
                          ("Flux disponible simulé", outcome.free_cash_flow),
                          ("Marge opérationnelle simulée", outcome.operating_margin),
                          ("Marge de flux disponible simulée", outcome.free_cash_flow_margin)):
        if metric.status == "calculated" and metric.value is not None:
            value = _number(metric.value, metric.unit, simulation.currency)
            result.text += f"\n- {label} : {value} [calcul : {metric.formula}]"
            result.facts.append(EvidenceFact(label=label, value=value, source=simulation.baseline_source or snapshot.source,
                                             timestamp=simulation.baseline_period_end,
                                             freshness="stale" if snapshot.stale else "delayed"))
        else:
            result.missing.append(f"{label} : {', '.join(metric.missing_inputs)}")
    if snapshot.stale:
        result.text += "\n\nInstantané périmé : simulation fondée sur des données à actualiser."
    if result.missing:
        result.text += "\n\n## Données manquantes\n" + "\n".join(f"- {item}" for item in result.missing)
    return result


async def _peers_answer(snapshot: FundamentalSnapshot) -> FundamentalAnswer:
    result = FundamentalAnswer(text="## Comparaison sectorielle", view="peers")
    try:
        comparison = await peer_comparison(snapshot.symbol)
    except Exception:  # A secondary source must not break the stock answer.
        result.text += "\nLes comparables sectoriels sont temporairement indisponibles."
        result.missing.append("Comparables sectoriels indisponibles")
        return result
    result.text += f"\nUnivers : {comparison.universe_source}. Pairs admissibles : {len(comparison.selected)}."
    for measure in comparison.measures:
        target = next((item for item in measure.values if item.ticker.removesuffix(".TO") == snapshot.symbol), None)
        if not target:
            continue
        value = _number(target.value, measure.unit)
        result.text += f"\n- {measure.label_fr} : {value} ({target.period_end.date().isoformat()}; {target.source_name})"
        if measure.median is not None:
            result.text += f"; médiane {_number(measure.median, measure.unit)} sur {measure.sample_size} titres"
        else:
            result.text += f"; médiane non calculable ({measure.sample_size} titres, minimum {measure.minimum_sample_size})"
        result.facts.append(EvidenceFact(label=measure.label_fr, value=value, source=target.source_name,
                                         timestamp=target.period_end, freshness="stale" if snapshot.stale else "delayed"))
        if not any(source.label == target.source_name and source.url == target.source_url for source in result.sources):
            result.sources.append(EvidenceSource(label=target.source_name, type="fundamental_peer",
                                                  freshness="stale" if snapshot.stale else "delayed",
                                                  timestamp=target.period_end, url=target.source_url))
        if len(result.facts) == 4:
            break
    if not result.facts:
        result.missing.append("Ratios comparables insuffisants")
    result.text += "\n\n## Limites\nLa comparaison exige une même définition et des périodes comparables; elle n'établit pas une qualité d'investissement."
    return result


async def _documents_answer(snapshot: FundamentalSnapshot) -> FundamentalAnswer:
    result = FundamentalAnswer(text="## Changements entre rapports officiels", view="documents")
    try:
        research = await research_official_documents(snapshot)
    except Exception:
        research = None
    if research is None or not research.comparisons:
        result.text += "\nAucune comparaison vérifiable de deux rapports annuels n'est disponible. Je ne déduis pas ce qui a changé."
        result.missing.append("Deux rapports annuels comparables avec extraits vérifiables")
        return result
    for item in research.comparisons[:4]:
        current, previous = item.current, item.previous
        result.text += (f"\n- Thème {item.topic} : extrait différent entre « {previous.document_title} » et « {current.document_title} ». "
                        "La portée de ce changement demande une lecture du document complet.")
        for passage in (previous, current):
            result.sources.append(EvidenceSource(label=f"{passage.document_title} · p. {passage.page_number or '?'}",
                                                  type="issuer_document", freshness="stale" if snapshot.stale else "delayed",
                                                  timestamp=passage.published_at, url=passage.document_url))
    result.text += "\n\n## Limites\nDifférence textuelle observée; ni importance financière ni cause n'est inférée."
    return result


async def answer_fundamental_question(snapshot: FundamentalSnapshot, question: str) -> FundamentalAnswer | None:
    kind = fundamental_question_kind(question)
    if not kind:
        return None
    if kind == "scenario":
        return _scenario_answer(snapshot, question)
    if kind == "peers":
        return await _peers_answer(snapshot)
    if kind == "documents":
        return await _documents_answer(snapshot)
    return _diagnostic_answer(snapshot, divergence="diagnostic fondamental" not in question.casefold())
