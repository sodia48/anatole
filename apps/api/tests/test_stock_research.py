"""Deterministic RY research fixtures: no live market values or provider calls."""

import json
from datetime import UTC, datetime, timedelta

import pytest

from app.schemas.fundamentals import (
    AnalystConsensus, CorporateEvents, FinancialHighlights, FinancialPeriod, FinancialSource,
    FundamentalMetrics, FundamentalSnapshot, OfficialCoverage, SectorMetric, TTMSummary,
)
from app.schemas.stocks import Candle, FocusSnapshot, Quote, StockNewsItem, StockNewsSnapshot, StockProfile, Technicals
from app.services.stock_research import build_stock_research_bundle, format_stock_research, generate_stock_research_from_evidence
from app.services.stock_sector_analysis import extract_official_bank_metrics, select_sector_metrics
from app.services.anatole_assistant_orchestrator import (
    AnatoleAssistantOrchestrator, _assistant_source_status, _evidence_source_to_assistant_source,
)
from app.schemas.assistant_context import EvidenceSource
from app.schemas.assistant_context import AssistantContext, UnifiedAssistantRequest
from app.services.market_data import market_data_service
from app.services.fundamentals import fundamentals_service
from app.services.stock_news import stock_news_service
from app.services.canada_360_providers import provider_router
from fastapi.testclient import TestClient
from app.main import app


NOW = datetime(2026, 9, 30, 20, tzinfo=UTC)
OFFICIAL = FinancialSource(source_type="issuer_official_document", source_name="RBC Investor Relations",
                           source_url="https://www.rbc.com/investor-relations/report.pdf",
                           filed_at=NOW - timedelta(days=10), confidence="official")


def fixtures(bank: bool = True, specialized: bool = True):
    candles = [Candle(time=int((NOW - timedelta(days=299 - i)).timestamp()),
                      open=260 + i * .05, high=266 + i * .05, low=255 + i * .05,
                      close=260 + i * .05, volume=1_000_000 + i * 1000) for i in range(300)]
    focus = FocusSnapshot(
        quote=Quote(ticker="RY.TO", symbol="RY", name="Royal Bank of Canada", exchange="TOR", currency="CAD",
                    price=277.59, previous_close=280, change=-2.41, change_percent=-.86,
                    day_high=280, day_low=275, volume=1_500_000, timestamp=NOW, source="TMX Money"),
        history=candles,
        technicals=Technicals(rsi_14=39.5, macd=-1.2, macd_signal=-.8, sma_20=276,
                              sma_50=275, sma_200=269, support=155, resistance=180),
        profile=StockProfile(ticker="RY.TO", name="RBC", exchange="TOR", currency="CAD"), generated_at=NOW)
    metrics = FundamentalMetrics(market_cap=100_000_000_000, trailing_pe=15, forward_pe=14,
        price_to_book=2.1, trailing_eps=18, return_on_equity=17, dividend_yield=3.2,
        dividend_rate=8.8, payout_ratio=48, revenue_growth=8, earnings_growth=11,
        fifty_two_week_high=310, fifty_two_week_low=240, total_revenue=70_000_000_000,
        total_debt=20_000_000_000, average_volume_3m=1_200_000)
    bank_metrics = [SectorMetric(key=key, label=label, value=value, unit=unit, source=OFFICIAL)
                    for key, label, value, unit in (
                        ("cet1", "CET1", 13.2, "%"), ("pcl", "PCL", 1200, "M CAD"),
                        ("roe", "ROE publié", 17.0, "%"),
                        ("efficiency_ratio", "Ratio d'efficience", 42.5, "%"),
                        ("dividend_payout", "Taux de distribution publié", 48, "%"))] if specialized else []
    fundamentals = FundamentalSnapshot(
        ticker="RY.TO", symbol="RY", name="RBC", currency="CAD", financial_currency="CAD",
        sector="Financial Services" if bank else "Technology", industry="Banks" if bank else "Software",
        status="available", metrics=metrics,
        quarterly_financials=[FinancialPeriod(period_end=NOW - timedelta(days=40), period_type="quarterly",
                                              total_revenue=17_000_000_000, net_income=4_000_000_000,
                                              diluted_eps=4.5, currency="CAD", source=OFFICIAL)],
        ttm=TTMSummary(), highlights=FinancialHighlights(revenue_growth_yoy=8.0, eps_growth_yoy=11.0),
        analysts=AnalystConsensus(analyst_count=15, target_low=270, target_mean=300, target_median=302,
                                  target_high=330, current_price=277.59, buy=7, hold=8),
        events=CorporateEvents(earnings_dates=[datetime(2026, 12, 1, tzinfo=UTC)]),
        official_coverage=OfficialCoverage(status="mixed", official_periods=1),
        sector_metrics=bank_metrics, source="Yahoo structured fallback", generated_at=NOW)
    news = StockNewsSnapshot(ticker="RY.TO", symbol="RY", company="RBC", generated_at=NOW,
        items=[StockNewsItem(id=str(i), title=f"RBC event {i}", summary="", url=f"https://example.com/{i}",
                            publisher="Publisher", published_at=NOW - timedelta(days=i)) for i in range(3)])
    return focus, fundamentals, news


def bundle(bank=True, specialized=True):
    return build_stock_research_bundle("RY", *fixtures(bank, specialized))


def test_deep_bundle_completeness():
    result = bundle()
    assert len(result.facts) > 40
    assert {"overview", "fundamental", "technical", "valuation", "profitability", "consensus", "bank", "events"} <= result.metric_groups.keys()
    assert len([fact for fact in result.metric_groups["events"] if fact.label == "Actualité"]) == 3


def test_bank_adapter_official_only():
    _, snapshot, _ = fixtures()
    assert {metric.key for metric in select_sector_metrics(snapshot)} == {"cet1", "pcl", "roe", "efficiency_ratio", "dividend_payout"}
    assert all(fact.provider == "official" for fact in bundle().sector_metrics)


def test_generic_adapter_omits_bank():
    assert not bundle(bank=False).sector_metrics


def test_technical_calculations_use_candles_not_old_levels():
    result = bundle()
    text = format_stock_research(result)
    assert "277.59" in text and "RSI 14" in text and "MACD" in text
    assert all(label in text for label in ("SMA 20", "SMA 50", "SMA 200", "Volume relatif", "Volatilité réalisée", "Momentum 20", "Momentum 50"))
    assert "155.00" not in text and "180.00" not in text
    assert "Plus bas des 20" not in text
    assert "Support observé" in text and "Résistance observée" in text
    assert "Support observé (plus bas des 20 dernières séances) : 269.00 CAD" in text
    assert "Résistance observée (plus haut des 20 dernières séances) : 280.95 CAD" in text


def test_valuation_and_dividend():
    text = format_stock_research(bundle())
    assert all(label in text for label in ("P/E courant", "P/E prévisionnel", "Prix / valeur comptable", "Rendement du dividende", "Taux de distribution"))
    assert "Rendement du dividende : 3.20 %" in text
    assert "Taux de distribution : 48.00 %" in text
    assert "ROE : 17.00 %" in text


def test_analyst_consensus_is_published():
    text = format_stock_research(bundle())
    assert "Nombre d'analystes : 15" in text
    assert all(label in text for label in ("Cible basse", "Cible moyenne", "Cible médiane", "Cible haute"))
    assert "prévision Anatole" in text


def test_official_period_provenance_over_fallback():
    result = bundle()
    assert any(fact.source.startswith("RBC Investor Relations") for fact in result.metric_groups["fundamental"])
    assert any(source.url == OFFICIAL.source_url for source in result.sources)
    assert "Couverture fondamentale : mixte" in format_stock_research(result)


def test_stale_disclosure():
    focus, snapshot, news = fixtures()
    snapshot.stale = True
    snapshot.refresh_in_progress = True
    result = build_stock_research_bundle("RY", focus, snapshot, news)
    assert "cache périmé" in format_stock_research(result)
    assert any(source.freshness == "stale" for source in result.sources)


def test_deterministic_formatter_scenarios_and_limits():
    text = format_stock_research(bundle(), question="Pourquoi ça baisse aujourd'hui ?")
    assert all(section in text for section in ("## Scénarios descriptifs", "## Risques", "## Ce qu’il faut surveiller", "## Sources et fraîcheur", "## Lecture de la séance"))
    assert "causalité" in text


@pytest.mark.asyncio
async def test_provider_writes_grounded_stock_analysis():
    result = bundle()
    class Provider:
        async def generate_internal_evidence(self, **_kwargs):
            answer = json.dumps({"answer_markdown": f"## Analyse ciblée\n- {result.facts[0].label} : {result.facts[0].value}",
                                 "used_fact_ids": ["F1"], "used_source_ids": [],
                                 "missing_data_ids": [], "follow_up_prompts": []})
            return type("Result", (), {"success": True, "answer": answer,
                                       "provider": "anthropic", "model": "mock"})()
    text = await generate_stock_research_from_evidence(result, "Analyse RY", Provider())
    assert "## Analyse ciblée" in text and result.facts[0].value in text


@pytest.mark.asyncio
async def test_provider_invention_is_rejected():
    class Provider:
        async def generate_internal_evidence(self, **_kwargs):
            return type("Result", (), {"success": True, "answer": "Prix 999 et achète"})()
    text = await generate_stock_research_from_evidence(bundle(), "Analyse RY", Provider())
    assert "999" not in text and "achète" not in text and "## Points saillants" not in text


def test_missing_bank_metrics_do_not_hallucinate():
    text = format_stock_research(bundle(specialized=False))
    assert "Données bancaires spécialisées non disponibles" in text
    assert "CET1" not in text and "PCL" not in text


def test_official_extractor_requires_unambiguous_label():
    text = "CET1 ratio 13.2%\nEfficiency ratio 42.5%\nProvision for credit losses $1,200 million\n"
    metrics = extract_official_bank_metrics(text, source_url=OFFICIAL.source_url,
                                            source_name=OFFICIAL.source_name, filed_at=NOW)
    assert {m.key for m in metrics} == {"cet1", "efficiency_ratio", "pcl"}
    assert not extract_official_bank_metrics(text + "CET1 ratio 12.9%", source_url=OFFICIAL.source_url,
                                             source_name=OFFICIAL.source_name, filed_at=NOW)[0].key == "cet1"


@pytest.mark.asyncio
async def test_ry_question_routes_to_complete_research(monkeypatch):
    focus, fundamentals, news = fixtures()

    async def focus_snapshot(*_args, **_kwargs):
        return focus

    async def fundamental_snapshot(*_args, **_kwargs):
        return fundamentals

    async def news_snapshot(*_args, **_kwargs):
        return news

    async def no_provider(**_kwargs):
        return None

    monkeypatch.setattr(market_data_service, "get_focus_snapshot", focus_snapshot)
    monkeypatch.setattr(fundamentals_service, "get_snapshot", fundamental_snapshot)
    monkeypatch.setattr(stock_news_service, "get_snapshot", news_snapshot)
    monkeypatch.setattr(provider_router, "generate_internal_evidence", no_provider)
    result = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(
        message="Fais une analyse technique et fondamentale de RY",
        context=AssistantContext(surface="stock", route="/focus/RY", symbol="RY")))
    assert result.intent == "stock_analysis"
    assert all(label in result.answer for label in ("CET1", "PCL", "ROE", "Ratio d'efficience",
        "Rendement du dividende", "RSI 14", "MACD", "SMA 20", "SMA 50", "SMA 200"))
    assert result.actions[0].href == "/focus/RY"
    assert len(result.evidence[0].sector_metrics) == 5


def _mock_ry_services(monkeypatch, *, stale=False, fundamentals_available=True,
                      news_available=True, provider_answer=None):
    focus, fundamentals, news = fixtures()
    fundamentals.stale = stale
    fundamentals.refresh_in_progress = stale

    async def focus_snapshot(*_args, **_kwargs):
        return focus

    async def fundamental_snapshot(*_args, **_kwargs):
        if not fundamentals_available:
            raise RuntimeError("fundamentals unavailable")
        return fundamentals

    async def news_snapshot(*_args, **_kwargs):
        if not news_available:
            raise RuntimeError("news unavailable")
        return news

    async def provider(**_kwargs):
        if provider_answer is None:
            return None
        return type("Result", (), {"success": True, "answer": provider_answer,
                                   "provider": "anthropic", "model": "mock"})()

    monkeypatch.setattr(market_data_service, "get_focus_snapshot", focus_snapshot)
    monkeypatch.setattr(fundamentals_service, "get_snapshot", fundamental_snapshot)
    monkeypatch.setattr(stock_news_service, "get_snapshot", news_snapshot)
    monkeypatch.setattr(provider_router, "generate_internal_evidence", provider)


@pytest.mark.asyncio
@pytest.mark.parametrize("surface,route", [("stock", "/focus/RY"), ("canada360", "/canada")])
async def test_stale_ry_research_preserves_evidence_and_legacy_source_contract(monkeypatch, surface, route):
    _mock_ry_services(monkeypatch, stale=True)
    result = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(
        message="Fais une analyse technique et fondamentale de RY",
        context=AssistantContext(surface=surface, route=route, symbol="RY")))
    assert result.intent == "stock_analysis"
    assert all(section in result.answer for section in ("## Vue d’ensemble", "## Analyse fondamentale",
        "## Valorisation", "## Analyse technique", "## Niveaux techniques", "## Données manquantes et limites"))
    assert "cache périmé" in result.answer
    assert any(source.freshness == "stale" for source in result.evidence[0].sources)
    assert all(source.status in {"live", "delayed", "fallback", "internal"} for source in result.sources)
    assert "achète" not in result.answer and "vends" not in result.answer


def test_http_canada_stock_question_with_stale_fundamentals(monkeypatch):
    _mock_ry_services(monkeypatch, stale=True)
    response = TestClient(app).post("/api/v1/assistant/chat", json={
        "message": "Fais une analyse technique et fondamentale de RY",
        "context": {"surface": "canada360", "route": "/canada", "language": "fr",
                    "metadata": {"region": "CA"},
                    "portfolio_scope": {"authorized": False, "position_count": 0}},
    })
    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "stock_analysis"
    assert any(source["freshness"] == "stale" for source in body["evidence"][0]["sources"])


@pytest.mark.parametrize("freshness,expected", [
    ("live", "live"), ("delayed", "delayed"), ("stale", "fallback"),
    ("fallback", "fallback"), ("internal", "internal"), ("unknown", "fallback"),
])
def test_evidence_source_conversion_is_total(freshness, expected):
    evidence = EvidenceSource(label="Source", type="test", freshness=freshness, timestamp=NOW)
    legacy = _evidence_source_to_assistant_source(evidence)
    assert legacy.status == expected == _assistant_source_status(freshness)
    assert evidence.freshness == freshness


@pytest.mark.asyncio
@pytest.mark.parametrize("surface,route", [("stock", "/focus/RY"), ("canada360", "/canada")])
@pytest.mark.parametrize("case", ["fresh", "stale", "fundamentals_unavailable", "news_unavailable",
                                  "provider_unavailable", "provider_success"])
async def test_stock_research_degrades_per_source(monkeypatch, surface, route, case):
    _mock_ry_services(monkeypatch, stale=case == "stale",
                      fundamentals_available=case != "fundamentals_unavailable",
                      news_available=case != "news_unavailable",
                      provider_answer=json.dumps({"answer_markdown": "## Analyse technique\n- Les indicateurs observés sont disponibles.\n## Niveaux techniques\n- Les seuils observés sont sourcés.",
                                                  "used_fact_ids": ["F1"], "used_source_ids": [],
                                                  "missing_data_ids": [], "follow_up_prompts": []})
                      if case == "provider_success" else None)
    result = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(
        message="Fais une analyse technique et fondamentale de RY",
        context=AssistantContext(surface=surface, route=route, symbol="RY")))
    assert result.intent == "stock_analysis"
    assert "## Analyse technique" in result.answer
    assert "## Niveaux techniques" in result.answer
    assert all(source.status in {"live", "delayed", "fallback", "internal"} for source in result.sources)
    if case == "fundamentals_unavailable":
        assert "Fondamentaux indisponibles" in result.answer
    if case == "news_unavailable":
        assert "Actualités du titre indisponibles" in result.answer
    if case == "provider_success":
        assert result.synthesis_provider == "anthropic" and result.synthesis_validated


@pytest.mark.asyncio
async def test_focus_unavailable_keeps_available_fundamentals(monkeypatch):
    _mock_ry_services(monkeypatch)

    async def unavailable(*_args, **_kwargs):
        raise RuntimeError("focus unavailable")

    monkeypatch.setattr(market_data_service, "get_focus_snapshot", unavailable)
    result = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(
        message="Fais une analyse technique et fondamentale de RY",
        context=AssistantContext(surface="stock", route="/focus/RY", symbol="RY")))
    assert result.intent == "stock_analysis"
    assert "Cotation Focus réelle indisponible" in result.answer
    assert "## Analyse fondamentale" in result.answer
    assert "Cours : 277.59" not in result.answer
