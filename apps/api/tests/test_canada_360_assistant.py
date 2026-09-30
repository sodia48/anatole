from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canada_360 import (
    Canada360Metric,
    Canada360Province,
    Canada360Snapshot,
)
from app.services.canada_360 import canada_360_service
from app.services.canada_360_assistant import canada_360_assistant_service


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
async def test_assistant_answers_from_official_snapshot(monkeypatch) -> None:
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
async def test_assistant_routes_benefits_to_official_resources() -> None:
    answer = await canada_360_assistant_service.answer(
        question="Quelles prestations puis-je chercher au Québec ?",
        lang="fr",
        jurisdiction="CA",
        mode="find",
    )

    urls = {item.url for item in answer.links}
    assert "https://www.canada.ca/en/services/benefits/finder.html" in urls
    assert "https://www.quebec.ca/en" in urls
    assert "admissibilité" in answer.answer


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
