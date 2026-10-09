"""Deep portfolio research uses observed snapshot values and degrades without a provider."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.schemas.assistant_context import AssistantContext, UnifiedAssistantRequest
from app.schemas.workspace import (
    PortfolioAllocation, PortfolioContributor, PortfolioCorrelationMatrix,
    PortfolioCoverage, PortfolioHorizonContribution, PortfolioHorizonResult,
    PortfolioContributionResult, PortfolioPositionSnapshot, PortfolioRisk,
    PortfolioSnapshot, PortfolioStressTest, PortfolioCorrelationCluster,
    PortfolioFactorSensitivity,
)
from app.services.anatole_assistant_orchestrator import AnatoleAssistantOrchestrator
from app.services.canada_360_providers import provider_router
from app.services.etf_holdings import etf_holdings_service
from app.services.portfolio import portfolio_service
from app.services.stock_news import stock_news_service
from app.services.portfolio_research import build_portfolio_research_bundle, format_portfolio_research
from app.services.portfolio_research import generate_portfolio_research_from_evidence
from app.services.portfolio_intelligence_v12 import build_attribution, build_risk_contributions
from app.services.portfolio_research_v12 import (
    build_lookthrough_summary, build_portfolio_xray, build_watchtower_delta,
)
from app.schemas.assistant_context import PortfolioWatchtowerAggregate
from app.schemas.stocks import Candle

NOW = datetime(2026, 10, 7, tzinfo=UTC)
SYMBOLS = ["MU", "VFV", "IMG", "MDA", "XEG", "VNP", "TD", "RY", "XIC", "SHOP", "T"]
WEIGHTS = [36, 15, 12, 10, 8, 6, 5, 4, 2, 1.5, 0.5]


def sample_snapshot() -> PortfolioSnapshot:
    positions = [
        PortfolioPositionSnapshot(
            symbol=symbol, ticker=symbol, name=f"Société {symbol}", sector="Autres" if index < 3 else "Finance",
            market="CA", currency="CAD", quantity=10, average_cost=100 + index * 10,
            price=weight * 100, fx_rate=1, cost_basis=(100 + index * 10) * 10,
            market_value=weight * 1000, unrealized_pnl=weight * 1000 - (100 + index * 10) * 10,
            unrealized_pnl_percent=5, day_pnl=10, day_change_percent=1,
            weight_percent=weight, source="Quote mock", delayed=False,
        )
        for index, (symbol, weight) in enumerate(zip(SYMBOLS, WEIGHTS, strict=True))
    ]
    coverage = PortfolioCoverage(symbols_expected=11, symbols_available=11, coverage_percent=100)
    return PortfolioSnapshot(
        base_currency="CAD", benchmark="^GSPTSE", benchmark_name="S&P/TSX Composite",
        total_market_value=100000, total_cost_basis=sum(row.cost_basis for row in positions),
        total_unrealized_pnl=100000 - sum(row.cost_basis for row in positions),
        total_unrealized_pnl_percent=30, total_day_pnl=110, total_day_change_percent=0.11,
        portfolio_score=66, positions=positions,
        sector_allocation=[
            PortfolioAllocation(key="other", label="Autres", value=57000, weight_percent=57),
            PortfolioAllocation(key="finance", label="Finance", value=43000, weight_percent=43),
        ],
        currency_allocation=[PortfolioAllocation(key="CAD", label="CAD", value=100000, weight_percent=100)],
        performance=[], risk=PortfolioRisk(volatility_percent=22, beta=1.2, max_drawdown_percent=-19,
            sharpe_ratio=0.8, concentration_hhi=0.2, top_position_percent=36, top_three_percent=63,
            diversification_score=58, risk_level="Élevé", history_coverage_percent=92, history_observations=180),
        contributors=[PortfolioContributor(symbol="MU", name="MU", value=80, value_percent=1, kind="day")],
        detractors=[PortfolioContributor(symbol="RY", name="RY", value=-20, value_percent=-1, kind="day")],
        performance_horizons=[
            PortfolioHorizonResult(horizon=horizon, return_percent=return_value,
                benchmark_return_percent=benchmark, excess_return_percent=return_value - benchmark,
                coverage=coverage, methodology="observed_day" if horizon == "1d" else "current_positions_reconstructed")
            for horizon, return_value, benchmark in
            [("1d", 0.2, 0.1), ("1m", -2, 1), ("3m", 5, 4), ("ytd", 7, 6), ("1y", 11, 9)]
        ],
        contribution_horizons=[PortfolioContributionResult(horizon="1m", coverage=coverage,
            methodology="current_positions_reconstructed", items=[
                PortfolioHorizonContribution(symbol="MU", contribution_percent=-1.2,
                    security_return_percent=-3.3, current_weight_percent=36),
                PortfolioHorizonContribution(symbol="RY", contribution_percent=0.4,
                    security_return_percent=10, current_weight_percent=4),
            ])],
        correlation=PortfolioCorrelationMatrix(symbols=["MU", "RY"],
            values=[[1, 0.25], [0.25, 1]], observations=[[180, 180], [180, 180]],
            average_correlation=0.25, highest_pair=("MU", "RY", 0.25), lowest_pair=("MU", "RY", 0.25)),
        stress_tests=[
            PortfolioStressTest(key=key, label=label, shock=-10, shock_unit="percent",
                estimated_portfolio_change_percent=impact, coverage=coverage, methodology="historical sensitivity")
            for key, label, impact in
            [("wti", "Pétrole WTI", -1.2), ("cad_usd", "CAD/USD", 0.7), ("canada_10y", "Taux 10 ans", -0.8)]
        ],
        risk_reading=["Concentration en tête observée"], methodology="Poids de marché courants et historique reconstitué",
        notes=["Les classifications sectorielles sont partielles"], generated_at=NOW,
    )


def ask(message: str, conversation_id=None) -> UnifiedAssistantRequest:
    return UnifiedAssistantRequest(
        message=message,
        context=AssistantContext(surface="portfolio", route="/portefeuille",
            portfolio_scope={"authorized": True, "position_count": len(SYMBOLS)}),
        conversation_id=conversation_id, portfolio_consent=True,
        portfolio_positions=[{"symbol": symbol, "quantity": 10, "average_cost": 100 + index * 10}
                             for index, symbol in enumerate(SYMBOLS)],
    )


def test_snapshot_bundle_separates_market_value_cost_and_unknown_sector():
    snapshot = sample_snapshot()
    bundle = build_portfolio_research_bundle(snapshot, requested_count=11)
    answer = format_portfolio_research(bundle, snapshot)
    assert bundle.position_rows[0].symbol == "MU"
    assert bundle.position_rows[0].weight_percent == 36
    assert snapshot.positions[0].cost_basis != snapshot.positions[0].market_value
    assert bundle.position_rows[0].market_value == 36000
    assert "36.0 % du portefeuille" in answer
    assert "Coût d’achat total" in answer and "Valeur de marché actuelle" in answer
    assert "Cumul des trois premières" in answer and "Cumul des cinq premières" in answer
    assert "Positions moins de 1 %" in answer
    assert "Couverture classification sectorielle :** 43.0 %" in answer
    assert "Secteur dominant :** Autres" not in answer
    assert "Couverture sectorielle partielle" in answer
    for label in ("Volatilité annualisée", "Bêta", "Repli maximal", "Ratio de Sharpe",
                  "Indice de concentration HHI", "Score de diversification"):
        assert label in answer
    for horizon in ("1D", "1M", "3M", "YTD", "1A"):
        assert f"{horizon} portefeuille" in answer
        assert f"{horizon} indice de référence" in answer
        assert f"{horizon} écart" in answer
        assert f"{horizon} couverture" in answer
    for scenario in ("Pétrole WTI", "CAD/USD", "Taux 10 ans"):
        assert scenario in answer
    assert "scénario, pas prévision" in answer
    assert "+ 1 autres positions" in answer
    assert "## Sources et fraîcheur" in answer
    for forbidden in ("vous devriez vendre", "vous devriez acheter", "alléger", "renforcer", "rebalancer",
                      "prendre des profits", "DCA", "buy the dip", "target allocation"):
        assert forbidden.casefold() not in answer.casefold()


@pytest.mark.asyncio
async def test_provider_writes_portfolio_analysis_without_raw_positions():
    snapshot = sample_snapshot()
    bundle = build_portfolio_research_bundle(snapshot)
    prompts = []
    async def provider(**kwargs):
        prompts.append(kwargs["prompt"])
        return SimpleNamespace(success=True, provider="anthropic", model="mock",
            answer=json.dumps({"answer_markdown": "## Radiographie\n- Les poids de marché sont calculés.",
                               "used_fact_ids": ["F1"], "used_source_ids": [],
                               "missing_data_ids": [], "follow_up_prompts": []}))
    answer = await generate_portfolio_research_from_evidence(
        bundle, snapshot, "Mon coût unitaire MU est de 100, que penses-tu de mon portefeuille ?", SimpleNamespace(generate_internal_evidence=provider))
    assert "## Radiographie" in answer
    assert "Mon coût unitaire" not in prompts[0]
    assert "100, que penses-tu" not in prompts[0]
    assert "total_cost_basis" not in prompts[0] and "average_cost" not in prompts[0]
    assert '"quantity"' not in prompts[0]
    async def invalid(**_kwargs):
        return SimpleNamespace(success=True, answer="[999999]")
    fallback = await generate_portfolio_research_from_evidence(bundle, snapshot, "Portefeuille ?", SimpleNamespace(generate_internal_evidence=invalid))
    assert "## Vue d’ensemble" in fallback
    assert "## Points saillants" not in fallback


@pytest.mark.asyncio
async def test_deep_portfolio_and_followups_use_one_snapshot_each(monkeypatch):
    snapshot = sample_snapshot()
    calls = []
    async def analyze(request):
        calls.append(request)
        return snapshot
    async def no_provider(**_kwargs):
        return None
    async def holdings(_symbol, limit=25):
        return SimpleNamespace(holdings=[SimpleNamespace(display_symbol="RY", weight_percent=6)],
            sectors=[], source_name="ETF mock", source_url=None, stale=True, generated_at=NOW)
    async def news(_symbol, **_kwargs):
        return SimpleNamespace(items=[SimpleNamespace(title="Résultats publiés", published_at=NOW,
            publisher="Nouvelles mock", url="https://example.com/news")])
    monkeypatch.setattr(portfolio_service, "analyze", analyze)
    monkeypatch.setattr(provider_router, "generate_internal_evidence", no_provider)
    monkeypatch.setattr(etf_holdings_service, "snapshot", holdings)
    monkeypatch.setattr(stock_news_service, "get_snapshot", news)
    orchestrator = AnatoleAssistantOrchestrator()
    first = await orchestrator.answer(ask("Que penses-tu de mon portefeuille ?"))
    assert first.intent == "portfolio_analysis"
    assert all(section in first.answer for section in
               ("Vue d’ensemble", "Répartition du portefeuille", "Concentration", "Risque",
                "Performance", "Points de vigilance", "Sources et fraîcheur"))
    assert first.actions[0].href == "/portefeuille"
    assert first.evidence[0].position_rows[0].weight_percent == 36
    assert any(source.freshness == "stale" for source in first.evidence[0].sources)
    for question, expected in [
        ("Et ma diversification ?", "Diversification"),
        ("Quelles positions contribuent le plus au risque ?", "Contributeurs"),
        ("Et face à une baisse du pétrole ?", "Pétrole WTI"),
        ("Pourquoi ai-je sous-performé le TSX ce mois-ci ?", "1M écart"),
        ("Quelles nouvelles touchent mes positions ?", "Actualités des positions"),
    ]:
        reply = await orchestrator.answer(ask(question, first.conversation_id))
        assert reply.intent == "portfolio_analysis"
        assert expected in reply.answer
    assert len(calls) == 6


def test_v12_lookthrough_aggregates_direct_and_two_etfs_without_claiming_full_coverage():
    positions = [SimpleNamespace(symbol="RY", weight_percent=20),
                 SimpleNamespace(symbol="XIC", weight_percent=30),
                 SimpleNamespace(symbol="VFV", weight_percent=50)]
    def holdings(rows):
        return SimpleNamespace(
            holdings=[SimpleNamespace(display_symbol=symbol, weight_percent=weight)
                      for symbol, weight in rows],
            sectors=[], source_name="ETF officiel", generated_at=NOW, stale=False, official=True,
        )
    summary = build_lookthrough_summary(positions, {"XIC", "VFV"}, {
        "XIC": holdings([("RY", 6), ("TD", 4)]),
        "VFV": holdings([("RY", 2), ("AAPL", 8)]),
    })
    ry = next(row for row in summary.holdings if row.symbol == "RY")
    assert ry.direct_weight_percent == 20
    assert ry.indirect_observed_weight_percent == pytest.approx(2.8)
    assert ry.combined_observed_weight_percent == pytest.approx(22.8)
    assert ry.source_etfs == ["VFV", "XIC"]
    assert summary.holdings_coverage_percent == 10
    assert summary.status == "partial"
    assert {row.kind for row in summary.overlaps if row.symbol == "RY"} == {"direct_etf", "etf_etf"}
    assert sum(row.indirect_observed_weight_percent for row in summary.holdings) == pytest.approx(8)
    missing = build_lookthrough_summary(positions, {"XIC", "VFV"}, {"XIC": holdings([("RY", 6)])})
    assert missing.holdings_coverage_percent == pytest.approx(2.25)


def test_v12_watchtower_delta_is_aggregate_only_and_session_bounded():
    earlier = PortfolioWatchtowerAggregate(timestamp=NOW, total_market_value=100000,
        top_three_percent=60, volatility_percent=18, top_cluster_weight_percent=40,
        coverage_fingerprints={"history": 90})
    later = PortfolioWatchtowerAggregate(timestamp=NOW.replace(hour=1), total_market_value=101000,
        top_three_percent=72, volatility_percent=24, top_cluster_weight_percent=55,
        coverage_fingerprints={"history": 95})
    delta = build_watchtower_delta(earlier, later)
    assert delta.previous_available and delta.elapsed_seconds == 3600
    assert delta.changes["top_three_percent"] == 12
    assert delta.changes["volatility_percent"] == 6
    assert delta.changes["top_cluster_weight_percent"] == 15
    assert delta.changes["coverage_history"] == 5
    assert not any(key in earlier.model_dump() for key in ("positions", "quantities", "average_cost", "cost_basis"))
    assert not build_watchtower_delta(None, earlier).previous_available


@pytest.mark.asyncio
async def test_v12_full_portfolio_conversation_macro_custom_stress_and_privacy(monkeypatch):
    snapshot = sample_snapshot()
    positions = snapshot.positions
    history = {}
    for index, row in enumerate(positions):
        price = 100.0
        candles = []
        for day in range(95):
            price *= 1 + .002 + .008 * __import__("math").sin(day * .2 + index * .4)
            candles.append(Candle(time=1_700_000_000 + day * 86_400, open=price,
                                  high=price, low=price, close=price, volume=1000))
        history[row.symbol] = candles
    risk = build_risk_contributions(positions, history)
    assert risk.items
    snapshot = snapshot.model_copy(update={
        "risk_contributions": risk,
        "factor_sensitivities": [
            PortfolioFactorSensitivity(symbol=row.symbol, factor="wti", beta=1, observations=80)
            for row in positions
        ],
        "correlation_clusters": [PortfolioCorrelationCluster(
            label="Cluster corrélé 1", symbols=["MU", "VFV", "IMG"],
            combined_weight_percent=63, average_internal_correlation=.78,
            observations=80, coverage_percent=100)],
        "attribution": build_attribution(positions, snapshot.performance_horizons,
                                         snapshot.contribution_horizons),
    })
    calls = []
    async def analyze(_request):
        calls.append("snapshot")
        return snapshot
    async def no_provider(**_kwargs):
        return None
    async def holdings(symbol, limit=25):
        rows = [SimpleNamespace(display_symbol="RY", weight_percent=6),
                SimpleNamespace(display_symbol="TD", weight_percent=4)] if symbol == "XIC" else [
                    SimpleNamespace(display_symbol="MU", weight_percent=3)]
        return SimpleNamespace(holdings=rows, sectors=[], source_name="ETF mock",
            source_url=None, stale=False, generated_at=NOW, official=True)
    async def canada(**_kwargs):
        return SimpleNamespace(answer="Inflation et taux publiés par les sources officielles.",
            conversation_id="00000000-0000-4000-8000-000000000001", history=[],
            links=[SimpleNamespace(agency="Banque du Canada", label="Taux", url="https://www.banqueducanada.ca")])
    monkeypatch.setattr(portfolio_service, "analyze", analyze)
    monkeypatch.setattr(provider_router, "generate_internal_evidence", no_provider)
    monkeypatch.setattr(etf_holdings_service, "snapshot", holdings)
    from app.services.canada_360_assistant import canada_360_assistant_service
    monkeypatch.setattr(canada_360_assistant_service, "answer", canada)
    orchestrator = AnatoleAssistantOrchestrator()
    questions = [
        ("Que penses-tu de mon portefeuille ?", "overview", "Radiographie"),
        ("Pourquoi ?", "overview", "Radiographie"),
        ("Et ma diversification ?", "diversification", "Diversification et clusters"),
        ("Quelle position explique le plus mon risque ?", "risk_contribution", "Où se trouve réellement le risque"),
        ("Et si le pétrole chute de 20 % ?", "stress", "wti -20.0 %"),
        ("Quels risques macro canadiens touchent mes positions ?", "macro", "Contexte macro Canada 360"),
        ("Qu’est-ce qui a changé depuis la dernière analyse ?", "watchtower", "Ce qui a changé"),
    ]
    conversation_id = None
    for message, focus, marker in questions:
        reply = await orchestrator.answer(ask(message, conversation_id))
        conversation_id = reply.conversation_id
        assert reply.intent == "portfolio_analysis"
        assert reply.evidence[0].portfolio_focus == focus
        assert marker in reply.answer
    assert len(calls) == len(questions)
    assert reply.evidence[0].watchtower.previous_available
    assert "quantities" not in str(orchestrator._sessions[conversation_id].portfolio_previous.model_dump())
    assert "average_cost" not in str(orchestrator._sessions[conversation_id].portfolio_previous.model_dump())
    fresh = await orchestrator.answer(ask("Que penses-tu de mon portefeuille ?"))
    assert not fresh.evidence[0].watchtower.previous_available
    macro_reply = await orchestrator.answer(ask("Quels risques macro canadiens touchent mes positions ?", conversation_id))
    assert any(row.skill == "canada360" for row in macro_reply.evidence)
    assert any(source.label == "Banque du Canada" for row in macro_reply.evidence
               for source in row.sources)
    assert all(exposure.factor in {"tsx", "wti", "cad_usd", "canada_10y"}
               for exposure in macro_reply.evidence[0].macro_exposures)
