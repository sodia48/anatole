from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.schemas.workspace import (
    AlertEvaluateRequest,
    AlertEvaluation,
    AlertSnapshot,
)
from app.services.market_data import market_data_service


_METRIC_LABELS = {
    "price": ("Prix", "$"),
    "change_percent": ("Variation du jour", "%"),
    "rsi_14": ("RSI 14", ""),
    "momentum_20d": ("Momentum 20 séances", "%"),
    "relative_volume": ("Volume relatif", "x"),
    "score": ("Score Anatole", "/100"),
}


def _key(value: str) -> str:
    return value.strip().upper().removesuffix(".TO").replace("-", ".")


def _average_volume(candles, sessions: int = 20) -> float:
    sample = candles[-sessions:] if len(candles) >= sessions else candles
    return sum(item.volume for item in sample) / max(len(sample), 1)


def _momentum(candles, sessions: int = 20) -> float:
    if len(candles) <= sessions or candles[-sessions - 1].close == 0:
        return 0.0
    return (candles[-1].close / candles[-sessions - 1].close - 1) * 100


def _score(change: float, momentum: float, relative_volume: float, rsi, trend: str) -> float:
    value = 50.0
    value += max(-18.0, min(18.0, momentum * 1.8))
    value += max(-8.0, min(8.0, change * 2.0))
    value += max(-5.0, min(8.0, (relative_volume - 1.0) * 8.0))
    value += {"Haussière": 12.0, "Mixte": 2.0, "Baissière": -14.0}.get(trend, 0.0)
    if rsi is not None and (rsi >= 80 or rsi <= 25):
        value -= 8.0
    return round(max(0.0, min(100.0, value)), 1)


def _format(value: float | None, unit: str) -> str:
    if value is None:
        return "N/D"
    if unit == "$":
        return f"{value:,.2f} $"
    if unit == "%":
        return f"{value:+.2f} %"
    if unit == "x":
        return f"{value:.2f}x"
    if unit == "/100":
        return f"{value:.1f}/100"
    return f"{value:.1f}"


class AlertService:
    async def evaluate(self, request: AlertEvaluateRequest) -> AlertSnapshot:
        enabled_symbols = list(
            dict.fromkeys(
                rule.symbol.strip().upper().removesuffix(".TO")
                for rule in request.rules
                if rule.enabled
            )
        )
        quotes, histories = await asyncio.gather(
            market_data_service.get_quotes(enabled_symbols),
            market_data_service.get_history_many(
                enabled_symbols,
                range_="3mo",
                interval="1d",
                concurrency=6,
            ),
        )
        quote_by_symbol = {_key(item.symbol): item for item in quotes}
        quote_by_symbol.update({_key(item.ticker): item for item in quotes})
        evaluated_at = datetime.now(UTC)
        items: list[AlertEvaluation] = []

        for rule in request.rules:
            symbol = rule.symbol.strip().upper().removesuffix(".TO")
            label, unit = _METRIC_LABELS[rule.metric]
            if not rule.enabled:
                items.append(
                    AlertEvaluation(
                        id=rule.id,
                        symbol=symbol,
                        name=symbol,
                        metric=rule.metric,
                        metric_label=label,
                        operator=rule.operator,
                        threshold=rule.threshold,
                        current_value=None,
                        unit=unit,
                        triggered=False,
                        status="disabled",
                        message="Alerte désactivée.",
                        evaluated_at=evaluated_at,
                    )
                )
                continue

            quote = quote_by_symbol.get(symbol)
            candles = histories.get(symbol, [])
            if quote is None or not candles:
                items.append(
                    AlertEvaluation(
                        id=rule.id,
                        symbol=symbol,
                        name=quote.name if quote else symbol,
                        metric=rule.metric,
                        metric_label=label,
                        operator=rule.operator,
                        threshold=rule.threshold,
                        current_value=None,
                        unit=unit,
                        triggered=False,
                        status="unavailable",
                        message="Donnée temporairement indisponible.",
                        source=quote.source if quote else None,
                        evaluated_at=evaluated_at,
                    )
                )
                continue

            technicals = market_data_service.calculate_technicals(candles)
            average_volume = _average_volume(candles)
            relative_volume = quote.volume / average_volume if average_volume else 0.0
            momentum = _momentum(candles)
            values = {
                "price": quote.price,
                "change_percent": quote.change_percent,
                "rsi_14": technicals.rsi_14,
                "momentum_20d": momentum,
                "relative_volume": relative_volume,
                "score": _score(
                    quote.change_percent,
                    momentum,
                    relative_volume,
                    technicals.rsi_14,
                    technicals.trend,
                ),
            }
            current = values[rule.metric]
            triggered = False
            if current is not None:
                triggered = (
                    current >= rule.threshold
                    if rule.operator == "above"
                    else current <= rule.threshold
                )
            operator_text = "au-dessus de" if rule.operator == "above" else "sous"
            state_text = "Déclenchée" if triggered else "Surveillance active"
            message = (
                f"{state_text} : {label} à {_format(current, unit)}, "
                f"seuil {operator_text} {_format(rule.threshold, unit)}."
            )
            items.append(
                AlertEvaluation(
                    id=rule.id,
                    symbol=symbol,
                    name=quote.name or symbol,
                    metric=rule.metric,
                    metric_label=label,
                    operator=rule.operator,
                    threshold=rule.threshold,
                    current_value=(round(float(current), 4) if current is not None else None),
                    unit=unit,
                    triggered=triggered,
                    status="triggered" if triggered else "monitoring",
                    message=message,
                    source=quote.source,
                    evaluated_at=evaluated_at,
                )
            )

        return AlertSnapshot(
            items=items,
            triggered_count=sum(item.status == "triggered" for item in items),
            monitored_count=sum(item.status == "monitoring" for item in items),
            unavailable_count=sum(item.status == "unavailable" for item in items),
            generated_at=evaluated_at,
            refresh_after_seconds=30,
        )


alert_service = AlertService()
