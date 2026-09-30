from __future__ import annotations

import pytest

from app.schemas.canada_360 import (
    Canada360AssistantProfile,
)
from app.services.canada_360_precision import (
    PROVINCE_DOMAINS,
    audit_grounded_answer,
    build_precision_instructions,
)


@pytest.mark.parametrize(
    "code",
    [
        "QC",
        "ON",
        "BC",
        "AB",
        "SK",
        "MB",
        "NB",
        "NS",
        "PE",
        "NL",
    ],
)
def test_precision_policy_knows_all_ten_provinces(
    code,
) -> None:
    assert code in PROVINCE_DOMAINS
    assert PROVINCE_DOMAINS[code]


def test_benefits_answer_requires_federal_and_provincial_evidence() -> None:
    profile = Canada360AssistantProfile(
        age=25,
        family_status="single",
        employment_status="unemployed",
        province="QC",
        objective="financial_assistance",
    )

    rejected = audit_grounded_answer(
        answer=(
            "Voici les programmes à vérifier selon ta situation."
        ),
        source_urls=[
            (
                "https://www.canada.ca/en/services/benefits/"
                "ei/ei-regular-benefit/eligibility.html"
            )
        ],
        question=(
            "J'ai 25 ans, je suis sans emploi et je cherche "
            "une aide financière."
        ),
        topic="benefits",
        jurisdiction="QC",
        profile=profile,
        history=[],
    )

    assert rejected.accepted is False
    assert "federal and provincial" in rejected.reason

    accepted = audit_grounded_answer(
        answer=(
            "Voici les programmes à vérifier selon ta situation."
        ),
        source_urls=[
            (
                "https://www.canada.ca/en/services/benefits/"
                "ei/ei-regular-benefit/eligibility.html"
            ),
            (
                "https://www.quebec.ca/famille-et-soutien-aux-personnes/"
                "aide-sociale-et-solidarite-sociale"
            ),
        ],
        question=(
            "J'ai 25 ans, je suis sans emploi et je cherche "
            "une aide financière."
        ),
        topic="benefits",
        jurisdiction="QC",
        profile=profile,
        history=[],
    )

    assert accepted.accepted is True
    assert accepted.federal is True
    assert accepted.provincial is True
    assert accepted.detailed is True


def test_detailed_question_rejects_homepage_only_evidence() -> None:
    profile = Canada360AssistantProfile(province="ON")

    audit = audit_grounded_answer(
        answer="Le programme pourrait s'appliquer.",
        source_urls=["https://www.ontario.ca/"],
        question="Suis-je admissible à cette aide ?",
        topic="benefits",
        jurisdiction="ON",
        profile=profile,
        history=[],
    )

    assert audit.accepted is False
    assert "generic government landing pages" in audit.reason


def test_categorical_eligibility_is_rejected_when_material_facts_missing() -> None:
    profile = Canada360AssistantProfile(
        age=25,
        employment_status="unemployed",
        province="AB",
        objective="financial_assistance",
    )

    audit = audit_grounded_answer(
        answer="Tu es admissible à cette prestation.",
        source_urls=[
            (
                "https://www.canada.ca/en/services/benefits/"
                "ei/ei-regular-benefit/eligibility.html"
            ),
            "https://www.alberta.ca/income-support",
        ],
        question="Est-ce que je peux avoir de l'aide ?",
        topic="benefits",
        jurisdiction="AB",
        profile=profile,
        history=[],
    )

    assert audit.accepted is False
    assert "categorical eligibility" in audit.reason


def test_precision_prompt_identifies_missing_unemployment_facts() -> None:
    profile = Canada360AssistantProfile(
        age=25,
        family_status="single",
        employment_status="unemployed",
        province="NS",
        objective="financial_assistance",
    )

    instructions = build_precision_instructions(
        question="Je cherche une aide financière.",
        topic="benefits",
        jurisdiction="NS",
        profile=profile,
        history=[],
    )

    assert "reason the last job ended" in instructions
    assert "recent insurable hours" in instructions
    assert "current income" in instructions
    assert "savings/assets" in instructions
    assert "federal and provincial programs" in instructions


def test_precision_prompt_stops_reasking_facts_already_in_history() -> None:
    class Turn:
        text = (
            "J'ai été mis à pied. J'ai 650 heures assurables, "
            "mon revenu est de 0 $ et j'ai 500 $ d'épargne."
        )

    profile = Canada360AssistantProfile(
        employment_status="unemployed",
        province="MB",
        objective="financial_assistance",
    )

    instructions = build_precision_instructions(
        question="Quelles aides dois-je vérifier maintenant ?",
        topic="benefits",
        jurisdiction="MB",
        profile=profile,
        history=[Turn()],
    )

    assert "reason the last job ended" not in instructions
    assert "recent insurable hours" not in instructions
    assert "current income" not in instructions
    assert "savings/assets" not in instructions
