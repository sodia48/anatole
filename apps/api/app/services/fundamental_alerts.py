"""Verifiable, opt-in fundamental events from the shared annual diagnostic."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256

from app.schemas.fundamentals import FinancialPeriod, FundamentalSnapshot
from app.schemas.workspace import AlertEvaluation, AlertRule
from app.services.fundamental_intelligence import build_fundamental_diagnostic


_DEFAULT_THRESHOLDS = {
    "fundamental_margin_drop": 3.0,  # percentage points
    "fundamental_debt_rise": 0.25,  # debt / equity ratio points
    "fundamental_fcf_drop": 20.0,  # percent of the prior positive FCF
}
_MEASURES = {
    "fundamental_margin_drop": ("operating_margin", "Marge opérationnelle", "points"),
    "fundamental_debt_rise": ("debt_to_equity", "Dette / capitaux propres", "x"),
    "fundamental_fcf_drop": ("free_cash_flow", "Flux disponible", "%"),
}


def _official(row: FinancialPeriod) -> bool:
    return bool(
        row.source
        and row.source.confidence == "official"
        and row.source.source_type in {"sec_edgar_xbrl", "issuer_official_normalized", "issuer_official_document"}
        and row.source.source_url
        and row.source.filed_at
    )


def evaluate_fundamental_event(
    rule: AlertRule, snapshot: FundamentalSnapshot, evaluated_at: datetime
) -> AlertEvaluation:
    symbol = rule.symbol.strip().upper().removesuffix(".TO")
    event_type = rule.event_type
    label = "Publication de résultats" if event_type == "fundamental_results" else _MEASURES[event_type][1]
    threshold = rule.threshold if rule.threshold is not None else _DEFAULT_THRESHOLDS.get(event_type)
    common = dict(
        id=rule.id, symbol=symbol, name=snapshot.name or symbol, event_type=event_type,
        metric_label=label, threshold=threshold, unit=_MEASURES[event_type][2] if event_type in _MEASURES else "",
        evaluated_at=evaluated_at,
    )

    def unavailable(message: str) -> AlertEvaluation:
        return AlertEvaluation(**common, triggered=False, status="unavailable", message=message)

    if snapshot.stale or snapshot.status == "unavailable":
        return unavailable("Données fondamentales périmées ou indisponibles : aucun déclenchement.")
    if event_type == "fundamental_results":
        published = sorted(
            (row for row in [*snapshot.annual_financials, *snapshot.quarterly_financials] if _official(row)),
            key=lambda row: row.source.filed_at, reverse=True,
        )
        if not published:
            return unavailable("Aucun rapport officiel daté et accessible.")
        latest_report = published[0]
        report_source = latest_report.source
        assert report_source is not None and report_source.filed_at is not None and report_source.source_url is not None
        filed_at = report_source.filed_at.astimezone(UTC)
        age = evaluated_at - filed_at
        if age < timedelta(0) or age > timedelta(days=90):
            return AlertEvaluation(**common, triggered=False, status="monitoring", message="Aucune publication officielle récente vérifiée.")
        digest = sha256(report_source.source_url.encode("utf-8")).hexdigest()[:16]
        return AlertEvaluation(
            **common, triggered=True, status="triggered",
            message=f"Rapport {('annuel' if latest_report.period_type == 'annual' else 'trimestriel')} {latest_report.period_end.date().isoformat()} publié le {filed_at.date().isoformat()} · {report_source.source_name}.",
            source=report_source.source_url,
            event_fingerprint=f"{symbol}:results:{latest_report.period_type}:{latest_report.period_end.date().isoformat()}:{digest}",
            event_value=latest_report.period_end.date().isoformat(),
        )
    rows = sorted(
        (row for row in snapshot.annual_financials if row.period_type == "annual"),
        key=lambda row: row.period_end, reverse=True,
    )
    if not rows or not _official(rows[0]):
        return unavailable("Exercice annuel officiel daté et accessible requis.")
    latest = rows[0]
    latest_source = latest.source
    assert latest_source is not None and latest_source.filed_at is not None
    filed_at = latest_source.filed_at.astimezone(UTC)
    age = evaluated_at - filed_at
    if age < timedelta(0) or age > timedelta(days=90):
        return AlertEvaluation(**common, triggered=False, status="monitoring", message="Aucune publication officielle récente vérifiée.")
    source_url = latest_source.source_url
    assert source_url is not None
    source_digest = sha256(source_url.encode("utf-8")).hexdigest()[:16]
    if len(rows) < 2:
        return unavailable("Deux exercices annuels comparables sont requis.")
    previous = rows[1]
    if not (
        _official(previous)
        and 300 <= (latest.period_end - previous.period_end).days <= 430
        and latest.currency and latest.currency == previous.currency
        and previous.source and previous.source.source_type == latest_source.source_type
    ):
        return unavailable("Périodes, devise ou provenance officielle non comparables.")
    diagnostic = build_fundamental_diagnostic(snapshot)
    measure_key = _MEASURES[event_type][0]
    measure = next(item for item in diagnostic.measures if item.key == measure_key)
    points = measure.observations[:2]
    if len(points) != 2 or [point.period_end for point in points] != [latest.period_end, previous.period_end]:
        return unavailable("Mesure absente ou non applicable à ce secteur.")
    current, prior = points[0].value, points[1].value
    if event_type == "fundamental_margin_drop":
        change = prior - current
        direction = "baisse"
    elif event_type == "fundamental_debt_rise":
        change = current - prior
        direction = "hausse"
    else:
        if prior <= 0:
            return unavailable("Une base de flux disponible strictement positive est requise.")
        change = (prior - current) / prior * 100
        direction = "baisse"
    triggered = change >= threshold
    return AlertEvaluation(
        **common, triggered=triggered, status="triggered" if triggered else "monitoring",
        current_value=round(change, 4),
        message=(
            f"{label} : {direction} de {change:.2f} {_MEASURES[event_type][2]} entre "
            f"{previous.period_end.date().isoformat()} et {latest.period_end.date().isoformat()} "
            f"({prior:.2f} → {current:.2f}) · {latest_source.source_name}."
        ),
        source=source_url,
        event_fingerprint=(
            f"{symbol}:{event_type}:{previous.period_end.date().isoformat()}:"
            f"{latest.period_end.date().isoformat()}:{source_digest}"
        ) if triggered else None,
        event_value=latest.period_end.date().isoformat() if triggered else None,
    )
