from __future__ import annotations

from datetime import UTC, datetime
import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.canada_360 import (
    Canada360AssistantProfile,
    Canada360AssistantResponse,
    Canada360Metric,
    Canada360Province,
    Canada360Snapshot,
)
from app.services import canada_360_assistant as assistant_module
from app.services.canada_360 import canada_360_service
from app.services.canada_360_assistant import (
    PROVINCES,
    _grounded_model_answer,
    _history_for_prompt,
    _official_domains,
    check_provider_health,
    canada_360_assistant_service,
)
from app.services.canada_360_sources import SOURCE_REGISTRY, identify_official_source
from app.services.canada_360_providers import ProviderEvidence, ProviderResult, provider_router
from app.services.provincial_statistics import provincial_statistics_service


def test_registry_recognizes_dedicated_agency_domains() -> None:
    job_bank = identify_official_source("https://www.jobbank.gc.ca/jobsearch")
    innovation = identify_official_source("https://innovation.canada.ca/en/")
    assert job_bank is not None and job_bank.agency == "Employment and Social Development Canada"
    assert innovation is not None and innovation.agency == "Innovation Canada"


@pytest.mark.asyncio
async def test_display_history_keeps_twenty_exchanges_with_ten_turn_model_window(monkeypatch) -> None:
    async def fake_model(**kwargs):
        return Canada360AssistantResponse(answer="Réponse vérifiée.", jurisdiction="CA")

    monkeypatch.setattr(assistant_module, "_grounded_model_answer", fake_model)
    conversation_id = None
    for number in range(21):
        result = await canada_360_assistant_service.answer(
            question=f"Bonjour numéro {number}", lang="fr", jurisdiction="CA",
            conversation_id=conversation_id,
        )
        conversation_id = result.conversation_id
    assert len(result.history) == 40
    assert result.history[0].text == "Bonjour numéro 1"
    prompt = _history_for_prompt(result.history)
    assert "User: Bonjour numéro 1\n" not in prompt
    assert "Bonjour numéro 20" in prompt
    assert prompt.count("User:") == 5


@pytest.mark.asyncio
async def test_response_deadline_returns_transparent_outage(monkeypatch) -> None:
    async def stalled_model(**kwargs):
        await asyncio.sleep(1)
        return Canada360AssistantResponse(answer="Trop tard", jurisdiction="CA")

    monkeypatch.setattr(assistant_module, "_grounded_model_answer", stalled_model)
    monkeypatch.setattr(settings, "canada360_total_response_deadline_seconds", 0.02)
    result = await canada_360_assistant_service.answer(
        question="Aide pour une démarche ?", lang="fr", jurisdiction="CA",
    )
    assert "moteur d’analyse" in result.answer
    assert "Trop tard" not in result.answer


def metric(
    key: str,
    label: str,
    value: float,
    unit: str = "percent",
) -> Canada360Metric:
    return Canada360Metric(
        key=key,
        label=label,
        category="test",
        value=value,
        change=0.1,
        change_kind="percent",
        unit=unit,
        source_name="Statistique Canada",
        source_url=(
            "https://www150.statcan.gc.ca/t1/tbl1/fr/"
            "tv.action?pid=1410028703"
        ),
        reference_period="août 2026",
        observed_at=datetime.now(UTC),
        freshness="fresh",
        official=True,
    )


def snapshot(
    *provinces: tuple[str, str, Canada360Metric],
    macro: list[Canada360Metric] | None = None,
) -> Canada360Snapshot:
    return Canada360Snapshot(
        language="fr",
        status="ok",
        macro=macro or [],
        provinces=[
            Canada360Province(code=code, name=name, metrics=[item])
            for code, name, item in provinces
        ],
        generated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("code", "name", "key", "label", "value", "unit", "question", "expected"),
    [
        (
            "AB", "Alberta", "unemployment_rate", "Taux de chômage", 7.8,
            "percent", "Quel est le taux de chômage actuel en Alberta ?", "7,8 %",
        ),
        (
            "QC", "Québec", "inflation_yoy", "Inflation", 2.4,
            "percent", "Quelle est l'inflation actuelle au Québec ?", "2,4 %",
        ),
        (
            "BC", "Colombie-Britannique", "population", "Population", 5_700_000,
            "persons", "Quelle est la population de la Colombie-Britannique ?",
            "5 700 000",
        ),
    ],
)
async def test_precise_stat_question_uses_official_snapshot_without_mode(
    monkeypatch, code, name, key, label, value, unit, question, expected,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    async def fake_snapshot(lang="fr", *, force=False):
        return snapshot((code, name, metric(key, label, value, unit)))

    monkeypatch.setattr(canada_360_service, "get_snapshot", fake_snapshot)

    answer = await canada_360_assistant_service.answer(
        question=question, lang="fr", jurisdiction="CA",
    )

    assert answer.intent == "statistics"
    assert name in answer.answer
    assert expected in answer.answer
    assert "août 2026" in answer.answer
    assert answer.links[0].agency == "Statistique Canada"
    assert answer.links[0].url.startswith("https://www150.statcan.gc.ca/")
    assert "Précise le service" not in answer.answer
    assert "Je peux répondre directement sur ce sujet" not in answer.answer


@pytest.mark.asyncio
async def test_statistical_followup_inherits_metric_without_dropdown(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    async def fake_snapshot(lang="fr", *, force=False):
        return snapshot(
            ("AB", "Alberta", metric("unemployment_rate", "Taux de chômage", 7.8)),
            ("ON", "Ontario", metric("unemployment_rate", "Taux de chômage", 6.5)),
        )

    monkeypatch.setattr(canada_360_service, "get_snapshot", fake_snapshot)

    first = await canada_360_assistant_service.answer(
        question="Quel est le taux de chômage actuel en Alberta ?",
        lang="fr", jurisdiction="CA",
    )
    second = await canada_360_assistant_service.answer(
        question="Et l'Ontario ?", lang="fr", jurisdiction="CA",
        conversation_id=first.conversation_id,
    )

    assert second.intent == "statistics"
    assert "Ontario" in second.answer
    assert "6,5 %" in second.answer
    assert "août 2026" in second.answer
    assert len(second.history) == 4
    assert second.history[0].text.startswith("Quel est le taux")


@pytest.mark.asyncio
async def test_explanation_keeps_both_provinces_and_figures_for_model(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    async def fake_snapshot(lang="fr", *, force=False):
        return snapshot(
            ("AB", "Alberta", metric("unemployment_rate", "Taux de chômage", 7.8)),
            ("QC", "Québec", metric("unemployment_rate", "Taux de chômage", 5.1)),
        )

    seen: dict = {}

    async def fake_model(**kwargs):
        seen.update(kwargs)
        return Canada360AssistantResponse(
            answer="L'écart demande une analyse des marchés du travail.",
            links=[], jurisdiction=kwargs["jurisdiction"],
        )

    monkeypatch.setattr(canada_360_service, "get_snapshot", fake_snapshot)
    monkeypatch.setattr(assistant_module, "_grounded_model_answer", fake_model)

    first = await canada_360_assistant_service.answer(
        question="Quel est le taux de chômage actuel en Alberta ?",
        lang="fr", jurisdiction="CA",
    )
    second = await canada_360_assistant_service.answer(
        question="Et au Québec ?", lang="fr", jurisdiction="CA",
        conversation_id=first.conversation_id,
    )
    third = await canada_360_assistant_service.answer(
        question="Pourquoi l'écart ?", lang="fr", jurisdiction="CA",
        conversation_id=first.conversation_id,
    )

    assert "5,1 %" in second.answer
    assert third.intent == "explain_difference"
    assert seen["jurisdiction"] == "QC"
    prior_text = " ".join(turn.text for turn in seen["history"])
    assert "Alberta" in prior_text and "Québec" in prior_text
    assert "7,8 %" in prior_text and "5,1 %" in prior_text
    domains = _official_domains(
        question="Pourquoi l'écart ?", jurisdiction="QC", history=seen["history"],
    )
    assert "alberta.ca" in domains and "quebec.ca" in domains


@pytest.mark.asyncio
async def test_profile_followup_keeps_history_without_fabricated_advice(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    async def no_snapshot(*args, **kwargs):
        raise AssertionError("personal context is not a statistical query")

    monkeypatch.setattr(canada_360_service, "get_snapshot", no_snapshot)
    first = await canada_360_assistant_service.answer(
        question="Quelles prestations existent au Québec ?",
        lang="fr", jurisdiction="CA",
    )
    second = await canada_360_assistant_service.answer(
        question=(
            "J'ai 25 ans, je suis célibataire, je suis sans emploi "
            "et je cherche une aide financière"
        ),
        lang="fr", jurisdiction="CA", conversation_id=first.conversation_id,
    )

    assert second.intent == "followup"
    assert len(second.history) == 4
    assert second.profile.age == 25
    assert second.profile.family_status == "single"
    assert second.profile.employment_status == "unemployed"
    assert second.profile.province == "QC"
    assert "moteur d’analyse" in second.answer
    assert second.links == []
    assert "Assurance-emploi" not in second.answer


@pytest.mark.asyncio
async def test_missing_model_is_transparent_for_open_question(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")
    answer = await canada_360_assistant_service.answer(
        question="Comment demander une aide au logement en Ontario ?",
        lang="fr", jurisdiction="CA",
    )

    assert answer.intent == "procedure"
    assert answer.answer == (
        "Canada 360 ne peut pas accéder à son moteur d’analyse pour le moment. "
        "Tes données gouvernementales structurées restent disponibles; "
        "réessaie cette question dans quelques instants."
    )
    assert answer.links == []


@pytest.mark.asyncio
async def test_cold_snapshot_hydrates_requested_province(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    async def cold_snapshot(lang="fr", *, force=False):
        return snapshot()

    async def provincial_snapshot(region=None, lang="fr", *, force=False):
        return SimpleNamespace(provinces=[SimpleNamespace(
            code="AB",
            metrics=[SimpleNamespace(
                key="unemployment_rate", label="Taux de chômage", category="Travail",
                value=7.8, change=0.1, change_kind="points",
                unit_kind="percent", table_url=metric(
                    "unemployment_rate", "Taux de chômage", 7.8
                ).source_url,
                reference_period="août 2026", released_at=datetime.now(UTC),
                note=None, history=[],
            )],
            official_source_name="Statistique Canada",
            official_source_url="https://www150.statcan.gc.ca/t1/tbl1/fr/",
        )])

    monkeypatch.setattr(canada_360_service, "get_snapshot", cold_snapshot)
    monkeypatch.setattr(
        provincial_statistics_service, "get_snapshot", provincial_snapshot
    )
    answer = await canada_360_assistant_service.answer(
        question="Quel est le taux de chômage actuel en Alberta ?",
        lang="fr", jurisdiction="CA",
    )

    assert answer.intent == "statistics"
    assert "Alberta" in answer.answer and "7,8 %" in answer.answer


def test_official_domain_filter_covers_all_thirteen_regions() -> None:
    expected = {
        "QC": "quebec.ca", "ON": "ontario.ca", "BC": "gov.bc.ca",
        "AB": "alberta.ca", "SK": "saskatchewan.ca", "MB": "gov.mb.ca",
        "NB": "gnb.ca", "NS": "novascotia.ca",
        "PE": "princeedwardisland.ca", "NL": "gov.nl.ca",
        "YT": "yukon.ca", "NT": "gov.nt.ca", "NU": "gov.nu.ca",
    }
    assert set(PROVINCES) == set(expected)
    for code, domain in expected.items():
        domains = _official_domains(question="aide financière", jurisdiction=code)
        assert "canada.ca" in domains
        assert domain in domains


def fake_result(answer: str, *urls: str, provider: str = "anthropic") -> ProviderResult:
    return ProviderResult(
        provider=provider, model="test-model", answer=answer,
        evidence=tuple(ProviderEvidence(url=url, title="Official program") for url in urls),
        success=True,
    )


def mock_router(monkeypatch, names, respond):
    providers = [SimpleNamespace(name=name, model="test-model") for name in names]
    monkeypatch.setattr(provider_router, "available", lambda: providers)

    async def generate(provider, *, prompt, domains, max_output_tokens=1800, attempts=None):
        if attempts is not None:
            attempts[0] += 1
        return await respond(provider, prompt, domains)

    monkeypatch.setattr(provider_router, "generate", generate)


def test_assistant_route_accepts_conversation_id_without_mode(monkeypatch) -> None:
    async def fake_answer(**kwargs):
        assert kwargs["conversation_id"] == "11111111-1111-1111-1111-111111111111"
        assert kwargs["mode"] == "ask"
        return Canada360AssistantResponse(
            answer="Réponse", jurisdiction=kwargs["jurisdiction"],
            conversation_id=kwargs["conversation_id"],
        )

    monkeypatch.setattr(canada_360_assistant_service, "answer", fake_answer)
    response = TestClient(app).post(
        "/api/v1/canada/assistant",
        json={
            "question": "aide financière", "lang": "fr", "jurisdiction": "ON",
            "conversation_id": "11111111-1111-1111-1111-111111111111",
        },
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_dental_eligibility_gets_substantive_grounded_answer(monkeypatch) -> None:
    calls = []

    async def respond(provider, prompt, domains):
        calls.append((provider.name, prompt, domains))
        return fake_result(
            "Le Régime canadien de soins dentaires exige de vérifier la couverture "
            "privée, la déclaration de revenus, le revenu familial et la résidence "
            "fiscale. Je ne peux pas confirmer votre admissibilité avec ces seuls "
            "renseignements. Avez-vous accès à une assurance dentaire privée ?",
            "https://www.canada.ca/fr/services/prestations/dentaire/regime-soins-dentaires/admissibilite.html",
        )

    mock_router(monkeypatch, ["anthropic"], respond)
    answer = await canada_360_assistant_service.answer(
        question="Ai-je droit au Régime canadien de soins dentaires ?",
        lang="fr", jurisdiction="CA",
    )
    assert answer.intent == "eligibility"
    assert "couverture privée" in answer.answer
    assert len(answer.links) == 1
    assert answer.links[0].jurisdiction == "CA"
    assert len(calls) == 1 and "canada.ca" in calls[0][2]


@pytest.mark.asyncio
async def test_precision_rejection_triggers_targeted_second_search(monkeypatch) -> None:
    prompts = []

    async def respond(provider, prompt, domains):
        prompts.append(prompt)
        if len(prompts) == 1:
            return fake_result("Le régime pourrait vous concerner.", "https://www.canada.ca/")
        return fake_result(
            "Le régime exige une vérification de la couverture privée, des revenus "
            "et de la résidence fiscale. Quels sont votre couverture et votre revenu ?",
            "https://www.canada.ca/fr/services/prestations/dentaire/regime-soins-dentaires/admissibilite.html",
        )

    mock_router(monkeypatch, ["anthropic"], respond)
    answer = await canada_360_assistant_service.answer(
        question="Ai-je droit au Régime canadien de soins dentaires ?",
        lang="fr", jurisdiction="CA",
    )
    assert len(prompts) == 2
    assert "Precision audit rejected draft #1" in prompts[1]
    assert "detailed eligibility requirements" in prompts[1]
    assert "admissibilite.html" in answer.links[0].url


@pytest.mark.parametrize("code", [
    "QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL",
    "YT", "NT", "NU",
])
@pytest.mark.asyncio
async def test_personal_financial_help_covers_federal_and_region(
    monkeypatch, code,
) -> None:
    region = next(source for source in SOURCE_REGISTRY if source.jurisdiction == code)
    url = f"https://{region.official_domains[0]}/en/services/income-support"
    seen = []

    async def respond(provider, prompt, domains):
        seen.append(domains)
        return fake_result(
            "Voici des programmes fédéraux et régionaux à examiner selon votre "
            "situation. Vérifiez les critères détaillés; votre admissibilité "
            "dépend des faits personnels encore manquants.",
            "https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit/eligibility.html",
            url,
        )

    mock_router(monkeypatch, ["anthropic"], respond)
    answer = await canada_360_assistant_service.answer(
        question="Je cherche une aide financière personnelle.",
        lang="fr", jurisdiction=code,
    )
    assert answer.jurisdiction == code
    assert answer.intent in {"benefit_or_program", "local_resource"}
    assert {link.jurisdiction for link in answer.links} == {"CA", code}
    assert region.official_domains[0] in seen[0]
    assert identify_official_source(url) is region


@pytest.mark.asyncio
async def test_health_check_discloses_only_safe_fields(monkeypatch) -> None:
    async def health():
        return {
            "configured_order": ["anthropic", "gemini", "openai"],
            "providers": {
                "anthropic": {"configured": True, "reachable": True,
                              "model": "claude-sonnet-5-5", "search_capable": True},
                "gemini": {"configured": False, "reachable": False,
                           "model": "gemini-3.8-flash", "search_capable": False},
                "openai": {"configured": False, "reachable": False,
                           "model": "gpt-6.1-sol", "search_capable": False},
            },
        }

    monkeypatch.setattr(provider_router, "health", health)
    result = await check_provider_health()
    assert result["providers"]["anthropic"]["reachable"]
    assert "key" not in str(result).lower()
    assert TestClient(app).get("/api/v1/admin/canada360/provider-health").status_code == 401


@pytest.mark.asyncio
async def test_feedback_is_session_scoped_and_does_not_log_question(
    monkeypatch, caplog,
) -> None:
    mock_router(monkeypatch, [], None)
    answer = await canada_360_assistant_service.answer(
        question="Question privée de test", lang="fr", jurisdiction="CA",
    )
    assert await canada_360_assistant_service.rate_answer(
        conversation_id=answer.conversation_id, turn_index=1, rating="up",
        lang="fr", jurisdiction="CA",
    )
    state = await canada_360_assistant_service.get_conversation(
        conversation_id=answer.conversation_id, lang="fr", jurisdiction="CA",
    )
    assert state.history[1].feedback == "up"
    assert "Question privée de test" not in caplog.text


def test_feedback_route_accepts_rating_without_raw_answer(monkeypatch) -> None:
    async def fake_rate_answer(**kwargs):
        assert kwargs["turn_index"] == 1
        assert kwargs["rating"] == "down"
        return True

    monkeypatch.setattr(canada_360_assistant_service, "rate_answer", fake_rate_answer)
    response = TestClient(app).post(
        "/api/v1/canada/assistant/feedback",
        json={
            "conversation_id": "11111111-1111-1111-1111-111111111111",
            "turn_index": 1, "rating": "down", "lang": "fr", "jurisdiction": "CA",
        },
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_two_precision_rejections_end_in_real_outage(monkeypatch) -> None:
    calls = []

    async def respond(provider, prompt, domains):
        calls.append(prompt)
        return fake_result("Vous pourriez vérifier ce programme.", "https://www.canada.ca/")

    mock_router(monkeypatch, ["anthropic"], respond)
    answer = await canada_360_assistant_service.answer(
        question="Ai-je droit au Régime canadien de soins dentaires ?",
        lang="fr", jurisdiction="CA",
    )
    assert len(calls) == 2
    assert "moteur d’analyse" in answer.answer
    assert answer.links == []


@pytest.mark.asyncio
async def test_anthropic_failure_gemini_responds_without_openai(monkeypatch) -> None:
    calls = []

    async def respond(provider, prompt, domains):
        calls.append(provider.name)
        if provider.name == "anthropic":
            return ProviderResult(provider="anthropic", model="test",
                                  error_category="timeout", retryable=True)
        return fake_result(
            "Le régime exige de vérifier la couverture privée, la déclaration "
            "de revenus et la résidence fiscale. Votre admissibilité dépend de "
            "ces faits. Avez-vous une assurance privée ?",
            "https://www.canada.ca/fr/services/prestations/dentaire/regime-soins-dentaires/admissibilite.html",
            provider="gemini",
        )

    mock_router(monkeypatch, ["anthropic", "gemini", "openai"], respond)
    answer = await canada_360_assistant_service.answer(
        question="Ai-je droit au Régime canadien de soins dentaires ?",
        lang="fr", jurisdiction="CA",
    )
    assert calls == ["anthropic", "gemini"]
    assert answer.links and "assurance privée" in answer.answer
    assert "OpenAI" not in answer.answer
