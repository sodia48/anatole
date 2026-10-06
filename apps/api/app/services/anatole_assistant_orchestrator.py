"""Ask → Analyze → Navigate using existing Anatole services and bounded context.

Conversation state contains symbols and consent only. Positions and raw questions are
never retained by this service or written to telemetry.
"""

from __future__ import annotations

import asyncio
import json
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
    NavigationAction, Skill, UnifiedAssistantRequest, UnifiedAssistantResponse,
)
from app.schemas.workspace import AssistantFact, AssistantLink, AssistantRequest, AssistantResponse, AssistantSource
from app.services.assistant import DISCLAIMER, _symbols, assistant_service
from app.services.canada_360_assistant import canada_360_assistant_service
from app.services.etf_holdings import etf_holdings_service
from app.services.fundamentals import fundamentals_service
from app.services.market_data import market_data_service
from app.services.stock_research import build_stock_research_bundle, generate_stock_research_from_evidence
from app.services.portfolio import portfolio_service
from app.services.stock_news import stock_news_service
from app.services.news import news_service
from app.services.canada_360_providers import provider_router
from app.schemas.workspace import PortfolioAnalyzeRequest, PortfolioPerformanceRequest, PortfolioPerformanceWeight
from app.services.portfolio_performance import portfolio_performance_service


logger = logging.getLogger(__name__)
SESSION_SECONDS = 2 * 60 * 60
_ETF_SYMBOLS = {item["ticker"] for item in ETF_CATALOG}
_ALIASES = {"shopify": "SHOP", "lightspeed": "LSPD"}
_PORTFOLIO_CUES = ("portefeuille", "positions", "allocation", "concentration", "mes risques", "mon risque", "my portfolio", "my positions", "my risk", "chevauch", "overlap")
_GOVERNMENT_CUES = ("canada 360", "gouvernement", "statistique canad", "statistique canada", "province", "prestation", "soins dentaires", "impôt", "assurance emploi", "government", "benefit", "dental", "unemployment rate", "taux de chômage", "inflation canad", "inflation au canada", "macro canadien", "passeport", "quebec", "québec", "ontario", "alberta")
_MACRO_CUES = ("inflation", "taux directeur", "pétrole", "cad", "macro", "interest rate", "oil price")
_NEWS_CUES = ("nouvelle", "actualité", "news", "aujourd'hui", "today", "baisse aujourd", "down today")
_GUARDRAIL_CUES = ("quoi acheter", "dois-je acheter", "que dois-je acheter", "quoi vendre", "dois-je vendre", "quelle action acheter", "which stock should i buy", "what should i buy", "buy for me", "recommend me")
_MARKET_CUES = ("marché", "market", "tsx", "terminal", "secteurs", "sectors")


@dataclass
class _Session:
    symbols: list[str] = field(default_factory=list)
    skill: Skill | None = None
    canada_id: str | None = None
    canada_turn_index: int | None = None
    portfolio_authorized: bool = False
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
                   or portfolio and any(cue in text for cue in _MACRO_CUES))
    if portfolio:
        return "portfolio_analysis", mixed_macro
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
                  government_profile: dict[str, str | int | None] | None = None) -> UnifiedAssistantResponse:
        return UnifiedAssistantResponse(
            **base.model_dump(), context=context, conversation_id=conversation_id,
            evidence=bundles, actions=actions, permission_required=permission_required,
            government_feedback=government_feedback,
            government_profile=government_profile,
        )

    @staticmethod
    async def _synthesize(base: AssistantResponse, bundle: AnatoleEvidenceBundle,
                          question: str) -> AssistantResponse:
        if not bundle.facts or bundle.skill in {"portfolio_analysis", "canada360", "guardrail"}:
            logger.info("assistant_deterministic_fallback skill=%s reason=no_public_evidence", bundle.skill)
            return base
        evidence = [{"label": fact.label, "value": fact.value, "source": fact.source}
                    for fact in bundle.facts[:10]]
        prompt = ("Résume en français uniquement les faits JSON fournis. N'ajoute aucun fait, chiffre, "
                  "cause, recommandation d'achat ou de vente. Si un fait manque, dis-le. "
                  "Une ou deux phrases.\nQuestion : " + question[:300] +
                  "\nFaits : " + json.dumps(evidence, ensure_ascii=False))
        try:
            result = await provider_router.generate_internal_evidence(prompt=prompt)
        except Exception:
            result = None
        if result and result.success and len(result.answer) <= 900:
            candidate = result.answer.strip()
            evidence_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", json.dumps(evidence, ensure_ascii=False)))
            answer_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", candidate))
            if (answer_numbers <= evidence_numbers and not re.search(
                r"\b(ach[eè]te[rz]?|vends?|recommande|buy|sell)\b|https?://", candidate, re.I
            )):
                base.answer += "\n\nLecture des faits : " + candidate
                logger.info("assistant_provider_synthesis skill=%s provider=%s source_count=%s",
                            bundle.skill, result.provider, len(bundle.sources))
                return base
        logger.info("assistant_deterministic_fallback skill=%s reason=provider_unavailable_or_unverified", bundle.skill)
        return base

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
        answer = await generate_stock_research_from_evidence(bundle, question, provider_router)
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
        if snapshot.regions:
            answer += " Régions principales : " + ", ".join(f"{row.label} {row.weight_percent:.1f} %" for row in snapshot.regions[:3]) + "."
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

    async def _portfolio(self, request: UnifiedAssistantRequest, symbols: list[str]) -> tuple[AssistantResponse, AnatoleEvidenceBundle]:
        logger.info("assistant_tool_started skill=portfolio_analysis tool=portfolio")
        snapshot = await portfolio_service.analyze(PortfolioAnalyzeRequest(positions=request.portfolio_positions))
        bundle = AnatoleEvidenceBundle(
            skill="portfolio_analysis", entities=[row.symbol for row in snapshot.positions[:5]],
            sources=[EvidenceSource(label="Portefeuille Anatole", type="portfolio",
                                    freshness="internal", timestamp=snapshot.generated_at)],
            freshness="internal", generated_at=snapshot.generated_at,
            limitations=["Analyse éducative fondée sur les positions transmises pour cette requête; aucune transaction."],
        )
        if snapshot.risk and snapshot.risk.top_position_percent is not None:
            bundle.facts.append(EvidenceFact(label="Plus grande position",
                                            value=f"{snapshot.risk.top_position_percent:.1f} %",
                                            source="Portefeuille Anatole", timestamp=snapshot.generated_at,
                                            freshness="internal"))
        if snapshot.sector_allocation:
            sector = max(snapshot.sector_allocation, key=lambda row: row.weight_percent)
            bundle.facts.append(EvidenceFact(label="Secteur dominant", value=f"{sector.label} {sector.weight_percent:.1f} %",
                                            source="Portefeuille Anatole", timestamp=snapshot.generated_at,
                                            freshness="internal"))
        if snapshot.risk and snapshot.risk.volatility_percent is not None:
            bundle.facts.append(EvidenceFact(label="Volatilité observée", value=f"{snapshot.risk.volatility_percent:.1f} %",
                                            source="Moteur de risque Anatole", timestamp=snapshot.generated_at,
                                            freshness="internal"))
        if snapshot.positions:
            top = max(snapshot.positions, key=lambda row: row.weight_percent)
            bundle.facts.append(EvidenceFact(label="Position dominante", value=f"{top.symbol} {top.weight_percent:.1f} %",
                                            source="Portefeuille Anatole", timestamp=snapshot.generated_at,
                                            freshness="internal"))
        text = request.message.casefold()
        answer = "Diagnostic des risques observés : " + (
            "; ".join(f"{fact.label} {fact.value}" for fact in bundle.facts) if bundle.facts
            else "les données disponibles ne suffisent pas à quantifier la concentration ou la volatilité"
        ) + "."
        if "répartition" in text or "repartition" in text or "allocation" in text:
            answer += (" Cette répartition montre les concentrations ci-dessus. Son adéquation dépend de votre horizon, "
                       "de votre tolérance au risque et de vos besoins de liquidité; ces positions seules ne permettent pas "
                       "de conclure qu'elle est bonne ou mauvaise.")
        if "sous-perform" in text or "underperform" in text:
            weights = [PortfolioPerformanceWeight(symbol=row.symbol, weight_percent=row.weight_percent, market=row.market)
                       for row in snapshot.positions if row.weight_percent > 0]
            if weights:
                try:
                    performance = await portfolio_performance_service.analyze(
                        PortfolioPerformanceRequest(positions=weights, benchmark=snapshot.benchmark, range="1m")
                    )
                    if performance.portfolio_return_percent is not None and performance.benchmark_return_percent is not None:
                        answer += (f" Sur un mois, le portefeuille reconstitué a varié de {performance.portfolio_return_percent:+.1f} % "
                                   f"contre {performance.benchmark_return_percent:+.1f} % pour {performance.benchmark_name}. "
                                   "Ces observations ne prouvent pas une cause unique de sous-performance.")
                        bundle.facts.append(EvidenceFact(label="Écart au TSX sur un mois",
                                                        value=f"{performance.excess_return_percent:+.1f} %" if performance.excess_return_percent is not None else "N/D",
                                                        source="Performance Anatole", timestamp=performance.generated_at,
                                                        freshness="internal"))
                        bundle.sources.append(EvidenceSource(label="Performance Anatole", type="portfolio_performance",
                                                            freshness="internal", timestamp=performance.generated_at))
                    else:
                        bundle.missing_data.append("Performance mensuelle comparable indisponible")
                except Exception:
                    bundle.missing_data.append("Performance mensuelle comparable indisponible")
        if "pétrole" in text or "oil" in text:
            stress = next((row for row in snapshot.stress_tests if row.key == "wti"), None)
            if stress and stress.estimated_portfolio_change_percent is not None:
                answer += (f" Le test existant {stress.label} estime une variation de {stress.estimated_portfolio_change_percent:+.1f} % "
                           f"avec {stress.coverage.coverage_percent:.0f} % de couverture. "
                           "Un choc de 20 % n'est pas calculé par ce moteur.")
                bundle.sources.append(EvidenceSource(label="Stress tests Anatole", type="portfolio_risk",
                                                    freshness="internal", timestamp=snapshot.generated_at))
            else:
                bundle.missing_data.append("Sensibilité au pétrole indisponible")
        if "chevauch" in text or "overlap" in text:
            etf = next((symbol for symbol in symbols if symbol in _ETF_SYMBOLS), None)
            if etf:
                try:
                    holdings = await etf_holdings_service.snapshot(etf, limit=25)
                    direct = {row.symbol.upper().removesuffix(".TO") for row in request.portfolio_positions}
                    common = [row for row in holdings.holdings if row.display_symbol.upper().removesuffix(".TO") in direct]
                    coverage = sum(row.weight_percent for row in holdings.holdings)
                    answer += f" Chevauchement {etf} : {len(common)} position(s) commune(s) parmi les {len(holdings.holdings)} participations publiées."
                    if common:
                        answer += " Titres communs : " + ", ".join(row.display_symbol for row in common[:5]) + "."
                    answer += f" Couverture observée des participations : {coverage:.1f} %; aucun pourcentage global de chevauchement n'est déduit si elle est incomplète."
                    bundle.sources.append(EvidenceSource(label=holdings.source_name, type="etf_holdings",
                                                        freshness="stale" if holdings.stale else "delayed",
                                                        timestamp=holdings.generated_at, url=holdings.source_url))
                except Exception:
                    bundle.missing_data.append("Participations ETF indisponibles pour le chevauchement")
                    answer += " Les participations de l’ETF sont indisponibles; le chevauchement ne peut pas être calculé."
        if any(cue in text for cue in _NEWS_CUES):
            tickers = [row.symbol for row in request.portfolio_positions[:5]]
            results = await asyncio.gather(
                *(stock_news_service.get_snapshot(symbol, language=request.context.language) for symbol in tickers),
                return_exceptions=True,
            )
            found = [(symbol, item) for symbol, result in zip(tickers, results, strict=True)
                     if not isinstance(result, Exception) for item in result.items[:2]]
            if found:
                answer += " Actualités des positions : " + "; ".join(
                    f"{symbol} — {item.title} ({item.published_at.date()})" for symbol, item in found[:5]
                ) + ". Aucun lien causal avec le cours n'est inféré."
                bundle.sources.extend(EvidenceSource(label=item.publisher, type="news", freshness="delayed",
                                                     timestamp=item.published_at, url=item.url) for _, item in found[:5])
            else:
                bundle.missing_data.append("Actualités des positions indisponibles")
        if "var" in text or "value at risk" in text:
            answer += " La VaR marginale n'est pas calculée par ce diagnostic."
        base = self._simple("portfolio_analysis", "Risques du portefeuille", answer,
                            confidence="moyenne" if bundle.facts else "limitée",
                            facts=[AssistantFact(label=f.label, value=f.value) for f in bundle.facts],
                            sources=[AssistantSource(label="Portefeuille Anatole",
                                                     detail=f"Calculé {snapshot.generated_at.isoformat()}", status="internal")])
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
            base, bundle = await self._portfolio(request, symbols)
        elif skill == "canada360":
            base, bundle, government_profile = await self._canada(request, state)
        elif skill == "compare" and len(symbols) >= 2:
            base = await assistant_service._compare(symbols[:2])
            bundle = _bundle_from_response(skill, base, symbols[:2])
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
            macro, macro_bundle, _ = await self._canada(request, state)
            bundles.append(macro_bundle)
            base.answer += ("\n\nContexte macro canadien : " + macro.answer +
                            "\nScénario, pas prévision : les expositions du portefeuille ci-dessus "
                            "peuvent être comparées à ces données, mais aucun impact causal précis n'est calculé.")
            base.sources.extend(macro.sources)
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
        elif skill == "market_analysis":
            actions.append(_action("Ouvrir Terminal", "/terminal"))
        elif skill == "news_context":
            actions.append(_action("Ouvrir Actualités", "/actualites"))
        elif skill == "data_quality":
            actions.append(_action("Ouvrir Qualité des données", "/qualite"))
        bundle.navigation_actions.extend(actions)
        base.intent = skill
        if skill in {"etf_analysis", "compare", "market_analysis"}:
            base = await self._synthesize(base, bundle, request.message)
        state.symbols = symbols[:2]
        state.skill = skill
        logger.info("assistant_navigation_action skill=%s count=%s", skill, len(actions))
        logger.info("assistant_response skill=%s latency_bucket=%s source_count=%s completeness=%s",
                    skill, _bucket(monotonic() - started), sum(len(row.sources) for row in bundles),
                    "partial" if any(row.missing_data for row in bundles) else "complete")
        return self._response(base, context=context, conversation_id=conversation_id,
                              bundles=bundles, actions=actions,
                              government_feedback={"conversation_id": state.canada_id, "turn_index": state.canada_turn_index}
                              if skill == "canada360" and state.canada_id and state.canada_turn_index is not None else None,
                              government_profile=government_profile)


anatole_assistant_orchestrator = AnatoleAssistantOrchestrator()
