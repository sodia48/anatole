from app.services.provincial_essential_policy import (
    classify_essential_release,
    source_options_for_region,
)


def test_quebec_source_priority() -> None:
    options = source_options_for_region("Québec", "fr")
    assert options[0] == "Toutes"
    assert options[1] == "Statistique Québec"
    assert "Gouvernement du Québec — Économie et finances" in options


def test_ontario_source_priority() -> None:
    options = source_options_for_region("Ontario", "fr")
    assert "Ontario Economic Accounts — Ministère des Finances" in options


def test_reject_premier_minister_agenda() -> None:
    decision = classify_essential_release(
        "Avis aux médias - Agenda public de la première ministre du Québec - 17 août 2026",
        "Annonce concernant la sécurité énergétique et le développement économique",
        source_kind="government",
    )
    assert decision.allowed is False


def test_reject_listeria() -> None:
    decision = classify_essential_release(
        "Mise en garde à la population : présence possible de Listeria",
        "Divers produits de jambon préparés.",
        source_kind="government",
    )
    assert decision.allowed is False


def test_accept_quebec_labour_market() -> None:
    decision = classify_essential_release(
        "Résultats de l’Enquête sur la population active pour le Québec",
        "Le nombre d’emplois augmente et le taux de chômage se fixe à 5,6 %.",
        source_kind="statistics",
    )
    assert decision.allowed is True
    assert decision.category == "Emploi"


def test_accept_cpi() -> None:
    decision = classify_essential_release(
        "Indice des prix à la consommation",
        "L’IPC augmente de 3,2 % sur douze mois.",
        source_kind="statistics",
    )
    assert decision.allowed is True
    assert decision.category == "Inflation"


def test_reject_vague_investment_announcement() -> None:
    decision = classify_essential_release(
        "Le gouvernement annonce un investissement",
        "Une annonce sera faite demain.",
        source_kind="government",
    )
    assert decision.allowed is False


def test_accept_material_investment_announcement() -> None:
    decision = classify_essential_release(
        "Investissement majeur dans une nouvelle usine",
        "Le projet de 850 millions de dollars créera 700 emplois et augmentera la capacité manufacturière.",
        source_kind="government",
    )
    assert decision.allowed is True
