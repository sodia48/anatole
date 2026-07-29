from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite

from app.schemas.workspace import (
    AdvisorPlan,
    AdvisorPlanRequest,
    AdvisorPriority,
    AdvisorProjection,
    AdvisorRiskDimension,
    AdvisorStressTest,
)
from app.services.portfolio import portfolio_service


SCENARIOS: tuple[tuple[str, str, float], ...] = (
    ("Préservation", "Capital stable", 0.0),
    ("Modéré", "Hypothèse illustrative", 3.0),
    ("Croissance", "Hypothèse illustrative", 6.0),
)

BOUNDARIES = [
    "Anatole n’indique jamais quel titre acheter, vendre ou conserver.",
    "Les scénarios sont illustratifs et ne constituent pas des prévisions de rendement.",
    "Le diagnostic porte sur les objectifs, les contraintes, la liquidité, la concentration et le risque.",
    "Les décisions fiscales, juridiques et réglementées doivent être validées avec un professionnel qualifié.",
]


def _money(value: float, currency: str) -> str:
    return f"{value:,.0f} {currency}".replace(",", " ")


def _future_value(
    current: float,
    monthly: float,
    years: int,
    annual_return_percent: float,
) -> float:
    months = max(0, years * 12)
    monthly_rate = annual_return_percent / 100 / 12
    if months == 0:
        return max(0.0, current)
    if abs(monthly_rate) < 1e-12:
        return max(0.0, current + monthly * months)
    growth = (1 + monthly_rate) ** months
    return max(0.0, current * growth + monthly * ((growth - 1) / monthly_rate))


def _capacity_label(score: int) -> str:
    if score <= -3:
        return "Prudente"
    if score <= 2:
        return "Équilibrée"
    return "Dynamique"


class AdvisorService:
    async def build(self, request: AdvisorPlanRequest) -> AdvisorPlan:
        profile = request.profile
        currency = profile.currency
        required_values = (
            profile.goal_type,
            profile.horizon_years,
            profile.target_amount,
            profile.current_savings,
            profile.monthly_contribution,
            profile.essential_monthly_expenses,
            profile.liquid_reserve,
            profile.high_interest_debt,
            profile.income_stability,
            profile.liquidity_need,
            profile.loss_comfort,
        )
        completed = sum(value is not None and value != "" for value in required_values)
        completeness = round(completed / len(required_values) * 100)

        horizon = profile.horizon_years or 0
        current = profile.current_savings or 0.0
        monthly = profile.monthly_contribution or 0.0
        target = profile.target_amount
        expenses = profile.essential_monthly_expenses or 0.0
        reserve = profile.liquid_reserve or 0.0
        reserve_months = reserve / expenses if expenses > 0 else None

        capacity_score = 0
        capacity_dimensions: list[AdvisorRiskDimension] = []

        if horizon >= 10:
            capacity_score += 2
            horizon_status = "favorable"
            horizon_detail = "Un horizon long offre davantage de temps pour absorber les variations."
        elif horizon >= 5:
            capacity_score += 1
            horizon_status = "balanced"
            horizon_detail = "L’horizon est intermédiaire; la stabilité du plan reste importante."
        elif horizon > 0:
            capacity_score -= 2
            horizon_status = "caution"
            horizon_detail = "Un horizon court réduit la marge de récupération après une baisse."
        else:
            horizon_status = "incomplete"
            horizon_detail = "Renseigne l’horizon pour évaluer la capacité de risque."
        capacity_dimensions.append(
            AdvisorRiskDimension(
                key="horizon",
                label="Horizon",
                value=f"{horizon} an{'s' if horizon != 1 else ''}" if horizon else "À compléter",
                status=horizon_status,
                detail=horizon_detail,
            )
        )

        stability_points = {"low": -2, "medium": 0, "high": 1}.get(
            profile.income_stability or "", 0
        )
        capacity_score += stability_points
        capacity_dimensions.append(
            AdvisorRiskDimension(
                key="income_stability",
                label="Stabilité des entrées",
                value={"low": "Faible", "medium": "Moyenne", "high": "Élevée"}.get(
                    profile.income_stability or "", "À compléter"
                ),
                status=(
                    "incomplete" if profile.income_stability is None
                    else "favorable" if stability_points > 0
                    else "caution" if stability_points < 0
                    else "balanced"
                ),
                detail="Une source de liquidités stable augmente la capacité à traverser une période défavorable.",
            )
        )

        liquidity_points = {"low": 1, "medium": -1, "high": -2}.get(
            profile.liquidity_need or "", 0
        )
        capacity_score += liquidity_points
        capacity_dimensions.append(
            AdvisorRiskDimension(
                key="liquidity",
                label="Besoin de liquidité",
                value={"low": "Faible", "medium": "Moyen", "high": "Élevé"}.get(
                    profile.liquidity_need or "", "À compléter"
                ),
                status=(
                    "incomplete" if profile.liquidity_need is None
                    else "favorable" if liquidity_points > 0
                    else "caution" if liquidity_points < 0
                    else "balanced"
                ),
                detail="Les sommes nécessaires à court terme doivent rester séparées du capital exposé aux marchés.",
            )
        )

        comfort_points = {"low": -2, "medium": 0, "high": 2}.get(
            profile.loss_comfort or "", 0
        )
        capacity_score += comfort_points
        capacity_dimensions.append(
            AdvisorRiskDimension(
                key="loss_comfort",
                label="Tolérance aux baisses",
                value={"low": "Faible", "medium": "Moyenne", "high": "Élevée"}.get(
                    profile.loss_comfort or "", "À compléter"
                ),
                status=(
                    "incomplete" if profile.loss_comfort is None
                    else "favorable" if comfort_points > 0
                    else "caution" if comfort_points < 0
                    else "balanced"
                ),
                detail="Cette donnée mesure le confort déclaré; elle ne remplace pas la capacité financière réelle.",
            )
        )

        reserve_score = 50.0
        if reserve_months is not None:
            reserve_score = min(100.0, reserve_months / 6 * 100)
        debt_score = 50.0 if profile.high_interest_debt is None else 25.0 if profile.high_interest_debt else 100.0
        contribution_score = 100.0 if monthly > 0 else 35.0
        goal_score = float(completeness)

        portfolio_snapshot = None
        if request.portfolio_positions:
            portfolio_snapshot = await portfolio_service.analyze(
                request.to_portfolio_request()
            )
        portfolio_score = portfolio_snapshot.portfolio_score if portfolio_snapshot else 55.0

        readiness_score = round(
            reserve_score * 0.30
            + debt_score * 0.20
            + contribution_score * 0.15
            + goal_score * 0.15
            + portfolio_score * 0.20,
            1,
        )
        readiness_score = min(100.0, max(0.0, readiness_score))

        projections: list[AdvisorProjection] = []
        if horizon > 0:
            for key, label, annual_return in SCENARIOS:
                projected = _future_value(current, monthly, horizon, annual_return)
                gap = projected - target if target is not None else None
                progress = (
                    min(999.0, projected / target * 100)
                    if target is not None and target > 0
                    else None
                )
                projections.append(
                    AdvisorProjection(
                        key=key.casefold().replace("é", "e"),
                        label=label,
                        annual_return_percent=annual_return,
                        projected_value=round(projected, 2),
                        gap_to_target=round(gap, 2) if gap is not None else None,
                        progress_percent=round(progress, 1) if progress is not None else None,
                    )
                )

        priorities: list[AdvisorPriority] = []
        if completeness < 80:
            priorities.append(
                AdvisorPriority(
                    key="profile",
                    level="high",
                    title="Compléter le cadre de décision",
                    detail="Les objectifs, l’horizon et les contraintes manquantes limitent la précision du diagnostic.",
                    action="Complète les champs encore vides dans le profil.",
                )
            )
        if profile.high_interest_debt is None:
            priorities.append(
                AdvisorPriority(
                    key="debt_status",
                    level="medium",
                    title="Clarifier la contrainte de dette",
                    detail="Le profil n’indique pas encore si une dette à coût élevé existe.",
                    action="Renseigne ce point pour éviter de surestimer la marge de risque disponible.",
                )
            )
        elif profile.high_interest_debt:
            priorities.append(
                AdvisorPriority(
                    key="debt",
                    level="high",
                    title="Isoler la contrainte de dette coûteuse",
                    detail="Une dette à coût élevé peut réduire la capacité d’absorber une baisse de marché.",
                    action="Quantifie son coût et son calendrier avant d’augmenter l’exposition au risque.",
                )
            )
        if reserve_months is not None and reserve_months < 3:
            priorities.append(
                AdvisorPriority(
                    key="reserve",
                    level="high",
                    title="Renforcer la marge de liquidité",
                    detail=f"La réserve déclarée couvre environ {reserve_months:.1f} mois de dépenses essentielles.",
                    action="Définis séparément le capital de court terme et le capital de long terme.",
                )
            )
        elif reserve_months is None:
            priorities.append(
                AdvisorPriority(
                    key="reserve",
                    level="medium",
                    title="Mesurer le coussin de liquidité",
                    detail="Les dépenses essentielles ou la réserve liquide ne sont pas encore renseignées.",
                    action="Ajoute ces deux montants pour calculer le nombre de mois couverts.",
                )
            )
        if monthly <= 0:
            priorities.append(
                AdvisorPriority(
                    key="contribution",
                    level="medium",
                    title="Définir une cadence de contribution",
                    detail="Le plan ne contient aucun apport périodique déclaré.",
                    action="Teste plusieurs montants mensuels dans les scénarios, sans choisir de produit.",
                )
            )
        if portfolio_snapshot:
            risk = portfolio_snapshot.risk
            if risk.top_position_percent >= 25 or risk.top_three_percent >= 65:
                priorities.append(
                    AdvisorPriority(
                        key="concentration",
                        level="high",
                        title="Examiner la concentration",
                        detail=(
                            f"La principale position pèse {risk.top_position_percent:.1f} % et les trois premières "
                            f"{risk.top_three_percent:.1f} % du portefeuille."
                        ),
                        action="Évalue l’impact de scénarios défavorables avant toute modification hypothétique.",
                    )
                )
            if portfolio_snapshot.risk.risk_level in {"Élevé", "Très élevé"}:
                priorities.append(
                    AdvisorPriority(
                        key="portfolio_risk",
                        level="medium",
                        title="Documenter le budget de risque",
                        detail=f"Le moteur classe le risque observé comme {portfolio_snapshot.risk.risk_level.lower()}.",
                        action="Compare ce risque observé à l’horizon, à la liquidité et au confort déclarés.",
                    )
                )
        if not priorities:
            priorities.append(
                AdvisorPriority(
                    key="review",
                    level="low",
                    title="Maintenir une discipline de revue",
                    detail="Aucune contrainte prioritaire n’est détectée dans les informations déclarées.",
                    action="Programme une revue périodique des objectifs, de la concentration et des écarts.",
                )
            )

        stress_base = (
            portfolio_snapshot.total_market_value
            if portfolio_snapshot
            else max(current, 0.0)
        )
        stress_tests: list[AdvisorStressTest] = []
        if stress_base > 0:
            for shock in (-10.0, -20.0, -30.0):
                loss = stress_base * abs(shock) / 100
                stress_tests.append(
                    AdvisorStressTest(
                        label=f"Baisse hypothétique de {abs(shock):.0f} %",
                        shock_percent=shock,
                        estimated_loss=round(loss, 2),
                        estimated_value=round(stress_base - loss, 2),
                        detail="Impact mécanique simplifié, avant fiscalité, corrélations changeantes et mouvements de devise.",
                    )
                )

        goal_name = profile.goal_name or {
            "retirement": "Retraite",
            "home": "Projet immobilier",
            "education": "Études",
            "reserve": "Réserve",
            "wealth": "Capital à long terme",
            "flexible": "Objectif flexible",
        }.get(profile.goal_type or "", "Objectif à définir")

        if target is not None and projections:
            middle = projections[1]
            if middle.gap_to_target is not None and isfinite(middle.gap_to_target):
                goal_status = (
                    f"écart illustratif de {_money(abs(middle.gap_to_target), currency)} "
                    f"{'au-dessus' if middle.gap_to_target >= 0 else 'sous'} l’objectif"
                )
            else:
                goal_status = "écart non calculable"
        else:
            goal_status = "objectif financier à compléter"

        summary = (
            f"Le profil est complété à {completeness} % et le score de préparation atteint "
            f"{readiness_score:.0f}/100. La capacité de risque ressort comme "
            f"{_capacity_label(capacity_score).lower()}. Pour {goal_name}, le scénario modéré indique un "
            f"{goal_status}. Ce résultat est une simulation de planification, pas une prévision ni une recommandation de placement."
        )

        return AdvisorPlan(
            title=f"Plan de décision — {goal_name}",
            summary=summary,
            currency=currency,
            profile_completeness=completeness,
            readiness_score=readiness_score,
            capacity_profile=_capacity_label(capacity_score),
            capacity_score=capacity_score,
            reserve_months=round(reserve_months, 1) if reserve_months is not None else None,
            portfolio_score=round(portfolio_snapshot.portfolio_score, 1) if portfolio_snapshot else None,
            portfolio_risk_level=portfolio_snapshot.risk.risk_level if portfolio_snapshot else None,
            top_position_percent=round(portfolio_snapshot.risk.top_position_percent, 1) if portfolio_snapshot else None,
            projections=projections,
            priorities=priorities[:6],
            risk_dimensions=capacity_dimensions,
            stress_tests=stress_tests,
            boundaries=BOUNDARIES,
            generated_at=datetime.now(UTC),
        )


advisor_service = AdvisorService()
