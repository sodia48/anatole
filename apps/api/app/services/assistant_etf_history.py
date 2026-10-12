"""Historical ETF answers built exclusively from the existing history service."""
from __future__ import annotations

import asyncio
import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pandas as pd

from app.data.etf_catalog import ETF_CATALOG, US_ETF_LISTINGS
from app.schemas.assistant_context import AnatoleEvidenceBundle, EvidenceFact, EvidenceSource
from app.services.etf_history import etf_history_service, normalize_etf_symbol

CATALOG = {row["ticker"]: row for row in ETF_CATALOG}
SYMBOLS = set(CATALOG) | set(US_ETF_LISTINGS)
HORIZONS = {"1mo": (1, "1 mois"), "3mo": (3, "3 mois"), "6mo": (6, "6 mois"),
            "1y": (12, "1 an"), "3y": (36, "3 ans"), "5y": (60, "5 ans"), "10y": (120, "10 ans")}
CA_SAMPLE = ("XIC", "XIU", "VCN", "VFV", "XQQ", "ZAG", "XBB", "XDV")
ETF_HISTORY_SKILLS = {"etf_performance", "etf_ranking", "etf_comparison"}


@dataclass(frozen=True)
class EtfHistoryQuery:
    symbols: tuple[str, ...] = ()
    region: str | None = None
    horizon: str = "5y"
    total_requested: bool = False

    @property
    def skill(self):
        return "etf_comparison" if len(self.symbols) > 1 else "etf_performance" if self.symbols else "etf_ranking"


def history_query(message, context, previous: EtfHistoryQuery | None = None):
    text = "".join(c for c in unicodedata.normalize("NFD", message.lower()) if not unicodedata.combining(c))
    horizon_match = re.search(r"\b(\d{1,2})\s*(?:dernier(?:e|es|s)?\s+)?(mois|months?|ans?|annees?|years?)\b", text)
    horizon = None
    if horizon_match:
        candidate = horizon_match[1] + ("mo" if horizon_match[2].startswith(("mois", "month")) else "y")
        horizon = candidate
    explicit = tuple(dict.fromkeys(token.removesuffix(".TO") for token in re.findall(r"\b[A-Z][A-Z0-9.-]{1,12}\b", message.upper())
                                   if token.removesuffix(".TO") in SYMBOLS))[:5]
    etf = bool(re.search(r"\b(?:etfs?|fnbs?)\b", text))
    performance = bool(re.search(r"perform|rendement|return|classement|ranking|meilleur|best|compare", text))
    follow = previous is not None and bool(re.fullmatch(r"\s*(?:et |and |what about )?(?:sur |over |on )?\d+\s*(?:ans?|annees?|years?|mois|months?)\s*[?!.]*\s*", text))
    if not ((etf or explicit) and (performance or horizon) or follow):
        return None
    region = "US" if re.search(r"americain|etats.unis|\bus\b|\busa\b|american|u\.s\.", text) else "CA" if re.search(r"canad", text) else None
    if follow:
        return EtfHistoryQuery(previous.symbols, previous.region, horizon or previous.horizon, previous.total_requested)
    if not explicit and not region and context.surface == "etf" and context.symbol in SYMBOLS and not re.search(r"le plus|best|classement|ranking|meilleur", text):
        explicit = (context.symbol,)
    return EtfHistoryQuery(explicit, region, horizon or "5y", bool(re.search(r"total|dividende|dividend", text)))


async def historical_answer(query: EtfHistoryQuery, language: str):
    fr = language == "fr"
    choose = lambda a, b: a if fr else b
    bundle = AnatoleEvidenceBundle(skill=query.skill, entities=list(query.symbols))
    if query.horizon not in HORIZONS:
        return choose("Horizons disponibles : 1, 3 ou 6 mois; 1, 3, 5 ou 10 ans. Précisez l’un de ces horizons.", "Available horizons: 1, 3 or 6 months; 1, 3, 5 or 10 years. Please choose one of these horizons."), bundle
    if not query.symbols and not query.region:
        return choose("Pour classer les ETF sur cette période, souhaitez-vous les ETF cotés au Canada ou aux États-Unis ? Le rendement du prix exclut les dividendes.",
                      "For this period, should I compare ETFs listed in Canada or in the United States? Price returns exclude dividends."), bundle
    selected = query.symbols or (tuple(US_ETF_LISTINGS) if query.region == "US" else CA_SAMPLE)
    bundle.entities = list(selected)
    now = datetime.now(UTC)
    months, label = HORIZONS[query.horizon]
    label = label if fr else f"{months} months" if months < 12 else f"{months // 12} years"
    target = (pd.Timestamp(now) - pd.DateOffset(months=months)).date()
    semaphore = asyncio.Semaphore(4)

    async def fetch(symbol):
        async with semaphore:
            try:
                return await asyncio.wait_for(etf_history_service.snapshot(symbol, query.horizon, native_currency=True), timeout=8)
            except Exception:
                return None

    snapshots = await asyncio.gather(*(fetch(symbol) for symbol in selected))
    valid = []
    for symbol, snapshot in zip(selected, snapshots, strict=True):
        reason = None
        expected_region = "US" if symbol in US_ETF_LISTINGS else "CA"
        if query.region and expected_region != query.region:
            reason = choose("cotation hors du marché demandé", "listing outside the requested market")
        elif snapshot is None or snapshot.status != "available":
            reason = choose("historique indisponible", "history unavailable")
        elif snapshot.normalized_symbol != normalize_etf_symbol(symbol) or snapshot.currency != ("USD" if expected_region == "US" else "CAD"):
            reason = choose("symbole ou devise non vérifiés", "symbol or currency unverified")
        elif snapshot.exchange not in ({"PCX", "NMS", "NGM", "NAS", "NYQ", "NYSEArca", "NasdaqGS"} if expected_region == "US" else {"TOR", "TSX"}):
            reason = choose("bourse non vérifiée", "exchange unverified")
        elif snapshot.return_basis != "price":
            reason = choose("méthode de rendement incompatible", "incompatible return methodology")
        else:
            points = {p.timestamp.date(): p.close for p in snapshot.points if target <= p.timestamp.date() <= now.date() and math.isfinite(p.close) and p.close > 0}
            dates = sorted(points)
            weekly = snapshot.interval == "1wk"
            tolerance = 10 if weekly else 5
            if (not dates or (dates[0] - target).days > tolerance or (now.date() - dates[-1]).days > 10
                    or len(dates) < max(2, int(months * (4 if weekly else 18) * .8))
                    or any((b-a).days > (21 if weekly else 10) for a, b in zip(dates, dates[1:]))):
                reason = choose("historique incomplet ou trop ancien pour la période", "incomplete or outdated history for this period")
            else:
                valid.append((symbol, snapshot, points))
        if snapshot is not None:
            stamp = max((p.timestamp for p in snapshot.points), default=None)
            bundle.sources.append(EvidenceSource(label=f"{symbol} · {snapshot.source_name}", type="etf_history", url=snapshot.source_url,
                timestamp=stamp, freshness="stale" if snapshot.stale else "delayed" if stamp else "unknown"))
        if reason:
            bundle.missing_data.append(f"{symbol}: {reason}")
    dates = sorted(set.intersection(*(set(row[2]) for row in valid))) if valid else []
    rows = []
    if len(dates) >= 2 and (dates[0]-target).days <= 10:
        start, end = dates[0], dates[-1]
        years = (end-start).days / 365.2425
        for symbol, snapshot, points in valid:
            try:
                ratio = points[end]/points[start]
                cumulative = (ratio-1)*100
                cagr = ((ratio ** (1/years))-1)*100 if years >= .95 else None
                if not math.isfinite(cumulative) or cagr is not None and not math.isfinite(cagr):
                    raise ValueError()
            except (OverflowError, ValueError, ZeroDivisionError):
                bundle.missing_data.append(f"{symbol}: " + choose("cours incohérents", "inconsistent prices"))
                continue
            rows.append((symbol, snapshot, cumulative, cagr))
    elif valid:
        bundle.missing_data.append(choose("Dates communes insuffisantes : aucun classement comparable.", "Insufficient common dates: no comparable ranking."))
    # Never rank different currency bases against each other or substitute price for requested total return.
    comparable = bool(rows) and len({row[1].currency for row in rows}) == 1 and not query.total_requested
    if comparable:
        rows.sort(key=lambda row: row[2], reverse=True)
    universe = ", ".join(selected)
    market = choose("cotés au Canada", "listed in Canada") if query.region == "CA" else choose("cotés aux États-Unis", "listed in the United States") if query.region == "US" else choose("symboles demandés", "requested symbols")
    lines = []
    if len(rows) == 1 and query.skill == "etf_performance" and not query.total_requested:
        symbol, _, change, _ = rows[0]
        lines.append(choose(f"Sur {label}, {symbol} affiche un rendement du prix de {change:+.2f} %, du {start} au {end}.", f"Over {label}, {symbol} has a price return of {change:+.2f}%, from {start} to {end}."))
    elif comparable:
        winner = rows[0]
        lines.append(choose(f"Sur {label}, {winner[0]} a le meilleur rendement du prix parmi les {len(rows)} ETF couverts ({market}) : {winner[2]:+.2f} %, du {start} au {end}.",
                            f"Over {label}, {winner[0]} has the highest price return among the {len(rows)} covered ETFs ({market}): {winner[2]:+.2f}%, from {start} to {end}."))
    else:
        lines.append(choose("Aucun classement fiable ne peut être établi avec les données comparables disponibles.", "No reliable ranking can be established with the available comparable data."))
    lines.append(choose(f"Univers étudié : {universe}. Échantillon non exhaustif; ce n’est pas le classement de tous les ETF du marché.",
                        f"Universe examined: {universe}. Non-exhaustive sample; this is not a ranking of every ETF in the market."))
    if rows:
        lines.extend(["", "## Comparaison" if fr else "## Comparison",
                      f"| {'Rang' if fr else 'Rank'} | ETF | {'Rendement du prix' if fr else 'Price return'} {label} | CAGR | {'Devise' if fr else 'Currency'} |",
                      "| --- | --- | --- | --- | --- |"])
        for rank, (symbol, snapshot, cumulative, cagr) in enumerate(rows, 1):
            annual = f"{cagr:+.2f} %" if cagr is not None else "—"
            lines.append(f"| {rank if comparable else '—'} | {symbol} ({snapshot.exchange}) | {cumulative:+.2f} % | {annual} | {snapshot.currency} |")
            bundle.facts.append(EvidenceFact(label=f"{symbol} price return", value=f"{cumulative:.6f}% ; CAGR {annual}; {start} / {end}; {snapshot.currency}",
                source=snapshot.source_name, timestamp=datetime.combine(end, datetime.min.time(), UTC), freshness="stale" if snapshot.stale else "delayed"))
        lines.extend(["", choose(f"Dates communes exactes : {start} → {end}.", f"Exact common dates: {start} → {end}.")])
    lines.extend(["", "## Analyse" if fr else "## Analysis",
        choose("Faits : les écarts calculés portent uniquement sur les cours de clôture observés. Interprétation : les expositions et le risque peuvent différer; ces rendements ne démontrent aucune causalité et ne prédisent pas les performances futures.",
               "Facts: calculated differences use observed closing prices only. Interpretation: exposures and risk may differ; these returns establish no causality and do not predict future performance.")])
    limits = [choose("Rendement du prix, dividendes exclus; ce n’est pas un rendement total. Aucune conversion de devise. Rendement = (cours final / cours initial − 1) × 100. CAGR = ((cours final / cours initial)^(365,2425 / jours) − 1) × 100, pour environ un an ou plus.",
                     "Price return, dividends excluded; not total return. No currency conversion. Return = (last / first close − 1) × 100. CAGR = ((last / first close)^(365.2425 / days) − 1) × 100, for about one year or longer.")]
    if query.total_requested:
        limits.append(choose("Rendement total demandé indisponible : les chiffres ci-dessus sont exclusivement des rendements du prix, sans classement.", "Requested total returns are unavailable: the figures above are price returns only, without ranking."))
    if rows and not comparable and not query.total_requested:
        limits.append(choose("Devises différentes : pas de classement commun.", "Different currencies: no common ranking."))
    limits.append(choose("Attribution sectorielle et effet des frais non mesurés; aucune cause de surperformance n’est déduite des cours seuls.", "Sector attribution and fee effects are not measured; no cause of outperformance is inferred from prices alone."))
    bundle.limitations = limits
    lines.extend(["", "## Méthodologie et limites" if fr else "## Methodology and limitations", *limits, *bundle.missing_data,
                  "", "## Sources et fraîcheur" if fr else "## Sources and freshness"])
    lines.extend(f"- {s.label} · {s.freshness} · {s.timestamp.date() if s.timestamp else choose('date inconnue', 'unknown date')}" for s in bundle.sources)
    bundle.freshness = "stale" if any(s.freshness == "stale" for s in bundle.sources) else "delayed" if rows else "unknown"
    return "\n".join(lines), bundle
