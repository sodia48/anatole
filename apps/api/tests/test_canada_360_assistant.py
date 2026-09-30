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
    _extract_model_response,
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
async def test_assistant_answers_from_official_snapshot(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    async def fake_snapshot(lang="fr", *, force=False):
        assert lang == "fr"
        assert force is False
        return Canada360Snapshot(
            language="fr",
            status="ok",
            macro=[
                metric(
                    "inflation_yoy",
                    "Inflation sur 12 mois",
                    2.1,
                )
            ],
            rates=[],
            markets=[],
            provinces=[
                Canada360Province(
                    code="QC",
                    name="Québec",
                    status="ok",
                    metrics=[
                        metric(
                            "unemployment_rate",
                            "Taux de chômage",
                            5.4,
                        )
                    ],
                    source_name="Statistique Canada",
                    source_url="https://www.statcan.gc.ca/",
                )
            ],
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
        question="Quel est le taux de chômage au Québec ?",
        lang="fr",
        jurisdiction="CA",
        mode="ask",
    )

    assert "Québec" in answer.answer
    assert "5,4 %" in answer.answer
    assert answer.links[0].url == "https://www.statcan.gc.ca/"
    assert answer.links[0].level == "statistics"


@pytest.mark.asyncio
async def test_assistant_answers_benefits_before_showing_sources(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")

    answer = await canada_360_assistant_service.answer(
        question="Quelles prestations existent au Québec ?",
        lang="fr",
        jurisdiction="CA",
        mode="ask",
    )

    normalized = answer.answer.lower()
    assert "retraite" in normalized
    assert "aide sociale" in normalized
    assert "portes d’entrée" not in normalized

    urls = {item.url for item in answer.links}
    assert "https://www.canada.ca/en/services/benefits/finder.html" in urls
    assert (
        "https://www.quebec.ca/en/family-and-support-for-individuals/"
        "social-assistance-social-solidarity/how-to-apply"
    ) in urls


def test_qc_web_search_is_restricted_to_official_domains() -> None:
    domains = _official_domains(
        question="Quelles prestations existent au Québec ?",
        jurisdiction="CA",
    )

    assert "canada.ca" in domains
    assert "statcan.gc.ca" in domains
    assert "quebec.ca" in domains
    assert "revenuquebec.ca" in domains
    assert "ramq.gouv.qc.ca" in domains
    assert "example.com" not in domains


def test_model_response_keeps_only_official_sources() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": (
                            "Au Québec, plusieurs aides fédérales et "
                            "provinciales peuvent s’appliquer selon la situation."
                        ),
                        "annotations": [
                            {
                                "type": "url_citation",
                                "title": "Benefits Finder",
                                "url": (
                                    "https://www.canada.ca/en/services/"
                                    "benefits/finder.html"
                                ),
                            },
                            {
                                "type": "url_citation",
                                "title": "Non officiel",
                                "url": "https://example.com/benefits",
                            },
                        ],
                    }
                ],
            },
            {
                "type": "web_search_call",
                "action": {
                    "sources": [
                        {
                            "title": "Gouvernement du Québec",
                            "url": "https://www.quebec.ca/",
                        }
                    ]
                },
            },
        ]
    }

    answer, links = _extract_model_response(
        payload,
        domains=["canada.ca", "quebec.ca"],
    )

    assert answer.startswith("Au Québec")
    assert {item.url for item in links} == {
        "https://www.canada.ca/en/services/benefits/finder.html",
        "https://www.quebec.ca/",
    }


def test_assistant_route_is_registered(monkeypatch) -> None:
    async def fake_answer(**kwargs):
        from app.schemas.canada_360 import Canada360AssistantResponse

        assert kwargs["question"] == "inflation"
        return Canada360AssistantResponse(
            answer="Canada — inflation: 2,1 %.",
            links=[],
            source_line="Statistique Canada",
            mode=kwargs["mode"],
            jurisdiction=kwargs["jurisdiction"],
        )

    monkeypatch.setattr(
        canada_360_assistant_service,
        "answer",
        fake_answer,
    )

    response = TestClient(app).post(
        "/api/v1/canada/assistant",
        json={
            "question": "inflation",
            "lang": "fr",
            "jurisdiction": "CA",
            "mode": "ask",
        },
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Canada — inflation: 2,1 %."
