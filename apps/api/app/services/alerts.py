from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from app.schemas.workspace import (
    AlertEvaluateRequest,
    AlertEvaluation,
    AlertSnapshot,
    DrawingAlertPoint,
)
from app.schemas.backtest import BacktestRequest
from app.services.backtest import strategy_signals
from app.services.market_data import market_data_service
from app.services.technical_analysis import (
    calculate_indicator,
    crossed_above,
    crossed_below,
    latest_value,
)
from app.services.analysis import analysis_service
from app.services.earnings_calendar import earnings_calendar_service
from app.services.insiders import insider_service
from app.services.stock_news import stock_news_service


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


def _momentum(candles, sessions: int = 20) -> float | None:
    if len(candles) <= sessions or candles[-sessions - 1].close == 0:
        return None
    return (candles[-1].close / candles[-sessions - 1].close - 1) * 100


def _relative_volume(volume: float, average_volume: float) -> float | None:
    return volume / average_volume if average_volume > 0 else None


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


def drawing_level(points: list[DrawingAlertPoint], time: int) -> float | None:
    if not points:
        return None
    if len(points) == 1 or points[1].time == points[0].time:
        return points[0].price
    slope = (
        points[1].price - points[0].price
    ) / (
        points[1].time - points[0].time
    )
    return points[0].price + slope * (time - points[0].time)


class AlertService:
    async def _evaluate_event(self, rule, evaluated_at: datetime) -> AlertEvaluation:
        symbol = rule.symbol.strip().upper().removesuffix(".TO")
        triggered = False
        source: str | None = None
        message = "Événement non observé lors de cette évaluation."
        try:
            if rule.event_type == "terminal_anomaly":
                snapshot = await analysis_service.terminal()
                matches = [item for item in snapshot.anomalies if item.symbol == symbol]
                triggered = bool(matches)
                source = matches[0].source if matches else "Terminal Pro · données de marché"
                message = matches[0].detail if matches else "Aucune anomalie Terminal active pour ce titre."
            elif rule.event_type == "terminal_regime":
                snapshot = await analysis_service.terminal()
                source = "Terminal Pro · TSX 60"
                message = f"Régime Terminal actuel : {snapshot.regime or 'N/D'}. Un changement nécessite une observation précédente."
            elif rule.event_type == "earnings_upcoming":
                snapshot = await earnings_calendar_service.get_snapshot("composite")
                horizon = evaluated_at + timedelta(days=7)
                matches = [item for item in snapshot.events if item.ticker == symbol and evaluated_at <= item.starts_at <= horizon]
                triggered = bool(matches)
                source = matches[0].source if matches else "Calendrier public des résultats"
                message = f"Résultats attendus le {matches[0].starts_at.isoformat()}." if matches else "Aucun résultat sourcé dans les sept prochains jours."
            elif rule.event_type == "insider_unusual":
                snapshot = await insider_service.snapshot(market="canada", ticker=symbol, days=180, scan_limit=1, result_limit=40)
                matches = [trade for trade in snapshot.trades if trade.unusual]
                triggered = bool(matches)
                source = matches[0].source_name if matches else next((item.source for item in snapshot.sources if item.status != "unavailable"), None)
                message = f"{len(matches)} transaction(s) inhabituelle(s) sourcée(s)." if matches else "Aucune transaction inhabituelle sourcée dans le snapshot disponible."
            elif rule.event_type == "company_news":
                snapshot = await stock_news_service.get_snapshot(symbol, language="fr")
                recent = [item for item in snapshot.items if item.published_at >= evaluated_at - timedelta(hours=24)]
                triggered = bool(recent)
                source = recent[0].publisher if recent else None
                message = recent[0].title if recent else "Aucune nouvelle récente sourcée concernant ce titre."
            else:
                raise ValueError("Type d'événement inconnu")
        except Exception:  # noqa: BLE001
            return AlertEvaluation(id=rule.id, symbol=symbol, name=symbol, event_type=rule.event_type, metric_label="Événement", unit="", triggered=False, status="unavailable", message="Source événementielle temporairement indisponible.", evaluated_at=evaluated_at)
        return AlertEvaluation(id=rule.id, symbol=symbol, name=symbol, event_type=rule.event_type, metric_label="Événement", unit="", triggered=triggered, status="triggered" if triggered else "monitoring", message=message, source=source, evaluated_at=evaluated_at)

    async def evaluate(self, request: AlertEvaluateRequest) -> AlertSnapshot:
        enabled_symbols = list(
            dict.fromkeys(
                rule.symbol.strip().upper().removesuffix(".TO")
                for rule in request.rules
                if rule.enabled and rule.kind == "threshold"
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
            if rule.kind == "event":
                if not rule.enabled:
                    items.append(AlertEvaluation(id=rule.id, symbol=symbol, name=symbol, event_type=rule.event_type, metric_label="Événement", unit="", triggered=False, status="disabled", message="Alerte désactivée.", evaluated_at=evaluated_at))
                else:
                    items.append(await self._evaluate_event(rule, evaluated_at))
                continue
            assert rule.metric is not None and rule.operator is not None and rule.threshold is not None
            label, unit = _METRIC_LABELS[rule.metric]
            if not rule.enabled:
                items.append(
                    AlertEvaluation(
                        id=rule.id,
                        symbol=symbol,
                        name=symbol,
                        metric=rule.metric,
                        alert_type=rule.alert_type,
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
                        alert_type=rule.alert_type,
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

            try:
                if rule.alert_type == "price_level":
                    technicals = market_data_service.calculate_technicals(candles)
                    average_volume = _average_volume(candles)
                    relative_volume = _relative_volume(quote.volume, average_volume)
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
                        ) if momentum is not None and relative_volume is not None else None,
                    }
                    current = values[rule.metric]
                    threshold = rule.threshold
                    triggered = (
                        current is not None
                        and (
                            current >= threshold
                            if rule.operator == "above"
                            else current <= threshold
                        )
                    )
                elif rule.alert_type == "indicator_threshold":
                    indicator_id = rule.indicator_id or "rsi"
                    outputs = calculate_indicator(
                        candles,
                        indicator_id,
                        rule.indicator_inputs,
                    )
                    output = outputs.get(rule.indicator_output)
                    if output is None:
                        output = next(iter(outputs.values()))
                    current = latest_value(output)
                    threshold = rule.threshold
                    label = f"{indicator_id.upper()} / {rule.indicator_output}"
                    unit = ""
                    triggered = (
                        current is not None
                        and (
                            current >= threshold
                            if rule.operator == "above"
                            else current <= threshold
                        )
                    )
                elif rule.alert_type == "indicator_cross":
                    primary_id = rule.indicator_id or "sma"
                    comparison_id = rule.comparison_indicator_id or "ema"
                    primary_outputs = calculate_indicator(
                        candles,
                        primary_id,
                        rule.indicator_inputs,
                    )
                    comparison_outputs = calculate_indicator(
                        candles,
                        comparison_id,
                        rule.comparison_indicator_inputs,
                    )
                    primary = primary_outputs.get(rule.indicator_output)
                    comparison = comparison_outputs.get(
                        rule.comparison_indicator_output
                    )
                    if primary is None:
                        primary = next(iter(primary_outputs.values()))
                    if comparison is None:
                        comparison = next(iter(comparison_outputs.values()))
                    current = latest_value(primary)
                    threshold = latest_value(comparison)
                    label = f"{primary_id.upper()} / {comparison_id.upper()}"
                    unit = ""
                    triggered = (
                        crossed_above(primary, comparison)
                        if rule.operator == "above"
                        else crossed_below(primary, comparison)
                    )
                elif rule.alert_type == "drawing_break":
                    if not rule.drawing_points:
                        raise ValueError("Drawing anchors are required.")
                    current = candles[-1].close
                    threshold = drawing_level(rule.drawing_points, candles[-1].time)
                    previous_threshold = (
                        drawing_level(rule.drawing_points, candles[-2].time)
                        if len(candles) > 1
                        else None
                    )
                    label = "Cassure de dessin"
                    unit = "$"
                    triggered = bool(
                        threshold is not None
                        and previous_threshold is not None
                        and (
                            (
                                candles[-2].close <= previous_threshold
                                and current > threshold
                            )
                            if rule.operator == "above"
                            else (
                                candles[-2].close >= previous_threshold
                                and current < threshold
                            )
                        )
                    )
                else:
                    strategy_id = rule.strategy_id or "sma_crossover"
                    signals = strategy_signals(
                        candles,
                        BacktestRequest(
                            ticker=symbol,
                            range="3mo",
                            interval="1d",
                            strategy=strategy_id,
                            strategy_parameters=rule.strategy_parameters,
                        ),
                    )
                    signal_series = (
                        signals.enter_long
                        if rule.strategy_signal == "buy"
                        else signals.exit_long
                    )
                    current = 1.0 if signal_series and signal_series[-1] else 0.0
                    threshold = 1.0
                    label = f"Signal {strategy_id} / {rule.strategy_signal}"
                    unit = ""
                    triggered = current == threshold
            except (KeyError, TypeError, ValueError) as error:
                items.append(
                    AlertEvaluation(
                        id=rule.id,
                        symbol=symbol,
                        name=quote.name or symbol,
                        metric=rule.metric,
                        alert_type=rule.alert_type,
                        metric_label=label,
                        operator=rule.operator,
                        threshold=rule.threshold,
                        current_value=None,
                        unit=unit,
                        triggered=False,
                        status="unavailable",
                        message=f"Règle invalide ou indisponible : {error}",
                        source=quote.source,
                        evaluated_at=evaluated_at,
                    )
                )
                continue
            if current is None or threshold is None:
                items.append(
                    AlertEvaluation(
                        id=rule.id,
                        symbol=symbol,
                        name=quote.name or symbol,
                        metric=rule.metric,
                        alert_type=rule.alert_type,
                        metric_label=label,
                        operator=rule.operator,
                        threshold=rule.threshold,
                        current_value=None,
                        unit=unit,
                        triggered=False,
                        status="unavailable",
                        message="Métrique indisponible avec les observations actuelles.",
                        source=quote.source,
                        evaluated_at=evaluated_at,
                    )
                )
                continue
            operator_text = "au-dessus de" if rule.operator == "above" else "sous"
            state_text = "Déclenchée" if triggered else "Surveillance active"
            message = (
                f"{state_text} : {label} à {_format(current, unit)}, "
                f"seuil {operator_text} {_format(threshold, unit)}."
            )
            items.append(
                AlertEvaluation(
                    id=rule.id,
                    symbol=symbol,
                    name=quote.name or symbol,
                    metric=rule.metric,
                    alert_type=rule.alert_type,
                    metric_label=label,
                    operator=rule.operator,
                    threshold=float(threshold if threshold is not None else rule.threshold),
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
