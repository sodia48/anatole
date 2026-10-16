"""Deterministic, reusable calculations over a sourced FundamentalSnapshot.

The service never fetches a second provider or infers an absent historical point.
It is shared by Focus, peer comparison, scenarios, alerts and the assistant.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from app.schemas.fundamental_intelligence import (
    FundamentalDiagnostic,
    FundamentalDimension,
    FundamentalFinding,
    FundamentalMeasure,
    FundamentalObservation,
    FundamentalScoreContribution,
)
from app.schemas.fundamentals import FinancialPeriod, FundamentalSnapshot


Operation = Literal["field", "ratio", "growth", "net_debt_to_ebitda"]


@dataclass(frozen=True, slots=True)
class MeasureDefinition:
    key: str
    label_fr: str
    label_en: str
    dimension: str
    unit: Literal["money", "percent", "ratio"]
    operation: Operation
    numerator: str
    denominator: str | None = None
    multiplier: float = 1.0
    favorable: Literal["higher", "lower"] = "higher"
    method_fr: str = "Valeur publiée dans les états financiers."
    method_en: str = "Value published in the financial statements."


MEASURES: tuple[MeasureDefinition, ...] = (
    MeasureDefinition("revenue", "Revenus", "Revenue", "growth", "money", "field", "total_revenue"),
    MeasureDefinition("net_income", "Bénéfice net", "Net income", "growth", "money", "field", "net_income"),
    MeasureDefinition("operating_cash_flow", "Flux opérationnel", "Operating cash flow", "cash_flow", "money", "field", "operating_cash_flow"),
    MeasureDefinition("free_cash_flow", "Flux disponible", "Free cash flow", "cash_flow", "money", "field", "free_cash_flow"),
    MeasureDefinition("revenue_growth", "Croissance des revenus", "Revenue growth", "growth", "percent", "growth", "total_revenue", multiplier=100,
                      method_fr="Variation entre deux exercices consécutifs de même devise, avec une base strictement positive.",
                      method_en="Change between consecutive fiscal years in the same currency, with a strictly positive base."),
    MeasureDefinition("net_income_growth", "Croissance du bénéfice", "Net income growth", "growth", "percent", "growth", "net_income", multiplier=100,
                      method_fr="Variation du bénéfice annuel; non calculée si la base est nulle ou négative, ou si le signe change.",
                      method_en="Annual earnings change; unavailable for a zero or negative base or a sign change."),
    MeasureDefinition("operating_margin", "Marge opérationnelle", "Operating margin", "profitability", "percent", "ratio", "operating_income", "total_revenue", 100,
                      method_fr="Résultat opérationnel / revenus × 100, pour un même exercice.",
                      method_en="Operating income / revenue × 100 within the same fiscal year."),
    MeasureDefinition("net_margin", "Marge nette", "Net margin", "profitability", "percent", "ratio", "net_income", "total_revenue", 100,
                      method_fr="Bénéfice net / revenus × 100, pour un même exercice.",
                      method_en="Net income / revenue × 100 within the same fiscal year."),
    MeasureDefinition("free_cash_flow_margin", "Marge de flux disponible", "Free cash flow margin", "cash_flow", "percent", "ratio", "free_cash_flow", "total_revenue", 100,
                      method_fr="Flux disponible / revenus × 100, pour un même exercice.",
                      method_en="Free cash flow / revenue × 100 within the same fiscal year."),
    MeasureDefinition("operating_cash_flow_margin", "Marge de flux opérationnel", "Operating cash flow margin", "cash_flow", "percent", "ratio", "operating_cash_flow", "total_revenue", 100,
                      method_fr="Flux opérationnel / revenus × 100, pour un même exercice.",
                      method_en="Operating cash flow / revenue × 100 within the same fiscal year."),
    MeasureDefinition("cash_conversion", "Conversion bénéfice-trésorerie", "Earnings cash conversion", "earnings_quality", "percent", "ratio", "operating_cash_flow", "net_income", 100,
                      method_fr="Flux opérationnel / bénéfice net × 100; non calculé si le bénéfice est nul ou négatif.",
                      method_en="Operating cash flow / net income × 100; unavailable when earnings are zero or negative."),
    MeasureDefinition("free_cash_flow_conversion", "Conversion bénéfice-flux disponible", "Earnings free cash conversion", "earnings_quality", "percent", "ratio", "free_cash_flow", "net_income", 100,
                      method_fr="Flux disponible / bénéfice net × 100; non calculé si le bénéfice est nul ou négatif.",
                      method_en="Free cash flow / net income × 100; unavailable when earnings are zero or negative."),
    MeasureDefinition("current_ratio", "Liquidité générale", "Current ratio", "liquidity", "ratio", "ratio", "current_assets", "current_liabilities",
                      method_fr="Actifs courants / passifs courants du même bilan.",
                      method_en="Current assets / current liabilities from the same balance sheet."),
    MeasureDefinition("cash_to_debt", "Trésorerie / dette", "Cash / debt", "liquidity", "ratio", "ratio", "total_cash", "total_debt",
                      method_fr="Trésorerie / dette totale du même bilan; non défini si la dette est nulle.",
                      method_en="Cash / total debt from the same balance sheet; undefined if debt is zero."),
    MeasureDefinition("debt_to_equity", "Dette / capitaux propres", "Debt / equity", "leverage", "ratio", "ratio", "total_debt", "stockholder_equity", favorable="lower",
                      method_fr="Dette totale / capitaux propres du même bilan; non défini si les capitaux propres sont nuls ou négatifs.",
                      method_en="Total debt / equity from the same balance sheet; undefined for zero or negative equity."),
    MeasureDefinition("net_debt_to_ebitda", "Dette nette / BAIIA", "Net debt / EBITDA", "leverage", "ratio", "net_debt_to_ebitda", "net_debt", "ebitda", favorable="lower",
                      method_fr="(Dette totale − trésorerie) / BAIIA du même exercice; BAIIA strictement positif requis.",
                      method_en="(Total debt − cash) / EBITDA from the same fiscal year; strictly positive EBITDA required."),
)

DIMENSIONS = (
    ("growth", "Croissance", "Growth"),
    ("profitability", "Rentabilité", "Profitability"),
    ("liquidity", "Liquidité", "Liquidity"),
    ("leverage", "Endettement", "Leverage"),
    ("cash_flow", "Flux de trésorerie", "Cash flow"),
    ("earnings_quality", "Qualité des résultats", "Earnings quality"),
)


def sector_family(snapshot: FundamentalSnapshot) -> str:
    context = f"{snapshot.sector or ''} {snapshot.industry or ''}".casefold()
    if any(value in context for value in ("bank", "banque")):
        return "bank"
    if any(value in context for value in ("insurance", "assurance")):
        return "insurance"
    if any(value in context for value in ("reit", "real estate", "immobilier")):
        return "real_estate"
    if any(value in context for value in ("mining", "miner", "métaux", "metals")):
        return "mining"
    if any(value in context for value in ("technology", "software", "technologie")):
        return "technology"
    if any(value in context for value in ("industrial", "industrie")):
        return "industrial"
    return "general"


def _finite(value: float | None) -> float | None:
    return value if value is not None and math.isfinite(value) else None


def _currency(row: FinancialPeriod, snapshot: FundamentalSnapshot) -> str | None:
    # A snapshot-level display currency cannot prove an individual period's currency.
    return row.currency


def _period_value(row: FinancialPeriod, field: str) -> float | None:
    if field == "net_debt":
        direct = _finite(row.net_debt)
        if direct is not None:
            return direct
        debt, cash = _finite(row.total_debt), _finite(row.total_cash)
        return debt - cash if debt is not None and cash is not None else None
    return _finite(getattr(row, field))


def _observation(
    snapshot: FundamentalSnapshot,
    row: FinancialPeriod,
    definition: MeasureDefinition,
    value: float,
    *,
    calculated: bool,
    inputs: list[str],
) -> FundamentalObservation:
    source = row.source
    derived = calculated or definition.numerator in row.calculated_fields
    return FundamentalObservation(
        value=round(value, 8),
        period_end=row.period_end,
        period_type=row.period_type,
        unit=definition.unit,
        currency=_currency(row, snapshot) if definition.unit == "money" else None,
        nature="calculated" if derived else "published",
        formula=definition.method_en if derived else None,
        inputs=inputs,
        source_name=source.source_name if source else snapshot.source,
        source_url=source.source_url if source else None,
        source_type=source.source_type if source else None,
        source_confidence=source.confidence if source else "unclassified",
        filed_at=source.filed_at if source else None,
    )


def _measure(snapshot: FundamentalSnapshot, rows: list[FinancialPeriod], definition: MeasureDefinition, family: str) -> FundamentalMeasure:
    if family in {"bank", "insurance"} and definition.dimension in {"liquidity", "leverage"}:
        return FundamentalMeasure(
            key=definition.key, label_fr=definition.label_fr, label_en=definition.label_en,
            dimension=definition.dimension, unit=definition.unit, status="not_applicable",
            reason_fr="Ratios génériques non interprétables pour cette activité financière.",
            reason_en="Generic ratios are not interpretable for this financial business.",
            method_fr=definition.method_fr, method_en=definition.method_en,
        )
    observations: list[FundamentalObservation] = []
    for index, row in enumerate(rows):
        value: float | None = None
        inputs = [definition.numerator]
        if definition.operation == "field":
            value = _period_value(row, definition.numerator)
        elif definition.operation == "growth":
            if index + 1 < len(rows):
                prior = rows[index + 1]
                days = (row.period_end - prior.period_end).days
                current, previous = _period_value(row, definition.numerator), _period_value(prior, definition.numerator)
                currency = _currency(row, snapshot)
                same_definition = (row.source is None and prior.source is None) or (
                    row.source is not None and prior.source is not None
                    and row.source.source_type == prior.source.source_type
                )
                if 300 <= days <= 430 and currency is not None and currency == _currency(prior, snapshot) and same_definition and current is not None and previous is not None and previous > 0 and current >= 0:
                    value = (current / previous - 1) * definition.multiplier
                    inputs.append(f"{definition.numerator}@{prior.period_end.date().isoformat()}")
        else:
            numerator = _period_value(row, definition.numerator)
            denominator = _period_value(row, definition.denominator or "")
            if numerator is not None and denominator is not None and denominator > 0:
                value = numerator / denominator * definition.multiplier
                inputs.append(definition.denominator or "")
                if definition.operation == "net_debt_to_ebitda" and row.net_debt is None:
                    inputs = ["total_debt", "total_cash", "ebitda"]
        if value is not None and math.isfinite(value):
            observations.append(_observation(snapshot, row, definition, value,
                                             calculated=definition.operation != "field", inputs=inputs))
    return FundamentalMeasure(
        key=definition.key, label_fr=definition.label_fr, label_en=definition.label_en,
        dimension=definition.dimension, unit=definition.unit, observations=observations,
        status="available" if observations else "insufficient",
        reason_fr=None if observations else "Champs, périodes ou devises comparables insuffisants.",
        reason_en=None if observations else "Insufficient fields, periods or comparable currencies.",
        method_fr=definition.method_fr, method_en=definition.method_en,
    )


def _dimensions(measures: list[FundamentalMeasure], rows: list[FinancialPeriod], family: str) -> list[FundamentalDimension]:
    definitions = {item.key: item for item in MEASURES}
    result: list[FundamentalDimension] = []
    latest_dates = [row.period_end for row in rows[:2]]
    for key, label_fr, label_en in DIMENSIONS:
        members = [item for item in measures if item.dimension == key]
        available = [item for item in members if item.status == "available"]
        special = family in {"bank", "insurance"} and key in {"liquidity", "leverage"}
        contributions: list[FundamentalScoreContribution] = []
        consecutive = len(latest_dates) == 2 and 300 <= (latest_dates[0] - latest_dates[1]).days <= 430
        if not special and consecutive:
            for measure in available:
                if measure.unit == "money":
                    continue  # A trend score must not double-count raw amount and derived growth.
                points = measure.observations[:2]
                if len(points) < 2 or [item.period_end for item in points] != latest_dates:
                    continue
                if points[0].source_type != points[1].source_type:
                    continue
                current, previous = points[0].value, points[1].value
                tolerance = max(abs(previous) * .05, 1.0 if measure.unit == "percent" else .05)
                delta = current - previous
                if definitions[measure.key].favorable == "lower":
                    delta = -delta
                direction: Literal["improving", "stable", "deteriorating"] = (
                    "improving" if delta > tolerance else "deteriorating" if delta < -tolerance else "stable"
                )
                contributions.append(FundamentalScoreContribution(
                    measure_key=measure.key, previous=previous, current=current,
                    direction=direction, points={"improving": 100, "stable": 50, "deteriorating": 0}[direction],
                ))
        scored = len(contributions) >= 2
        result.append(FundamentalDimension(
            key=key, label_fr=label_fr, label_en=label_en,
            measure_keys=[item.key for item in members], available_count=len(available),
            score=round(sum(item.points for item in contributions) / len(contributions), 1) if scored else None,
            score_status="not_applicable" if special else "directional" if scored else "insufficient",
            contributions=contributions if scored else [],
            explanation_fr=("Ratios génériques non applicables à cette activité financière." if special else
                            "Indice de direction historique uniquement : deux ratios comparables au minimum, 100 si amélioration, 50 si stable, 0 si détérioration, poids égaux. Ce n'est pas une note de santé ni une recommandation." if scored else
                            "Deux ratios comparables sur les deux derniers exercices sont requis pour un indice directionnel."),
            explanation_en=("Generic ratios do not apply to this financial business." if special else
                            "Historical direction index only: at least two comparable ratios, 100 for improving, 50 for stable, 0 for deteriorating, equal weights. It is not a health rating or recommendation." if scored else
                            "Two comparable ratios across the two latest fiscal years are required for a directional index."),
        ))
    return result


def _findings(measures: list[FundamentalMeasure]) -> list[FundamentalFinding]:
    by_key = {item.key: item for item in measures}

    def latest(key: str) -> float | None:
        values = by_key[key].observations
        return values[0].value if values else None

    found: list[FundamentalFinding] = []
    revenue_growth = latest("revenue_growth")
    if revenue_growth is not None and revenue_growth > 5:
        found.append(FundamentalFinding(kind="strength", text_fr="Les revenus publiés progressent sur le dernier exercice comparable.",
                                        text_en="Published revenue increased in the latest comparable fiscal year.", measure_keys=["revenue_growth"]))
    elif revenue_growth is not None and revenue_growth < 0:
        found.append(FundamentalFinding(kind="vulnerability", text_fr="Les revenus publiés reculent sur le dernier exercice comparable.",
                                        text_en="Published revenue declined in the latest comparable fiscal year.", measure_keys=["revenue_growth"]))
    conversion = latest("cash_conversion")
    if conversion is not None and conversion < 80:
        found.append(FundamentalFinding(kind="vulnerability", text_fr="Les flux opérationnels couvrent moins de 80 % du bénéfice net publié.",
                                        text_en="Operating cash flow covers less than 80% of published net income.", measure_keys=["cash_conversion"]))
    elif conversion is not None and conversion >= 100:
        found.append(FundamentalFinding(kind="strength", text_fr="Les flux opérationnels couvrent le bénéfice net publié.",
                                        text_en="Operating cash flow covers published net income.", measure_keys=["cash_conversion"]))
    income = by_key["net_income"].observations
    cash = by_key["free_cash_flow"].observations
    if len(income) >= 2 and len(cash) >= 2 and income[0].period_end == cash[0].period_end and income[1].period_end == cash[1].period_end:
        if income[0].value > income[1].value and cash[0].value < cash[1].value:
            found.append(FundamentalFinding(kind="observation",
                                            text_fr="Le bénéfice progresse alors que le flux disponible recule; les deux séries méritent un examen conjoint.",
                                            text_en="Earnings rose while free cash flow fell; the two series warrant a joint review.",
                                            measure_keys=["net_income", "free_cash_flow"]))
    return found


def build_fundamental_diagnostic(snapshot: FundamentalSnapshot) -> FundamentalDiagnostic:
    """Build a non-advisory diagnostic from observations already in the snapshot."""
    family = sector_family(snapshot)
    rows = sorted((row for row in snapshot.annual_financials if row.period_type == "annual"),
                  key=lambda row: row.period_end, reverse=True)
    measures = [_measure(snapshot, rows, definition, family) for definition in MEASURES]
    return FundamentalDiagnostic(
        ticker=snapshot.ticker, name=snapshot.name, sector=snapshot.sector,
        industry=snapshot.industry, sector_family=family, generated_at=datetime.now(UTC),
        source_generated_at=snapshot.generated_at, stale=snapshot.stale,
        financial_currency=snapshot.financial_currency, status=snapshot.status,
        measures=measures, dimensions=_dimensions(measures, rows, family),
        findings=_findings(measures),
        methodology_fr="Calculs déterministes sur les exercices annuels du même instantané. Sources, périodes et formules par observation. Aucun score global ni conseil d'investissement.",
        methodology_en="Deterministic calculations over annual periods from one snapshot. Sources, periods and formulas per observation. No global score or investment advice.",
        missing_data=[item.key for item in measures if item.status == "insufficient"],
    )
