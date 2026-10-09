"""Evidence-first stock research. Every displayed number is observed or derived here."""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

from app.schemas.assistant_context import AnatoleEvidenceBundle, EvidenceFact, EvidenceSource
from app.schemas.fundamentals import FundamentalSnapshot
from app.schemas.stocks import FocusSnapshot, StockNewsSnapshot
from app.services.stock_sector_analysis import is_bank, select_sector_metrics
from app.services.assistant_synthesis import synthesize_from_evidence


GROUPS = (
    ("overview", "Vue d’ensemble"), ("fundamental", "Analyse fondamentale"),
    ("valuation", "Valorisation"), ("profitability", "Rentabilité et croissance"),
    ("balance", "Capital, bilan et qualité financière"), ("bank", "Indicateurs bancaires"),
    ("dividend", "Dividende"), ("consensus", "Consensus analystes publié"),
    ("technical", "Analyse technique"), ("momentum", "Momentum et tendance"),
    ("levels", "Niveaux techniques"), ("events", "Catalyseurs et événements à surveiller"),
)


def _number(value: float, decimals: int = 2) -> str:
    return f"{value:,.{decimals}f}".replace(",", " ")


def _pct(value: float) -> str:
    return f"{_number(value)} %"


def _add(bundle: AnatoleEvidenceBundle, group: str, label: str, value: str,
         source: str, timestamp: datetime | None, freshness: str,
         *, provider: str | None = None) -> None:
    fact = EvidenceFact(label=label, value=value, source=source, timestamp=timestamp,
                        freshness=freshness, provider=provider)
    bundle.facts.append(fact)
    bundle.metric_groups.setdefault(group, []).append(fact)


def _history_value(candles: list, now: datetime, days: int) -> float | None:
    cutoff = (now - timedelta(days=days)).timestamp()
    earlier = [row for row in candles if row.time <= cutoff]
    return earlier[-1].close if earlier else None


def _technical(bundle: AnatoleEvidenceBundle, focus: FocusSnapshot) -> None:
    quote, tech = focus.quote, focus.technicals
    source = quote.source
    freshness = "delayed" if quote.delayed else "live"
    at = quote.timestamp
    currency = quote.currency
    add = lambda group, label, value: _add(bundle, group, label, value, source, at, freshness)
    add("overview", "Cours", f"{_number(quote.price)} {currency}")
    add("overview", "Variation de séance", f"{_pct(quote.change_percent)} ({_number(quote.change)} {currency})")
    add("overview", "Horodatage de cotation", at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC"))
    add("technical", "Volume courant", _number(quote.volume, 0))
    add("technical", "Calcul technique", focus.generated_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC"))
    candles = sorted((c for c in focus.history if c.close > 0), key=lambda c: c.time)
    if not candles:
        bundle.missing_data.append("Historique de cours indisponible")
        return
    now = datetime.fromtimestamp(candles[-1].time, UTC)
    closes = [row.close for row in candles]
    for label, days in (("1M", 30), ("3M", 91), ("6M", 183), ("1A", 365)):
        prior = _history_value(candles, now, days)
        if prior and prior > 0:
            add("momentum", f"Performance {label}", _pct((closes[-1] / prior - 1) * 100))
    start_year = datetime(now.year, 1, 1, tzinfo=UTC).timestamp()
    year_candles = [row for row in candles if row.time < start_year]
    if year_candles:
        add("momentum", "Performance YTD", _pct((closes[-1] / year_candles[-1].close - 1) * 100))
    for horizon in (20, 50):
        if len(closes) > horizon and closes[-horizon - 1] > 0:
            add("momentum", f"Momentum {horizon} séances", _pct((closes[-1] / closes[-horizon - 1] - 1) * 100))
    for horizon, sma in ((20, tech.sma_20), (50, tech.sma_50), (200, tech.sma_200)):
        if sma is not None and sma > 0:
            add("technical", f"SMA {horizon}", f"{_number(sma)} {currency}")
            add("momentum", f"Écart cours / SMA {horizon}", _pct((quote.price / sma - 1) * 100))
            add("momentum", f"Horizon {horizon} séances", "configuration positive" if quote.price > sma else
                "configuration sous pression" if quote.price < sma else "configuration neutre")
    for label, value in (("RSI 14", tech.rsi_14), ("MACD", tech.macd), ("Signal MACD", tech.macd_signal)):
        if value is not None:
            add("technical", label, _number(value))
    if len(closes) >= 21:
        returns = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - 20, len(closes))]
        mean = sum(returns) / len(returns)
        volatility = math.sqrt(sum((item - mean) ** 2 for item in returns) / (len(returns) - 1)) * math.sqrt(252) * 100
        add("technical", "Volatilité réalisée 20 séances annualisée", _pct(volatility))
    recent = candles[-20:]
    if len(recent) >= 2:
        average = sum(row.volume for row in recent[:-1]) / (len(recent) - 1)
        if average > 0:
            add("technical", "Volume moyen (19 séances précédentes)", _number(average, 0))
            add("technical", "Volume relatif", f"{_number(quote.volume / average)} x")
    add("levels", "Support observé (plus bas des 20 dernières séances)", f"{_number(min(row.low for row in recent))} {currency}")
    add("levels", "Résistance observée (plus haut des 20 dernières séances)", f"{_number(max(row.high for row in recent))} {currency}")
    year = candles[-252:]
    high, low = max(row.high for row in year), min(row.low for row in year)
    if high > low:
        add("levels", "Fourchette 52 semaines observée", f"{_number(low)}–{_number(high)} {currency}")
        add("levels", "Repli depuis le sommet observé", _pct((quote.price / high - 1) * 100))
        add("levels", "Position dans la fourchette observée", _pct((quote.price - low) / (high - low) * 100))


def build_stock_research_bundle(symbol: str, focus: FocusSnapshot | None,
                                fundamentals: FundamentalSnapshot | None,
                                news: StockNewsSnapshot | None) -> AnatoleEvidenceBundle:
    bundle = AnatoleEvidenceBundle(skill="stock_analysis", entities=[symbol],
                                   generated_at=datetime.now(UTC))
    if focus is not None and not focus.quote.source.casefold().startswith(("demo", "démonstration")):
        _technical(bundle, focus)
        bundle.sources.append(EvidenceSource(label=focus.quote.source, type="market_quote",
                                             freshness="delayed" if focus.quote.delayed else "live",
                                             timestamp=focus.quote.timestamp))
        bundle.time_series_summary = f"Historique Focus : {len(focus.history)} séances; calculs au {focus.generated_at.isoformat()}"
        bundle.freshness = "delayed" if focus.quote.delayed else "live"
    else:
        bundle.missing_data.append("Cotation Focus réelle indisponible")
    if fundamentals is None or fundamentals.status == "unavailable":
        bundle.missing_data.append("Fondamentaux indisponibles")
    else:
        _fundamental(bundle, fundamentals)
    if news is not None and news.items:
        for item in news.items[:5]:
            _add(bundle, "events", "Actualité", f"{item.title} ({item.publisher}, {item.published_at.date()})",
                 item.publisher, item.published_at, "delayed")
            bundle.sources.append(EvidenceSource(label=item.publisher, type="news", freshness="delayed",
                                                 timestamp=item.published_at, url=item.url))
    else:
        bundle.missing_data.append("Actualités du titre indisponibles")
    return bundle


def _fundamental(bundle: AnatoleEvidenceBundle, snap: FundamentalSnapshot) -> None:
    metrics = snap.metrics
    at = snap.generated_at
    fresh = "stale" if snap.stale else "delayed"
    source = snap.source
    currency = snap.currency or ""
    financial_currency = snap.financial_currency or currency
    bundle.sources.append(EvidenceSource(label=source, type="fundamentals", freshness=fresh, timestamp=at))
    coverage = {"official": "officielle", "mixed": "mixte", "fallback": "fallback",
                "unavailable": "indisponible"}[snap.official_coverage.status]
    _add(bundle, "overview", "Couverture fondamentale", coverage,
         source, at, fresh)
    if snap.stale:
        bundle.limitations.append("Fondamentaux en cache périmé; actualisation en cours" if snap.refresh_in_progress
                                  else "Fondamentaux en cache périmé")
    elif snap.refresh_in_progress:
        bundle.limitations.append("Actualisation approfondie des documents officiels en cours")

    def add(group: str, label: str, value: float | None, unit: str = ""):
        if value is not None and math.isfinite(value):
            rendered = _pct(value) if unit == "%" else f"{_number(value, 0 if isinstance(value, int) else 2)} {unit}".strip()
            _add(bundle, group, label, rendered, source, at, fresh)

    add("overview", "Capitalisation", metrics.market_cap, currency)
    add("valuation", "P/E courant", metrics.trailing_pe, "x")
    add("valuation", "P/E prévisionnel publié", metrics.forward_pe, "x")
    add("valuation", "Prix / valeur comptable", metrics.price_to_book, "x")
    add("valuation", "Prix / ventes", metrics.price_to_sales, "x")
    add("valuation", "Bêta", metrics.beta)
    add("levels", "Plus haut 52 semaines publié", metrics.fifty_two_week_high, currency)
    add("levels", "Plus bas 52 semaines publié", metrics.fifty_two_week_low, currency)
    add("profitability", "BPA courant", metrics.trailing_eps, currency)
    add("profitability", "BPA prévisionnel publié", metrics.forward_eps, currency)
    for label, value in (("Croissance du chiffre d'affaires", metrics.revenue_growth),
                         ("Croissance du bénéfice", metrics.earnings_growth),
                         ("Marge bénéficiaire", metrics.profit_margin),
                         ("ROE", metrics.return_on_equity), ("ROA", metrics.return_on_assets)):
        add("profitability", label, value, "%")
    for label, value in (("Chiffre d'affaires", metrics.total_revenue),
                         ("Résultat net", metrics.net_income_to_common),
                         ("Flux de trésorerie disponible", metrics.free_cash_flow),
                         ("Flux de trésorerie opérationnel", metrics.operating_cash_flow),
                         ("Trésorerie", metrics.total_cash), ("Dette totale", metrics.total_debt)):
        add("balance" if label in {"Trésorerie", "Dette totale"} else "fundamental", label, value, financial_currency)
    add("balance", "Dette / capitaux propres", metrics.debt_to_equity, "%")
    add("dividend", "Dividende annuel", metrics.dividend_rate, currency)
    add("dividend", "Rendement du dividende", metrics.dividend_yield, "%")
    add("dividend", "Taux de distribution", metrics.payout_ratio, "%")
    for label, value in (("Croissance du chiffre d'affaires sur un an", snap.highlights.revenue_growth_yoy),
                         ("Croissance du bénéfice sur un an", snap.highlights.net_income_growth_yoy),
                         ("Croissance du BPA sur un an", snap.highlights.eps_growth_yoy),
                         ("TCAC du chiffre d'affaires sur trois ans", snap.highlights.three_year_revenue_cagr)):
        add("profitability", label, value, "%")
    for period_type, periods in (("trimestriel", snap.quarterly_financials), ("annuel", snap.annual_financials)):
        for period in periods[:2]:
            if period.source is None:
                continue
            psource = period.source
            pfresh = "stale" if snap.stale else "delayed"
            provenance = f"{psource.source_name} ({psource.source_type})"
            date = period.period_end.date()
            for label, value in (("Chiffre d'affaires", period.total_revenue),
                                 ("Résultat net", period.net_income), ("BPA dilué", period.diluted_eps)):
                if value is not None:
                    _add(bundle, "fundamental", f"{label} {period_type} {date}",
                         f"{_number(value)} {period.currency or financial_currency}", provenance,
                         psource.filed_at or period.period_end, pfresh)
            bundle.sources.append(EvidenceSource(label=provenance, type=psource.source_type,
                                                 freshness=pfresh, timestamp=psource.filed_at or period.period_end,
                                                 url=psource.source_url))
    for metric in select_sector_metrics(snap):
        fact = EvidenceFact(label=metric.label, value=f"{_number(metric.value)} {metric.unit}",
                            source=metric.source.source_name,
                            timestamp=metric.source.filed_at or metric.period_end,
                            freshness="stale" if snap.stale else "delayed", provider="official")
        bundle.sector_metrics.append(fact)
        bundle.facts.append(fact)
        bundle.metric_groups.setdefault("bank", []).append(fact)
        bundle.sources.append(EvidenceSource(label=metric.source.source_name, type=metric.source.source_type,
                                             freshness=fact.freshness, timestamp=fact.timestamp,
                                             url=metric.source.source_url))
    if is_bank(snap) and not bundle.sector_metrics:
        bundle.missing_data.append("Données bancaires spécialisées non disponibles dans la source actuelle")
    analysts = snap.analysts
    for label, value in (("Nombre d'analystes", analysts.analyst_count),
                         ("Cible basse", analysts.target_low), ("Cible moyenne", analysts.target_mean),
                         ("Cible médiane", analysts.target_median), ("Cible haute", analysts.target_high),
                         ("Cours de référence du consensus", analysts.current_price),
                         ("Écart à la cible moyenne publié", analysts.upside_to_mean_percent),
                         ("Achat fort", analysts.strong_buy), ("Achat", analysts.buy),
                         ("Conserver", analysts.hold), ("Vente", analysts.sell),
                         ("Vente forte", analysts.strong_sell)):
        add("consensus", label, value, "%" if "Écart" in label else
            (currency if "Cible" in label or "Cours" in label else ""))
    for label, date in (("Date ex-dividende", snap.events.ex_dividend_date),
                        ("Date de versement", snap.events.dividend_date)):
        if date:
            _add(bundle, "dividend", label, str(date.date()), source, at, fresh)
    if snap.events.earnings_dates:
        future = [date for date in snap.events.earnings_dates
                  if (date if date.tzinfo else date.replace(tzinfo=UTC)) >= datetime.now(UTC)]
        if future:
            _add(bundle, "events", "Prochains résultats annoncés", str(min(future).date()), source, at, fresh)
    for item in snap.earnings_history[:2]:
        if item.surprise_percent is not None:
            _add(bundle, "profitability", f"Surprise BPA {item.period}", _pct(item.surprise_percent), source, at, fresh)


def format_stock_research(bundle: AnatoleEvidenceBundle, *, question: str = "",
                          selected_highlights: list[int] | None = None) -> str:
    """Stable Markdown-like plaintext; the UI renders only headings and bullets."""
    symbol = bundle.entities[0] if bundle.entities else "Titre"
    lines = [f"Analyse technique et fondamentale de {symbol}"]
    if selected_highlights:
        lines += ["", "## Points saillants"]
        for index in selected_highlights[:5]:
            fact = bundle.facts[index]
            lines.append(f"- {fact.label} : {fact.value}.")
    for key, heading in GROUPS:
        facts = bundle.metric_groups.get(key, [])
        if not facts:
            continue
        lines += ["", f"## {heading}"]
        lines.extend(f"- {fact.label} : {fact.value}." for fact in facts)
        if key == "consensus":
            lines.append("- Ces cibles sont un consensus publié; elles ne constituent pas une prévision Anatole.")
        if key == "events" and any(fact.label == "Actualité" for fact in facts):
            lines.append("- Ces titres ne démontrent pas à eux seuls la cause d'un mouvement de cours.")
    if "baisse" in question.casefold() or "down today" in question.casefold():
        lines += ["", "## Lecture de la séance", "- La variation et les actualités ci-dessus ne démontrent pas une causalité. Une comparaison sectorielle n'est pas disponible dans cette analyse."]
    drivers = bundle.metric_groups.get("momentum", []) + bundle.metric_groups.get("profitability", [])
    if drivers:
        labels = [fact.label for fact in drivers[:3]]
        lines += ["", "## Scénarios descriptifs",
                  f"- Favorable : amélioration de {', '.join(labels)}; surveiller les mêmes métriques publiées.",
                  f"- Central : stabilité de {', '.join(labels)}; surveiller leur prochaine mise à jour.",
                  f"- Défavorable : détérioration de {', '.join(labels)}; surveiller les mêmes métriques publiées."]
    risk_facts = bundle.metric_groups.get("balance", []) + bundle.metric_groups.get("technical", [])
    if risk_facts:
        lines += ["", "## Risques", "- Les métriques de bilan et la volatilité observée décrivent une exposition; elles ne permettent pas de prévoir un rendement."]
    watch = bundle.metric_groups.get("events", []) or bundle.metric_groups.get("levels", [])
    if watch:
        lines += ["", "## Ce qu’il faut surveiller"]
        lines.extend(f"- {fact.label} : {fact.value}." for fact in watch[:3])
    if bundle.missing_data or bundle.limitations:
        lines += ["", "## Données manquantes et limites"]
        lines.extend(f"- {item}." for item in bundle.missing_data + bundle.limitations)
    if bundle.sources:
        lines += ["", "## Sources et fraîcheur"]
        seen = set()
        for source in bundle.sources:
            key = (source.label, source.timestamp, source.type)
            if key in seen:
                continue
            seen.add(key)
            date = source.timestamp.isoformat() if source.timestamp else "date indisponible"
            lines.append(f"- {source.label} ({source.type}) : {source.freshness}, {date}.")
    return "\n".join(lines)


async def generate_stock_research_from_evidence(bundle: AnatoleEvidenceBundle, question: str,
                                                provider_router: object) -> str:
    fallback = format_stock_research(bundle, question=question)
    return (await synthesize_from_evidence(bundle, question, fallback, provider_router)).answer
