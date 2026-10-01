from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
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
    _official_domains,
    canada_360_assistant_service,
)
from app.services.provincial_statistics import provincial_statistics_service


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
    assert answer.links[0].label == "Statistique Canada"
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
    assert third.intent == "explanation"
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
    assert "Je ne peux pas vérifier cette réponse" in second.answer
    assert second.links == []
    assert "Assurance-emploi" not in second.answer


@pytest.mark.asyncio
async def test_missing_model_is_transparent_for_open_question(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")
    answer = await canada_360_assistant_service.answer(
        question="Comment demander une aide au logement en Ontario ?",
        lang="fr", jurisdiction="CA",
    )

    assert answer.intent == "services"
    assert answer.answer == (
        "Je ne peux pas vérifier cette réponse en profondeur pour le moment. "
        "Réessaie dans quelques instants."
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


def test_official_domain_filter_covers_all_ten_provinces() -> None:
    expected = {
        "QC": "quebec.ca", "ON": "ontario.ca", "BC": "gov.bc.ca",
        "AB": "alberta.ca", "SK": "saskatchewan.ca", "MB": "gov.mb.ca",
        "NB": "gnb.ca", "NS": "novascotia.ca",
        "PE": "princeedwardisland.ca", "NL": "gov.nl.ca",
    }
    assert set(PROVINCES) == set(expected)
    for code, domain in expected.items():
        domains = _official_domains(question="aide financière", jurisdiction=code)
        assert "canada.ca" in domains
        assert domain in domains


@pytest.mark.asyncio
async def test_responses_api_uses_official_search_and_recovers_invalid_model(
    monkeypatch, caplog,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-only-key")
    monkeypatch.setattr(settings, "canada360_assistant_model", "invalid-model")
    requests: list[dict] = []

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *, headers, json):
            assert url == "https://api.openai.com/v1/responses"
            requests.append(json.copy())
            request = httpx.Request("POST", url)
            if len(requests) == 1:
                return httpx.Response(
                    404, json={"error": {"code": "model_not_found"}},
                    request=request,
                )
            return httpx.Response(
                200, json={"output": [{
                    "type": "message",
                    "content": [{
                        "type": "output_text",
                        "text": "Voici une réponse vérifiée sur les services.",
                        "annotations": [{
                            "url": "https://www.canada.ca/en/services/benefits/finder.html",
                            "title": "Benefits Finder",
                        }],
                    }],
                }]}, request=request,
            )

    monkeypatch.setattr(assistant_module.httpx, "AsyncClient", FakeClient)
    response = await _grounded_model_answer(
        question="Quels services existent ?", lang="fr", jurisdiction="CA",
        mode="ask", topic="services", profile=Canada360AssistantProfile(),
        history=[],
    )

    assert response is not None
    assert response.answer.startswith("Voici une réponse vérifiée")
    assert [row["model"] for row in requests] == ["invalid-model", "gpt-5.4-mini"]
    assert requests[1]["tool_choice"] == "required"
    assert requests[1]["store"] is False
    assert requests[1]["max_output_tokens"] == 1200
    assert "canada.ca" in requests[1]["tools"][0]["filters"]["allowed_domains"]
    assert "test-only-key" not in caplog.text


def test_assistant_route_accepts_conversation_id_without_mode(monkeypatch) -> None:
    async def fake_answer(**kwargs):
        assert kwargs["conversation_id"] == (
            "11111111-1111-1111-1111-111111111111"
        )
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
    assert response.json()["conversation_id"] == (
        "11111111-1111-1111-1111-111111111111"
    )
