"""Conservative peer selection and comparison over the shared diagnostic engine."""

from __future__ import annotations

import asyncio
import math
import re
from datetime import datetime
from statistics import median

from app.schemas.fundamental_intelligence import (
    PeerCandidate,
    PeerComparison,
    PeerMeasureComparison,
    PeerMeasureValue,
)
from app.schemas.fundamentals import FundamentalSnapshot
from app.services.fundamental_intelligence import build_fundamental_diagnostic, sector_family
from app.services.fundamentals import fundamentals_service
from app.services.tsx60 import TSX60, TSX60_AS_OF, TSX60_SOURCE
from app.services.tsx_composite_universe import (
    CompositeConstituent,
    XIC_UNIVERSE_SOURCE,
    tsx_composite_universe_service,
)


MIN_SAMPLE = 6  # Target plus at least five accepted peers.
MAX_PEERS = 8
METRICS = (
    "revenue_growth", "net_income_growth", "operating_margin", "net_margin",
    "free_cash_flow_margin", "cash_conversion", "debt_to_equity", "current_ratio",
)
VALUATION = {
    "trailing_pe": ("C/B courant", "Trailing P/E"),
    "forward_pe": ("C/B anticipé", "Forward P/E"),
    "price_to_book": ("Cours / valeur comptable", "Price / book"),
    "price_to_sales": ("Cours / ventes", "Price / sales"),
    "enterprise_to_ebitda": ("VE / BAIIA", "EV / EBITDA"),
}
TICKER = re.compile(r"^[A-Z][A-Z0-9.\-]{0,12}$")


def _code(value: str) -> str:
    return value.strip().upper().removesuffix(".TO")


def _eligible(target: FundamentalSnapshot, peer: FundamentalSnapshot) -> str | None:
    if peer.status == "unavailable":
        return "financial snapshot unavailable"
    if sector_family(peer) != sector_family(target):
        return "different business family"
    if not target.industry or not peer.industry:
        return "industry unverified"
    if target.industry.casefold() != peer.industry.casefold():
        return "different industry"
    a, b = target.metrics.market_cap, peer.metrics.market_cap
    if not a or not b or not math.isfinite(a) or not math.isfinite(b) or a <= 0 or b <= 0:
        return "market capitalization unavailable"
    if not target.currency or not peer.currency or target.currency != peer.currency:
        return "market capitalization currencies differ or are unknown"
    if not .2 <= b / a <= 5:
        return "market capitalization outside 0.2–5× target range"
    target_years = {row.period_end.year for row in target.annual_financials if row.currency == target.financial_currency}
    peer_years = {row.period_end.year for row in peer.annual_financials if row.currency == peer.financial_currency}
    if not target_years.intersection(peer_years) or target.financial_currency != peer.financial_currency:
        return "no comparable annual metrics"
    return None


def _candidate(target: FundamentalSnapshot, member: CompositeConstituent,
               snapshot: FundamentalSnapshot | None) -> PeerCandidate:
    reason = _eligible(target, snapshot) if snapshot else "financial snapshot unavailable"
    if reason is None:
        category = "direct"
    elif (snapshot and target.industry and snapshot.industry
          and sector_family(target) == sector_family(snapshot)
          and target.industry.casefold() != snapshot.industry.casefold()):
        category, reason = "related", "related business only"
    else:
        category = "sector"
        reason = reason or "sector exploration only"
    return PeerCandidate(
        ticker=member.ticker, name=member.name, sector=member.sector or "",
        selection_basis="Verified snapshot" if snapshot else "Canadian index constituent; classification pending",
        comparability=category, industry=snapshot.industry if snapshot else None, reason=reason,
    )


def _annual_values(target: FundamentalSnapshot, peers: list[FundamentalSnapshot]) -> list[PeerMeasureComparison]:
    diagnostics = [build_fundamental_diagnostic(item) for item in [target, *peers]]
    output: list[PeerMeasureComparison] = []
    for key in METRICS:
        target_measure = next(item for item in diagnostics[0].measures if item.key == key)
        target_point = target_measure.observations[0] if target_measure.observations else None
        values: list[PeerMeasureValue] = []
        if target_point:
            for diagnostic in diagnostics:
                measure = next(item for item in diagnostic.measures if item.key == key)
                point = next((item for item in measure.observations if item.period_end.year == target_point.period_end.year
                              and abs((item.period_end - target_point.period_end).days) <= 210), None)
                if point:
                    values.append(PeerMeasureValue(
                        ticker=diagnostic.ticker, value=point.value, period_end=point.period_end,
                        source_name=point.source_name, source_url=point.source_url,
                        source_confidence=point.source_confidence,
                    ))
        output.append(_comparison(key, target_measure.label_fr, target_measure.label_en, "annual",
                                  target_measure.unit, target.ticker, values))
    return output


def _valuation_values(target: FundamentalSnapshot, peers: list[FundamentalSnapshot]) -> list[PeerMeasureComparison]:
    output: list[PeerMeasureComparison] = []
    for key, (label_fr, label_en) in VALUATION.items():
        values: list[PeerMeasureValue] = []
        target_value = getattr(target.metrics, key)
        if (target_value is not None and math.isfinite(target_value) and target_value > 0
            and "quoteSummary" in target.source):
            for item in [target, *peers]:
                value = getattr(item.metrics, key)
                if (value is not None and math.isfinite(value) and value > 0
                    and "quoteSummary" in item.source
                    and abs((item.generated_at - target.generated_at).total_seconds()) <= 86_400):
                    values.append(PeerMeasureValue(
                        ticker=item.ticker, value=value, period_end=item.generated_at,
                        source_name="Yahoo Finance quoteSummary", source_confidence="secondary",
                    ))
        output.append(_comparison(key, label_fr, label_en, "current_snapshot", "ratio", target.ticker, values))
    return output


def _comparison(key: str, label_fr: str, label_en: str, basis: str, unit: str,
                target_ticker: str, values: list[PeerMeasureValue]) -> PeerMeasureComparison:
    sufficient = len(values) >= MIN_SAMPLE
    ordered = sorted(values, key=lambda item: (-item.value, item.ticker))
    rank = next((position for position, item in enumerate(ordered, 1) if item.ticker == target_ticker), None)
    return PeerMeasureComparison(
        key=key, label_fr=label_fr, label_en=label_en, basis=basis, unit=unit,
        values=values, sample_size=len(values), median=round(median(item.value for item in values), 8) if sufficient else None,
        rank=rank if sufficient else None,
        explanation_fr=("Médiane et rang sur au moins six sociétés admissibles, cible incluse; périodes comparables et même définition. Rang par valeur décroissante, sans jugement de qualité."
                        if sufficient else "Médiane et rang indisponibles : moins de six sociétés comparables avec cette donnée."),
        explanation_en=("Median and rank require at least six eligible companies including the target, comparable periods and the same definition. Rank is by descending value, not investment quality."
                        if sufficient else "Median and rank unavailable: fewer than six comparable companies have this value."),
    )


def build_peer_comparison(target: FundamentalSnapshot, peers: list[FundamentalSnapshot],
                          candidates: list[PeerCandidate], *, universe_source: str,
                          universe_as_of: str | None, selected: list[str]) -> PeerComparison:
    permitted = {_code(item.ticker): item for item in candidates}
    excluded: dict[str, str] = {}
    accepted: list[FundamentalSnapshot] = []
    by_code = {_code(item.ticker): item for item in peers}
    for code in selected:
        item = by_code.get(code)
        if code not in permitted:
            excluded[code] = "outside selected Canadian sector universe"
        elif permitted[code].reason in {"related business only", "sector exploration only"}:
            excluded[code] = permitted[code].reason
        elif item is None:
            excluded[code] = "financial snapshot unavailable"
        elif reason := _eligible(target, item):
            excluded[code] = reason
        else:
            accepted.append(item)
    return PeerComparison(
        target=target.ticker, sector=target.sector, sector_family=sector_family(target),
        universe_source=universe_source, universe_as_of=universe_as_of,
        candidates=candidates, selected=[item.ticker for item in accepted], excluded=excluded,
        measures=_annual_values(target, accepted) + _valuation_values(target, accepted),
        method_fr="Pairs directs : même industrie vérifiée, capitalisation entre 0,2 et 5 fois la cible dans la même devise, et exercices financiers comparables. Les activités connexes et autres sociétés du secteur restent exploratoires. Médiane et rang exigent au moins six sociétés avec une valeur comparable.",
        method_en="Direct peers require a verified matching industry, market cap within 0.2–5 times the target in the same currency, and comparable fiscal data. Related businesses and other sector companies are exploratory. Median and rank require at least six companies with comparable values.",
    )


async def peer_comparison(ticker: str, requested: list[str] | None = None, *,
                          target_snapshot: FundamentalSnapshot | None = None) -> PeerComparison:
    target = target_snapshot if target_snapshot is not None else await fundamentals_service.get_snapshot(ticker)
    try:
        universe = await tsx_composite_universe_service.get_constituents()
        universe_source, as_of = XIC_UNIVERSE_SOURCE, tsx_composite_universe_service.as_of
    except Exception:  # noqa: BLE001
        universe = [CompositeConstituent(ticker=item.symbol, name=item.name, sector=item.sector,
                                         weight=item.weight, exchange="TSX", currency="CAD") for item in TSX60]
        universe_source, as_of = TSX60_SOURCE, TSX60_AS_OF
    target_code = _code(target.ticker)
    target_member = next((item for item in universe if _code(item.ticker) == target_code), None)
    broad_sector = target_member.sector if target_member else target.sector
    members = [item for item in universe if item.sector == broad_sector and _code(item.ticker) != target_code][:40]
    selected = [_code(item) for item in requested] if requested is not None else []
    if len(selected) > MAX_PEERS or len(set(selected)) != len(selected) or any(not TICKER.fullmatch(item) for item in selected):
        raise ValueError("Select up to eight distinct valid peer tickers")

    async def load(code: str) -> FundamentalSnapshot | None:
        try:
            async with semaphore:
                return await asyncio.wait_for(fundamentals_service.get_snapshot(code), timeout=8)
        except Exception:  # noqa: BLE001
            return None

    semaphore = asyncio.Semaphore(10)
    ordered_codes = list(dict.fromkeys([*selected, *(_code(item.ticker) for item in members)]))
    allowed = {_code(item.ticker) for item in members}
    tasks = {code: asyncio.create_task(load(code)) for code in ordered_codes if code in allowed}
    done, pending = await asyncio.wait(tasks.values(), timeout=10) if tasks else (set(), set())
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    snapshots = {code: task.result() for code, task in tasks.items() if task in done and not task.cancelled()
                 and task.exception() is None and task.result() is not None}
    candidates = [_candidate(target, item, snapshots.get(_code(item.ticker))) for item in members]
    candidates.sort(key=lambda item: ("direct", "related", "sector").index(item.comparability))
    if requested is None:
        selected = [_code(item.ticker) for item in candidates if item.comparability == "direct"][:MAX_PEERS]
    return build_peer_comparison(target, [snapshots[code] for code in selected if code in snapshots], candidates,
                                 universe_source=universe_source, universe_as_of=as_of, selected=selected)
