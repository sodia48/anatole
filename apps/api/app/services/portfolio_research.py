"""Evidence-first portfolio research from one consented PortfolioSnapshot."""

from __future__ import annotations

import json
from datetime import UTC

from app.schemas.assistant_context import (
    AnatoleEvidenceBundle, EvidenceFact, EvidenceSource, PortfolioEvidencePosition,
    PortfolioLookThroughSummary,
)
from app.schemas.workspace import PortfolioSnapshot
from app.services.portfolio_research_v12 import (
    build_concentration_map, build_macro_exposures, build_portfolio_xray,
)


SOURCE = "Portefeuille Anatole"
UNKNOWN_SECTORS = {"autres", "other", "unknown", "n/a", "non classé", "non classe", "indisponible"}
HORIZON_LABELS = {"1d": "1D", "1w": "1S", "1m": "1M", "3m": "3M", "ytd": "YTD", "1y": "1A"}
GROUPS = (
    ("overview", "Vue d’ensemble"), ("allocation", "Répartition du portefeuille"),
    ("concentration", "Concentration"), ("diversification", "Diversification"),
    ("lookthrough", "ETF look-through et chevauchements"), ("risk", "Risque"),
    ("performance", "Performance"), ("contribution", "Contributeurs et détracteurs"),
    ("correlation", "Corrélations"), ("sector", "Expositions sectorielles"),
    ("currency", "Expositions devises"), ("stress", "Stress tests"),
    ("news", "Actualités des positions"),
    ("strengths", "Points forts observables"), ("watchpoints", "Points de vigilance"),
)


def _number(value: float, digits: int = 1) -> str:
    return f"{value:,.{digits}f}".replace(",", " ")


def _money(value: float, currency: str) -> str:
    return f"{_number(value, 2)} {currency}"


def _percent(value: float, *, signed: bool = False) -> str:
    return f"{value:+.1f} %" if signed else f"{value:.1f} %"


def _add(bundle: AnatoleEvidenceBundle, group: str, label: str, value: str,
         source: str = SOURCE) -> None:
    fact = EvidenceFact(label=label, value=value, source=source,
                        timestamp=bundle.generated_at, freshness="internal")
    bundle.facts.append(fact)
    bundle.metric_groups.setdefault(group, []).append(fact)


def build_portfolio_research_bundle(snapshot: PortfolioSnapshot,
                                    *, requested_count: int | None = None) -> AnatoleEvidenceBundle:
    positions = sorted(snapshot.positions, key=lambda row: getattr(row, "weight_percent", 0), reverse=True)
    currency = getattr(snapshot, "base_currency", "CAD")
    bundle = AnatoleEvidenceBundle(
        skill="portfolio_analysis", entities=[row.symbol for row in positions[:5]],
        sources=[EvidenceSource(label=SOURCE, type="portfolio", freshness="internal",
                                timestamp=snapshot.generated_at)],
        freshness="internal", generated_at=snapshot.generated_at,
        limitations=["Analyse éducative des positions autorisées pour cette requête; aucune transaction ni décision d’adéquation."],
    )
    if requested_count is not None and len(positions) < requested_count:
        bundle.missing_data.append(f"{requested_count - len(positions)} position(s) sans cotation ou conversion exploitable")
    for row in positions:
        if hasattr(row, "market_value"):
            bundle.position_rows.append(PortfolioEvidencePosition(
                symbol=row.symbol, name=row.name, quantity=row.quantity,
                average_cost=row.average_cost, price=row.price,
                market_value=row.market_value, weight_percent=row.weight_percent,
                unrealized_pnl=row.unrealized_pnl,
                unrealized_pnl_percent=row.unrealized_pnl_percent,
                day_change_percent=row.day_change_percent, sector=row.sector,
                currency=row.currency, base_currency=currency, source=row.source,
                freshness="delayed" if row.delayed else "live",
            ))
            if not any(source.label == row.source for source in bundle.sources):
                bundle.sources.append(EvidenceSource(label=row.source, type="quote",
                    freshness="delayed" if row.delayed else "live", timestamp=snapshot.generated_at))

    for label, key in (("Valeur de marché actuelle", "total_market_value"),
                       ("Coût d’achat total", "total_cost_basis"),
                       ("Gain/perte latent", "total_unrealized_pnl"),
                       ("Variation de la journée", "total_day_pnl")):
        value = getattr(snapshot, key, None)
        if value is not None:
            _add(bundle, "overview", label, _money(value, currency))
    for label, key in (("Gain/perte latent", "total_unrealized_pnl_percent"),
                       ("Variation de la journée", "total_day_change_percent")):
        value = getattr(snapshot, key, None)
        if value is not None:
            _add(bundle, "overview", f"{label} en %", _percent(value, signed=True))
    if (score := getattr(snapshot, "portfolio_score", None)) is not None:
        _add(bundle, "overview", "Score portefeuille", f"{score:.1f}/100")
    if (benchmark := getattr(snapshot, "benchmark_name", None)):
        _add(bundle, "overview", "Indice de référence", benchmark)

    weights = [row.weight_percent for row in positions]
    if weights:
        _add(bundle, "concentration", "Nombre de positions cotées", str(len(positions)))
        _add(bundle, "concentration", "Plus grande position", _percent(weights[0]))
        _add(bundle, "concentration", "Cumul des trois premières", _percent(sum(weights[:3])))
        _add(bundle, "concentration", "Cumul des cinq premières", _percent(sum(weights[:5])))
        for threshold, label in ((0.5, "moins de 0,5 %"), (1, "moins de 1 %"),
                                 (10, "plus de 10 %"), (20, "plus de 20 %"), (30, "plus de 30 %")):
            count = sum(weight < threshold if threshold < 1 else weight > threshold for weight in weights)
            _add(bundle, "concentration", f"Positions {label}", str(count))
        for row in positions[:5]:
            _add(bundle, "allocation", f"Poids actuel {row.symbol}", _percent(row.weight_percent))
        if sum(weight < 1 for weight in weights):
            _add(bundle, "watchpoints", "Petites positions",
                 f"{sum(weight < 1 for weight in weights)} position(s) pèsent chacune moins de 1 %; leur contribution individuelle est mécaniquement limitée.")
    risk = getattr(snapshot, "risk", None)
    if risk:
        for label, key, group, suffix in (
            ("Volatilité annualisée", "volatility_percent", "risk", "%"),
            ("Bêta", "beta", "risk", ""),
            ("Repli maximal observé", "max_drawdown_percent", "risk", "%"),
            ("Ratio de Sharpe", "sharpe_ratio", "risk", ""),
            ("Indice de concentration HHI", "concentration_hhi", "concentration", ""),
            ("Score de diversification", "diversification_score", "diversification", "/100"),
            ("Couverture historique", "history_coverage_percent", "risk", "%"),
            ("Observations historiques", "history_observations", "risk", ""),
        ):
            value = getattr(risk, key, None)
            if value is not None:
                rendered = _percent(value) if suffix == "%" else f"{_number(value)}{suffix}"
                _add(bundle, group, label, rendered, "Risque Anatole")
        if (level := getattr(risk, "risk_level", None)):
            _add(bundle, "overview", "Niveau de risque observé", level, "Risque Anatole")
        if getattr(risk, "top_position_percent", 0) and risk.top_position_percent >= 30:
            _add(bundle, "watchpoints", "Concentration en tête", _percent(risk.top_position_percent))
        if getattr(risk, "history_coverage_percent", 100) < 70:
            bundle.missing_data.append("Historique insuffisant pour plusieurs statistiques de risque")
    else:
        bundle.missing_data.append("Statistiques de risque indisponibles")

    sectors = getattr(snapshot, "sector_allocation", [])
    unknown = sum(row.weight_percent for row in sectors if row.label.casefold() in UNKNOWN_SECTORS)
    if sectors:
        coverage = max(0.0, min(100.0, 100 - unknown))
        _add(bundle, "sector", "Couverture classification sectorielle", _percent(coverage))
        for row in sectors:
            if row.label.casefold() not in UNKNOWN_SECTORS:
                value = getattr(row, "value", None)
                _add(bundle, "sector", row.label,
                     f"{_percent(row.weight_percent)} · {_money(value, currency)}" if value is not None
                     else _percent(row.weight_percent))
        if unknown:
            bundle.limitations.append(f"Couverture sectorielle partielle : {_percent(unknown)} classés Autres/Unknown, sans exposition économique déterminée")
        known = [row for row in sectors if row.label.casefold() not in UNKNOWN_SECTORS]
        if known:
            dominant = max(known, key=lambda row: row.weight_percent)
            _add(bundle, "sector", "Secteur dominant classé", f"{dominant.label} {_percent(dominant.weight_percent)}")
            if unknown == 0:
                _add(bundle, "sector", "Secteur dominant", f"{dominant.label} {_percent(dominant.weight_percent)}")
    else:
        bundle.missing_data.append("Classification sectorielle indisponible")

    for row in getattr(snapshot, "currency_allocation", []):
        _add(bundle, "currency", row.label, f"{_percent(row.weight_percent)} · {_money(row.value, currency)}")
    if not getattr(snapshot, "currency_allocation", []):
        bundle.missing_data.append("Répartition par devise indisponible")

    for row in getattr(snapshot, "performance_horizons", []):
        label = HORIZON_LABELS.get(row.horizon, row.horizon.upper())
        if row.return_percent is None:
            bundle.missing_data.append(f"Performance {label} non publiée : couverture {row.coverage.coverage_percent:.0f} %")
            continue
        _add(bundle, "performance", f"{label} portefeuille", _percent(row.return_percent, signed=True), "Performance Anatole")
        if row.benchmark_return_percent is not None:
            _add(bundle, "performance", f"{label} indice de référence", _percent(row.benchmark_return_percent, signed=True), "Performance Anatole")
        else:
            bundle.missing_data.append(f"Indice de référence {label} indisponible; écart non calculé")
        if row.excess_return_percent is not None:
            _add(bundle, "performance", f"{label} écart", _percent(row.excess_return_percent, signed=True), "Performance Anatole")
        _add(bundle, "performance", f"{label} couverture", _percent(row.coverage.coverage_percent), "Performance Anatole")
    if not bundle.metric_groups.get("performance"):
        bundle.missing_data.append("Performance par horizon indisponible")

    for row in getattr(snapshot, "contribution_horizons", []):
        if not row.items:
            continue
        label = HORIZON_LABELS.get(row.horizon, row.horizon.upper())
        for item in (row.items[:2] + row.items[-2:]):
            _add(bundle, "contribution", f"{label} {item.symbol}",
                 f"contribution {_percent(item.contribution_percent, signed=True)}; titre {_percent(item.security_return_percent, signed=True)}; poids {_percent(item.current_weight_percent)}")
        _add(bundle, "contribution", f"{label} couverture", _percent(row.coverage.coverage_percent))
    if not bundle.metric_groups.get("contribution"):
        for kind, rows in (("Contributeur du jour", getattr(snapshot, "contributors", [])),
                           ("Détracteur du jour", getattr(snapshot, "detractors", []))):
            for row in rows[:3]:
                _add(bundle, "contribution", f"{kind} {row.symbol}",
                     f"P&L jour {_money(row.value, currency)}; variation du titre {_percent(row.value_percent, signed=True)}")

    correlation = getattr(snapshot, "correlation", None)
    if correlation:
        total_pairs = len(correlation.symbols) * (len(correlation.symbols) - 1) // 2
        valid_pairs = sum(correlation.values[i][j] is not None for i in range(len(correlation.symbols))
                          for j in range(i + 1, len(correlation.symbols)))
        if total_pairs:
            _add(bundle, "correlation", "Paires calculables", f"{valid_pairs}/{total_pairs}")
        for label, pair in (("Paire la plus corrélée", correlation.highest_pair),
                            ("Paire la moins corrélée", correlation.lowest_pair)):
            if pair:
                _add(bundle, "correlation", label, f"{pair[0]} / {pair[1]} : {pair[2]:+.2f}")
        if correlation.average_correlation is not None:
            _add(bundle, "correlation", "Corrélation moyenne calculable", f"{correlation.average_correlation:+.2f}")
        if total_pairs and valid_pairs < total_pairs:
            bundle.missing_data.append(f"Corrélations manquantes : {total_pairs - valid_pairs}/{total_pairs} paires")

    for row in getattr(snapshot, "stress_tests", []):
        if row.estimated_portfolio_change_percent is None:
            bundle.missing_data.append(f"Impact du scénario {row.label} non calculable : couverture {row.coverage.coverage_percent:.0f} %")
            continue
        shock = (f"{row.shock:+.0f} points de base" if row.shock_unit == "basis_points"
                 else _percent(row.shock, signed=True))
        _add(bundle, "stress", row.label,
             f"choc {shock}; impact estimé {_percent(row.estimated_portfolio_change_percent, signed=True)}; "
             f"couverture {_percent(row.coverage.coverage_percent)}; scénario, pas prévision",
             "Stress tests Anatole")

    for note in getattr(snapshot, "risk_reading", []):
        if not any(word in note.casefold() for word in UNKNOWN_SECTORS):
            _add(bundle, "watchpoints", "Lecture du risque", note, "Risque Anatole")
    for note in getattr(snapshot, "notes", []):
        if note not in bundle.limitations:
            bundle.limitations.append(note)
    if not positions:
        bundle.missing_data.append("Aucune position valorisable; aucune allocation chiffrée ne peut être présentée")
    if getattr(snapshot, "total_unrealized_pnl", 0) > 0:
        _add(bundle, "strengths", "Gain latent observé", _money(snapshot.total_unrealized_pnl, currency))
    if correlation and correlation.lowest_pair and correlation.lowest_pair[2] < 0.3:
        _add(bundle, "strengths", "Paire à faible corrélation observée",
             f"{correlation.lowest_pair[0]} / {correlation.lowest_pair[1]} : {correlation.lowest_pair[2]:+.2f}")
    if getattr(risk, "history_coverage_percent", 0) >= 90:
        _add(bundle, "strengths", "Historique couvert", _percent(risk.history_coverage_percent))
    bundle.time_series_summary = getattr(snapshot, "methodology", "") or None
    bundle.risk_contributions = getattr(snapshot, "risk_contributions", None)
    bundle.attribution = getattr(snapshot, "attribution", [])
    bundle.correlation_clusters = getattr(snapshot, "correlation_clusters", [])
    bundle.lookthrough = PortfolioLookThroughSummary()
    bundle.macro_exposures = build_macro_exposures(snapshot)
    bundle.portfolio_xray = build_portfolio_xray(snapshot, requested_count, bundle.lookthrough)
    bundle.concentration_map = build_concentration_map(snapshot, bundle.lookthrough, bundle.macro_exposures)
    return bundle


def add_etf_lookthrough(bundle: AnatoleEvidenceBundle, etf_symbol: str, etf_weight: float,
                        holdings: object, direct_symbols: set[str]) -> None:
    """Report observed ETF overlap only; incomplete holdings stay explicitly partial."""
    rows = getattr(holdings, "holdings", [])
    coverage = min(100.0, sum(row.weight_percent for row in rows))
    common = [row for row in rows if row.display_symbol.upper().removesuffix(".TO") in direct_symbols]
    _add(bundle, "lookthrough", f"Couverture observée des participations {etf_symbol}", _percent(coverage))
    _add(bundle, "lookthrough", f"{etf_symbol} chevauchement direct",
         f"{len(common)} position(s) commune(s) parmi {len(rows)} participations publiées")
    if common:
        observed = etf_weight * sum(row.weight_percent for row in common) / 100
        _add(bundle, "lookthrough", f"{etf_symbol} exposition commune observée",
             f"{_percent(observed)} du portefeuille; borne observée, pas chevauchement complet")
        _add(bundle, "lookthrough", f"{etf_symbol} titres communs",
             ", ".join(row.display_symbol for row in common[:5]))
    sectors = getattr(holdings, "sectors", [])
    if getattr(holdings, "official", False) and not getattr(holdings, "stale", False):
        for sector in sectors[:3]:
            _add(bundle, "lookthrough", f"{etf_symbol} secteur implicite {sector.label}",
                 f"{_percent(etf_weight * sector.weight_percent / 100)} du portefeuille observé")
    if coverage < 99.5:
        bundle.limitations.append(f"Look-through {etf_symbol} partiel : {_percent(coverage)} des participations publiées; aucun chevauchement total inféré")
    bundle.sources.append(EvidenceSource(label=holdings.source_name, type="etf_holdings",
        freshness="stale" if holdings.stale else "delayed",
        timestamp=holdings.generated_at, url=holdings.source_url))


def format_portfolio_research(bundle: AnatoleEvidenceBundle, snapshot: PortfolioSnapshot,
                              *, question: str = "", selected_highlights: list[int] | None = None) -> str:
    currency = getattr(snapshot, "base_currency", "CAD")
    value = getattr(snapshot, "total_market_value", None)
    cost = getattr(snapshot, "total_cost_basis", None)
    if value is not None and cost is not None:
        opening = f"Votre portefeuille vaut {_money(value, currency)} pour un coût d’achat de {_money(cost, currency)}. Les poids ci-dessous reposent sur la valeur de marché actuelle."
    else:
        opening = "Voici une lecture descriptive des données de portefeuille disponibles; certaines valorisations restent indisponibles."
    lines = [opening]
    xray = bundle.portfolio_xray
    if xray:
        lines.extend(["", "## Radiographie",
                      f"- **Positions valorisées :** {xray.position_count}; couverture des cotations {xray.quote_coverage_percent:.1f} %.",
                      f"- **Qualité d’analyse :** {xray.analysis_quality}."])
        if xray.effective_positions is not None:
            lines.append(f"- **Nombre effectif de positions :** {xray.effective_positions:.2f}, calculé par 1 / somme des poids de marché au carré.")
        for label, value in (("Couverture historique", xray.history_coverage_percent),
                             ("Classification sectorielle", xray.sector_coverage_percent),
                             ("Look-through ETF", xray.etf_lookthrough_coverage_percent),
                             ("Contribution au risque", xray.risk_contribution_coverage_percent),
                             ("Attribution", xray.attribution_coverage_percent),
                             ("Corrélations", xray.correlation_coverage_percent),
                             ("Stress", xray.stress_coverage_percent)):
            if value is not None:
                lines.append(f"- **{label} :** {value:.1f} % de couverture.")
    risk_contributions = bundle.risk_contributions
    if risk_contributions and risk_contributions.items:
        lines.extend(["", "## Où se trouve réellement le risque",
                      f"- Contribution calculée par covariance sur {risk_contributions.observations} observations synchronisées; couverture {risk_contributions.coverage.coverage_percent:.1f} %."])
        for row in risk_contributions.items[:5]:
            lines.append(f"- **{row.symbol} :** poids {row.portfolio_weight_percent:.1f} %; contribution au risque {row.risk_contribution_percent:.1f} %; volatilité isolée {row.standalone_volatility_percent:.1f} %.")
        lines.append("- Il s’agit d’une contribution à la volatilité historique, pas d’une VaR marginale ni d’une prévision.")
    concentration = bundle.concentration_map
    if concentration:
        details = []
        if concentration.direct_top_three_percent is not None:
            details.append(f"- Les trois plus grandes positions directes représentent {concentration.direct_top_three_percent:.1f} %.")
        for row in concentration.observed_economic_top[:3]:
            if row.direct_weight_percent > 0 and row.indirect_observed_weight_percent > 0:
                details.append(f"- **{row.symbol} :** {row.direct_weight_percent:.1f} % direct + {row.indirect_observed_weight_percent:.1f} % indirect observé via {', '.join(row.source_etfs)}; le total reste partiel si les holdings le sont.")
        if concentration.top_cluster_weight_percent is not None:
            details.append(f"- Plus grand cluster corrélé : {concentration.top_cluster_weight_percent:.1f} % de poids de marché.")
        if details:
            lines.extend(["", "## Concentrations cachées", *details])
    if bundle.correlation_clusters or xray and xray.effective_positions is not None:
        lines.extend(["", "## Diversification et clusters"])
        if xray and xray.effective_positions is not None:
            lines.append(f"- {xray.position_count} lignes représentent {xray.effective_positions:.2f} positions effectives selon les poids.")
        for cluster in bundle.correlation_clusters[:5]:
            lines.append(f"- **{cluster.label} :** {', '.join(cluster.symbols)}; poids {cluster.combined_weight_percent:.1f} %; corrélation interne moyenne {cluster.average_internal_correlation:.2f}; {cluster.observations} observations, {cluster.coverage_percent:.0f} % des paires couvertes.")
    if bundle.attribution:
        rows = [row for row in bundle.attribution if row.portfolio_return_percent is not None]
        if rows:
            lines.extend(["", "## Performance et attribution"])
            for row in rows:
                label = HORIZON_LABELS.get(row.horizon, row.horizon.upper())
                comparison = (f"; indice {row.benchmark_return_percent:+.2f} %; écart {row.excess_return_percent:+.2f} %"
                              if row.benchmark_return_percent is not None and row.excess_return_percent is not None else
                              "; indice et écart non calculables")
                lines.append(f"- **{label} :** portefeuille {row.portfolio_return_percent:+.2f} %{comparison}; couverture {row.coverage.coverage_percent:.0f} %.")
                if row.horizon in {"1d", "1m"}:
                    for item in (row.top_contributors[:2] + row.top_detractors[:2]):
                        lines.append(f"- {label} {item.symbol} : contribution {item.contribution_percent:+.2f} points; titre {item.security_return_percent:+.2f} %.")
                    if row.sector_contributions:
                        lines.append("- Secteurs connus observés : " + "; ".join(
                            f"{sector} {value:+.2f} points" for sector, value in sorted(row.sector_contributions.items())) + ".")
            lines.append("- Au-delà de 1D, cette attribution reconstitue les positions actuelles à quantités constantes; elle ne tient pas compte des transactions historiques.")
    if bundle.scenarios or any(row.weighted_sensitivity is not None for row in bundle.macro_exposures):
        lines.extend(["", "## Stress et sensibilités"])
        for row in bundle.scenarios:
            shock = f"{row.shock:+.0f} points de base" if row.shock_unit == "basis_points" else f"{row.shock:+.1f} %"
            if row.estimated_portfolio_change_percent is not None:
                lines.append(f"- **{row.factor} {shock} :** impact estimé {row.estimated_portfolio_change_percent:+.2f} %; couverture {row.coverage.coverage_percent:.0f} %; scénario, pas prévision.")
                for position in sorted(row.positions, key=lambda item: abs(item.contribution_percent_points), reverse=True)[:3]:
                    lines.append(f"- {position.symbol} : {position.contribution_percent_points:+.2f} points d’impact calculé.")
            else:
                lines.append(f"- **{row.factor} {shock} :** impact indisponible; couverture {row.coverage.coverage_percent:.0f} %.")
        for row in bundle.macro_exposures:
            if row.weighted_sensitivity is not None:
                lines.append(f"- Sensibilité historique pondérée {row.factor} : {row.weighted_sensitivity:+.3f}; couverture {row.coverage_percent:.0f} %.")
        lines.append("- Inflation et chômage servent uniquement de contexte officiel tant qu’aucune sensibilité directe n’est calculée.")
    if bundle.watchtower:
        delta = bundle.watchtower
        lines.extend(["", "## Ce qui a changé"])
        if not delta.previous_available:
            lines.append("- Aucun snapshot antérieur dans cette conversation.")
        else:
            lines.append(f"- Entre {delta.previous_at.astimezone(UTC).strftime('%Y-%m-%d %H:%M UTC')} et {delta.current_at.astimezone(UTC).strftime('%Y-%m-%d %H:%M UTC')} ({delta.elapsed_seconds:.0f} secondes).")
            if delta.changes:
                for key, change in list(delta.changes.items())[:12]:
                    lines.append(f"- {key.replace('_', ' ')} : {change:+.2f} par rapport au snapshot précédent.")
            else:
                lines.append("- Aucun agrégat comparable n’a changé.")
    if xray:
        lines.extend(["", "## Données manquantes et couverture",
                      f"- Cotations {xray.quote_coverage_percent:.0f} %; historique {(xray.history_coverage_percent or 0):.0f} %; secteurs {(xray.sector_coverage_percent or 0):.0f} %; risque calculable {(xray.risk_contribution_coverage_percent or 0):.0f} %."])
    if selected_highlights:
        lines.extend(["", "## Points saillants"])
        lines.extend(f"- **{bundle.facts[index].label} :** {bundle.facts[index].value}" for index in selected_highlights[:5])
    for group, title in GROUPS:
        facts = bundle.metric_groups.get(group, [])
        if not facts:
            continue
        lines.extend(["", f"## {title}"])
        if group != "allocation" or not bundle.position_rows:
            lines.extend(f"- **{fact.label} :** {fact.value}" for fact in facts)
        if group == "overview":
            lines.append("- Le coût d’achat sert au calcul du gain ou de la perte latente; il ne sert pas aux poids actuels.")
        if group == "allocation":
            if bundle.position_rows:
                for row in bundle.position_rows[:10]:
                    lines.append(f"- **{row.symbol} :** {_percent(row.weight_percent)} du portefeuille · valeur {_money(row.market_value, row.base_currency)} · P&L latent {_money(row.unrealized_pnl, row.base_currency)}")
                if len(bundle.position_rows) > 10:
                    lines.append(f"- + {len(bundle.position_rows) - 10} autres positions dans Portefeuille.")
        if group == "risk":
            lines.append("- La volatilité mesure la dispersion historique; le bêta compare au marché; le repli maximal et le Sharpe décrivent l’historique, sans prévoir la suite.")
        if group == "performance":
            lines.append("- Les horizons au-delà d’un jour reconstituent les positions actuelles à quantités constantes; aucune performance n’est publiée sous le seuil de couverture du moteur.")
        if group == "correlation":
            lines.append("- Le nombre de lignes ne suffit pas à établir la diversification; seules les paires disposant d’un historique commun sont comparées.")
        if group == "stress":
            lines.append("- Ces chocs sont des scénarios fondés sur les sensibilités historiques, pas des prévisions.")
    lines.extend(["", "## Ce qu’il faut surveiller",
                  "- L’évolution des poids calculés sur les valeurs de marché, des contributions et de la couverture des historiques lors des prochaines mises à jour."])
    if any(cue in question.casefold() for cue in ("répart", "repart", "bien", "diversif", "adapt")):
        lines.extend(["", "## Adéquation à votre situation",
                      "- Les chiffres décrivent la répartition; ils ne permettent pas de la qualifier de bonne ou mauvaise sans connaître votre horizon, vos besoins de liquidité, votre capacité de perte, vos contraintes et votre objectif."])
    if bundle.missing_data or bundle.limitations:
        lines.extend(["", "## Données manquantes et limites"])
        lines.extend(f"- {item}" for item in dict.fromkeys(bundle.missing_data + bundle.limitations))
    if bundle.time_series_summary:
        lines.extend(["", "## Méthode", f"- {bundle.time_series_summary}"])
    lines.extend(["", "## Sources et fraîcheur"])
    lines.extend(f"- {source.label} : {source.freshness}; {source.timestamp.astimezone(UTC).strftime('%Y-%m-%d %H:%M UTC') if source.timestamp else 'date indisponible'}."
                 for source in bundle.sources)
    return "\n".join(lines)


async def generate_portfolio_research_from_evidence(bundle: AnatoleEvidenceBundle,
                                                    snapshot: PortfolioSnapshot, question: str,
                                                    provider_router: object) -> str:
    """The provider selects fact indices only; prose and every number remain deterministic."""
    if len(bundle.facts) < 4:
        return format_portfolio_research(bundle, snapshot, question=question)
    aggregates = [(index, fact) for index, fact in enumerate(bundle.facts)
                  if fact not in bundle.metric_groups.get("allocation", [])][:80]
    evidence = [{"index": index, "label": fact.label, "value": fact.value} for index, fact in aggregates]
    topic = "performance" if any(cue in question.casefold() for cue in ("perform", "tsx", "rendement")) else (
        "risque" if any(cue in question.casefold() for cue in ("risqu", "pétrole", "oil", "stress")) else (
        "diversification" if any(cue in question.casefold() for cue in ("divers", "répart", "repart", "allocation"))
        else "vue d’ensemble"))
    prompt = ("Choisis au plus cinq indices de faits dérivés pertinents pour ce thème. "
              "Réponds uniquement par un tableau JSON d'entiers sans prose, chiffre supplémentaire, "
              "transaction ni recommandation. Aucun détail brut de position ni question complète n'est fourni.\nThème : "
              + topic + "\nFaits : " + json.dumps(evidence, ensure_ascii=False))
    try:
        result = await provider_router.generate_internal_evidence(prompt=prompt)
        indices = json.loads(result.answer) if result and result.success else []
        valid = {index for index, _ in aggregates}
        if not isinstance(indices, list) or len(indices) > 5 or any(type(index) is not int or index not in valid for index in indices):
            indices = []
    except Exception:  # noqa: BLE001
        indices = []
    return format_portfolio_research(bundle, snapshot, question=question,
                                     selected_highlights=list(dict.fromkeys(indices)))
