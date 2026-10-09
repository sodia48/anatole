"""The provider receives bounded evidence and its draft is checked before display."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.schemas.assistant_context import (
    AnatoleEvidenceBundle, EvidenceFact, EvidenceSource, PortfolioWatchtowerDelta, PortfolioXRay,
)
from app.services.assistant_synthesis import evidence_payload, synthesize_from_evidence, validate_draft
from app.services.canada_360_providers import ProviderResult
from app.services import canada_360_providers as provider_module
from app.services.canada_360_providers import Canada360ProviderRouter


NOW = datetime(2026, 10, 8, tzinfo=UTC)


def bundle(skill="stock_analysis"):
    fact = EvidenceFact(label="Rendement observé", value="12.5 %", source="Données publiques",
                        freshness="delayed", timestamp=NOW)
    return AnatoleEvidenceBundle(
        skill=skill, entities=["RY"], facts=[fact], metric_groups={"performance": [fact]},
        sources=[EvidenceSource(label="Données publiques", type="quote",
                                freshness="delayed", timestamp=NOW)],
        missing_data=["Historique antérieur indisponible"], generated_at=NOW,
    )


def draft(answer="## Analyse\n- RY affiche un rendement observé de 12.5 % (F1, S1)."):
    return json.dumps({"answer_markdown": answer, "used_fact_ids": ["F1"],
                       "used_source_ids": ["S1"], "missing_data_ids": ["M1"],
                       "follow_up_prompts": ["Quelle est la période observée ?"]})


@pytest.mark.parametrize("skill", ["stock_analysis", "portfolio_analysis", "etf_analysis",
    "compare", "market_analysis", "news_context", "data_quality"])
@pytest.mark.asyncio
async def test_each_financial_skill_uses_validated_provider_draft(skill):
    calls = []

    async def generate(**kwargs):
        calls.append(kwargs)
        return ProviderResult(provider="anthropic", model="claude-test", answer=draft(), success=True)

    result = await synthesize_from_evidence(bundle(skill), "Analyse RY", "Repli local",
                                            SimpleNamespace(generate_internal_evidence=generate))
    assert result.validated and result.provider == "anthropic" and result.model == "claude-test"
    assert result.answer.startswith("## Analyse") and result.answer != "Repli local"
    assert calls[0]["provider_order"][0] == "anthropic"


@pytest.mark.parametrize("answer", [
    "RY affiche 999 % (F1).", "Visiter https://example.com (F1).",
    "Acheter RY (F1).", "<script>alert(12.5)</script> (F1).",
    "Une source S9 affiche 12.5 % (F1).",
])
def test_rejects_unsupported_or_unsafe_drafts(answer):
    with pytest.raises(ValueError):
        validate_draft(draft(answer), evidence_payload(bundle(), "Analyse RY"))


@pytest.mark.asyncio
async def test_invalid_draft_retries_once_then_uses_local_formatter():
    calls = 0

    async def generate(**_kwargs):
        nonlocal calls
        calls += 1
        return ProviderResult(provider="anthropic", model="claude-test",
                              answer=draft("Rendement 999 % (F1)."), success=True)

    result = await synthesize_from_evidence(bundle(), "Analyse RY", "Repli local",
                                            SimpleNamespace(generate_internal_evidence=generate))
    assert calls == 2
    assert result.answer == "Repli local" and result.mode == "deterministic"


@pytest.mark.asyncio
async def test_provider_unavailable_uses_local_formatter_without_retry():
    calls = 0

    async def generate(**_kwargs):
        nonlocal calls
        calls += 1
        return None

    result = await synthesize_from_evidence(bundle(), "Analyse RY", "Repli local",
                                            SimpleNamespace(generate_internal_evidence=generate))
    assert calls == 1 and result.answer == "Repli local"


def test_portfolio_payload_contains_only_authorized_aggregates():
    source = bundle("portfolio_analysis")
    source.facts.extend([
        EvidenceFact(label="Coût d’achat total", value="700 CAD", source="Portefeuille Anatole"),
        EvidenceFact(label="Valeur de marché actuelle", value="1000 CAD", source="Portefeuille Anatole"),
    ])
    source.metric_groups["overview"] = source.facts[1:]
    source.portfolio_xray = PortfolioXRay(total_market_value=1000, total_cost_basis=700,
                                          unrealized_pnl=300, history_coverage_percent=60)
    source.watchtower = PortfolioWatchtowerDelta(current_at=NOW, previous_available=True,
        changes={"total_market_value": 300, "top_position_weight_percent": 2.5})
    source.position_rows = []
    payload = evidence_payload(source, "Mon coût est 700 CAD, compte ABC", {
        "last_skill": "portfolio_analysis", "portfolio_focus": "overview",
        "last_answer_summary": "Mon coût est 700 CAD", "account_id": "ABC",
    })
    encoded = json.dumps(payload, ensure_ascii=False)
    assert "12.5 %" in encoded and "history_coverage_percent" in encoded
    for private in ("700", "1000", "300", "ABC", "total_market_value", "total_cost_basis",
                    "unrealized_pnl", "last_answer_summary", "account_id"):
        assert private not in encoded


@pytest.mark.parametrize("anthropic_error", ["auth", "timeout"])
@pytest.mark.asyncio
async def test_router_falls_back_from_claude_to_gemini(monkeypatch, anthropic_error):
    router = Canada360ProviderRouter()
    router._providers = {name: SimpleNamespace(name=name, model=f"{name}-test", api_key="test",
                                                configured=True)
                         for name in ("anthropic", "gemini", "openai")}
    monkeypatch.setattr(router, "circuit_open", lambda _provider: False)
    calls = []

    async def post_json(**kwargs):
        calls.append(kwargs["name"])
        if kwargs["name"] == "anthropic":
            return ProviderResult(provider="anthropic", model="test", error_category=anthropic_error)
        return {"candidates": [{"content": {"parts": [{"text": draft()}]}}]}

    monkeypatch.setattr(provider_module, "_post_json", post_json)
    result = await synthesize_from_evidence(bundle(), "Analyse RY", "Repli local", router)
    assert calls == ["anthropic", "gemini"]
    assert result.provider == "gemini" and result.validated


@pytest.mark.asyncio
async def test_router_falls_back_to_openai_after_two_provider_errors(monkeypatch):
    router = Canada360ProviderRouter()
    router._providers = {name: SimpleNamespace(name=name, model=f"{name}-test", api_key="test",
                                                configured=True)
                         for name in ("anthropic", "gemini", "openai")}
    monkeypatch.setattr(router, "circuit_open", lambda _provider: False)
    calls = []

    async def post_json(**kwargs):
        calls.append(kwargs["name"])
        if kwargs["name"] != "openai":
            return ProviderResult(provider=kwargs["name"], model="test", error_category="auth")
        return {"output": [{"type": "message", "content": [{"type": "output_text", "text": draft()}]}]}

    monkeypatch.setattr(provider_module, "_post_json", post_json)
    result = await synthesize_from_evidence(bundle(), "Analyse RY", "Repli local", router)
    assert calls == ["anthropic", "gemini", "openai"]
    assert result.provider == "openai" and result.validated
