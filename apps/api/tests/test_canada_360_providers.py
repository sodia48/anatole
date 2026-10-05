from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings, settings
from app.schemas.canada_360 import Canada360AssistantProfile
from app.services import canada_360_providers as provider_module
from app.services.canada_360_assistant import _grounded_model_answer
from app.services.canada_360_providers import (
    AnthropicProvider,
    Canada360ProviderRouter,
    GeminiProvider,
    OpenAIProvider,
    ProviderEvidence,
    ProviderResult,
    provider_router,
)
from app.services.canada_360_sources import official_domains


DETAILED = (
    "https://www.canada.ca/fr/services/prestations/dentaire/"
    "regime-soins-dentaires/admissibilite.html"
)
ANSWER = (
    "Le régime demande de vérifier la couverture privée, les revenus et la "
    "résidence fiscale. Votre admissibilité dépend de ces faits. "
    "Avez-vous une assurance privée ?"
)


def result(name: str, answer: str = ANSWER, *urls: str) -> ProviderResult:
    return ProviderResult(
        provider=name, model="test-model", answer=answer,
        evidence=tuple(ProviderEvidence(url=url) for url in urls),
        success=True,
    )


def install(monkeypatch, names: list[str], responses: dict[str, list[ProviderResult]]):
    providers = [SimpleNamespace(name=name, model="test-model") for name in names]
    calls: list[tuple[str, str, list[str]]] = []
    monkeypatch.setattr(provider_router, "available", lambda: providers)

    async def generate(provider, *, prompt, domains, max_output_tokens=1800):
        calls.append((provider.name, prompt, domains))
        return responses[provider.name].pop(0)

    monkeypatch.setattr(provider_router, "generate", generate)
    return calls


async def answer():
    return await _grounded_model_answer(
        question="Ai-je droit au Régime canadien de soins dentaires ?",
        lang="fr", jurisdiction="CA", mode="ask", topic="health",
        profile=Canada360AssistantProfile(), history=[],
    )


def test_provider_order_normalizes_deduplicates_and_ignores_unknown(monkeypatch) -> None:
    config = Settings(
        _env_file=None,
        CANADA360_PROVIDER_ORDER=" Gemini,ANTHROPIC,gemini,unknown ",
    )
    assert config.canada360_provider_order == ("gemini", "anthropic")
    assert Settings(_env_file=None, CANADA360_PROVIDER_ORDER="bad").canada360_provider_order == (
        "anthropic", "gemini", "openai",
    )
    monkeypatch.setenv("CANADA360_PROVIDER_ORDER", "gemini,anthropic")
    assert Settings(_env_file=None).canada360_provider_order == ("gemini", "anthropic")


@pytest.mark.asyncio
async def test_anthropic_success_never_calls_fallbacks(monkeypatch) -> None:
    calls = install(monkeypatch, ["anthropic", "gemini", "openai"], {
        "anthropic": [result("anthropic", ANSWER, DETAILED)],
    })
    response = await answer()
    assert response is not None and response.links
    assert [name for name, _, _ in calls] == ["anthropic"]


@pytest.mark.asyncio
async def test_anthropic_timeout_falls_back_to_gemini(monkeypatch) -> None:
    calls = install(monkeypatch, ["anthropic", "gemini", "openai"], {
        "anthropic": [ProviderResult(
            provider="anthropic", model="test-model",
            error_category="timeout", retryable=True,
        )],
        "gemini": [result("gemini", ANSWER, DETAILED)],
    })
    response = await answer()
    assert response is not None and response.links
    assert [name for name, _, _ in calls] == ["anthropic", "gemini"]


@pytest.mark.asyncio
async def test_two_precision_rejections_fall_back_to_gemini(monkeypatch) -> None:
    calls = install(monkeypatch, ["anthropic", "gemini"], {
        "anthropic": [
            result("anthropic", "Le régime pourrait vous concerner.", "https://www.canada.ca/"),
            result("anthropic", "Le régime pourrait vous concerner.", "https://www.canada.ca/"),
        ],
        "gemini": [result("gemini", ANSWER, DETAILED)],
    })
    response = await answer()
    assert response is not None and response.links
    assert [name for name, _, _ in calls] == ["anthropic", "anthropic", "gemini"]
    assert "Precision audit rejected draft #1" in calls[1][1]


@pytest.mark.asyncio
async def test_absent_anthropic_uses_gemini(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "gemini_api_key", "test-only-key")
    monkeypatch.setattr(settings, "openai_api_key", "")
    router = Canada360ProviderRouter()
    assert [provider.name for provider in router.available()] == ["gemini"]


@pytest.mark.asyncio
async def test_openai_optional_when_first_two_absent(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "test-only-key")
    router = Canada360ProviderRouter()
    assert [provider.name for provider in router.available()] == ["openai"]


def test_openai_absent_does_not_disable_anthropic(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-only-key")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    assert [provider.name for provider in Canada360ProviderRouter().available()] == ["anthropic"]


@pytest.mark.asyncio
async def test_all_absent_open_question_is_transparent(monkeypatch) -> None:
    install(monkeypatch, [], {})
    assert await answer() is None


@pytest.mark.asyncio
async def test_gemini_non_government_citation_rejected(monkeypatch) -> None:
    calls = install(monkeypatch, ["gemini", "openai"], {
        "gemini": [
            result("gemini", ANSWER, DETAILED, "https://example.com/advice"),
            result("gemini", ANSWER, DETAILED, "https://example.com/advice"),
        ],
        "openai": [result("openai", ANSWER, DETAILED)],
    })
    response = await answer()
    assert response is not None and response.links
    assert [name for name, _, _ in calls] == ["gemini", "gemini", "openai"]


@pytest.mark.asyncio
async def test_anthropic_domains_come_from_registry(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-only-key")
    seen = {}

    async def fake_post(**kwargs):
        seen.update(kwargs)
        return {"content": [{"type": "text", "text": ANSWER, "citations": [{
            "type": "web_search_result_location", "url": DETAILED,
            "title": "Admissibilité",
        }]}]}

    monkeypatch.setattr(provider_module, "_post_json", fake_post)
    domains = official_domains(["QC"])
    response = await AnthropicProvider().generate(prompt="Question", domains=domains)
    assert response.success and response.evidence[0].url == DETAILED
    assert seen["payload"]["tools"][0]["type"] == "web_search_20250305"
    assert seen["payload"]["tools"][0]["allowed_domains"] == domains
    assert "quebec.ca" in domains


@pytest.mark.asyncio
async def test_gemini_uses_only_cited_grounding_chunks(monkeypatch) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "test-only-key")

    async def fake_post(**kwargs):
        assert kwargs["payload"]["tools"] == [{"google_search": {}}]
        return {"candidates": [{
            "content": {"parts": [{"text": ANSWER}]},
            "groundingMetadata": {
                "groundingChunks": [
                    {"web": {"uri": DETAILED, "title": "Official"}},
                    {"web": {"uri": "https://example.com/irrelevant", "title": "Other"}},
                ],
                "groundingSupports": [{"groundingChunkIndices": [0]}],
            },
        }]}

    monkeypatch.setattr(provider_module, "_post_json", fake_post)
    response = await GeminiProvider().generate(prompt="Question", domains=["canada.ca"])
    assert response.success and [e.url for e in response.evidence] == [DETAILED]


@pytest.mark.asyncio
async def test_gemini_redirect_requires_official_target(monkeypatch) -> None:
    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["follow_redirects"] is False

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url):
            assert url.startswith("https://vertexaisearch.cloud.google.com/grounding-api-redirect/")
            return httpx.Response(302, headers={"location": DETAILED})

    monkeypatch.setattr(provider_module.httpx, "AsyncClient", FakeClient)
    resolved = await provider_module._resolve_gemini_url(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"
    )
    assert resolved == DETAILED
    assert await provider_module._resolve_gemini_url("https://example.com/redirect") is None


@pytest.mark.asyncio
async def test_openai_request_keeps_official_filter_and_no_storage(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-only-key")
    seen = {}

    async def fake_post(**kwargs):
        seen.update(kwargs)
        return {"output": [{"type": "message", "content": [{
            "type": "output_text", "text": ANSWER,
            "annotations": [{"url": DETAILED, "title": "Official"}],
        }]}]}

    monkeypatch.setattr(provider_module, "_post_json", fake_post)
    response = await OpenAIProvider().generate(prompt="Question", domains=["canada.ca"])
    assert response.success and response.evidence[0].url == DETAILED
    assert seen["payload"]["store"] is False
    assert seen["payload"]["tools"][0]["filters"]["allowed_domains"] == ["canada.ca"]
    assert seen["payload"]["model"] == "gpt-6.1-sol"


@pytest.mark.asyncio
async def test_provider_order_override(monkeypatch) -> None:
    monkeypatch.setattr(settings, "canada360_provider_order", ("gemini", "anthropic"))
    monkeypatch.setattr(settings, "anthropic_api_key", "test-only-key")
    monkeypatch.setattr(settings, "gemini_api_key", "test-only-key")
    router = Canada360ProviderRouter()
    assert [provider.name for provider in router.available()] == ["gemini", "anthropic"]


@pytest.mark.asyncio
async def test_circuit_breaker_skips_provider_during_cooldown(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-only-key")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "canada360_provider_retries", 0)
    router = Canada360ProviderRouter()
    provider = router.available()[0]
    calls = []

    async def failing(**kwargs):
        calls.append(1)
        return ProviderResult(provider="anthropic", model=provider.model,
                              error_category="rate_limit", retryable=True)

    monkeypatch.setattr(provider, "generate", failing)
    await router.generate(provider, prompt="Question", domains=["canada.ca"])
    assert calls == [1]
    assert router.available() == []


@pytest.mark.asyncio
async def test_retry_is_bounded_at_one(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-only-key")
    monkeypatch.setattr(settings, "canada360_provider_retries", 1)
    router = Canada360ProviderRouter()
    provider = router.available()[0]
    calls = []

    async def failing(**kwargs):
        calls.append(1)
        return ProviderResult(provider="anthropic", model=provider.model,
                              error_category="timeout", retryable=True)

    monkeypatch.setattr(provider, "generate", failing)
    await router.generate(provider, prompt="Question", domains=["canada.ca"])
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_health_response_contains_no_secret(monkeypatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-only-secret")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    router = Canada360ProviderRouter()

    async def fake_generate(provider, *, prompt, domains, max_output_tokens=1800):
        return result("anthropic", ANSWER, DETAILED)

    monkeypatch.setattr(router, "generate", fake_generate)
    health = await router.health()
    assert health["configured_order"] == ["anthropic", "gemini", "openai"]
    assert health["providers"]["anthropic"]["search_capable"] is True
    assert health["providers"]["openai"]["configured"] is False
    assert "test-only-secret" not in str(health)
