from __future__ import annotations

import re
from datetime import UTC, datetime

from app.data.etf_catalog import ETF_CATALOG
from app.schemas.analysis import CompareRequest
from app.schemas.workspace import (
    AdvisorPlanRequest,
    AssistantFact,
    AssistantLink,
    AssistantRequest,
    AssistantResponse,
    AssistantSource,
    PortfolioAnalyzeRequest,
)
from app.services.analysis import analysis_service
from app.services.advisor import advisor_service
from app.services.data_quality import data_quality_service
from app.services.market_data import market_data_service
from app.services.portfolio import portfolio_service
from app.services.tsx60 import TSX60


DISCLAIMER = (
    "Outil de planification et d’analyse éducative. Anatole ne recommande aucun "
    "achat, aucune vente, aucun maintien de titre et n’exécute aucune transaction."
)

_KNOWN_SYMBOLS = {
    item.symbol for item in TSX60
} | {
    item["ticker"] for item in ETF_CATALOG
}
_STOPWORDS = {
    "ANATOLE", "TSX", "ETF", "RSI", "CAD", "USD", "IPO", "LE", "LA",
    "LES", "UN", "UNE", "DES", "DU", "ET", "OU", "VS", "SUR", "POUR",
    "AVEC", "QUE", "QUOI", "EST", "SON", "MON", "MES", "TON", "TA",
    "MARCHE", "MARCHÉ", "COMPARE", "COMPARER", "ANALYSE", "DONNEES",
}


def _symbols(message: str, context_symbol: str | None) -> list[str]:
    output: list[str] = []
    if context_symbol:
        output.append(context_symbol.strip().upper().removesuffix(".TO"))

    # Les symboles connus peuvent être saisis en minuscules; les symboles hors
    # univers Anatole doivent être écrits explicitement en majuscules afin de
    # ne pas confondre des mots français avec des tickers.
    normalized_tokens = re.findall(
        r"\b[A-Z][A-Z0-9.^-]{0,14}(?:\.TO)?\b",
        message.upper(),
    )
    explicit_tokens = re.findall(
        r"\b[A-Z][A-Z0-9.^-]{1,14}(?:\.TO)?\b",
        message,
    )

    for candidate in [*normalized_tokens, *explicit_tokens]:
        clean = candidate.removesuffix(".TO")
        if clean in _STOPWORDS or clean in output:
            continue
        if clean in _KNOWN_SYMBOLS or clean.startswith("^") or candidate in explicit_tokens:
            output.append(clean)
    return output[:5]


def _tone(value: float) -> str:
    if value > 0.15:
        return "positive"
    if value < -0.15:
        return "negative"
    return "neutral"


class AssistantService:
    async def _market(self) -> AssistantResponse:
        snapshot = await analysis_service.terminal()
        leading = snapshot.sectors[:3]
        signals = snapshot.opportunities[:3]
        sectors_text = ", ".join(
            f"{item.sector} ({item.state.lower()})"
            for item in leading
        ) or "aucun leadership sectoriel clair"
        signals_text = ", ".join(item.symbol for item in signals) or "aucun signal quantitatif marqué"
        answer = (
            f"Le régime du {snapshot.universe} est **{snapshot.regime.lower()}** "
            f"avec un score de {snapshot.regime_score:.0f}/100 et un risque "
            f"{snapshot.risk_level.lower()}. La largeur du marché est de "
            f"{snapshot.advance_ratio:.0f} % d’avancées, tandis que "
            f"{snapshot.above_sma50_percent:.0f} % des titres se maintiennent "
            f"au-dessus de leur moyenne mobile 50 séances.\n\n"
            f"Les zones de leadership sont {sectors_text}. Les signaux quantitatifs les plus marqués "
            f"concernent {signals_text}; ils servent à approfondir l’analyse, pas à formuler une instruction de placement."
        )
        return AssistantResponse(
            intent="market",
            title="Lecture du marché canadien",
            answer=answer,
            facts=[
                AssistantFact(label="Régime", value=snapshot.regime, tone="info"),
                AssistantFact(label="Score", value=f"{snapshot.regime_score:.0f}/100", tone="positive" if snapshot.regime_score >= 60 else "negative" if snapshot.regime_score < 45 else "neutral"),
                AssistantFact(label="Risque", value=snapshot.risk_level, tone="negative" if snapshot.risk_level in {"Élevé", "Critique"} else "neutral"),
                AssistantFact(label="Largeur", value=f"{snapshot.advance_ratio:.0f} %", tone="positive" if snapshot.advance_ratio >= 55 else "negative" if snapshot.advance_ratio < 45 else "neutral"),
            ],
            links=[
                AssistantLink(label="Ouvrir Terminal Pro", href="/terminal"),
                AssistantLink(label="Voir le Screener", href="/screener"),
            ],
            sources=[
                AssistantSource(label="Terminal Pro", detail=snapshot.methodology, status="internal"),
                AssistantSource(label="TSX 60", detail=f"Actualisé {snapshot.generated_at.isoformat()}", status="delayed"),
            ],
            suggestions=[
                "Quels secteurs dominent aujourd’hui ?",
                "Compare RY et TD",
                "Analyse SHOP",
            ],
            confidence="élevée",
            disclaimer=DISCLAIMER,
            generated_at=datetime.now(UTC),
        )

    async def _compare(self, symbols: list[str]) -> AssistantResponse:
        snapshot = await analysis_service.compare(
            CompareRequest(symbols=symbols, range="1y")
        )
        winner = snapshot.instruments[0]
        rows = "; ".join(
            f"{item.symbol}: score {item.score:.0f}/100, rendement {item.total_return_percent:+.1f} %, volatilité "
            f"{item.volatility_percent:.1f} %" if item.volatility_percent is not None else
            f"{item.symbol}: score {item.score:.0f}/100, rendement {item.total_return_percent:+.1f} %"
            for item in snapshot.instruments
        )
        answer = (
            f"Sur un an, **{winner.symbol}** obtient le score quantitatif le plus élevé dans cette comparaison. "
            f"Comparaison synthétique : {rows}.\n\n"
            "Ce classement décrit les données observées; il ne constitue pas une recommandation. "
            "La matrice de corrélation du Comparateur aide à examiner les différences de risque et de diversification."
        )
        return AssistantResponse(
            intent="compare",
            title=f"Comparaison {' · '.join(symbols)}",
            answer=answer,
            facts=[
                AssistantFact(label="Score le plus élevé", value=winner.symbol, tone="info"),
                AssistantFact(label="Score", value=f"{winner.score:.0f}/100", tone="positive"),
                AssistantFact(label="Rendement 1 an", value=f"{winner.total_return_percent:+.1f} %", tone=_tone(winner.total_return_percent)),
            ],
            links=[
                AssistantLink(label="Ouvrir la comparaison complète", href=f"/comparateur?symbols={','.join(symbols)}"),
                AssistantLink(label=f"Voir {winner.symbol} dans Focus", href=f"/focus/{winner.symbol}"),
            ],
            sources=[
                AssistantSource(label="Comparateur Anatole", detail=snapshot.methodology, status="internal"),
                AssistantSource(label="Données de marché", detail="Historiques publics avec données de secours en cas de panne.", status="delayed"),
            ],
            suggestions=[
                f"Quel est le principal risque de {winner.symbol} ?",
                "Montre-moi le régime du marché",
                "Comment diversifier ce portefeuille ?",
            ],
            confidence="élevée",
            disclaimer=DISCLAIMER,
            generated_at=datetime.now(UTC),
        )

    async def _ticker(self, symbol: str) -> AssistantResponse:
        snapshot = await market_data_service.get_focus_snapshot(symbol, range_="1y", interval="1d")
        quote = snapshot.quote
        tech = snapshot.technicals
        momentum = 0.0
        if len(snapshot.history) > 21 and snapshot.history[-21].close:
            momentum = (snapshot.history[-1].close / snapshot.history[-21].close - 1) * 100
        rsi_text = f"{tech.rsi_14:.1f}" if tech.rsi_14 is not None else "N/D"
        answer = (
            f"**{quote.symbol} — {quote.name}** cote {quote.price:,.2f} {quote.currency}, "
            f"en variation de {quote.change_percent:+.2f} % sur la séance. La tendance technique "
            f"est {tech.trend.lower()}, le momentum sur environ 20 séances est de {momentum:+.1f} % "
            f"et le RSI 14 se situe à {rsi_text}.\n\n"
            f"Le support calculé est {tech.support:,.2f} et la résistance {tech.resistance:,.2f}. "
            "Ces niveaux sont des repères statistiques, pas des garanties d’exécution."
            if tech.support is not None and tech.resistance is not None
            else (
                f"**{quote.symbol} — {quote.name}** cote {quote.price:,.2f} {quote.currency}, "
                f"en variation de {quote.change_percent:+.2f} %. La tendance technique est "
                f"{tech.trend.lower()}, le momentum 20 séances est {momentum:+.1f} % et le RSI 14 {rsi_text}."
            )
        )
        source_status = "fallback" if quote.source.startswith("demo") else "delayed" if quote.delayed else "live"
        return AssistantResponse(
            intent="ticker",
            title=f"Analyse de {quote.symbol}",
            answer=answer,
            facts=[
                AssistantFact(label="Prix", value=f"{quote.price:,.2f} {quote.currency}", tone="neutral"),
                AssistantFact(label="Séance", value=f"{quote.change_percent:+.2f} %", tone=_tone(quote.change_percent)),
                AssistantFact(label="Momentum 20j", value=f"{momentum:+.1f} %", tone=_tone(momentum)),
                AssistantFact(label="RSI 14", value=rsi_text, tone="neutral"),
            ],
            links=[
                AssistantLink(label="Ouvrir Focus", href=f"/focus/{quote.symbol}"),
                AssistantLink(label="Créer une alerte", href=f"/alertes?symbol={quote.symbol}"),
            ],
            sources=[
                AssistantSource(label=quote.source, detail=f"Horodatage {quote.timestamp.isoformat()}", status=source_status),
                AssistantSource(label="Moteur technique Anatole", detail="RSI, moyennes mobiles, support, résistance et tendance.", status="internal"),
            ],
            suggestions=[
                f"Compare {quote.symbol} et RY",
                f"Quels risques ressortent pour {quote.symbol} ?",
                "Quel est le régime du marché ?",
            ],
            confidence="moyenne" if quote.source.startswith("demo") else "élevée",
            disclaimer=DISCLAIMER,
            generated_at=datetime.now(UTC),
        )

    async def _portfolio(self, request: AssistantRequest) -> AssistantResponse:
        if not request.portfolio_positions:
            return AssistantResponse(
                intent="portfolio",
                title="Analyse du portefeuille",
                answer=(
                    "Aucune position n’est encore enregistrée dans le contexte de l’Assistant. "
                    "Ajoute tes positions dans Portefeuille; elles resteront stockées localement dans ton navigateur."
                ),
                links=[AssistantLink(label="Ouvrir Portefeuille", href="/portefeuille")],
                suggestions=["Quel est le régime du marché ?", "Compare RY et TD"],
                confidence="limitée",
                disclaimer=DISCLAIMER,
                generated_at=datetime.now(UTC),
            )
        snapshot = await portfolio_service.analyze(
            PortfolioAnalyzeRequest(positions=request.portfolio_positions)
        )
        top = snapshot.positions[0] if snapshot.positions else None
        answer = (
            f"Le portefeuille vaut environ {snapshot.total_market_value:,.2f} {snapshot.base_currency}. "
            f"Le gain latent est de {snapshot.total_unrealized_pnl:+,.2f} {snapshot.base_currency} "
            f"({snapshot.total_unrealized_pnl_percent:+.1f} %) et le score global atteint "
            f"{snapshot.portfolio_score:.0f}/100. Le niveau de risque est {snapshot.risk.risk_level.lower()}."
        )
        if top:
            answer += (
                f" La plus grande position est {top.symbol} à {top.weight_percent:.1f} %; "
                f"les trois premières totalisent {snapshot.risk.top_three_percent:.1f} %."
            )
        return AssistantResponse(
            intent="portfolio",
            title="Diagnostic du portefeuille",
            answer=answer,
            facts=[
                AssistantFact(label="Valeur", value=f"{snapshot.total_market_value:,.0f} {snapshot.base_currency}", tone="neutral"),
                AssistantFact(label="P&L latent", value=f"{snapshot.total_unrealized_pnl_percent:+.1f} %", tone=_tone(snapshot.total_unrealized_pnl_percent)),
                AssistantFact(label="Score", value=f"{snapshot.portfolio_score:.0f}/100", tone="positive" if snapshot.portfolio_score >= 65 else "neutral"),
                AssistantFact(label="Risque", value=snapshot.risk.risk_level, tone="negative" if snapshot.risk.risk_level in {"Élevé", "Très élevé"} else "neutral"),
            ],
            links=[AssistantLink(label="Ouvrir le diagnostic complet", href="/portefeuille")],
            sources=[
                AssistantSource(label="Portefeuille Anatole", detail="Positions locales analysées avec cotations et historiques publics.", status="internal"),
            ],
            suggestions=["Quelles positions concentrent le risque ?", "Quel secteur domine ?", "Compare mes deux plus grandes positions"],
            confidence="élevée" if snapshot.positions else "limitée",
            disclaimer=DISCLAIMER,
            generated_at=datetime.now(UTC),
        )

    async def _quality(self) -> AssistantResponse:
        snapshot = data_quality_service.snapshot()
        degraded = [item.label for item in snapshot.sources if item.status in {"degraded", "stale", "unavailable"}]
        answer = (
            f"La qualité globale des données est **{snapshot.overall_status.lower()}** "
            f"avec un score de {snapshot.overall_score:.0f}/100. Le mode fournisseur est "
            f"{snapshot.provider_mode}."
        )
        if degraded:
            answer += " Sources à surveiller : " + ", ".join(degraded[:4]) + "."
        else:
            answer += " Aucune source active n’est actuellement signalée comme dégradée."
        return AssistantResponse(
            intent="quality",
            title="Qualité des données Anatole",
            answer=answer,
            facts=[
                AssistantFact(label="Score", value=f"{snapshot.overall_score:.0f}/100", tone="positive" if snapshot.overall_score >= 80 else "negative" if snapshot.overall_score < 55 else "neutral"),
                AssistantFact(label="État", value=snapshot.overall_status, tone="info"),
                AssistantFact(label="Mode", value=snapshot.provider_mode, tone="neutral"),
            ],
            links=[AssistantLink(label="Ouvrir Qualité des données", href="/qualite")],
            sources=[AssistantSource(label="Observabilité Anatole", detail="Caches, couverture, retries et erreurs upstream.", status="internal")],
            suggestions=["Pourquoi une source est-elle dégradée ?", "Quel est le régime du marché ?"],
            confidence="élevée",
            disclaimer=DISCLAIMER,
            generated_at=datetime.now(UTC),
        )

    async def _guardrail(self, request: AssistantRequest) -> AssistantResponse:
        symbols = _symbols(request.message, request.context_symbol)
        facts = [
            AssistantFact(label="Limite", value="Aucun achat/vente", tone="info"),
            AssistantFact(label="Alternative", value="Cadre de décision", tone="neutral"),
        ]
        links = [
            AssistantLink(label="Comparer les faits", href=f"/comparateur?symbols={','.join(symbols)}" if len(symbols) >= 2 else "/comparateur"),
            AssistantLink(label="Examiner le risque", href="/portefeuille"),
        ]
        answer = (
            "Je ne peux pas choisir un placement, dire quoi acheter ou vendre, ni confirmer qu’un titre "
            "convient à une personne. Je peux toutefois transformer la question en analyse contrôlable : "
            "objectif, horizon, liquidité, capacité d’absorber une baisse, concentration, coûts, scénarios "
            "et critères de suivi."
        )
        if symbols:
            answer += (
                f" Pour {' et '.join(symbols)}, Anatole peut comparer les données observées et simuler leur "
                "impact hypothétique sans conclure par une instruction de transaction."
            )
        return AssistantResponse(
            intent="guardrail",
            title="Cadre de décision, sans recommandation",
            answer=answer,
            facts=facts,
            links=links,
            sources=[
                AssistantSource(
                    label="Garde-fous Anatole",
                    detail="Blocage des demandes d’achat, vente, maintien et sélection personnalisée de titres.",
                    status="internal",
                )
            ],
            suggestions=[
                "Construis mon plan à partir de mon objectif",
                "Teste une baisse de 20 % sur mon portefeuille",
                "Montre les principales concentrations de risque",
            ],
            confidence="élevée",
            disclaimer=DISCLAIMER,
            guardrail_triggered=True,
            generated_at=datetime.now(UTC),
        )

    async def _advisor(self, request: AssistantRequest) -> AssistantResponse:
        if request.advisor_profile is None:
            return AssistantResponse(
                intent="advisor",
                title="Profil de planification à compléter",
                answer=(
                    "Renseigne ton objectif, ton horizon, ta réserve liquide, ta cadence de contribution et "
                    "tes contraintes. Anatole construira ensuite un diagnostic, des scénarios et un ordre de "
                    "priorités sans sélectionner de placement."
                ),
                links=[AssistantLink(label="Ouvrir le profil", href="/assistant#profil")],
                suggestions=["Quel est le rôle de l’horizon ?", "Analyse mon portefeuille"],
                confidence="limitée",
                disclaimer=DISCLAIMER,
                generated_at=datetime.now(UTC),
            )
        plan = await advisor_service.build(
            AdvisorPlanRequest(
                profile=request.advisor_profile,
                portfolio_positions=request.portfolio_positions,
            )
        )
        facts = [
            AssistantFact(label="Préparation", value=f"{plan.readiness_score:.0f}/100", tone="positive" if plan.readiness_score >= 70 else "negative" if plan.readiness_score < 45 else "neutral"),
            AssistantFact(label="Profil de capacité", value=plan.capacity_profile, tone="info"),
            AssistantFact(label="Profil complété", value=f"{plan.profile_completeness} %", tone="positive" if plan.profile_completeness >= 80 else "neutral"),
        ]
        if plan.reserve_months is not None:
            facts.append(
                AssistantFact(
                    label="Réserve",
                    value=f"{plan.reserve_months:.1f} mois",
                    tone="positive" if plan.reserve_months >= 3 else "negative",
                )
            )
        return AssistantResponse(
            intent="advisor",
            title=plan.title,
            answer=plan.summary,
            facts=facts,
            links=[
                AssistantLink(label="Voir le portefeuille", href="/portefeuille"),
                AssistantLink(label="Tester des scénarios", href="/assistant#scenarios"),
                AssistantLink(label="Créer des alertes de suivi", href="/alertes"),
            ],
            sources=[
                AssistantSource(
                    label="Planificateur Anatole",
                    detail="Profil déclaré, scénarios illustratifs et diagnostic du portefeuille local.",
                    status="internal",
                )
            ],
            suggestions=[
                "Explique ma priorité numéro un",
                "Teste une baisse de 20 %",
                "Où se concentre mon risque ?",
            ],
            confidence="élevée" if plan.profile_completeness >= 80 else "moyenne",
            disclaimer=DISCLAIMER,
            plan=plan,
            generated_at=datetime.now(UTC),
        )

    async def answer(self, request: AssistantRequest) -> AssistantResponse:
        text = request.message.casefold()
        symbols = _symbols(request.message, request.context_symbol)
        trade_action_terms = (
            "acheter", "vendre", "conserver", "garder", "accumuler", "alléger",
            "alleger", "surpondérer", "surponderer", "sous-pondérer", "sous-ponderer",
            "buy", "sell", "hold",
        )
        selection_terms = (
            "recommande", "recommandation", "meilleur placement", "meilleure action",
            "meilleur titre", "meilleur etf", "bon placement", "où investir", "ou investir",
            "dans quoi investir", "quel etf", "quelle action choisir", "quel titre choisir",
            "choisis pour moi", "dois-je investir", "devrais-je investir",
        )
        if any(term in text for term in trade_action_terms + selection_terms):
            return await self._guardrail(request)
        advisor_terms = (
            "plan", "objectif", "horizon", "retraite", "maison", "mise de fonds",
            "épargne", "epargne", "contribution", "capacité de risque", "capacite de risque",
            "profil de risque", "stress test", "scénario", "scenario", "suis-je sur la bonne voie",
            "priorité", "priorite", "robot-conseiller", "conseiller",
        )
        if any(term in text for term in advisor_terms):
            return await self._advisor(request)
        compare_intent = any(word in text for word in ("compare", "comparer", "versus", " vs "))
        if compare_intent and len(symbols) >= 2:
            return await self._compare(symbols)
        if any(word in text for word in ("portefeuille", "positions", "allocation", "diversification", "concentration")):
            return await self._portfolio(request)
        if any(word in text for word in ("qualité", "qualite", "source", "donnée", "donnee", "502", "api")):
            return await self._quality()
        if symbols:
            return await self._ticker(symbols[0])
        if any(word in text for word in ("marché", "marche", "tsx", "régime", "regime", "secteur", "terminal")):
            return await self._market()
        if request.advisor_profile is not None:
            return await self._advisor(request)
        return await self._market()


assistant_service = AssistantService()
