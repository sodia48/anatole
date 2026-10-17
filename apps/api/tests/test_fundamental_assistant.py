"""The four research questions use public, sourced tools through the real orchestrator."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.assistant_context import AssistantContext, NavigationAction, UnifiedAssistantRequest
from app.schemas.fundamental_documents import DocumentComparison, DocumentPassage, FundamentalDocumentResearch
from app.schemas.fundamental_intelligence import PeerComparison, PeerMeasureComparison, PeerMeasureValue
from app.services.anatole_assistant_orchestrator import AnatoleAssistantOrchestrator
from app.services.fundamental_assistant import answer_fundamental_question
from app.services.canada_360_providers import provider_router
from app.services.fundamentals import fundamentals_service
from app.services.market_data import market_data_service
from app.services.stock_news import stock_news_service
from test_fundamental_intelligence import sample_snapshot


@pytest.fixture
def research_tools(monkeypatch):
    snapshot = sample_snapshot()
    snapshot.stale = True
    snapshot.refresh_in_progress = True

    async def fundamentals(_ticker):
        return snapshot

    async def unavailable(*_args, **_kwargs):
        raise RuntimeError("secondary provider unavailable")

    async def no_provider(**_kwargs):
        return None

    monkeypatch.setattr(fundamentals_service, "get_snapshot", fundamentals)
    monkeypatch.setattr(market_data_service, "get_focus_snapshot", unavailable)
    monkeypatch.setattr(stock_news_service, "get_snapshot", unavailable)
    monkeypatch.setattr(provider_router, "generate_internal_evidence", no_provider)
    return snapshot


def _request(message: str) -> UnifiedAssistantRequest:
    return UnifiedAssistantRequest(message=message,
        context=AssistantContext(surface="stock", route="/focus/TEST", symbol="TEST"))


@pytest.mark.asyncio
async def test_earnings_cash_divergence_keeps_periods_sources_and_no_causal_claim(research_tools):
    result = await AnatoleAssistantOrchestrator().answer(_request(
        "Pourquoi les bénéfices progressent alors que les flux de trésorerie diminuent ?"))
    assert result.intent == "stock_analysis"
    assert "## Faits et calculs observés" in result.answer
    assert "## Interprétation" in result.answer
    assert "divergence est observée" in result.answer
    assert "ne prouve pas sa cause" in result.answer
    assert "2025-12-31" in result.answer and "2024-12-31" in result.answer
    assert any(fact.source == "Issuer annual report" for fact in result.evidence[0].facts)
    assert any(source.freshness == "stale" for source in result.evidence[0].sources)
    assert all(source.status in {"live", "delayed", "fallback", "internal"} for source in result.sources)
    assert result.actions[1].href == "/focus/TEST?view=diagnostic"


@pytest.mark.asyncio
async def test_requested_revenue_shock_uses_shared_scenario_and_exposes_missing_inputs(research_tools):
    result = await AnatoleAssistantOrchestrator().answer(_request(
        "Que deviendraient les ratios si les revenus diminuaient de 15 % ?"))
    assert "Scénario illustratif : revenus −15 %" in result.answer
    assert "1 020.00 CAD" in result.answer
    assert "Marge opérationnelle simulée" in result.answer
    assert "Bénéfice net simulé" in result.answer
    assert "Données manquantes" in result.answer
    assert "prévision" in result.answer
    assert result.actions[1].href == "/focus/TEST?view=scenarios"
    assert any(fact.label == "Revenus simulés" for fact in result.evidence[0].facts)


@pytest.mark.asyncio
async def test_peer_comparison_uses_sample_threshold_not_invented_ranking(research_tools, monkeypatch):
    async def peers(_symbol):
        return PeerComparison(target="TEST.TO", sector="Industrials", sector_family="industrial",
            universe_source="TSX", candidates=[], selected=["ONE"], measures=[PeerMeasureComparison(
                key="operating_margin", label_fr="Marge opérationnelle", label_en="Operating margin",
                basis="annual", unit="percent", values=[PeerMeasureValue(ticker="TEST.TO", value=15,
                    period_end=datetime(2025, 12, 31, tzinfo=UTC), source_name="Issuer annual report",
                    source_url="https://issuer.example/reports/2025.pdf", source_confidence="official")],
                sample_size=2, minimum_sample_size=6, explanation_fr="Échantillon insuffisant",
                explanation_en="Insufficient sample")], method_fr="Même secteur", method_en="Same sector")
    monkeypatch.setattr("app.services.fundamental_assistant.peer_comparison", peers)
    result = await AnatoleAssistantOrchestrator().answer(_request("Comment cette société se compare aux concurrents ?"))
    assert "médiane non calculable" in result.answer
    assert "minimum 6" in result.answer
    assert result.actions[1].href == "/focus/TEST?view=peers"
    assert any(fact.label == "Marge opérationnelle" for fact in result.evidence[0].facts)


@pytest.mark.asyncio
async def test_report_changes_only_claims_verified_excerpt_difference(research_tools, monkeypatch):
    def passage(year, excerpt):
        return DocumentPassage(document_url=f"https://issuer.example/{year}.pdf",
            document_title=f"Annual report {year}", document_type="annual",
            published_at=datetime(year + 1, 2, 1, tzinfo=UTC), page_number=20,
            topic="results", excerpt=excerpt)

    async def documents(_snapshot):
        return FundamentalDocumentResearch(ticker="TEST.TO", status="available",
            comparisons=[DocumentComparison(topic="results", current=passage(2025, "Revenue rose."),
                                            previous=passage(2024, "Revenue was stable."))])
    monkeypatch.setattr("app.services.fundamental_assistant.research_official_documents", documents)
    result = await AnatoleAssistantOrchestrator().answer(_request(
        "Quels éléments ont le plus changé depuis le dernier rapport annuel ?"))
    assert "extrait différent" in result.answer
    assert "demande une lecture" in result.answer
    assert len([source for source in result.evidence[0].sources if source.type == "issuer_document"]) == 2
    assert result.actions[1].href == "/focus/TEST?view=documents"


def test_focus_deep_link_is_allowlisted():
    assert NavigationAction(label="Diagnostic", href="/focus/TEST?view=diagnostic").href.endswith("diagnostic")
    with pytest.raises(ValidationError):
        NavigationAction(label="Unsafe", href="/focus/TEST?view=diagnostic&next=https://evil.example")


@pytest.mark.asyncio
async def test_incompatible_currencies_do_not_confirm_divergence():
    snapshot = sample_snapshot()
    snapshot.annual_financials[1].currency = "USD"
    result = await answer_fundamental_question(snapshot,
        "Pourquoi les bénéfices progressent alors que les flux de trésorerie diminuent ?")
    assert result is not None
    assert "n'est pas confirmée" in result.text
    assert "divergence est observée" not in result.text


@pytest.mark.asyncio
async def test_unverifiable_annual_report_comparison_is_explicit():
    result = await answer_fundamental_question(sample_snapshot(),
        "Quels éléments ont le plus changé depuis le dernier rapport annuel ?")
    assert result is not None
    assert "Aucune comparaison vérifiable" in result.text
    assert result.missing


def test_real_http_assistant_research_response(research_tools):
    response = TestClient(app).post("/api/v1/assistant/chat", json={
        "message": "Pourquoi les bénéfices progressent alors que les flux de trésorerie diminuent pour TEST ?",
        "context": {"surface": "stock", "route": "/focus/TEST", "symbol": "TEST", "language": "fr"},
    })
    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "stock_analysis"
    assert "Faits et calculs observés" in body["answer"]
    assert any(source["freshness"] == "stale" for source in body["evidence"][0]["sources"])
