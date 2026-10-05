"""Global assistant dispatch, evidence, consent and navigation boundaries."""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.assistant_context import AssistantContext, NavigationAction, UnifiedAssistantRequest
from app.schemas.workspace import AssistantFact, AssistantSource
from app.services.anatole_assistant_orchestrator import AnatoleAssistantOrchestrator, _clean_symbols
from app.services.assistant import assistant_service
from app.services.canada_360_assistant import canada_360_assistant_service
from app.services.canada_360_providers import provider_router
from app.services.canada_360_providers import ProviderResult
from app.services.etf_holdings import etf_holdings_service
from app.services.fundamentals import fundamentals_service
from app.services.portfolio import portfolio_service
from app.services.stock_news import stock_news_service
from app.services.news import news_service


NOW = datetime(2026, 10, 1, tzinfo=UTC)
POSITIONS = [{"symbol": "SHOP", "quantity": 2, "average_cost": 30}]


@pytest.fixture
def unit(monkeypatch: pytest.MonkeyPatch) -> AnatoleAssistantOrchestrator:
    async def no_provider(**_kwargs):
        return None

    monkeypatch.setattr(provider_router, "generate_internal_evidence", no_provider)
    return AnatoleAssistantOrchestrator()


def request(message: str, *, surface: str = "other", symbol: str | None = None,
            conversation_id=None, consent=False, positions=None) -> UnifiedAssistantRequest:
    route = {"stock": f"/focus/{symbol}", "etf": f"/etf/{symbol}", "portfolio": "/portefeuille", "news": "/actualites",
             "canada360": "/canada", "compare": "/comparateur"}.get(surface, "/assistant")
    return UnifiedAssistantRequest(message=message,
                                   context=AssistantContext(surface=surface, route=route, symbol=symbol),
                                   conversation_id=conversation_id, portfolio_consent=consent,
                                   portfolio_positions=positions or [])


@pytest.fixture
def stock_tools(monkeypatch: pytest.MonkeyPatch, unit: AnatoleAssistantOrchestrator):
    seen: list[str] = []

    async def ticker(symbol):
        seen.append(symbol)
        return unit._simple("stock_analysis", symbol, f"Analyse {symbol} : prix 100 CAD.",
                            facts=[AssistantFact(label="Prix", value="100 CAD")],
                            sources=[AssistantSource(label="Quote source", detail="Observed", status="delayed")])

    async def unavailable(*_args, **_kwargs):
        raise RuntimeError("upstream unavailable")

    monkeypatch.setattr(assistant_service, "_ticker", ticker)
    monkeypatch.setattr(fundamentals_service, "get_snapshot", unavailable)
    monkeypatch.setattr(stock_news_service, "get_snapshot", unavailable)
    return seen


@pytest.mark.asyncio
async def test_focus_followup_and_compare_keep_shop(unit, stock_tools, monkeypatch):
    first = await unit.answer(request("Analyse ce titre", surface="stock", symbol="SHOP"))
    second = await unit.answer(request("Pourquoi il baisse ?", conversation_id=first.conversation_id))
    assert first.intent == second.intent == "stock_analysis"
    assert stock_tools == ["SHOP", "SHOP"]
    assert first.actions[0].href == "/focus/SHOP"

    async def compare(symbols):
        assert symbols == ["SHOP", "LSPD"]
        return unit._simple("compare", "Comparaison", "SHOP et LSPD", sources=[AssistantSource(label="Comparateur", detail="1 an", status="internal")])

    monkeypatch.setattr(assistant_service, "_compare", compare)
    third = await unit.answer(request("Compare-le à LSPD", conversation_id=first.conversation_id))
    assert third.intent == "compare"
    assert third.actions[0].href == "/comparateur?symbols=SHOP,LSPD"


@pytest.mark.asyncio
async def test_explicit_new_symbol_overrides_page_context(unit, stock_tools):
    result = await unit.answer(request("Analyse LSPD", surface="stock", symbol="SHOP"))
    assert result.intent == "stock_analysis"
    assert stock_tools == ["LSPD"]
    assert result.actions[0].href == "/focus/LSPD"


def test_two_symbols_survive_macro_followup_from_focus_page():
    context = AssistantContext(surface="stock", route="/focus/SHOP", symbol="SHOP", symbols=["SHOP"])
    assert _clean_symbols("Quels risques macro canadiens touchent les deux ?", context, ["SHOP", "LSPD"]) == ["SHOP", "LSPD"]


@pytest.mark.asyncio
async def test_market_question_ignores_stock_page_and_old_symbol(unit, stock_tools, monkeypatch):
    async def market():
        return unit._simple("market", "Marché", "Le marché canadien est observé.",
                            sources=[AssistantSource(label="Terminal", detail="observed", status="internal")])
    monkeypatch.setattr(assistant_service, "_market", market)
    first = await unit.answer(request("Analyse ce titre", surface="stock", symbol="SHOP"))
    second = await unit.answer(request("Quel est le régime du marché ?", surface="stock", symbol="SHOP",
                                       conversation_id=first.conversation_id))
    assert second.intent == "market_analysis"
    assert stock_tools == ["SHOP"]


@pytest.mark.asyncio
async def test_etf_context_has_real_holdings_and_freshness(unit, monkeypatch):
    async def snapshot(_symbol, limit=10):
        return SimpleNamespace(name="iShares XIC", provider="iShares", category="Canada", exposure="TSX",
                               holdings=[SimpleNamespace(display_symbol="RY", weight_percent=6.5)],
                               top_holdings_weight_percent=6.5, sectors=[], regions=[],
                               source_name="Fund data", source_url="https://example.com/fund", stale=False,
                               generated_at=NOW)
    monkeypatch.setattr(etf_holdings_service, "snapshot", snapshot)
    async def quote(_symbol):
        return unit._simple("ticker", "XIC", "XIC cote 40 CAD.",
                            facts=[AssistantFact(label="Prix", value="40 CAD")],
                            sources=[AssistantSource(label="Quote source", detail="Observed", status="delayed")])
    monkeypatch.setattr(assistant_service, "_ticker", quote)
    result = await unit.answer(request("Quels sont ses principaux holdings ?", surface="etf", symbol="XIC"))
    assert result.intent == "etf_analysis"
    assert "RY" in result.answer and "iShares" in result.answer
    assert result.evidence[0].facts[0].freshness == "delayed"
    assert result.actions[0].href == "/etf/XIC"


@pytest.mark.asyncio
async def test_portfolio_requires_consent_and_never_calls_service_first(unit, monkeypatch):
    async def forbidden(_request):
        raise AssertionError("positions accessed without consent")
    monkeypatch.setattr(portfolio_service, "analyze", forbidden)
    result = await unit.answer(request("Quels sont mes principaux risques ?", surface="portfolio", positions=POSITIONS))
    assert result.permission_required
    assert not result.evidence[0].entities
    assert "Autoriser" in result.answer


@pytest.mark.asyncio
async def test_expired_conversation_requires_new_portfolio_permission(unit, monkeypatch):
    async def forbidden(_request):
        raise AssertionError("expired session accessed portfolio")
    monkeypatch.setattr(portfolio_service, "analyze", forbidden)
    first = await unit.answer(request("Mes risques ?", surface="portfolio"))
    unit._sessions[first.conversation_id].expires_at = 0
    second = await unit.answer(request("Mes risques ?", surface="portfolio", conversation_id=first.conversation_id,
                                       consent=True, positions=POSITIONS))
    assert second.permission_required
    assert second.conversation_id != first.conversation_id


@pytest.mark.asyncio
async def test_portfolio_granted_has_sourced_concentration_and_overlap(unit, monkeypatch, caplog):
    async def analyze(payload):
        assert payload.positions[0].symbol == "SHOP"
        return SimpleNamespace(positions=[SimpleNamespace(symbol="SHOP", weight_percent=70, market="CA")],
                               risk=SimpleNamespace(top_position_percent=70, volatility_percent=20),
                               sector_allocation=[SimpleNamespace(label="Technologie", weight_percent=70)],
                               stress_tests=[], generated_at=NOW, benchmark="^GSPTSE")

    async def holdings(_symbol, limit=25):
        return SimpleNamespace(holdings=[SimpleNamespace(display_symbol="SHOP", weight_percent=2.5)],
                               source_name="Fund data", source_url=None, stale=False, generated_at=NOW)

    monkeypatch.setattr(portfolio_service, "analyze", analyze)
    monkeypatch.setattr(etf_holdings_service, "snapshot", holdings)
    result = await unit.answer(request("Est-ce que XIC chevauche mon portefeuille ?", surface="portfolio",
                                       consent=True, positions=POSITIONS))
    assert result.intent == "portfolio_analysis"
    assert "1 position(s) commune(s)" in result.answer
    assert any(f.label == "Secteur dominant" and f.source == "Portefeuille Anatole" for f in result.evidence[0].facts)
    assert "Couverture observée" in result.answer
    assert "quantity" not in caplog.text and "average_cost" not in caplog.text


@pytest.mark.asyncio
async def test_government_and_mixed_macro_stock(unit, stock_tools, monkeypatch):
    async def canada(**_kwargs):
        return SimpleNamespace(answer="Inflation canadienne 2 % selon StatCan.", conversation_id="00000000-0000-4000-8000-000000000001",
                               links=[SimpleNamespace(label="StatCan", agency="StatCan", url="https://www.statcan.gc.ca")])
    monkeypatch.setattr(canada_360_assistant_service, "answer", canada)
    government = await unit.answer(request("Quel est le taux de chômage au Canada ?", surface="canada360"))
    assert government.intent == "canada360"
    mixed = await unit.answer(request("Quel impact de l'inflation canadienne sur SHOP ?", surface="stock", symbol="SHOP"))
    assert {row.skill for row in mixed.evidence} == {"canada360", "stock_analysis"}
    assert "Scénario, pas prévision" in mixed.answer


@pytest.mark.asyncio
async def test_canada360_switches_to_portfolio_then_back_to_government(unit, monkeypatch):
    government_questions: list[str] = []
    portfolio_calls: list[int] = []

    async def canada(**kwargs):
        government_questions.append(kwargs["question"])
        return SimpleNamespace(answer="Réponse officielle sourcée.",
                               conversation_id="00000000-0000-4000-8000-000000000001", history=[],
                               links=[SimpleNamespace(label="Canada", agency="Canada", url="https://www.canada.ca")])

    async def analyze(payload):
        portfolio_calls.append(len(payload.positions))
        return SimpleNamespace(positions=[SimpleNamespace(symbol="SHOP", weight_percent=70, market="CA")],
                               risk=SimpleNamespace(top_position_percent=70, volatility_percent=20),
                               sector_allocation=[], stress_tests=[], generated_at=NOW, benchmark="^GSPTSE")

    monkeypatch.setattr(canada_360_assistant_service, "answer", canada)
    monkeypatch.setattr(portfolio_service, "analyze", analyze)
    first = await unit.answer(request("Quel est le taux de chômage au Canada ?", surface="canada360"))
    prompt = await unit.answer(request("je parle de mon portefeuille personnel de placement dans anatole",
                                       surface="canada360", conversation_id=first.conversation_id))
    assert prompt.intent == "portfolio_analysis" and prompt.permission_required
    assert government_questions == ["Quel est le taux de chômage au Canada ?"]
    assert portfolio_calls == []
    granted = await unit.answer(request("je parle de mon portefeuille personnel de placement dans anatole",
                                        surface="canada360", conversation_id=prompt.conversation_id,
                                        consent=True, positions=POSITIONS))
    followup = await unit.answer(request("penses-tu que la repartition est bien faite ?", surface="canada360",
                                         conversation_id=granted.conversation_id, consent=True, positions=POSITIONS))
    assert granted.intent == followup.intent == "portfolio_analysis"
    assert "horizon" in followup.answer and portfolio_calls == [1, 1]
    province = await unit.answer(request("Et au Québec ?", surface="canada360",
                                         conversation_id=followup.conversation_id))
    assert province.intent == "canada360" and len(government_questions) == 2


@pytest.mark.asyncio
async def test_canada360_explicit_etf_beats_government_surface(unit, monkeypatch):
    async def forbidden(**_kwargs):
        raise AssertionError("government service must not receive an ETF question")

    async def snapshot(_symbol, limit=10):
        return SimpleNamespace(name="XIC", provider="iShares", category="Canada", exposure="TSX",
                               holdings=[], top_holdings_weight_percent=None, sectors=[], regions=[],
                               source_name="Fund data", source_url=None, stale=False, generated_at=NOW)

    async def quote(_symbol):
        return unit._simple("ticker", "XIC", "Prix indisponible")

    monkeypatch.setattr(canada_360_assistant_service, "answer", forbidden)
    monkeypatch.setattr(etf_holdings_service, "snapshot", snapshot)
    monkeypatch.setattr(assistant_service, "_ticker", quote)
    result = await unit.answer(request("Quels sont les risques de l'ETF XIC ?", surface="canada360"))
    assert result.intent == "etf_analysis"


@pytest.mark.asyncio
async def test_news_surface_uses_sourced_feed_only(unit, monkeypatch):
    async def snapshot(_language):
        return SimpleNamespace(items=[SimpleNamespace(title="Décision de taux publiée", source="Banque du Canada",
                                                      published_at=NOW, url="https://www.banqueducanada.ca")],
                               generated_at=NOW)
    monkeypatch.setattr(news_service, "get_snapshot", snapshot)
    result = await unit.answer(request("Quelles actualités ?", surface="news"))
    assert result.intent == "news_context"
    assert "Décision de taux publiée" in result.answer
    assert result.evidence[0].sources[0].type == "news"
    assert result.actions[0].href == "/actualites"


@pytest.mark.asyncio
async def test_guardrail_and_provider_fallback(unit, stock_tools):
    refusal = await unit.answer(request("Quelle action dois-je acheter ?"))
    assert refusal.guardrail_triggered and refusal.intent == "guardrail"
    stock = await unit.answer(request("Analyse SHOP", surface="stock", symbol="SHOP"))
    assert "Analyse SHOP" in stock.answer
    assert stock.evidence[0].sources[0].freshness == "delayed"


@pytest.mark.asyncio
async def test_demo_quote_is_not_presented_as_real(unit, stock_tools, monkeypatch):
    async def demo(symbol):
        return unit._simple("ticker", symbol, "Prix 999 CAD", facts=[AssistantFact(label="Prix", value="999 CAD")],
                            sources=[AssistantSource(label="demo", detail="fallback", status="fallback")])
    monkeypatch.setattr(assistant_service, "_ticker", demo)
    result = await unit.answer(request("Analyse SHOP", surface="stock", symbol="SHOP"))
    assert "999" not in result.answer
    assert result.evidence[0].facts == []
    assert "Cotation réelle indisponible" in result.evidence[0].missing_data


@pytest.mark.asyncio
async def test_internal_provider_mode_never_enables_search_or_storage(monkeypatch):
    captured = {}

    async def post(**kwargs):
        captured.update(kwargs["payload"])
        return {"output": [{"type": "message", "content": [{"type": "output_text", "text": "Données observées."}]}]}

    monkeypatch.setattr(provider_router, "available", lambda: [SimpleNamespace(name="openai", model="test", api_key="fake")])
    monkeypatch.setattr("app.services.canada_360_providers._post_json", post)
    result = await provider_router.generate_internal_evidence(prompt="Faits internes seulement")
    assert result and result.success
    assert "tools" not in captured and captured["store"] is False


@pytest.mark.asyncio
async def test_provider_unsupported_number_uses_deterministic_answer(unit, stock_tools, monkeypatch):
    async def invented(**_kwargs):
        return ProviderResult(provider="openai", model="test", answer="Prix 999 CAD.", success=True)
    monkeypatch.setattr(provider_router, "generate_internal_evidence", invented)
    result = await unit.answer(request("Analyse SHOP", surface="stock", symbol="SHOP"))
    assert "999" not in result.answer and "100 CAD" in result.answer


def test_context_navigation_and_portfolio_payload_are_bounded():
    assert AssistantContext(route="/aujourdhui").route == "/aujourdhui"
    with pytest.raises(ValidationError):
        AssistantContext(surface="stock", route="/focus/SHOP", symbol="SHOP;DROP")
    with pytest.raises(ValidationError):
        AssistantContext(route="https://external.example")
    for href in ("javascript:alert(1)", "https://example.com", "/paper/trade", "/focus/SHOP?next=evil", "/focus/.."):
        with pytest.raises(ValidationError):
            NavigationAction(label="unsafe", href=href)
    with pytest.raises(ValidationError):
        request("risk", consent=True, positions=[{"symbol": "A/B", "quantity": 1, "average_cost": 0}])


def test_endpoint_v2_and_legacy_still_exist():
    client = TestClient(app)
    response = client.post("/api/v1/assistant/chat", json={"message": "Quels sont mes risques ?", "context": {"surface": "portfolio", "route": "/portefeuille"}})
    assert response.status_code == 200
    assert response.json()["permission_required"] is True
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/workspace/assistant" in paths
