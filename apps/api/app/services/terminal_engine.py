from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import UTC, datetime
from typing import Iterable

from app.schemas.analysis import (
    TerminalAnomaly,
    TerminalBreadthDivergence,
    TerminalBreadthPoint,
    TerminalBreadthPro,
    TerminalDataQuality,
    TerminalMethodologySection,
    TerminalOpportunity,
    TerminalRegimeHistoryPoint,
    TerminalRegimeHorizon,
    TerminalSector,
    TerminalSectorRotation,
)
from app.schemas.discovery import ScreenerRow
from app.schemas.stocks import Candle


COVERAGE_THRESHOLD_PERCENT = 70.0
REGIME_THRESHOLDS = ((72, "Haussier"), (60, "Constructif"), (45, "Neutre"), (32, "Fragile"))
HORIZONS = (("session", "Séance", 1), ("5d", "5J", 5), ("20d", "20J", 20), ("3m", "3M", 63))


def clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def regime_label(score: float) -> str:
    for threshold, label in REGIME_THRESHOLDS:
        if score >= threshold:
            return label
    return "Baissier"


def risk_label(score: float, breadth: float) -> str:
    if score >= 68 and breadth >= 55:
        return "Faible"
    if score >= 48:
        return "Modéré"
    if score >= 30:
        return "Élevé"
    return "Critique"


def regime_score(*, breadth: float, trend: float, quality: float, momentum: float, tape: float) -> float:
    """Deterministic formula shared by every Terminal horizon.

    Breadth 30%, trend structure 30%, Anatole cross-sectional quality 22%,
    momentum 12%, and observed tape/performance 6%.
    """
    return round(clamp(breadth * 0.30 + trend * 0.30 + quality * 0.22 + momentum * 0.12 + tape * 0.06), 1)


def _return(candles: list[Candle], sessions: int, end: int | None = None) -> float | None:
    end_index = len(candles) - 1 if end is None else end
    start_index = end_index - sessions
    if start_index < 0 or end_index >= len(candles) or candles[start_index].close <= 0:
        return None
    return (candles[end_index].close / candles[start_index].close - 1) * 100


def _sma(candles: list[Candle], sessions: int, end: int | None = None) -> float | None:
    end_index = len(candles) - 1 if end is None else end
    start = end_index - sessions + 1
    if start < 0:
        return None
    return sum(item.close for item in candles[start : end_index + 1]) / sessions


def _average_volume(candles: list[Candle], sessions: int = 20, end: int | None = None) -> float | None:
    end_index = len(candles) - 1 if end is None else end
    start = end_index - sessions
    if start < 0:
        return None
    sample = candles[start:end_index]
    return sum(item.volume for item in sample) / len(sample) if sample else None


def _rsi(candles: list[Candle], end: int | None = None, sessions: int = 14) -> float | None:
    end_index = len(candles) - 1 if end is None else end
    start = end_index - sessions
    if start < 0:
        return None
    changes = [candles[index].close - candles[index - 1].close for index in range(start + 1, end_index + 1)]
    gains = sum(max(change, 0) for change in changes) / sessions
    losses = sum(max(-change, 0) for change in changes) / sessions
    if losses == 0:
        return 100.0 if gains else 50.0
    return round(100 - 100 / (1 + gains / losses), 2)


def _row_score(change: float, momentum: float, relative_volume: float, rsi: float | None, trend: str) -> float:
    change_score = clamp(50 + change * 7)
    momentum_score = clamp(50 + momentum * 3.2)
    volume_score = clamp(relative_volume * 45)
    rsi_score = 50.0 if rsi is None else clamp(100 - abs(rsi - 60) * 2.4)
    trend_score = {"Haussière": 88.0, "Mixte": 55.0, "Baissière": 20.0}.get(trend, 45.0)
    return round(change_score * 0.18 + momentum_score * 0.28 + volume_score * 0.16 + rsi_score * 0.18 + trend_score * 0.20, 1)


def _signal(score: float) -> str:
    if score >= 72:
        return "Momentum fort"
    if score >= 60:
        return "Constructif"
    if score <= 32:
        return "Sous pression"
    if score <= 44:
        return "Fragile"
    return "Neutre"


def _trend(price: float, sma20: float | None, sma50: float | None) -> str:
    if sma20 is None or sma50 is None:
        return "Indéterminée"
    if price > sma20 > sma50:
        return "Haussière"
    if price < sma20 < sma50:
        return "Baissière"
    return "Mixte"


def rebuild_real_rows(
    rows: Iterable[ScreenerRow],
    histories: dict[str, list[Candle]],
    *,
    explicit_demo: bool,
) -> list[ScreenerRow]:
    output: list[ScreenerRow] = []
    for row in rows:
        if row.source == "demo-fallback" or (row.source == "demo-explicit" and not explicit_demo):
            continue
        candles = histories.get(row.symbol)
        if candles is None or len(candles) < 21:
            continue
        latest = candles[-1]
        change = row.change_percent
        momentum = _return(candles, 20) or 0.0
        sma20 = _sma(candles, 20)
        sma50 = _sma(candles, 50)
        rsi = _rsi(candles)
        average_volume = _average_volume(candles) or 0.0
        relative_volume = row.volume / average_volume if average_volume > 0 else 0.0
        trend = _trend(latest.close, sma20, sma50)
        score = _row_score(change, momentum, relative_volume, rsi, trend)
        output.append(row.model_copy(update={
            "price": latest.close,
            "momentum_20d": round(momentum, 2),
            "average_volume_20d": round(average_volume),
            "relative_volume": round(relative_volume, 2),
            "rsi_14": rsi,
            "sma_20": sma20,
            "sma_50": sma50,
            "trend": trend,
            "score": score,
            "signal": _signal(score),
        }))
    return output


def data_quality(
    all_rows: Iterable[ScreenerRow],
    histories: dict[str, list[Candle]],
    expected_symbols: Iterable[str],
    *,
    explicit_demo: bool,
) -> TerminalDataQuality:
    expected = list(expected_symbols)
    rows = list(all_rows)
    real = {
        row.symbol for row in rows
        if row.source != "demo-fallback" and (explicit_demo or row.source != "demo-explicit")
    }
    historical = {symbol for symbol in real if len(histories.get(symbol, [])) >= 21}
    coverage = len(real) / max(len(expected), 1) * 100
    history_coverage = len(historical) / max(len(expected), 1) * 100
    warnings: list[str] = []
    if coverage < COVERAGE_THRESHOLD_PERCENT:
        warnings.append("Couverture de cotations réelles inférieure à 70 %; les métriques transversales sont N/D.")
    if history_coverage < COVERAGE_THRESHOLD_PERCENT:
        warnings.append("Couverture historique réelle inférieure à 70 %; les métriques historiques sont N/D.")
    if any(row.source == "demo-fallback" for row in rows):
        warnings.append("Les lignes demo-fallback ont été exclues de tous les calculs Terminal.")
    return TerminalDataQuality(
        expected_symbols=len(expected),
        real_symbols=len(real),
        unavailable_symbols=sorted(set(expected) - real),
        coverage_percent=round(coverage, 1),
        history_symbols=len(historical),
        history_coverage_percent=round(history_coverage, 1),
        warnings=warnings,
        source_statuses={
            "real": str(len(real)),
            "history": str(len(historical)),
            "demo_fallback_excluded": str(sum(row.source == "demo-fallback" for row in rows)),
        },
    )


def opportunity(row: ScreenerRow, kind: str) -> TerminalOpportunity:
    reasons: list[str] = []
    if row.score >= 72:
        reasons.append(f"Score Anatole élevé ({row.score:.0f}/100)")
    if abs(row.momentum_20d) >= 5:
        reasons.append(f"Momentum 20 j de {row.momentum_20d:+.1f} %")
    if row.relative_volume >= 1.4:
        reasons.append(f"Volume relatif {row.relative_volume:.1f}×")
    if row.trend in {"Haussière", "Baissière"}:
        reasons.append(f"Tendance {row.trend.lower()}")
    return TerminalOpportunity(
        symbol=row.symbol, name=row.name, sector=row.sector, price=row.price,
        change_percent=row.change_percent, momentum_20d=row.momentum_20d,
        rsi_14=row.rsi_14, relative_volume=row.relative_volume, score=row.score,
        signal=row.signal, opportunity_type=kind,
        reasons=reasons[:4] or ["Profil à vérifier dans Focus"],
    )


def _current_metrics(rows: list[ScreenerRow], weights: dict[str, float]) -> dict[str, float]:
    directional = [row for row in rows if abs(row.change_percent) > 0.001]
    breadth = sum(row.change_percent > 0.001 for row in directional) / max(len(directional), 1) * 100
    sma20_rows = [row for row in rows if row.sma_20 is not None]
    sma50_rows = [row for row in rows if row.sma_50 is not None]
    above20 = sum(row.price > (row.sma_20 or math.inf) for row in sma20_rows) / max(len(sma20_rows), 1) * 100
    above50 = sum(row.price > (row.sma_50 or math.inf) for row in sma50_rows) / max(len(sma50_rows), 1) * 100
    total_weight = sum(weights.get(row.symbol, 1.0) for row in rows) or 1.0
    weighted_change = sum(weights.get(row.symbol, 1.0) * row.change_percent for row in rows) / total_weight
    average_score = statistics.fmean(row.score for row in rows) if rows else 0.0
    average_momentum = statistics.fmean(row.momentum_20d for row in rows) if rows else 0.0
    trend_score = above20 * 0.45 + above50 * 0.55
    score = regime_score(
        breadth=breadth,
        trend=trend_score,
        quality=average_score,
        momentum=clamp(50 + average_momentum * 4),
        tape=clamp(50 + weighted_change * 16),
    )
    return {"breadth": breadth, "above20": above20, "above50": above50, "weighted": weighted_change, "quality": average_score, "momentum": average_momentum, "score": score}


def build_regime_horizons(
    rows: list[ScreenerRow], histories: dict[str, list[Candle]], weights: dict[str, float], expected: int,
) -> list[TerminalRegimeHorizon]:
    now = datetime.now(UTC)
    coverage = len(rows) / max(expected, 1) * 100
    if coverage < COVERAGE_THRESHOLD_PERCENT:
        return [TerminalRegimeHorizon(key=key, label=label, regime=None, score=None, risk_level=None, coverage_percent=round(coverage, 1), as_of=now) for key, label, _ in HORIZONS]
    current = _current_metrics(rows, weights)
    output: list[TerminalRegimeHorizon] = []
    for key, label, sessions in HORIZONS:
        values: list[tuple[ScreenerRow, float]] = []
        for row in rows:
            candles = histories.get(row.symbol, [])
            value = row.change_percent if key == "session" else _return(candles, sessions)
            if value is not None:
                values.append((row, value))
        horizon_coverage = len(values) / max(expected, 1) * 100
        if horizon_coverage < COVERAGE_THRESHOLD_PERCENT:
            output.append(TerminalRegimeHorizon(key=key, label=label, regime=None, score=None, risk_level=None, coverage_percent=round(horizon_coverage, 1), as_of=now))
            continue
        directional = [value for _, value in values if abs(value) > 0.001]
        breadth = sum(value > 0 for value in directional) / max(len(directional), 1) * 100
        average_change = statistics.fmean(value for _, value in values)
        weighted_total = sum(weights.get(row.symbol, 1.0) for row, _ in values) or 1.0
        weighted_change = sum(weights.get(row.symbol, 1.0) * value for row, value in values) / weighted_total
        score = regime_score(
            breadth=breadth,
            trend=current["above20"] * 0.45 + current["above50"] * 0.55,
            quality=current["quality"],
            momentum=clamp(50 + average_change * (4 if sessions <= 20 else 2)),
            tape=clamp(50 + weighted_change * (16 if sessions == 1 else 4)),
        )
        output.append(TerminalRegimeHorizon(
            key=key, label=label, regime=regime_label(score), score=score,
            risk_level=risk_label(score, breadth), change_percent=round(weighted_change, 3),
            breadth_percent=round(breadth, 1), above_sma20_percent=round(current["above20"], 1),
            above_sma50_percent=round(current["above50"], 1),
            average_momentum_percent=round(average_change, 2), coverage_percent=round(horizon_coverage, 1), as_of=now,
        ))
    return output


def _index_at(candles: list[Candle], timestamp: int) -> int | None:
    low, high = 0, len(candles) - 1
    found: int | None = None
    while low <= high:
        middle = (low + high) // 2
        if candles[middle].time <= timestamp:
            found = middle
            low = middle + 1
        else:
            high = middle - 1
    return found


def build_regime_history(
    histories: dict[str, list[Candle]], benchmark: list[Candle], expected: int,
) -> list[TerminalRegimeHistoryPoint]:
    if not benchmark:
        return []
    base = benchmark[0].close
    output: list[TerminalRegimeHistoryPoint] = []
    for benchmark_candle in benchmark[-260:]:
        timestamp = benchmark_candle.time
        changes: list[float] = []
        momentums: list[float] = []
        above20: list[bool] = []
        above50: list[bool] = []
        scores: list[float] = []
        for candles in histories.values():
            index = _index_at(candles, timestamp)
            if index is None or index < 20:
                continue
            one_day = _return(candles, 1, index)
            momentum = _return(candles, 20, index)
            sma20 = _sma(candles, 20, index)
            sma50 = _sma(candles, 50, index)
            if one_day is None or momentum is None or sma20 is None:
                continue
            changes.append(one_day)
            momentums.append(momentum)
            above20.append(candles[index].close > sma20)
            if sma50 is not None:
                above50.append(candles[index].close > sma50)
            avg_volume = _average_volume(candles, 20, index) or 0
            relative_volume = candles[index].volume / avg_volume if avg_volume else 0
            trend = _trend(candles[index].close, sma20, sma50)
            scores.append(_row_score(one_day, momentum, relative_volume, _rsi(candles, index), trend))
        coverage = len(changes) / max(expected, 1) * 100
        score: float | None = None
        breadth: float | None = None
        regime: str | None = None
        if coverage >= COVERAGE_THRESHOLD_PERCENT and changes and above50:
            directional = [value for value in changes if abs(value) > 0.001]
            breadth = sum(value > 0 for value in directional) / max(len(directional), 1) * 100
            trend = statistics.fmean([sum(above20) / len(above20) * 100, sum(above50) / len(above50) * 100])
            score = regime_score(
                breadth=breadth, trend=trend, quality=statistics.fmean(scores),
                momentum=clamp(50 + statistics.fmean(momentums) * 4),
                tape=clamp(50 + statistics.fmean(changes) * 16),
            )
            regime = regime_label(score)
        output.append(TerminalRegimeHistoryPoint(
            timestamp=timestamp, regime_score=score, regime=regime,
            benchmark_value=round(benchmark_candle.close / base * 100, 3) if base > 0 else None,
            breadth_percent=round(breadth, 1) if breadth is not None else None,
            coverage_percent=round(coverage, 1),
        ))
    return output


def build_breadth(
    rows: list[ScreenerRow], histories: dict[str, list[Candle]], weights: dict[str, float], expected: int,
) -> TerminalBreadthPro:
    coverage = len(rows) / max(expected, 1) * 100
    unavailable = coverage < COVERAGE_THRESHOLD_PERCENT
    divergence = TerminalBreadthDivergence(active=False, severity="info", title="Aucune divergence", explanation="Aucune divergence déterministe détectée entre l'indice et sa largeur.")
    if unavailable:
        return TerminalBreadthPro(coverage_percent=round(coverage, 1), divergence=divergence)
    advancers = sum(row.change_percent > 0.001 for row in rows)
    decliners = sum(row.change_percent < -0.001 for row in rows)
    unchanged = len(rows) - advancers - decliners
    advance_ratio = advancers / max(advancers + decliners, 1) * 100
    above20_rows = [row for row in rows if row.sma_20 is not None]
    above50_rows = [row for row in rows if row.sma_50 is not None]
    above200: list[bool] = []
    highs = lows = 0
    for row in rows:
        candles = histories.get(row.symbol, [])
        sma200 = _sma(candles, 200)
        if sma200 is not None:
            above200.append(candles[-1].close > sma200)
        sample = candles[-252:]
        if len(sample) >= 200:
            highs += sample[-1].high >= max(item.high for item in sample[:-1])
            lows += sample[-1].low <= min(item.low for item in sample[:-1])
    up_volume = sum(row.volume for row in rows if row.change_percent > 0.001)
    down_volume = sum(row.volume for row in rows if row.change_percent < -0.001)
    neutral_volume = sum(row.volume for row in rows if abs(row.change_percent) <= 0.001)
    equal_weight = statistics.fmean(row.change_percent for row in rows)
    total_weight = sum(weights.get(row.symbol, 1) for row in rows) or 1
    cap_weight = sum(weights.get(row.symbol, 1) * row.change_percent for row in rows) / total_weight
    sector_changes: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        sector_changes[row.sector].append(row.change_percent)
    sector_means = [statistics.fmean(values) for values in sector_changes.values()]
    positive_sectors = sum(value > 0 for value in sector_means)
    negative_sectors = sum(value < 0 for value in sector_means)
    if cap_weight > 0.25 and advance_ratio < 40:
        divergence = TerminalBreadthDivergence(active=True, severity="high", title="Hausse concentrée", explanation="Le TSX pondéré progresse alors que moins de 40 % des mouvements directionnels sont positifs.")
    elif cap_weight > 0 and advance_ratio < 48:
        divergence = TerminalBreadthDivergence(active=True, severity="watch", title="Largeur fragile", explanation="Le TSX pondéré est positif, mais moins de 48 % des mouvements directionnels progressent.")
    elif cap_weight < 0 and advance_ratio > 55:
        divergence = TerminalBreadthDivergence(active=True, severity="watch", title="Résilience sous la surface", explanation="Le TSX pondéré recule alors qu'une majorité des mouvements directionnels progresse.")
    timestamps = sorted({candle.time for candles in histories.values() for candle in candles})[-260:]
    cumulative = 0
    ad_line: list[TerminalBreadthPoint] = []
    for timestamp in timestamps:
        day_changes: list[float] = []
        for candles in histories.values():
            index = _index_at(candles, timestamp)
            if index is None or candles[index].time != timestamp:
                continue
            value = _return(candles, 1, index)
            if value is not None:
                day_changes.append(value)
        if len(day_changes) / max(expected, 1) * 100 < COVERAGE_THRESHOLD_PERCENT:
            continue
        cumulative += sum(value > 0.001 for value in day_changes) - sum(value < -0.001 for value in day_changes)
        ad_line.append(TerminalBreadthPoint(timestamp=timestamp, value=cumulative))
    return TerminalBreadthPro(
        advancers=advancers, decliners=decliners, unchanged=unchanged, advance_ratio=round(advance_ratio, 1),
        above_sma20_percent=round(sum(row.price > (row.sma_20 or math.inf) for row in above20_rows) / max(len(above20_rows), 1) * 100, 1),
        above_sma50_percent=round(sum(row.price > (row.sma_50 or math.inf) for row in above50_rows) / max(len(above50_rows), 1) * 100, 1),
        above_sma200_percent=round(sum(above200) / len(above200) * 100, 1) if above200 else None,
        new_highs_52w=highs, new_lows_52w=lows, up_volume=up_volume, down_volume=down_volume,
        neutral_volume=neutral_volume, up_volume_ratio_percent=round(up_volume / max(up_volume + down_volume, 1) * 100, 1),
        equal_weight_change_percent=round(equal_weight, 3), cap_weight_change_percent=round(cap_weight, 3),
        concentration_spread_percent_points=round(cap_weight - equal_weight, 3), positive_sectors=positive_sectors,
        negative_sectors=negative_sectors, positive_sectors_percent=round(positive_sectors / max(len(sector_means), 1) * 100, 1),
        advance_decline_line=ad_line, coverage_percent=round(coverage, 1), divergence=divergence,
    )


def build_sector_rotation(
    rows: list[ScreenerRow], histories: dict[str, list[Candle]], benchmark: list[Candle], expected: int,
) -> list[TerminalSectorRotation]:
    benchmark_now = _return(benchmark, 20)
    benchmark_previous = _return(benchmark, 20, len(benchmark) - 6) if len(benchmark) >= 26 else None
    grouped: dict[str, list[ScreenerRow]] = defaultdict(list)
    for row in rows:
        grouped[row.sector].append(row)
    output: list[TerminalSectorRotation] = []
    for sector, members in grouped.items():
        current = [(row, _return(histories.get(row.symbol, []), 20)) for row in members]
        current = [(row, value) for row, value in current if value is not None]
        previous = [(row, _return(histories.get(row.symbol, []), 20, len(histories.get(row.symbol, [])) - 6)) for row in members if len(histories.get(row.symbol, [])) >= 26]
        previous_values = [value for _, value in previous if value is not None]
        if not current or benchmark_now is None:
            output.append(TerminalSectorRotation(sector=sector, member_count=len(members), quadrant="N/D", state="N/D"))
            continue
        x = statistics.fmean(value for _, value in current)
        y = x - benchmark_now
        previous_x = statistics.fmean(previous_values) if previous_values else None
        previous_y = previous_x - benchmark_previous if previous_x is not None and benchmark_previous is not None else None
        if x >= 0 and y >= 0:
            quadrant, state = "LEADERSHIP", "Leadership"
        elif x >= 0 and y < 0:
            quadrant, state = "AMÉLIORATION", "Amélioration"
        elif x < 0 and y >= 0:
            quadrant, state = "AFFAIBLISSEMENT", "Affaiblissement"
        else:
            quadrant, state = "SOUS PRESSION", "Sous pression"
        breadth = sum(value > 0 for _, value in current) / len(current) * 100
        leadership = clamp(50 + x * 3 + y * 4 + (breadth - 50) * 0.2)
        output.append(TerminalSectorRotation(
            sector=sector, momentum_20d=round(x, 2), relative_strength_20d=round(y, 2),
            breadth_percent=round(breadth, 1), average_score=round(statistics.fmean(row.score for row, _ in current), 1),
            relative_volume=round(statistics.fmean(row.relative_volume for row, _ in current), 2), member_count=len(current),
            x=round(x, 2), y=round(y, 2), previous_x=round(previous_x, 2) if previous_x is not None else None,
            previous_y=round(previous_y, 2) if previous_y is not None else None, quadrant=quadrant, state=state,
            leadership_score=round(leadership, 1),
        ))
    return sorted(output, key=lambda item: item.leadership_score or -1, reverse=True)


def legacy_sectors(rotation: list[TerminalSectorRotation], rows: list[ScreenerRow]) -> list[TerminalSector]:
    grouped: dict[str, list[ScreenerRow]] = defaultdict(list)
    for row in rows:
        grouped[row.sector].append(row)
    output: list[TerminalSector] = []
    for item in rotation:
        members = grouped[item.sector]
        output.append(TerminalSector(
            sector=item.sector, change_percent=round(statistics.fmean(row.change_percent for row in members), 3),
            momentum_20d=item.momentum_20d or 0, average_score=item.average_score or 0,
            relative_volume=item.relative_volume or 0, advancers=sum(row.change_percent > 0 for row in members),
            decliners=sum(row.change_percent < 0 for row in members), leadership_score=item.leadership_score or 0,
            state="Leadership" if (item.leadership_score or 0) >= 72 else "Accumulation" if (item.leadership_score or 0) >= 60 else "Neutre" if (item.leadership_score or 0) >= 44 else "Distribution" if (item.leadership_score or 0) >= 30 else "Faiblesse",
        ))
    return output


def _z_score(value: float, sample: list[float]) -> float | None:
    if len(sample) < 10:
        return None
    deviation = statistics.stdev(sample)
    return (value - statistics.fmean(sample)) / deviation if deviation > 1e-12 else None


def _rarity(z_score: float | None, magnitude: float = 0) -> float:
    return round(clamp(45 + abs(z_score or 0) * 18 + abs(magnitude) * 4), 1)


def build_anomalies(rows: list[ScreenerRow], histories: dict[str, list[Candle]]) -> list[TerminalAnomaly]:
    now = datetime.now(UTC)
    sector_change: dict[str, float] = {}
    grouped: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        grouped[row.sector].append(row.change_percent)
    for sector, values in grouped.items():
        sector_change[sector] = statistics.fmean(values)
    output: list[TerminalAnomaly] = []

    def add(row: ScreenerRow, kind: str, severity: str, direction: str, observed: float | None, baseline: float | None, unit: str, title: str, detail: str, z: float | None = None, magnitude: float = 0) -> None:
        output.append(TerminalAnomaly(
            id=f"{kind}:{row.symbol}", symbol=row.symbol, sector=row.sector, type=kind,
            severity=severity, direction=direction, rarity_score=_rarity(z, magnitude), z_score=round(z, 3) if z is not None else None,
            observed_value=round(observed, 4) if observed is not None else None, baseline_value=round(baseline, 4) if baseline is not None else None,
            unit=unit, title=title, detail=detail, reasons=[detail], source=row.source, generated_at=now,
        ))

    for row in rows:
        candles = histories.get(row.symbol, [])
        if len(candles) < 22:
            continue
        latest, previous = candles[-1], candles[-2]
        volumes = [float(item.volume) for item in candles[-21:-1]]
        average_volume = statistics.fmean(volumes)
        volume_z = _z_score(float(latest.volume), volumes)
        volume_ratio = latest.volume / average_volume if average_volume else 0
        if volume_ratio >= 1.8 or (volume_z is not None and volume_z >= 2):
            add(row, "volume_spike", "high" if volume_ratio >= 2.5 else "watch", "positive" if row.change_percent >= 0 else "negative", volume_ratio, 1, "×", f"Volume inhabituel — {row.symbol}", f"Volume de séance à {volume_ratio:.1f}× la moyenne des 20 séances précédentes.", volume_z, volume_ratio - 1)
        gap = (latest.open / previous.close - 1) * 100 if previous.close else 0
        if abs(gap) >= 1.5:
            add(row, "gap", "high" if abs(gap) >= 3 else "watch", "positive" if gap > 0 else "negative", gap, 0, "%", f"Gap de séance — {row.symbol}", f"Ouverture à {gap:+.2f} % de la clôture précédente.", magnitude=gap)
        recent = _return(candles, 5)
        prior = _return(candles, 5, len(candles) - 6)
        acceleration = recent - prior if recent is not None and prior is not None else None
        if acceleration is not None and abs(acceleration) >= 4:
            add(row, "momentum_acceleration", "watch", "positive" if acceleration > 0 else "negative", acceleration, prior, "points %", f"Accélération du momentum — {row.symbol}", f"Le rendement 5J a varié de {acceleration:+.2f} points face à la fenêtre 5J précédente.", magnitude=acceleration)
        if row.rsi_14 is not None and (row.rsi_14 >= 75 or row.rsi_14 <= 25):
            add(row, "rsi_extreme", "watch", "positive" if row.rsi_14 >= 75 else "negative", row.rsi_14, 50, "RSI", f"RSI extrême — {row.symbol}", f"RSI 14 observé à {row.rsi_14:.1f}; rareté statistique, pas probabilité directionnelle.", magnitude=(row.rsi_14 - 50) / 10)
        previous_sma20 = _sma(candles, 20, len(candles) - 2)
        current_sma20 = _sma(candles, 20)
        if previous_sma20 is not None and current_sma20 is not None and (previous.close - previous_sma20) * (latest.close - current_sma20) < 0:
            direction = "positive" if latest.close > current_sma20 else "negative"
            add(row, "sma_cross", "watch", direction, latest.close, current_sma20, "CAD", f"Traversée prix/MM20 — {row.symbol}", "Le prix a réellement traversé sa MM20 entre les deux dernières séances.", magnitude=(latest.close / current_sma20 - 1) * 100)
        if (row.change_percent >= 2 and volume_ratio < 0.7) or (row.change_percent <= -2 and volume_ratio >= 1.8):
            add(row, "price_volume_divergence", "watch", "negative", row.change_percent, volume_ratio, "% / ×", f"Divergence prix-volume — {row.symbol}", "Le mouvement du prix et le niveau de volume divergent selon les seuils documentés.", volume_z, row.change_percent)
        dislocation = row.change_percent - sector_change.get(row.sector, row.change_percent)
        if abs(dislocation) >= 2.5:
            add(row, "sector_dislocation", "watch", "positive" if dislocation > 0 else "negative", dislocation, sector_change.get(row.sector), "points %", f"Dislocation sectorielle — {row.symbol}", f"Le titre s'écarte de {dislocation:+.2f} points de la moyenne de son secteur.", magnitude=dislocation)
        if len(candles) >= 56:
            end = len(candles) - 6
            old_change = _return(candles, 1, end) or 0
            old_momentum = _return(candles, 20, end) or 0
            old_sma20, old_sma50 = _sma(candles, 20, end), _sma(candles, 50, end)
            old_avg_volume = _average_volume(candles, 20, end) or 0
            old_relative_volume = candles[end].volume / old_avg_volume if old_avg_volume else 0
            old_score = _row_score(old_change, old_momentum, old_relative_volume, _rsi(candles, end), _trend(candles[end].close, old_sma20, old_sma50))
            shift = row.score - old_score
            if abs(shift) >= 12:
                add(row, "score_shift", "high" if abs(shift) >= 20 else "watch", "positive" if shift > 0 else "negative", row.score, old_score, "score", f"Déplacement du score — {row.symbol}", f"Score Anatole {shift:+.1f} points face à environ cinq séances auparavant.", magnitude=shift / 5)
    return sorted(output, key=lambda item: (item.severity != "high", -item.rarity_score, item.id))[:40]


def methodology_sections() -> list[TerminalMethodologySection]:
    return [
        TerminalMethodologySection(key="regime", title="Régime", description="Score 0-100: largeur 30 %, tendance 30 %, score Anatole moyen 22 %, momentum 12 % et tape/performance 6 %. Seuils: 32, 45, 60 et 72."),
        TerminalMethodologySection(key="horizons", title="Horizons", description="Séance, 5J, 20J et 3M réutilisent la même formule déterministe sur le même historique quotidien; aucune donnée future n'entre dans un point passé."),
        TerminalMethodologySection(key="breadth", title="Breadth Pro", description="Le volume en hausse/baisse est le volume des titres à séance positive/négative, pas un volume acheteur/vendeur agressif. La MM200 exclut les historiques trop courts."),
        TerminalMethodologySection(key="rotation", title="Rotation", description="X mesure le momentum sectoriel 20J; Y la performance sectorielle moins celle du TSX sur la même période. Il s'agit de rotation quantitative observée, pas de flux institutionnels."),
        TerminalMethodologySection(key="anomalies", title="Anomalies", description="Règles déterministes sur volume, gaps, momentum, RSI, traversées de moyennes, divergences, secteurs et déplacement de score."),
        TerminalMethodologySection(key="rarity", title="Rareté statistique", description="La rareté 0-100 provient du z-score et de l'amplitude observée. Elle ne représente ni conviction ni probabilité de hausse."),
        TerminalMethodologySection(key="drivers", title="Drivers", description="Corrélations calculées sur les rendements quotidiens communs, idéalement 60 séances et jamais sous 20 observations. Une corrélation n'établit pas de causalité."),
    ]
