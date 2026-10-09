from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta

from app.schemas.fixed_income import (
    CanadaYieldCurveSnapshot, CanadaYieldHistory, FixedIncomeCurvePoint,
    FixedIncomeDataQuality, FixedIncomeHistoryObservation, FixedIncomeSignal,
)

from app.core.data_hub import shared_data_hub
from app.core.resilience import AsyncStaleCache, shared_http_client


VALET_URL = "https://www.bankofcanada.ca/valet/observations/{series}/json"
VALET_SERIES = {
    # Legacy CANSIM identifiers retained as stable internal keys. Valet's
    # current public catalogue exposes the same official benchmark yields
    # under the BD.CDN.* identifiers below.
    "V39051": "BD.CDN.2YR.DQ.YLD",
    "V39055": "BD.CDN.10YR.DQ.YLD",
}

# Series confirmed against the official Valet catalogue.
CURVE_SERIES = {
    "2Y": ("BD.CDN.2YR.DQ.YLD", "2 year"),
    "3Y": ("BD.CDN.3YR.DQ.YLD", "3 year"),
    "5Y": ("BD.CDN.5YR.DQ.YLD", "5 year"),
    "7Y": ("BD.CDN.7YR.DQ.YLD", "7 year"),
    "10Y": ("BD.CDN.10YR.DQ.YLD", "10 year"),
    "Long": ("BD.CDN.LONG.DQ.YLD", "Long-term"),
    "Real Long": ("BD.CDN.RRB.DQ.YLD", "Real return, long-term"),
    "1-3Y": ("CDN.AVG.1YTO3Y.AVG", "Marketable average, 1 to 3 years"),
    "3-5Y": ("CDN.AVG.3YTO5Y.AVG", "Marketable average, 3 to 5 years"),
    "5-10Y": ("CDN.AVG.5YTO10Y.AVG", "Marketable average, 5 to 10 years"),
    ">10Y": ("CDN.AVG.OVER.10.AVG", "Marketable average, over 10 years"),
    "Policy": ("V39079", "Target for the overnight rate"),
}
CURVE_SOURCE_URL = "https://www.bankofcanada.ca/rates/interest-rates/canadian-bonds/"
HISTORY_DAYS = {"1D": 5, "1W": 10, "1M": 35, "3M": 100, "1Y": 370, "5Y": 1830, "10Y": 3660}


def _parse_curve_observations(payload: dict, keys: tuple[str, ...]) -> dict[str, list[tuple[datetime, float]]]:
    parsed: dict[str, list[tuple[datetime, float]]] = {key: [] for key in keys}
    for row in payload.get("observations", []):
        if not isinstance(row, dict):
            continue
        try:
            date = datetime.fromisoformat(row["d"]).replace(tzinfo=UTC)
        except (KeyError, TypeError, ValueError):
            continue
        for key in keys:
            raw = row.get(CURVE_SERIES[key][0])
            try:
                value = float(raw["v"])
            except (KeyError, TypeError, ValueError):
                continue
            if -10 <= value <= 100:
                parsed[key].append((date, value))
    for values in parsed.values():
        values.sort(key=lambda item: item[0])
    return parsed


def _curve_point(key: str, rows: list[tuple[datetime, float]], now: datetime) -> FixedIncomeCurvePoint:
    series, label = CURVE_SERIES[key]
    latest = rows[-1] if rows else None
    previous = rows[-2] if len(rows) > 1 else None
    return FixedIncomeCurvePoint(
        official_series_id=series, label=label, tenor=key,
        latest=latest[1] if latest else None,
        previous=previous[1] if previous else None,
        bp_change=round((latest[1] - previous[1]) * 100, 2) if latest and previous else None,
        observed_at=latest[0] if latest else None,
        source_url="https://www.bankofcanada.ca/valet/series/" + series + "/json",
        freshness=("delayed" if latest and (now - latest[0]).days <= 5 else
                   "stale" if latest else "unavailable"),
    )


def _spread(a: FixedIncomeCurvePoint, b: FixedIncomeCurvePoint) -> float | None:
    return round((b.latest - a.latest) * 100, 2) if a.latest is not None and b.latest is not None else None


def _curve_shape(spread_bps: float | None) -> str:
    if spread_bps is None:
        return "unknown"
    if spread_bps < -5:
        return "inverted"
    if spread_bps <= 5:
        return "flat"
    return "normal"


def _curve_signals(points: dict[str, FixedIncomeCurvePoint]) -> list[FixedIncomeSignal]:
    ten, two, policy = points["10Y"], points["2Y"], points["Policy"]
    observed = ten.observed_at or two.observed_at
    if observed is None:
        return []
    try:
        threshold = min(100.0, max(1.0, float(os.getenv("CANADA_10Y_MOVE_SIGNAL_BPS", "10"))))
    except ValueError:
        threshold = 10.0
    signals: list[FixedIncomeSignal] = []

    def add(kind: str, detail: str, at: datetime | None = None) -> None:
        signals.append(FixedIncomeSignal(kind=kind, detail=detail,
            observed_at=at or observed, source_url=CURVE_SOURCE_URL))

    if ten.bp_change is not None and abs(ten.bp_change) >= threshold:
        add("ten_year_move", f"Canada 10Y moved {ten.bp_change:+g} bp since its prior observation")
    if all(value is not None for value in (two.latest, two.previous, ten.latest, ten.previous)):
        current = (ten.latest - two.latest) * 100
        previous = (ten.previous - two.previous) * 100
        if (current < 0 <= previous) or (previous < 0 <= current):
            add("curve_zero_cross", f"Canada 2s10s crossed zero to {current:+.1f} bp")
        if _curve_shape(current) != _curve_shape(previous):
            add("curve_shape_change", f"Canada 2s10s shape changed to {_curve_shape(current)}")
    if policy.bp_change is not None and policy.bp_change != 0:
        add("policy_change", f"Overnight target changed {policy.bp_change:+g} bp", policy.observed_at)
    return signals


class BankOfCanadaValetService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[
            str,
            dict[str, list[tuple[int, float]]],
        ] = shared_data_hub.cache(
            "bank-of-canada-yields",
            max_entries=4,
        )
        self._curve_cache: AsyncStaleCache[str, dict[str, list[tuple[datetime, float]]]] = shared_data_hub.cache(
            "bank-of-canada-curve", max_entries=8,
        )

    async def _load(self) -> dict[str, list[tuple[int, float]]]:
        output: dict[str, list[tuple[int, float]]] = {"V39051": [], "V39055": []}
        async def load_series(alias: str, series: str) -> tuple[str, str, dict[str, object]]:
            payload = await shared_http_client.get_json(
                VALET_URL.format(series=series), params={"recent": 260}, attempts=2,
            )
            return alias, series, payload

        payloads = await asyncio.gather(*(load_series(alias, series) for alias, series in VALET_SERIES.items()))
        for alias, series, payload in payloads:
            for observation in payload.get("observations") or []:
                raw = observation.get(series)
                if not isinstance(raw, dict):
                    continue
                try:
                    timestamp = int(datetime.fromisoformat(str(observation["d"])).replace(tzinfo=UTC).timestamp())
                    output[alias].append((timestamp, float(raw["v"])))
                except (KeyError, TypeError, ValueError):
                    continue
        for values in output.values():
            values.sort(key=lambda item: item[0])
        if not any(output.values()):
            raise RuntimeError("Bank of Canada Valet returned no usable observations")
        return output

    async def yields(self) -> dict[str, list[tuple[int, float]]]:
        return await self._cache.get_or_load(
            "terminal-rates",
            self._load,
            fresh_seconds=900,
            stale_seconds=86_400,
        )

    async def _load_curve(self) -> dict[str, list[tuple[datetime, float]]]:
        keys = tuple(CURVE_SERIES)
        series = ",".join(CURVE_SERIES[key][0] for key in keys)
        payload = await shared_http_client.get_json(
            VALET_URL.format(series=series), params={"recent": 15}, attempts=2,
        )
        rows = _parse_curve_observations(payload, keys)
        if not any(rows.values()):
            raise RuntimeError("Bank of Canada curve has no observations")
        return rows

    async def curve(self) -> CanadaYieldCurveSnapshot:
        now = datetime.now(UTC)
        try:
            rows = await self._curve_cache.get_or_load(
                "latest", self._load_curve, fresh_seconds=900, stale_seconds=86_400,
            )
        except Exception:
            rows = {key: [] for key in CURVE_SERIES}
        points = {key: _curve_point(key, rows.get(key, []), now) for key in CURVE_SERIES}
        benchmarks = [points[key] for key in ("2Y", "3Y", "5Y", "7Y", "10Y", "Long")]
        available = sum(point.latest is not None for point in benchmarks)
        freshness = ("stale" if any(point.freshness == "stale" for point in benchmarks if point.latest is not None)
                     else "delayed" if available else "unavailable")
        quality = FixedIncomeDataQuality(
            scope="federal_curve",
            status="full" if available == 6 and freshness == "delayed" else "partial" if available else "unavailable",
            source=CURVE_SOURCE_URL,
            observed_at=max((point.observed_at for point in benchmarks if point.observed_at), default=None),
            freshness=freshness, coverage=f"{available}/6 benchmark tenors",
        )
        return CanadaYieldCurveSnapshot(
            points=benchmarks,
            marketable_averages=[points[key] for key in ("1-3Y", "3-5Y", "5-10Y", ">10Y")],
            spread_2s10s_bps=_spread(points["2Y"], points["10Y"]),
            spread_2s5s_bps=_spread(points["2Y"], points["5Y"]),
            spread_5s_long_bps=_spread(points["5Y"], points["Long"]),
            spread_10s_long_bps=_spread(points["10Y"], points["Long"]),
            policy_rate=points["Policy"], real_long_yield=points["Real Long"],
            curve_shape=_curve_shape(_spread(points["2Y"], points["10Y"])),
            signals=_curve_signals(points),
            generated_at=now, quality=quality,
        )

    async def history(self, period: str) -> CanadaYieldHistory:
        if period not in HISTORY_DAYS:
            raise ValueError("Unsupported history period")
        keys = ("2Y", "3Y", "5Y", "7Y", "10Y", "Long")
        series = ",".join(CURVE_SERIES[key][0] for key in keys)
        start = (datetime.now(UTC) - timedelta(days=HISTORY_DAYS[period])).date().isoformat()

        async def load() -> dict[str, list[tuple[datetime, float]]]:
            payload = await shared_http_client.get_json(
                VALET_URL.format(series=series), params={"start_date": start}, attempts=2,
            )
            rows = _parse_curve_observations(payload, keys)
            if not any(rows.values()):
                raise RuntimeError("Bank of Canada history unavailable")
            return rows

        try:
            rows = await self._curve_cache.get_or_load(
                "history:" + period, load, fresh_seconds=1800, stale_seconds=86_400,
            )
        except Exception:
            rows = {key: [] for key in keys}
        by_date: dict[datetime, dict[str, float]] = {}
        for key, values in rows.items():
            for date, value in values:
                by_date.setdefault(date, {})[key] = value
        observations = [FixedIncomeHistoryObservation(observed_at=date.date(), yields_percent=values)
                        for date, values in sorted(by_date.items())]
        if period == "1D":
            observations = observations[-2:]
        latest_date = observations[-1].observed_at if observations else None
        stale = bool(latest_date and (datetime.now(UTC).date() - latest_date).days > 5)
        return CanadaYieldHistory(
            period=period, observations=observations, source_url=CURVE_SOURCE_URL,
            quality=FixedIncomeDataQuality(
                scope="federal_curve", status="partial" if stale else "full" if observations else "unavailable",
                source=CURVE_SOURCE_URL,
                observed_at=datetime.combine(latest_date, datetime.min.time(), UTC) if latest_date else None,
                freshness="stale" if stale else "delayed" if observations else "unavailable",
                coverage=f"{len(observations)} dates",
            ),
        )


bank_of_canada_valet_service = BankOfCanadaValetService()
