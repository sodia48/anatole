"""Ask → Analyze → Navigate using existing Anatole services and bounded context.

Conversation state contains short routing context and consent. Positions and raw
questions are never retained by this service or written to telemetry.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from time import monotonic
from typing import Literal
from uuid import UUID, uuid4

from app.data.etf_catalog import ETF_CATALOG
from app.schemas.assistant_context import (
    AnatoleEvidenceBundle, AssistantContext, EvidenceFact, EvidenceSource,
    NavigationAction, PortfolioWatchtowerAggregate, Skill, UnifiedAssistantRequest,
    UnifiedAssistantResponse,
)
from app.schemas.workspace import AssistantFact, AssistantLink, AssistantRequest, AssistantResponse, AssistantSource
from app.services.assistant import DISCLAIMER, _symbols, assistant_service
from app.services.canada_360_assistant import canada_360_assistant_service
from app.services.etf_holdings import etf_holdings_service
from app.services.fundamentals import fundamentals_service
from app.services.market_data import market_data_service
from app.services.stock_research import build_stock_research_bundle, format_stock_research
from app.services.portfolio import portfolio_service
from app.services.portfolio_research import (
    add_etf_lookthrough, build_portfolio_research_bundle,
    format_portfolio_research,
)
from app.services.assistant_synthesis import SynthesisOutcome, synthesize_from_evidence
from app.services.portfolio_intelligence_v12 import (
    run_portfolio_scenarios, scenario_request_from_question,
)
from app.services.portfolio_research_v12 import (
    PortfolioConversationFocus, build_concentration_map, build_lookthrough_summary,
    build_macro_exposures, build_portfolio_xray, build_watchtower_aggregate,
    build_watchtower_delta, portfolio_focus_from_question,
)
from app.services.stock_news import stock_news_service
from app.services.news import news_service
from app.services.canada_360_providers import provider_router
from app.services.bank_of_canada import bank_of_canada_valet_service
from app.services.municipal_debt_sources import municipal_debt_service
from app.services.provincial_debt_sources import provincial_profile
from app.schemas.workspace import PortfolioAnalyzeRequest


logger = logging.getLogger(__name__)
SESSION_SECONDS = 2 * 60 * 60
_ETF_SYMBOLS = {item["ticker"] for item in ETF_CATALOG}
_ALIASES = {"shopify": "SHOP", "lightspeed": "LSPD"}
_PORTFOLIO_CUES = ("portefeuille", "positions", "allocation", "concentration", "mes risques", "mon risque", "my portfolio", "my positions", "my risk", "chevauch", "overlap", "diversification", "sous-perform", "sous perform", "underperform", "doublonn", "cluster", "contribue au risque")
_GOVERNMENT_CUES = ("canada 360", "gouvernement", "statistique canad", "statistique canada", "province", "prestation", "soins dentaires", "impôt", "assurance emploi", "government", "benefit", "dental", "unemployment rate", "taux de chômage", "inflation canad", "inflation au canada", "macro canadien", "passeport", "quebec", "québec", "ontario", "alberta")
_MACRO_CUES = ("inflation", "taux directeur", "pétrole", "cad", "macro", "interest rate", "oil price")
_NEWS_CUES = ("nouvelle", "actualité", "news", "aujourd'hui", "today", "baisse aujourd", "down today")
_GUARDRAIL_CUES = ("quoi acheter", "dois-je acheter", "que dois-je acheter", "quoi vendre", "dois-je vendre", "quelle action acheter", "which stock should i buy", "what should i buy", "buy for me", "recommend me")
_MARKET_CUES = ("marché", "market", "tsx", "terminal", "secteurs", "sectors")
_FIXED_INCOME_CUES = ("courbe des taux", "yield curve", "courbe invers", "courbe est-elle invers", "taux canadien", "taux du canada",
                      "10 ans canadien", "10-year canada", "obligataire", "bond issue", "bond yield",
                      "émissions de toronto", "emissions de toronto", "toronto bonds", "provinces empruntent",
                      "provincial borrowing", "taux & obligations")


@dataclass
class _Session:
    symbols: list[str] = field(default_factory=list)
    skill: Skill | None = None
    canada_id: str | None = None
    canada_turn_index: int | None = None
    portfolio_authorized: bool = False
    portfolio_focus: PortfolioConversationFocus | None = None
    portfolio_previous: PortfolioWatchtowerAggregate | None = None
    last_question_topic: str | None = None
    last_answer_summary: str | None = None
    expires_at: float = 0.0


def _bucket(seconds: float) -> str:
    return "<1s" if seconds < 1 else "<5s" if seconds < 5 else "<15s" if seconds < 15 else ">=15s"


def _action(label: str, href: str) -> NavigationAction:
    return NavigationAction(label=label, href=href)


LegacySourceStatus = Literal["live", "delayed", "fallback", "internal"]


def _assistant_source_status(freshness: str) -> LegacySourceStatus:
    """Keep the legacy response contract while evidence retains detailed freshness."""
    status: dict[str, LegacySourceStatus] = {
        "live": "live", "delayed": "delayed", "internal": "internal",
        "stale": "fallback", "fallback": "fallback",
    }
    return status.get(freshness, "fallback")


def _evidence_source_to_assistant_source(source: EvidenceSource) -> AssistantSource:
    return AssistantSource(
        label=source.label,
        detail=source.url or (source.timestamp.isoformat() if source.timestamp else ""),
        status=_assistant_source_status(source.freshness),
    )


def _explicit_symbols(message: str) -> list[str]:
    # French elisions such as "l'ETF" must not resolve to the listed ticker L.
    without_elisions = re.sub(r"\b[ldjcmnstqu]['’](?=\w)", "", message, flags=re.IGNORECASE)
    return _symbols(without_elisions, None)


def _clean_symbols(message: str, context: AssistantContext, previous: list[str]) -> list[str]:
    found = _explicit_symbols(message)
    lowered = message.casefold()
    for name, symbol in _ALIASES.items():
        if name in lowered and symbol not in found:
            found.append(symbol)
    comparing = any(cue in lowered for cue in ("compare", "compar", "versus", " vs "))
    referential = bool(re.search(r"\b(?:il|elle|lui|ce titre|cette action|cet etf|les deux|ceux-ci)\b|compare-le|compare-la", lowered))
    broad_topic = (any(cue in lowered for cue in _MARKET_CUES + _GOVERNMENT_CUES)
                   or any(cue in lowered for cue in ("qualité des données", "data quality"))) and not referential
    seed = context.symbol or (context.symbols[0] if context.symbols else None)
    if not seed and previous and (referential or comparing) and context.surface not in {"market", "news"}:
        seed = previous[0]
    if comparing and seed and seed not in found and found:
        found.insert(0, seed)
    if not found and not broad_topic:
        found = ([seed] if seed else []) + [symbol for symbol in context.symbols if symbol != seed]
        if referential and ("les deux" in lowered or not context.symbols):
            found.extend(symbol for symbol in previous if symbol not in found)
    elif comparing:
        found.extend(symbol for symbol in context.symbols if symbol not in found)
    return found[:5]


def _select_skill(message: str, context: AssistantContext, symbols: list[str], previous: Skill | None = None) -> tuple[Skill, bool]:
    text = message.casefold()
    if any(cue in text for cue in _GUARDRAIL_CUES):
        return "guardrail", False
    portfolio = (any(cue in text for cue in _PORTFOLIO_CUES)
                 or bool(re.search(r"\b(?:mon|mes|my)\b.{0,40}\brisqu", text))
                 or context.surface == "portfolio" and any(word in text for word in ("mon", "mes", "my", "risqu", "secteur", "concentr", "performance", "nouvell")))
    explicit_government = any(cue in text for cue in _GOVERNMENT_CUES)
    explicit_market = any(cue in text for cue in _MARKET_CUES)
    explicit_news = any(cue in text for cue in _NEWS_CUES)
    explicit_instrument = bool(symbols) and (bool(_explicit_symbols(message)) or bool(re.search(r"\b(?:analyse|cours|prix|etf|ticker|action|titre|holdings)\b", text)))
    government = explicit_government or (context.surface == "canada360" or previous == "canada360") and not (portfolio or explicit_instrument or explicit_market or explicit_news)
    mixed_macro = (government and bool(symbols) and any(cue in text for cue in _MACRO_CUES)
                   or (portfolio or previous == "portfolio_analysis")
                   and any(cue in text for cue in ("macro", "inflation", "chômage", "taux directeur", "contexte de taux", "sensible au pétrole", "sensibles au pétrole")))
    if portfolio:
        return "portfolio_analysis", mixed_macro
    if any(cue in text for cue in _FIXED_INCOME_CUES) or (context.surface == "fixed_income" and not explicit_instrument):
        return "fixed_income", False
    if any(cue in text for cue in ("compare", "compar", "versus", " vs ")) and len(symbols) >= 2:
        return "compare", False
    if previous == "portfolio_analysis" and not (explicit_government or explicit_instrument or explicit_market or explicit_news):
        return "portfolio_analysis", False
    if government:
        return "canada360", mixed_macro
    if any(cue in text for cue in ("qualité", "qualite", "source de donnée", "data quality", "source health")):
        return "data_quality", False
    if any(cue in text for cue in _NEWS_CUES) and not symbols:
        return "news_context", False
    if explicit_market and not explicit_instrument:
        return "market_analysis", False
    if symbols:
        return ("etf_analysis" if symbols[0] in _ETF_SYMBOLS or context.surface == "etf" and symbols[0] == context.symbol else "stock_analysis"), False
    if context.surface == "news":
        return "news_context", False
    return "market_analysis", False


def _bundle_from_response(skill: Skill, response: AssistantResponse, entities: list[str]) -> AnatoleEvidenceBundle:
    status = response.sources[0].status if response.sources else "unknown"
    def fact_source(fact: AssistantFact) -> AssistantSource | None:
        if skill == "stock_analysis" and fact.label in {"Momentum 20j", "RSI 14"} and len(response.sources) > 1:
            return response.sources[1]
        return response.sources[0] if response.sources else None
    def observed_at(source: AssistantSource | None) -> datetime:
        if source and source.detail.startswith("Horodatage "):
            try:
                return datetime.fromisoformat(source.detail.removeprefix("Horodatage ").strip())
            except ValueError:
                pass
        return response.generated_at
    bundle = AnatoleEvidenceBundle(
        skill=skill, entities=entities,
        facts=[EvidenceFact(label=fact.label, value=fact.value,
                            source=fact_source(fact).label if fact_source(fact) else "Anatole",
                            timestamp=observed_at(fact_source(fact)),
                            freshness=fact_source(fact).status if fact_source(fact) else "unknown",
                            provider=fact_source(fact).label if fact_source(fact) and fact_source(fact).status in {"live", "delayed"} else None,
                            confidence="low" if response.confidence == "limitée" else "medium")
               for fact in response.facts],
        sources=[EvidenceSource(label=source.label,
                                type="quote" if skill in {"stock_analysis", "etf_analysis"} and index == 0 else "technical" if "technique" in source.label.casefold() else "internal",
                                freshness=source.status, timestamp=observed_at(source))
                 for index, source in enumerate(response.sources)],
        freshness=status,
        missing_data=[] if response.sources else ["Données sourcées insuffisantes"],
        generated_at=response.generated_at,
    )
    return bundle


class AnatoleAssistantOrchestrator:
    def __init__(self) -> None:
        self._sessions: dict[UUID, _Session] = {}
        self._lock = asyncio.Lock()

    async def _session(self, requested: UUID | None) -> tuple[UUID, _Session, bool]:
        async with self._lock:
            now = monotonic()
            for key in [key for key, value in self._sessions.items() if value.expires_at <= now]:
                self._sessions.pop(key, None)
            if requested is not None and requested in self._sessions:
                state = self._sessions[requested]
                state.expires_at = now + SESSION_SECONDS
                return requested, state, False
            fresh = uuid4()
            state = _Session(expires_at=now + SESSION_SECONDS)
            self._sessions[fresh] = state
            return fresh, state, requested is not None

    @staticmethod
    def _response(base: AssistantResponse, *, context: AssistantContext,
                  conversation_id: UUID, bundles: list[AnatoleEvidenceBundle],
                  actions: list[NavigationAction], permission_required: bool = False,
                  government_feedback: dict[str, str | int] | None = None,
                  government_profile: dict[str, str | int | None] | None = None,
                  synthesis: SynthesisOutcome | None = None) -> UnifiedAssistantResponse:
        return UnifiedAssistantResponse(
            **base.model_dump(), context=context, conversation_id=conversation_id,
            evidence=bundles, actions=actions, permission_required=permission_required,
            government_feedback=government_feedback,
            government_profile=government_profile,
            synthesis_provider=synthesis.provider if synthesis else None,
            synthesis_model=synthesis.model if synthesis else None,
            synthesis_mode=synthesis.mode if synthesis else None,
            synthesis_validated=synthesis.validated if synthesis else False,
        )

    @staticmethod
    def _simple(skill: Skill, title: str, answer: str, *, confidence: str = "limitée",
                facts: list[AssistantFact] | None = None, sources: list[AssistantSource] | None = None) -> AssistantResponse:
        return AssistantResponse(intent=skill, title=title, answer=answer,
                                 facts=facts or [], sources=sources or [],
                                 confidence=confidence, disclaimer=DISCLAIMER,
                                 generated_at=datetime.now(UTC))

    async def _stock(self, symbol: str, language: str, question: str = "") -> tuple[AssistantResponse, AnatoleEvidenceBundle]:
        started = monotonic()
        logger.info("assistant_tool_started skill=stock_analysis tool=focus")
        tasks = await asyncio.gather(
            market_data_service.get_focus_snapshot(symbol, range_="1y", interval="1d"),
            fundamentals_service.get_snapshot(symbol),
            stock_news_service.get_snapshot(symbol, language=language),
            return_exceptions=True,
        )
        focus, fundamentals, news = tasks
        fundamental_snapshot = None if isinstance(fundamentals, Exception) else fundamentals
        news_snapshot = None if isinstance(news, Exception) else news
        if isinstance(focus, Exception):
            logger.info("assistant_tool_failed skill=stock_analysis tool=focus latency_bucket=%s", _bucket(monotonic() - started))
            if fundamental_snapshot is None and news_snapshot is None:
                try:
                    base = await assistant_service._ticker(symbol)
                except Exception:
                    base = self._simple("stock_analysis", symbol, "Les données Focus ne sont pas disponibles pour ce titre.")
                bundle = _bundle_from_response("stock_analysis", base, [symbol])
                if any(source.freshness == "fallback" for source in bundle.sources):
                    base = self._simple("stock_analysis", symbol,
                                        "La cotation disponible est une donnée de démonstration; je ne la présente pas comme un prix réel.")
                    bundle.facts.clear()
                    bundle.missing_data.append("Cotation réelle indisponible")
                return base, bundle
            focus = None
        bundle = build_stock_research_bundle(symbol, focus, fundamental_snapshot, news_snapshot)
        answer = format_stock_research(bundle, question=question)
        sector = f"{focus.profile.sector or ''} {focus.profile.industry or ''}".casefold() if focus is not None else ""
        if any(word in question.casefold() for word in ("taux", "rate", "obligat", "bond")) and any(
            word in sector for word in ("bank", "banque", "reit", "immobili", "utilit", "insurance", "assurance")
        ):
            curve = await bank_of_canada_valet_service.curve()
            two = next((point for point in curve.points if point.tenor == "2Y"), None)
            ten = next((point for point in curve.points if point.tenor == "10Y"), None)
            if two and ten and two.latest is not None and ten.latest is not None:
                value = f"2Y {two.latest:.2f}%; 10Y {ten.latest:.2f}%; 2s10s {curve.spread_2s10s_bps:+g} pb; 10Y {ten.bp_change:+g} pb/jour" if curve.spread_2s10s_bps is not None and ten.bp_change is not None else f"2Y {two.latest:.2f}%; 10Y {ten.latest:.2f}%"
                bundle.facts.append(EvidenceFact(label="Contexte de taux Canada", value=value,
                    source="Bank of Canada Valet", timestamp=ten.observed_at, freshness=ten.freshness))
                bundle.sources.append(EvidenceSource(label="Bank of Canada Valet", type="government",
                    freshness=ten.freshness, timestamp=ten.observed_at,
                    url="https://www.bankofcanada.ca/rates/interest-rates/canadian-bonds/"))
                answer += ("\n\n## Contexte de taux Canada\n- " + value +
                           f". Ce contexte ne prouve pas à lui seul la variation du titre {symbol}.")
        base = self._simple("stock_analysis", symbol, answer,
            confidence="moyenne" if bundle.facts else "limitée",
            facts=[AssistantFact(label=f.label, value=f.value) for f in bundle.facts[:12]],
            sources=[_evidence_source_to_assistant_source(s) for s in bundle.sources[:12]])
        logger.info("assistant_tool_completed skill=stock_analysis tool=focus latency_bucket=%s source_count=%s", _bucket(monotonic() - started), len(bundle.sources))
        return base, bundle

    async def _etf(self, symbol: str) -> tuple[AssistantResponse, AnatoleEvidenceBundle]:
        logger.info("assistant_tool_started skill=etf_analysis tool=holdings")
        snapshot, quote = await asyncio.gather(
            etf_holdings_service.snapshot(symbol, limit=10),
            assistant_service._ticker(symbol), return_exceptions=True,
        )
        if isinstance(snapshot, Exception):
            logger.info("assistant_tool_failed skill=etf_analysis tool=holdings")
            base = self._simple("etf_analysis", symbol, "Les participations de cet ETF ne sont pas disponibles; je ne peux pas les déduire.")
            return base, _bundle_from_response("etf_analysis", base, [symbol])
        bundle = AnatoleEvidenceBundle(
            skill="etf_analysis", entities=[symbol],
            sources=[EvidenceSource(label=snapshot.source_name, type="etf_holdings",
                                    freshness="stale" if snapshot.stale else "delayed",
                                    timestamp=snapshot.generated_at, url=snapshot.source_url)],
            freshness="stale" if snapshot.stale else "delayed",
            generated_at=snapshot.generated_at,
        )
        if not snapshot.holdings:
            bundle.missing_data.append("Participations indisponibles")
            answer = f"{symbol} : les principales participations ne sont pas disponibles dans les données vérifiées."
        else:
            names = ", ".join(f"{row.display_symbol} ({row.weight_percent:.1f} %)" for row in snapshot.holdings[:10])
            answer = f"{snapshot.name} ({symbol}), fournisseur {snapshot.provider}, catégorie {snapshot.category}, exposition {snapshot.exposure}, détient notamment : {names}."
            for row in snapshot.holdings[:10]:
                bundle.facts.append(EvidenceFact(label=row.display_symbol, value=f"{row.weight_percent:.2f} %",
                                                source=snapshot.source_name, timestamp=snapshot.generated_at,
                                                freshness=bundle.freshness))
            if snapshot.top_holdings_weight_percent is not None:
                answer += f" Les participations affichées couvrent {snapshot.top_holdings_weight_percent:.1f} % du fonds."
            else:
                bundle.limitations.append("La couverture des participations n'est pas chiffrée")
        if snapshot.sectors:
            answer += " Secteurs principaux : " + ", ".join(f"{row.label} {row.weight_percent:.1f} %" for row in snapshot.sectors[:3]) + "."
            for row in snapshot.sectors[:3]:
                bundle.facts.append(EvidenceFact(label=f"Secteur {row.label}",
                    value=f"{row.weight_percent:.1f} %", source=snapshot.source_name,
                    timestamp=snapshot.generated_at, freshness=bundle.freshness))
        if snapshot.regions:
            answer += " Régions principales : " + ", ".join(f"{row.label} {row.weight_percent:.1f} %" for row in snapshot.regions[:3]) + "."
            for row in snapshot.regions[:3]:
                bundle.facts.append(EvidenceFact(label=f"Région {row.label}",
                    value=f"{row.weight_percent:.1f} %", source=snapshot.source_name,
                    timestamp=snapshot.generated_at, freshness=bundle.freshness))
        if not isinstance(quote, Exception) and quote.sources and quote.sources[0].status != "fallback" and quote.facts:
            answer = quote.answer.split("\n\n")[0] + "\n\n" + answer
            quote_bundle = _bundle_from_response("etf_analysis", quote, [symbol])
            bundle.facts = quote_bundle.facts[:2] + bundle.facts
            bundle.sources = quote_bundle.sources[:1] + bundle.sources
        else:
            bundle.missing_data.append("Cotation ETF vérifiée indisponible")
        answer += " Les frais et la liquidité ne sont pas estimés sans source fiable."
        base = self._simple("etf_analysis", symbol, answer, confidence="moyenne",
                            facts=[AssistantFact(label=f.label, value=f.value) for f in bundle.facts[:4]],
                            sources=[AssistantSource(label=snapshot.source_name,
                                                     detail=f"Données au {snapshot.generated_at.isoformat()}", status="delayed")])
        if not isinstance(quote, Exception) and quote.sources and quote.sources[0].status != "fallback" and quote.facts:
            base.sources = quote.sources[:1] + base.sources
        logger.info("assistant_tool_completed skill=etf_analysis tool=holdings source_count=%s", len(bundle.sources))
        return base, bundle

    async def _portfolio(self, request: UnifiedAssistantRequest, symbols: list[str],
                         state: _Session) -> tuple[AssistantResponse, AnatoleEvidenceBundle]:
        logger.info("assistant_tool_started skill=portfolio_analysis tool=portfolio")
        snapshot = await portfolio_service.analyze(PortfolioAnalyzeRequest(positions=request.portfolio_positions))
        bundle = build_portfolio_research_bundle(snapshot, requested_count=len(request.portfolio_positions))
        text = request.message.casefold()
        focus = portfolio_focus_from_question(request.message, state.portfolio_focus)
        bundle.portfolio_focus = focus

        etfs = [(row.symbol, row.weight_percent) for row in snapshot.positions if row.symbol in _ETF_SYMBOLS]
        explicit = next((symbol for symbol in symbols if symbol in _ETF_SYMBOLS), None)
        if explicit and explicit not in {symbol for symbol, _ in etfs} and any(cue in text for cue in ("chevauch", "overlap")):
            etfs.append((explicit, 0.0))
        holdings_snapshots: dict[str, object] = {}
        if etfs:
            limit = asyncio.Semaphore(6)
            async def fetch_holdings(symbol: str) -> object:
                async with limit:
                    return await asyncio.wait_for(etf_holdings_service.snapshot(symbol, limit=25), timeout=4)
            results = await asyncio.gather(
                *(fetch_holdings(symbol) for symbol, _ in etfs), return_exceptions=True,
            )
            direct = {row.symbol.upper().removesuffix(".TO") for row in snapshot.positions}
            for (symbol, weight), result in zip(etfs, results, strict=True):
                if isinstance(result, Exception):
                    bundle.missing_data.append(f"Participations {symbol} indisponibles pour le look-through")
                else:
                    holdings_snapshots[symbol] = result
                    add_etf_lookthrough(bundle, symbol, weight, result, direct)
        bundle.lookthrough = build_lookthrough_summary(snapshot.positions, _ETF_SYMBOLS, holdings_snapshots)
        bundle.macro_exposures = build_macro_exposures(snapshot)
        bundle.portfolio_xray = build_portfolio_xray(snapshot, len(request.portfolio_positions), bundle.lookthrough)
        bundle.concentration_map = build_concentration_map(snapshot, bundle.lookthrough, bundle.macro_exposures)
        custom = scenario_request_from_question(request.message)
        if custom:
            bundle.scenarios = run_portfolio_scenarios(
                custom, snapshot.positions, getattr(snapshot, "factor_sensitivities", []))
            logger.info("portfolio_stress_custom coverage_bucket=%s position_count=%s",
                        "high" if all(row.coverage.coverage_percent >= 90 for row in bundle.scenarios) else "partial",
                        len(snapshot.positions))
        current_aggregate = build_watchtower_aggregate(bundle, snapshot)
        bundle.watchtower = build_watchtower_delta(state.portfolio_previous, current_aggregate)
        state.portfolio_previous = current_aggregate
        state.portfolio_focus = focus
        logger.info("portfolio_xray_built coverage_bucket=%s position_count=%s",
                    bundle.portfolio_xray.analysis_quality, len(snapshot.positions))
        logger.info("portfolio_lookthrough_built coverage_bucket=%s etf_count=%s",
                    "high" if bundle.lookthrough.holdings_coverage_percent >= 90 else "partial",
                    bundle.lookthrough.etf_count)
        if bundle.watchtower.previous_available:
            logger.info("portfolio_watchtower_delta coverage_bucket=%s position_count=%s",
                        bundle.portfolio_xray.analysis_quality, len(snapshot.positions))

        if any(cue in text for cue in _NEWS_CUES):
            tickers = [row.symbol for row in snapshot.positions[:5]]
            results = await asyncio.gather(
                *(stock_news_service.get_snapshot(symbol, language=request.context.language) for symbol in tickers),
                return_exceptions=True,
            )
            found = [(symbol, item) for symbol, result in zip(tickers, results, strict=True)
                     if not isinstance(result, Exception) for item in result.items[:2]]
            if found:
                for symbol, item in found[:5]:
                    bundle.facts.append(EvidenceFact(label=f"Actualité {symbol}",
                        value=f"{item.title} ({item.published_at.date()})", source=item.publisher,
                        timestamp=item.published_at, freshness="delayed"))
                    bundle.metric_groups.setdefault("news", []).append(bundle.facts[-1])
                    bundle.sources.append(EvidenceSource(label=item.publisher, type="news",
                        freshness="delayed", timestamp=item.published_at, url=item.url))
                bundle.limitations.append("Aucun lien causal entre ces actualités et les cours n’est inféré.")
            else:
                bundle.missing_data.append("Actualités des positions indisponibles")
        if "var" in text or "value at risk" in text:
            bundle.missing_data.append("La VaR marginale n’est pas calculée par ce diagnostic")
        if ("pétrole" in text or "oil" in text) and not any(row.key == "wti" and row.estimated_portfolio_change_percent is not None
                                                           for row in snapshot.stress_tests):
            bundle.missing_data.append("Sensibilité au pétrole indisponible")
        answer = format_portfolio_research(bundle, snapshot, question=request.message)
        if custom and custom.canada_10y_bps is not None:
            curve = await bank_of_canada_valet_service.curve()
            ten = next((point for point in curve.points if point.tenor == "10Y"), None)
            if ten and ten.latest is not None:
                bundle.facts.append(EvidenceFact(label="Canada 10Y officiel", value=f"{ten.latest:.2f}%",
                    source="Bank of Canada Valet", timestamp=ten.observed_at, freshness=ten.freshness))
                bundle.sources.append(EvidenceSource(label="Bank of Canada Valet · Canada 10Y", type="government",
                    freshness=ten.freshness, timestamp=ten.observed_at,
                    url="https://www.bankofcanada.ca/rates/interest-rates/canadian-bonds/"))
                answer += f"\n\n## Contexte de taux Canada\n- 10Y officiel : {ten.latest:.2f} % (Banque du Canada). Le choc de {custom.canada_10y_bps:g} pb utilise uniquement les sensibilités historiques couvertes, sans durée obligataire supposée."
            else:
                bundle.missing_data.append("Canada 10Y officiel indisponible")
        base = self._simple("portfolio_analysis", "Analyse du portefeuille", answer,
                            confidence="moyenne" if bundle.facts else "limitée",
                            facts=[AssistantFact(label=f.label, value=f.value) for f in bundle.facts[:25]],
                            sources=[_evidence_source_to_assistant_source(s) for s in bundle.sources[:12]])
        logger.info("assistant_tool_completed skill=portfolio_analysis tool=portfolio source_count=%s completeness=%s",
                    len(bundle.sources), "partial" if bundle.missing_data else "complete")
        return base, bundle

    async def _canada(self, request: UnifiedAssistantRequest, state: _Session) -> tuple[AssistantResponse, AnatoleEvidenceBundle, dict[str, str | int | None] | None]:
        logger.info("assistant_tool_started skill=canada360 tool=canada360")
        result = await canada_360_assistant_service.answer(
            question=request.message, lang=request.context.language,
            jurisdiction=request.context.metadata.get("region", "CA") if request.context.metadata.get("region", "CA") in {"CA", "QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL", "YT", "NT", "NU"} else "CA",
            conversation_id=state.canada_id,
        )
        state.canada_id = result.conversation_id
        state.canada_turn_index = len(result.history) - 1 if getattr(result, "history", None) else None
        sources = [AssistantSource(label=link.agency or link.label,
                                   detail=link.url, status="delayed") for link in result.links]
        base = self._simple("canada360", "Canada 360", result.answer,
                            confidence="élevée" if sources else "limitée", sources=sources)
        bundle = AnatoleEvidenceBundle(
            skill="canada360", sources=[EvidenceSource(label=link.agency or link.label,
                                                       type="government", freshness="delayed",
                                                       timestamp=datetime.now(UTC), url=link.url)
                                         for link in result.links],
            missing_data=[] if sources else ["Sources gouvernementales indisponibles"],
            freshness="delayed", generated_at=datetime.now(UTC),
        )
        logger.info("assistant_tool_completed skill=canada360 tool=canada360 source_count=%s", len(sources))
        profile = getattr(result, "profile", None)
        return base, bundle, profile.model_dump() if profile is not None and hasattr(profile, "model_dump") else None

    async def _fixed_income(self, request: UnifiedAssistantRequest) -> tuple[AssistantResponse, AnatoleEvidenceBundle]:
        """Compose only observed official rates, issuer profiles and issue fields."""
        text = request.message.casefold()
        english = request.context.language == "en"
        now = datetime.now(UTC)
        bundle = AnatoleEvidenceBundle(skill="fixed_income", freshness="delayed", generated_at=now)
        lines: list[str] = []

        if "toronto" in text and any(word in text for word in ("émission", "emission", "issue", "bond")):
            profile = await municipal_debt_service.profile("toronto")
            issues = profile.recent_issues[:5] if profile else []
            lines.append("## Toronto bond issues" if english else "## Émissions obligataires de Toronto")
            if issues:
                for issue in issues:
                    issue_amount = f"{issue.issue_amount:,.0f}" if issue.issue_amount is not None else "N/D"
                    outstanding = f"{issue.outstanding_amount:,.0f}" if issue.outstanding_amount is not None else "N/D"
                    coupon = f"{issue.coupon_percent:g}%" if issue.coupon_percent is not None else "N/D"
                    value = (f"{issue.settlement_date}: {issue.cusip or 'N/D'}, {coupon} coupon, "
                             f"{issue.maturity_date}, {issue_amount} {issue.currency or ''}, "
                             f"{outstanding} {issue.currency or ''} outstanding")
                    bundle.facts.append(EvidenceFact(label="Toronto issue", value=value,
                        source="City of Toronto", timestamp=issue.observed_at, freshness="delayed"))
                    lines.append("- " + value)
                bundle.sources.append(EvidenceSource(label="City of Toronto · Recently Settled Bond Issues",
                    type="government", freshness="delayed", timestamp=issues[0].observed_at,
                    url=issues[0].official_url))
            else:
                lines.append("Official issue table is unavailable." if english else "Le tableau officiel des émissions est indisponible.")
                bundle.missing_data.append("Toronto issue table unavailable")
        elif any(word in text for word in ("québec", "quebec", "ontario", "province", "provincial")) and any(
            word in text for word in ("obligat", "bond", "emprunt", "borrowing")):
            qc, on = await asyncio.gather(provincial_profile("QC"), provincial_profile("ON"))
            lines.append("## Provincial borrowing" if english else "## Emprunts provinciaux")
            for profile in (qc, on):
                if profile is None:
                    continue
                if profile.borrowing_program_amount is not None:
                    value = f"{profile.borrowing_program_amount / 1_000_000_000:g} billion CAD ({profile.fiscal_year})"
                    bundle.facts.append(EvidenceFact(label=f"{profile.name} borrowing program", value=value,
                        source=profile.issuer, timestamp=profile.quality.observed_at, freshness="delayed"))
                    lines.append(f"- {profile.name}: {value}.")
                else:
                    lines.append(f"- {profile.name}: " + ("official issuer profile; comparable amount unavailable."
                                 if english else "profil officiel disponible ; montant comparable indisponible."))
                    bundle.missing_data.append(f"{profile.name}: comparable borrowing amount unavailable")
                if profile.source_urls:
                    bundle.sources.append(EvidenceSource(label=profile.issuer, type="government",
                        freshness="delayed", timestamp=profile.quality.observed_at,
                        url=profile.borrowing_program_url or profile.source_urls[0]))
            lines.append("Secondary-market provincial yields and spreads are unavailable."
                         if english else "Rendements secondaires et spreads provinciaux : source de marché non configurée.")
            bundle.missing_data.append("Secondary-market provincial yields unavailable")
        else:
            curve = await bank_of_canada_valet_service.curve()
            lines.append("## Government of Canada benchmark curve" if english else "## Courbe de référence du Canada")
            for point in curve.points:
                if point.latest is None:
                    continue
                value = f"{point.latest:.2f}%"
                change = f" ({point.bp_change:+g} bp)" if point.bp_change is not None else ""
                bundle.facts.append(EvidenceFact(label=f"Canada {point.tenor}", value=value + change,
                    source="Bank of Canada Valet", timestamp=point.observed_at,
                    freshness=point.freshness))
                lines.append(f"- {point.tenor}: {value}{change}.")
            if curve.spread_2s10s_bps is not None:
                value = f"{curve.spread_2s10s_bps:+g} bp"
                bundle.facts.append(EvidenceFact(label="Canada 2s10s", value=value,
                    source="Bank of Canada Valet", timestamp=curve.quality.observed_at,
                    freshness=curve.quality.freshness))
                lines.append(f"- 2s10s: {value}; " + ("shape" if english else "forme") + f": {curve.curve_shape}.")
            if not bundle.facts:
                lines.append("Official rates are temporarily unavailable." if english else "Les taux officiels sont temporairement indisponibles.")
                bundle.missing_data.append("Federal curve unavailable")
            bundle.sources.append(EvidenceSource(label="Bank of Canada Valet · benchmark bond yields",
                type="government", freshness=curve.quality.freshness,
                timestamp=curve.quality.observed_at,
                url="https://www.bankofcanada.ca/rates/interest-rates/canadian-bonds/"))
            if "10 ans" in text or "10-year" in text:
                lines.append("The prior observation is a daily comparison, not a forecast."
                             if english else "La variation compare deux observations de clôture ; elle ne prédit pas la suite.")

        bundle.freshness = "delayed" if bundle.facts else "unknown"
        lines.append("No provincial or municipal market yield is inferred from a coupon."
                     if english else "Aucun rendement provincial ou municipal n’est déduit d’un coupon.")
        base = self._simple("fixed_income", "Rates & Bonds" if english else "Taux & Obligations",
            "\n".join(lines), confidence="moyenne" if bundle.facts else "limitée",
            facts=[AssistantFact(label=f.label, value=f.value) for f in bundle.facts],
            sources=[_evidence_source_to_assistant_source(s) for s in bundle.sources])
        return base, bundle

    async def _news(self, language: str) -> tuple[AssistantResponse, AnatoleEvidenceBundle]:
        logger.info("assistant_tool_started skill=news_context tool=news_feed")
        try:
            snapshot = await news_service.get_snapshot(language)
        except Exception:
            logger.info("assistant_tool_failed skill=news_context tool=news_feed")
            base = self._simple("news_context", "Actualités du marché",
                                "Les actualités sourcées ne sont pas disponibles actuellement.")
            return base, _bundle_from_response("news_context", base, [])
        items = snapshot.items[:3]
        bundle = AnatoleEvidenceBundle(
            skill="news_context", freshness="delayed", generated_at=snapshot.generated_at,
            sources=[EvidenceSource(label=item.source, type="news", freshness="delayed",
                                    timestamp=item.published_at, url=item.url) for item in items],
            facts=[EvidenceFact(label="Actualité", value=item.title, source=item.source,
                                timestamp=item.published_at, freshness="delayed") for item in items],
            missing_data=[] if items else ["Actualités sourcées indisponibles"],
        )
        if items:
            answer = "Actualités récentes sourcées : " + "; ".join(
                f"{item.title} ({item.source}, {item.published_at.date()})" for item in items
            ) + ". Aucun impact causal sur un titre n'est déduit de ces titres seuls."
        else:
            answer = "Les actualités sourcées ne sont pas disponibles actuellement."
        base = self._simple("news_context", "Actualités du marché", answer,
                            sources=[AssistantSource(label=item.source, detail=item.url, status="delayed") for item in items])
        logger.info("assistant_tool_completed skill=news_context tool=news_feed source_count=%s", len(bundle.sources))
        return base, bundle

    async def answer(self, request: UnifiedAssistantRequest) -> UnifiedAssistantResponse:
        started = monotonic()
        conversation_id, state, expired_session = await self._session(request.conversation_id)
        if not state.canada_id and request.government_conversation_id:
            state.canada_id = str(request.government_conversation_id)
        context = request.context
        symbols = _clean_symbols(request.message, context, state.symbols)
        skill, mixed_macro = _select_skill(request.message, context, symbols, state.skill)
        logger.info("assistant_skill_selected skill=%s", skill)
        if skill == "portfolio_analysis" and (expired_session or not (request.portfolio_consent and request.portfolio_positions)):
            state.skill = skill
            context.portfolio_scope.authorized = False
            base = self._simple(skill, "Autorisation du portefeuille",
                                "Autoriser Anatole Assistant à analyser les positions de ce portefeuille pour cette conversation ? Sans autorisation, je peux seulement expliquer les risques généraux.")
            bundle = _bundle_from_response(skill, base, [])
            return self._response(base, context=context, conversation_id=conversation_id,
                                  bundles=[bundle], actions=[_action("Ouvrir Portefeuille", "/portefeuille")],
                                  permission_required=True)
        if skill == "portfolio_analysis":
            state.portfolio_authorized = True
        government_profile = None
        if skill == "guardrail":
            logger.info("assistant_guardrail skill=guardrail")
            base = await assistant_service._guardrail(AssistantRequest(message=request.message,
                                                                      context_symbol=symbols[0] if symbols else None))
            bundle = _bundle_from_response(skill, base, symbols)
        elif skill == "stock_analysis" and symbols:
            base, bundle = await self._stock(symbols[0], context.language, request.message)
        elif skill == "etf_analysis" and symbols:
            base, bundle = await self._etf(symbols[0])
        elif skill == "portfolio_analysis":
            base, bundle = await self._portfolio(request, symbols, state)
        elif skill == "canada360":
            base, bundle, government_profile = await self._canada(request, state)
        elif skill == "fixed_income":
            base, bundle = await self._fixed_income(request)
        elif skill == "compare" and len(symbols) >= 2:
            base = await assistant_service._compare(symbols[:2])
            bundle = _bundle_from_response(skill, base, symbols[:2])
            compared = await asyncio.gather(*(
                self._etf(symbol) if symbol in _ETF_SYMBOLS else
                self._stock(symbol, context.language, request.message)
                for symbol in symbols[:2]), return_exceptions=True)
            for symbol, result in zip(symbols[:2], compared, strict=True):
                if isinstance(result, Exception):
                    bundle.missing_data.append(f"Données détaillées {symbol} indisponibles")
                    continue
                _, detail = result
                for fact in detail.facts[:30]:
                    linked = fact.model_copy(update={"label": f"{symbol} · {fact.label}"})
                    bundle.facts.append(linked)
                bundle.sources.extend(detail.sources[:10])
                bundle.missing_data.extend(detail.missing_data[:5])
        elif skill == "data_quality":
            base = await assistant_service._quality()
            bundle = _bundle_from_response(skill, base, [])
        elif skill == "news_context":
            if symbols:
                base, bundle = await self._stock(symbols[0], context.language, request.message)
                bundle.skill = "news_context"
            else:
                base, bundle = await self._news(context.language)
        else:
            base = await assistant_service._market()
            bundle = _bundle_from_response("market_analysis", base, [])
        bundles = [bundle]
        if mixed_macro and skill == "portfolio_analysis":
            try:
                macro, macro_bundle, _ = await self._canada(request, state)
                bundles.append(macro_bundle)
                base.answer += ("\n\n## Contexte macro Canada 360\n" + macro.answer +
                                "\nLes séries officielles d’inflation et de chômage restent du contexte; "
                                "aucune sensibilité à ces séries n’est inférée.")
                base.sources.extend(macro.sources)
                logger.info("portfolio_macro_context source_count=%s coverage_bucket=%s",
                            len(macro_bundle.sources), "high" if macro_bundle.sources else "low")
            except Exception:
                bundle.missing_data.append("Contexte officiel Canada 360 temporairement indisponible")
                base.answer += "\n\n## Contexte macro Canada 360\nDonnées officielles indisponibles pour cette question."
                logger.info("portfolio_macro_context source_count=0 coverage_bucket=low")
        if mixed_macro and symbols and skill == "canada360":
            for symbol in symbols[:2]:
                stock, stock_bundle = await self._stock(symbol, context.language)
                bundles.append(stock_bundle)
                base.answer += ("\n\nScénario, pas prévision : pour " + symbol +
                                ", les données Focus fournissent un contexte de marché, sans quantifier un impact causal de la macroéconomie. " +
                                stock.answer)
                base.sources.extend(stock.sources)
        actions: list[NavigationAction] = []
        if skill == "compare" and len(symbols) >= 2:
            actions.append(_action(f"Comparer {symbols[0]} et {symbols[1]}",
                                   f"/comparateur?symbols={symbols[0]},{symbols[1]}"))
        elif skill == "stock_analysis" and symbols:
            actions.append(_action(f"Ouvrir l’analyse complète de {symbols[0]} dans Focus", f"/focus/{symbols[0]}"))
        elif skill == "etf_analysis" and symbols:
            actions.append(_action(f"Voir {symbols[0]} dans ETF", f"/etf/{symbols[0]}"))
        elif skill == "portfolio_analysis":
            actions.append(_action("Ouvrir Portefeuille", "/portefeuille"))
        elif skill == "canada360":
            actions.append(_action("Ouvrir Canada 360", "/canada"))
        elif skill == "fixed_income":
            actions.append(_action("Voir Taux & Obligations", "/taux-obligations"))
        elif skill == "market_analysis":
            actions.append(_action("Ouvrir Terminal", "/terminal"))
        elif skill == "news_context":
            actions.append(_action("Ouvrir Actualités", "/actualites"))
        elif skill == "data_quality":
            actions.append(_action("Ouvrir Qualité des données", "/qualite"))
        bundle.navigation_actions.extend(actions)
        base.intent = skill
        synthesis = None
        if skill not in {"canada360", "guardrail"}:
            macro_suffix = ("\n\n## Contexte macro Canada 360" +
                            base.answer.split("\n\n## Contexte macro Canada 360", 1)[1]
                            if mixed_macro and skill == "portfolio_analysis"
                            and "\n\n## Contexte macro Canada 360" in base.answer else "")
            synthesis = await synthesize_from_evidence(
                bundle, request.message, base.answer, provider_router,
                conversation={
                    "last_skill": state.skill,
                    "symbols": symbols[:2],
                    "portfolio_focus": bundle.portfolio_focus if skill == "portfolio_analysis" else None,
                    "last_question_topic": state.last_question_topic,
                    "last_answer_summary": state.last_answer_summary,
                    "jurisdiction": context.metadata.get("region", "CA")[:4],
                    "portfolio_permission_state": state.portfolio_authorized,
                },
            )
            base.answer = synthesis.answer + (macro_suffix if synthesis.validated else "")
            if synthesis.validated and synthesis.follow_up_prompts:
                base.suggestions = list(synthesis.follow_up_prompts)
        state.symbols = symbols[:2]
        state.skill = skill
        state.last_question_topic = bundle.portfolio_focus or skill
        state.last_answer_summary = (f"Analyse portefeuille : {bundle.portfolio_focus}" if skill == "portfolio_analysis"
                                     else base.answer[:160])
        logger.info("assistant_navigation_action skill=%s count=%s", skill, len(actions))
        logger.info("assistant_response skill=%s latency_bucket=%s source_count=%s completeness=%s",
                    skill, _bucket(monotonic() - started), sum(len(row.sources) for row in bundles),
                    "partial" if any(row.missing_data for row in bundles) else "complete")
        return self._response(base, context=context, conversation_id=conversation_id,
                              bundles=bundles, actions=actions,
                              government_feedback={"conversation_id": state.canada_id, "turn_index": state.canada_turn_index}
                              if skill == "canada360" and state.canada_id and state.canada_turn_index is not None else None,
                              government_profile=government_profile, synthesis=synthesis)


anatole_assistant_orchestrator = AnatoleAssistantOrchestrator()
