from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.canada_360 import (
    Canada360Metric,
    Canada360Province,
    Canada360Snapshot,
)
from app.services.canada_360 import canada_360_service
from app.services.canada_360_assistant import (
    PROVINCIAL_INCOME_ASSISTANCE,
    _official_domains,
    canada_360_assistant_service,
)


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
        source_url="https://www.statcan.gc.ca/",
        reference_period="août 2026",
        observed_at=datetime.now(UTC),
        freshness="fresh",
        official=True,
    )


@pytest.mark.asyncio
async def test_profile_followup_keeps_history_and_does_not_become_employment_stat(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    first = await canada_360_assistant_service.answer(
        question="Quelles prestations existent au Québec ?",
        lang="fr",
        jurisdiction="CA",
        mode="ask",
    )

    second = await canada_360_assistant_service.answer(
        question=(
            "J'ai 25 ans, je suis célibataire, je suis sans emploi "
            "et je cherche une aide financière"
        ),
        lang="fr",
        jurisdiction="CA",
        mode="ask",
        conversation_id=first.conversation_id,
    )

    assert second.conversation_id == first.conversation_id
    assert len(second.history) == 4
    assert second.profile.age == 25
    assert second.profile.family_status == "single"
    assert second.profile.employment_status == "unemployed"
    assert second.profile.province == "QC"
    assert second.intent == "followup"
    assert "Assurance-emploi" in second.answer
    assert "Programme d’aide sociale" in second.answer
    assert "Canada — Emploi" not in second.answer


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("code", "program_name"),
    [
        ("QC", "Programme d’aide sociale"),
        ("ON", "Ontario Works"),
        ("BC", "Income Assistance"),
        ("AB", "Income Support"),
        ("SK", "Saskatchewan Income Support"),
        ("MB", "Employment and Income Assistance"),
        ("NB", "Programme d’aide sociale"),
        ("NS", "Income Assistance"),
        ("PE", "Social Assistance Program"),
        ("NL", "Income Support"),
    ],
)
async def test_unemployed_profile_is_supported_for_all_ten_provinces(
    monkeypatch,
    code,
    program_name,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    answer = await canada_360_assistant_service.answer(
        question=(
            "J'ai 25 ans, je suis célibataire, sans emploi "
            "et je cherche une aide financière"
        ),
        lang="fr",
        jurisdiction=code,
        mode="ask",
    )

    assert answer.profile.province == code
    assert answer.intent == "services"
    assert program_name in answer.answer
    assert PROVINCIAL_INCOME_ASSISTANCE[code][2] in {
        link.url for link in answer.links
    }


def test_official_domain_filter_covers_all_ten_provinces() -> None:
    expected = {
        "QC": "quebec.ca",
        "ON": "ontario.ca",
        "BC": "gov.bc.ca",
        "AB": "alberta.ca",
        "SK": "saskatchewan.ca",
        "MB": "gov.mb.ca",
        "NB": "gnb.ca",
        "NS": "novascotia.ca",
        "PE": "princeedwardisland.ca",
        "NL": "gov.nl.ca",
    }

    for code, domain in expected.items():
        domains = _official_domains(
            question="aide financière",
            jurisdiction=code,
        )
        assert "canada.ca" in domains
        assert domain in domains


@pytest.mark.asyncio
async def test_explicit_statistical_question_still_uses_snapshot(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    async def fake_snapshot(lang="fr", *, force=False):
        return Canada360Snapshot(
            language="fr",
            status="ok",
            macro=[
                metric(
                    "employment",
                    "Emploi",
                    21_173_100,
                    "persons",
                )
            ],
            rates=[],
            markets=[],
            provinces=[],
            sources=[],
            issues=[],
            generated_at=datetime.now(UTC),
            refresh_after_seconds=60,
        )

    monkeypatch.setattr(
        canada_360_service,
        "get_snapshot",
        fake_snapshot,
    )

    answer = await canada_360_assistant_service.answer(
        question="Combien d'emplois y a-t-il au Canada ?",
        lang="fr",
        jurisdiction="CA",
        mode="ask",
    )

    assert answer.intent == "statistics"
    assert "21 173 100" in answer.answer


def test_assistant_route_accepts_conversation_id(monkeypatch) -> None:
    from app.schemas.canada_360 import Canada360AssistantResponse

    async def fake_answer(**kwargs):
        assert kwargs["conversation_id"] == (
            "11111111-1111-1111-1111-111111111111"
        )
        return Canada360AssistantResponse(
            answer="Réponse",
            links=[],
            source_line=None,
            mode=kwargs["mode"],
            jurisdiction=kwargs["jurisdiction"],
            conversation_id=kwargs["conversation_id"],
        )

    monkeypatch.setattr(
        canada_360_assistant_service,
        "answer",
        fake_answer,
    )

    response = TestClient(app).post(
        "/api/v1/canada/assistant",
        json={
            "question": "aide financière",
            "lang": "fr",
            "jurisdiction": "ON",
            "mode": "ask",
            "conversation_id": (
                "11111111-1111-1111-1111-111111111111"
            ),
        },
    )

    assert response.status_code == 200
    assert (
        response.json()["conversation_id"]
        == "11111111-1111-1111-1111-111111111111"
    )
