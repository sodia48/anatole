"use client";

import { isTerminalV2Snapshot } from "@anatole/shared";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Gauge,
  Radar,
  RefreshCw,
  ShieldAlert,
  Waves,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getTerminalSnapshot } from "@/lib/api";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  TerminalAlert,
  TerminalOpportunity,
  TerminalSector,
  TerminalSnapshot,
} from "@/lib/types";

import styles from "./Analysis.module.css";
import { TerminalV2Sections } from "./TerminalV2Sections";

type FeedMode = "all" | "volume" | "momentum" | "pressure";

const FEED_MODES: Array<{ value: FeedMode; label: readonly [string, string] }> = [
  { value: "all", label: ["Tous", "All"] },
  { value: "volume", label: ["Volume", "Volume"] },
  { value: "momentum", label: ["Momentum", "Momentum"] },
  { value: "pressure", label: ["Sous pression", "Under pressure"] },
];

function formatPercent(value: number, digits = 2, language: AnatoleLanguage = "fr"): string {
  return `${new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value)} %`;
}

function formatPrice(value: number, language: AnatoleLanguage): string {
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function valueClass(value: number | null): string {
  if (value == null || value === 0) {
    return "";
  }
  return value > 0 ? "positive" : "negative";
}

function stateClass(sector: TerminalSector): string {
  if (sector.state === "Leadership") {
    return styles.stateLeadership;
  }
  if (sector.state === "Accumulation") {
    return styles.stateAccumulation;
  }
  if (sector.state === "Distribution") {
    return styles.stateDistribution;
  }
  if (sector.state === "Faiblesse") {
    return styles.stateWeakness;
  }
  return "";
}

function alertClass(alert: TerminalAlert): string {
  if (alert.severity === "high") {
    return styles.alertHigh;
  }
  if (alert.severity === "watch") {
    return styles.alertWatch;
  }
  return "";
}

function alertIcon(alert: TerminalAlert) {
  if (alert.severity === "high") {
    return <ShieldAlert size={16} />;
  }
  if (alert.severity === "watch") {
    return <AlertTriangle size={16} />;
  }
  return <Activity size={16} />;
}

function formatAsOf(value: string | null, language: AnatoleLanguage, dateOnly = false): string {
  if (!value) return "N/D";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return new Intl.DateTimeFormat(localeFor(language), dateOnly
    ? { year: "numeric", month: "2-digit", day: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }).format(date);
}

function regimeLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({ Haussier: "Bullish", Constructif: "Constructive", Neutre: "Neutral", Fragile: "Fragile", Baissier: "Bearish" } as Record<string, string>)[value] ?? value;
}

function riskLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({ Faible: "Low", Modéré: "Moderate", Élevé: "High", Critique: "Critical" } as Record<string, string>)[value] ?? value;
}

function stateLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({ Leadership: "Leadership", Accumulation: "Accumulation", Neutre: "Neutral", Distribution: "Distribution", Faiblesse: "Weakness" } as Record<string, string>)[value] ?? value;
}

function opportunityLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({ Leadership: "Leadership", "Sous pression": "Under pressure", Accélération: "Acceleration", Tendance: "Trend" } as Record<string, string>)[value] ?? value;
}

function componentCopy(component: TerminalSnapshot["components"][number], language: AnatoleLanguage) {
  if (language === "fr") return component;
  const copies: Record<string, { label: string; value: string; description: string }> = {
    breadth: { label: "Market breadth", value: component.value.replace("hausses", "gainers").replace("baisses", "decliners"), description: "Share of TSX 60 securities rising among directional moves." },
    trend: { label: "Trend structure", value: component.value.replace("au-dessus de la MM50", "above the 50-session average"), description: "Share of securities supported by their 20- and 50-session moving averages." },
    momentum: { label: "20-day momentum", value: component.value.replace("en moyenne", "on average"), description: "Average cross-sectional momentum of TSX 60 constituents." },
    quality: { label: "Signal quality", value: component.value, description: "Average Anatole score combining price, volume, momentum, RSI, and trend." },
  };
  return { ...component, ...(copies[component.key] ?? {}) };
}

function alertCopy(alert: TerminalAlert, language: AnatoleLanguage): TerminalAlert {
  if (language === "fr") return alert;
  if (alert.id === "market-breadth") return { ...alert, category: "Market", title: "Weak market breadth", detail: "Only a minority of directional moves are positive; index gains may be concentrated." };
  if (alert.id.startsWith("volume:")) return { ...alert, category: "Price-volume", title: `Unusual activity in ${alert.symbol}`, detail: "Relative volume and the session move are unusually high." };
  if (alert.id.startsWith("rsi:")) return { ...alert, category: "Extension", title: `${alert.symbol} is technically extended`, detail: "The 14-session RSI is elevated; strength can persist, but consolidation risk is higher." };
  return { ...alert, category: "Dislocation", title: `Pullback within a positive trend — ${alert.symbol}`, detail: "Positive 20-day momentum contrasts with a negative session." };
}

function uniqueRadarItems(snapshot: TerminalSnapshot): TerminalOpportunity[] {
  const items = new Map<string, TerminalOpportunity>();

  for (const item of [
    ...snapshot.opportunities,
    ...snapshot.leaders,
    ...snapshot.laggards,
  ]) {
    const current = items.get(item.symbol);
    if (!current || item.score > current.score) {
      items.set(item.symbol, item);
    }
  }

  return [...items.values()];
}

function RankingTable({
  title,
  items,
  direction,
  language,
}: {
  title: string;
  items: TerminalOpportunity[];
  direction: "leaders" | "laggards";
  language: AnatoleLanguage;
}) {
  return (
    <article className={`panel ${styles.sectionPanel}`}>
      <div className={styles.sectionHeading}>
        <div>
          <span className="eyebrow">
            {direction === "leaders" ? "LEADERSHIP" : pick(language, "PRESSION", "PRESSURE")}
          </span>
          <h2>{title}</h2>
        </div>
        {direction === "leaders" ? (
          <ArrowUpRight size={20} color="#27d5ae" />
        ) : (
          <ArrowDownRight size={20} color="#ff6f86" />
        )}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.rankTable} data-mobile-cards="terminal">
          <thead>
            <tr>
              <th>{pick(language, "Titre", "Security")}</th>
              <th>{pick(language, "Séance", "Session")}</th>
              <th>Momentum</th>
              <th>Volume</th>
              <th>RSI</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.symbol}>
                <td data-label={pick(language, "Titre", "Security")}>
                  <div className={styles.instrumentCell}>
                    <span className={styles.rankBadge}>{index + 1}</span>
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.sector}</small>
                    </span>
                  </div>
                </td>
                <td data-label={pick(language, "Séance", "Session")} className={valueClass(item.change_percent)}>
                  {formatPercent(item.change_percent, 2, language)}
                </td>
                <td data-label="Momentum" className={valueClass(item.momentum_20d)}>
                  {formatPercent(item.momentum_20d, 1, language)}
                </td>
                <td data-label="Volume relatif">{item.relative_volume.toFixed(1)}×</td>
                <td data-label="RSI">{item.rsi_14?.toFixed(1) ?? "—"}</td>
                <td data-label="Score">
                  <span className={styles.scorePill}>{item.score.toFixed(0)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function MarketSignalCard({ item, language }: { item: TerminalOpportunity; language: AnatoleLanguage }) {
  const marker = Math.max(2, Math.min(98, item.score));
  const direction =
    item.change_percent > 0.005
      ? "up"
      : item.change_percent < -0.005
        ? "down"
        : "flat";

  return (
    <Link
      href={`/focus/${encodeURIComponent(item.symbol)}`}
      className={styles.marketSignalCard}
      data-direction={direction}
      aria-label={pick(language, `${item.symbol}, ${item.name}, variation ${formatPercent(item.change_percent, 2, language)}, score ${item.score.toFixed(0)} sur 100`, `${item.symbol}, ${item.name}, change ${formatPercent(item.change_percent, 2, language)}, score ${item.score.toFixed(0)} out of 100`)}
    >
      <div className={styles.signalCardTop}>
        <div className={styles.signalIdentity}>
          <strong>{item.symbol}</strong>
          <span>{item.name}</span>
        </div>
        <div className={styles.signalPrice}>
          <span>{formatPrice(item.price, language)}</span>
          <strong className={valueClass(item.change_percent)}>
            {formatPercent(item.change_percent, 2, language)}
          </strong>
        </div>
      </div>

      <div className={styles.signalBar} aria-label={pick(language, `Score Anatole ${item.score.toFixed(0)} sur 100`, `Anatole score ${item.score.toFixed(0)} out of 100`)}>
        <span className={styles.signalZoneRisk} />
        <span className={styles.signalZoneNeutral} />
        <span className={styles.signalZoneStrong} />
        <i
          className={styles.signalMarker}
          style={{ left: `calc(${marker}% - 6px)` }}
        />
      </div>
      <div className={styles.signalBarLabels}>
        <span>Score 0</span>
        <span>100</span>
      </div>

      <div className={styles.signalMetrics}>
        <div>
          <span>Momentum</span>
          <strong className={valueClass(item.momentum_20d)}>
            {formatPercent(item.momentum_20d, 1, language)}
          </strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{item.relative_volume.toFixed(1)}×</strong>
        </div>
        <div>
          <span>RSI</span>
          <strong>{item.rsi_14?.toFixed(0) ?? "—"}</strong>
        </div>
      </div>

      <div className={styles.signalFooter}>
        <span>{opportunityLabel(item.opportunity_type, language)}</span>
        <span>
          Focus <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

export function TerminalClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>("all");
  const [sectorFilter, setSectorFilter] = useState("Tous");

  const load = useCallback(
    async (background = false, signal?: AbortSignal) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await getTerminalSnapshot(signal);
        if (!isTerminalV2Snapshot(response)) {
          throw new Error(pick(language, "Le backend connecté ne fournit pas le contrat Terminal V2.", "The connected backend does not provide the Terminal V2 contract."));
        }
        setSnapshot(response);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") {
          setError(
            reason instanceof Error
              ? reason.message
              : pick(language, "Terminal Pro est temporairement indisponible.", "Pro Terminal is temporarily unavailable."),
          );
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(false, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const interval = window.setInterval(
      () => {
        if (!document.hidden) void load(true);
      },
      Math.max(snapshot.refresh_after_seconds, 60) * 1000,
    );

    return () => window.clearInterval(interval);
  }, [load, snapshot]);

  const radarItems = useMemo(
    () => (snapshot ? uniqueRadarItems(snapshot) : []),
    [snapshot],
  );

  const sectors = useMemo(() => {
    const values = new Set(radarItems.map((item) => item.sector));
    return ["Tous", ...[...values].sort((left, right) => left.localeCompare(right, "fr"))];
  }, [radarItems]);

  const visibleRadarItems = useMemo(() => {
    let items = [...radarItems];

    if (sectorFilter !== "Tous") {
      items = items.filter((item) => item.sector === sectorFilter);
    }

    if (feedMode === "volume") {
      return items.sort((left, right) => right.relative_volume - left.relative_volume);
    }
    if (feedMode === "momentum") {
      return items.sort((left, right) => right.momentum_20d - left.momentum_20d);
    }
    if (feedMode === "pressure") {
      return items.sort((left, right) => {
        const leftPressure = left.score + Math.max(left.change_percent, 0) * 3;
        const rightPressure = right.score + Math.max(right.change_percent, 0) * 3;
        return leftPressure - rightPressure;
      });
    }

    return items.sort((left, right) => right.score - left.score);
  }, [feedMode, radarItems, sectorFilter]);

  const scoredSectors = snapshot?.sectors.filter((sector) => sector.leadership_score != null) ?? [];
  const strongestSector = scoredSectors[0];
  const weakestSector = scoredSectors.at(-1);
  const generatedAt = useMemo(() => {
    if (!snapshot) {
      return "";
    }
    return new Intl.DateTimeFormat(localeFor(language), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(snapshot.generated_at));
  }, [language, snapshot]);

  if (loading && !snapshot) {
    return (
      <div className={styles.page}>
        <section className={`panel ${styles.loadingPanel}`}>
          <div className={styles.loadingCopy}>
            <span className={styles.spinner} />
            <strong>{pick(language, "Initialisation du Terminal Pro", "Initializing Pro Terminal")}</strong>
            <span>
              {pick(language, "Analyse de la largeur, des tendances, des secteurs et des anomalies prix-volume.", "Analyzing breadth, trends, sectors, and price-volume anomalies.")}
            </span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${styles.terminalPage}`}>
      <header className={`panel ${styles.hero} ${styles.terminalHeroV2}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">{pick(language, "FLUX DE MARCHÉ", "MARKET FLOW")} · TERMINAL PRO</span>
          <h1>Terminal Pro</h1>
          <p>
            {pick(language, "Une lecture mobile du marché canadien inspirée des meilleurs terminaux : régime, volume inhabituel, momentum, secteurs et alertes, sans recommandations de placement.", "A mobile view of the Canadian market inspired by leading terminals: regime, unusual volume, momentum, sectors, and alerts, without investment recommendations.")}
          </p>
        </div>
        {snapshot ? (
          <div className={styles.terminalPulse}>
            <div
              className={styles.scoreRing}
              style={{
                background: snapshot.regime_score == null ? "rgba(52,83,102,.32)" : `conic-gradient(#20caa3 0 ${snapshot.regime_score}%, rgba(52,83,102,.32) ${snapshot.regime_score}% 100%)`,
              }}
            >
              <span>
                <strong>{snapshot.regime_score?.toFixed(0) ?? "N/D"}</strong>
                <small>/100</small>
              </span>
            </div>
            <div className={styles.regimeCopy}>
              <span>{pick(language, "Régime", "Regime")}</span>
              <strong>{snapshot.regime ? regimeLabel(snapshot.regime, language) : "N/D"}</strong>
              <small>{pick(language, "Risque", "Risk")} {snapshot.risk_level ? riskLabel(snapshot.risk_level, language).toLowerCase() : "N/D"}</small>
            </div>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className={styles.errorNotice}>
          {language === "fr" ? error : "Pro Terminal is temporarily unavailable."} {snapshot ? pick(language, "Les dernières données valides restent affichées.", "The latest valid data remains visible.") : ""}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <section className={styles.marketEventStrip} data-testid="terminal-freshness">
            <div className={styles.marketEventCopy}>
              <span>{pick(language, "Données marché", "Market data")} · {formatAsOf(snapshot.data_quality.quotes_as_of, language)}</span>
              <strong>{pick(language, "Historique quotidien", "Daily history")} · {formatAsOf(snapshot.data_quality.history_as_of, language, true)}</strong>
            </div>
            {snapshot.radar_items.some((item) => item.delayed) ? <strong>{pick(language, "Différé", "Delayed")}</strong> : null}
          </section>
          <section className={styles.marketEventStrip}>
            <div className={styles.marketEventIcon}>
              <Bell size={18} />
            </div>
            <div className={styles.marketEventCopy}>
              <span>{pick(language, "Événements de marché", "Market events")}</span>
              <strong>
                {snapshot.alerts.length} {pick(language, "alertes", "alerts")} · {snapshot.high_relative_volume_count ?? "N/D"} {pick(language, "volumes inhabituels", "unusual volumes")}
              </strong>
            </div>
            <a href="#terminal-alerts">
              {pick(language, "Voir tout", "View all")} <ArrowRight size={14} />
            </a>
          </section>

          <section className={styles.terminalKpiStrip}>
            <article>
              <span>TSX 60</span>
              <strong className={valueClass(snapshot.weighted_change_percent)}>
                {snapshot.weighted_change_percent == null ? "N/D" : formatPercent(snapshot.weighted_change_percent, 2, language)}
              </strong>
            </article>
            <article>
              <span>{pick(language, "Largeur", "Breadth")}</span>
              <strong>{snapshot.advance_ratio == null ? "N/D" : `${snapshot.advance_ratio.toFixed(0)} %`}</strong>
            </article>
            <article>
              <span>{pick(language, "Au-dessus MM50", "Above 50-session average")}</span>
              <strong>{snapshot.above_sma50_percent == null ? "N/D" : `${snapshot.above_sma50_percent.toFixed(0)} %`}</strong>
            </article>
            <article>
              <span>{pick(language, "Score moyen", "Average score")}</span>
              <strong>{snapshot.average_anatole_score?.toFixed(0) ?? "N/D"}</strong>
            </article>
          </section>

          <TerminalV2Sections language={language} snapshot={snapshot} />

          <section className={`panel ${styles.terminalFeedPanel}`}>
            <div className={styles.terminalFeedHeading}>
              <div>
                <span className="eyebrow">{pick(language, "RADAR PRO", "PRO RADAR")}</span>
                <h2>{pick(language, "Signaux à surveiller", "Signals to monitor")}</h2>
                <p>
                  {pick(language, "Les cartes classent les configurations selon le score, le volume, le momentum et la pression observée.", "Cards rank configurations by score, volume, momentum, and observed pressure.")}
                </p>
              </div>
              <Radar size={22} color="#55a0ff" />
            </div>

            <div className={styles.terminalTabs} role="tablist" aria-label={pick(language, "Filtrer le radar Terminal Pro", "Filter the Pro Terminal radar")}>
              {FEED_MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={feedMode === item.value}
                  className={feedMode === item.value ? styles.terminalTabActive : styles.terminalTab}
                  onClick={() => setFeedMode(item.value)}
                >
                  {pick(language, item.label[0], item.label[1])}
                </button>
              ))}
            </div>

            <div className={styles.terminalSectorFilters} aria-label={pick(language, "Filtrer par secteur", "Filter by sector")}>
              {sectors.map((sector) => (
                <button
                  key={sector}
                  type="button"
                  className={sectorFilter === sector ? styles.terminalSectorFilterActive : styles.terminalSectorFilter}
                  onClick={() => setSectorFilter(sector)}
                >
                  {sector === "Tous" ? pick(language, "Tous", "All") : sector}
                </button>
              ))}
            </div>

            {visibleRadarItems.length ? (
              <div className={styles.marketSignalGrid}>
                {visibleRadarItems.map((item) => (
                  <MarketSignalCard key={item.symbol} item={item} language={language} />
                ))}
              </div>
            ) : (
              <div className={styles.emptyInline}>
                {pick(language, "Aucun titre ne correspond à ce filtre pour le moment.", "No security currently matches this filter.")}
              </div>
            )}
          </section>

          <section className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">{pick(language, "ROTATION SECTORIELLE", "SECTOR ROTATION")}</span>
                <h2>{pick(language, "Carte de leadership", "Leadership map")}</h2>
                <p>{pick(language, "Une lecture compacte de la force, du momentum et de la largeur de chaque secteur.", "A compact view of each sector’s strength, momentum, and breadth.")}</p>
              </div>
              <Waves size={21} color="#55a0ff" />
            </div>
            <div className={styles.terminalSectorGrid}>
              {snapshot.sectors.map((sector) => (
                <article className={styles.terminalSectorCard} key={sector.sector}>
                  <div className={styles.terminalSectorTop}>
                    <strong>{sector.sector}</strong>
                    <span className={`${styles.statePill} ${stateClass(sector)}`}>
                      {stateLabel(sector.state, language)}
                    </span>
                  </div>
                  {sector.leadership_score != null ? <div className={styles.terminalSectorScore} data-testid={`terminal-sector-score-${sector.sector}`}>
                    <span style={{ width: `${sector.leadership_score}%` }} />
                    <i style={{ left: `calc(${sector.leadership_score}% - 4px)` }} />
                  </div> : null}
                  <div className={styles.terminalSectorMetrics}>
                    <div>
                      <span>{pick(language, "Séance", "Session")}</span>
                      <strong className={valueClass(sector.change_percent)}>
                        {formatPercent(sector.change_percent, 2, language)}
                      </strong>
                    </div>
                    <div>
                      <span>Momentum</span>
                      <strong className={valueClass(sector.momentum_20d)}>
                        {sector.momentum_20d == null ? "N/D" : formatPercent(sector.momentum_20d, 1, language)}
                      </strong>
                    </div>
                    <div>
                      <span>{pick(language, "Largeur", "Breadth")}</span>
                      <strong>{sector.advancers}↑ {sector.decliners}↓</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="terminal-alerts" className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">{pick(language, "SURVEILLANCE", "MONITORING")}</span>
                <h2>{pick(language, "Alertes et dislocations", "Alerts and dislocations")}</h2>
                <p>{pick(language, "Signaux qui méritent une vérification dans Focus.", "Signals worth reviewing in Focus.")}</p>
              </div>
              <Activity size={21} color="#f2b84b" />
            </div>
            <div className={styles.alertList}>
              {snapshot.alerts.length ? (
                snapshot.alerts.map((rawAlert) => {
                  const alert = alertCopy(rawAlert, language);
                  return (
                  <article
                    className={`${styles.alertCard} ${alertClass(alert)}`}
                    key={alert.id}
                  >
                    <span className={styles.alertIcon}>{alertIcon(alert)}</span>
                    <div className={styles.alertCopy}>
                      <div className={styles.alertMeta}>
                        <span>{alert.category}</span>
                        {alert.symbol ? <span>{alert.symbol}</span> : null}
                      </div>
                      <strong>{alert.title}</strong>
                      <p>{alert.detail}</p>
                    </div>
                    {alert.symbol ? (
                      <Link href={`/focus/${encodeURIComponent(alert.symbol)}`} aria-label={pick(language, `Ouvrir ${alert.symbol} dans Focus`, `Open ${alert.symbol} in Focus`)}>
                        <ArrowRight size={15} />
                      </Link>
                    ) : null}
                  </article>
                  );
                })
              ) : (
                <div className={styles.emptyInline}>
                  {pick(language, "Aucune anomalie majeure détectée dans le dernier calcul.", "No major anomaly was detected in the latest calculation.")}
                </div>
              )}
            </div>
          </section>

          <details className={`panel ${styles.terminalDetails}`}>
            <summary>
              <span>
                <Gauge size={18} />
                {pick(language, "Analyse détaillée du marché", "Detailed market analysis")}
              </span>
              <small>{pick(language, "Composantes, leaders, pression et méthodologie", "Components, leaders, pressure, and methodology")}</small>
            </summary>

            <div className={styles.terminalDetailsBody}>
              <section className={styles.componentGrid}>
                {snapshot.components.map((rawComponent) => {
                  const component = componentCopy(rawComponent, language);
                  return (
                  <article className={styles.componentCard} key={component.key}>
                    <div className={styles.componentTop}>
                      <span>{component.label}</span>
                      <strong>{component.score?.toFixed(0) ?? "N/D"}</strong>
                    </div>
                    {component.score != null ? <div className={styles.componentTrack} data-testid={`terminal-component-score-${component.key}`}>
                      <span style={{ width: `${component.score}%` }} />
                    </div> : null}
                    <b>{component.value}</b>
                    <p>{component.description}</p>
                  </article>
                  );
                })}
              </section>

              <section className={styles.terminalColumns}>
                <RankingTable
                  title={pick(language, "Leaders du score Anatole", "Anatole score leaders")}
                  items={snapshot.leaders}
                  direction="leaders"
                  language={language}
                />
                <RankingTable
                  title={pick(language, "Titres sous pression", "Securities under pressure")}
                  items={snapshot.laggards}
                  direction="laggards"
                  language={language}
                />
              </section>

              <section className={styles.kpiGrid}>
                <article className={styles.notice}>
                  <strong>Leadership</strong><br />
                  {pick(language, `${strongestSector?.sector ?? "N/D"} domine avec un score de ${strongestSector?.leadership_score?.toFixed(0) ?? "N/D"}/100.`, `${strongestSector?.sector ?? "N/D"} leads with a score of ${strongestSector?.leadership_score?.toFixed(0) ?? "N/D"}/100.`)}
                </article>
                <article className={styles.notice}>
                  <strong>{pick(language, "Faiblesse", "Weakness")}</strong><br />
                  {pick(language, `${weakestSector?.sector ?? "N/D"} ferme la marche à ${weakestSector?.leadership_score?.toFixed(0) ?? "N/D"}/100.`, `${weakestSector?.sector ?? "N/D"} trails at ${weakestSector?.leadership_score?.toFixed(0) ?? "N/D"}/100.`)}
                </article>
                <article className={styles.notice}>
                  <strong>{pick(language, "Impulsion moyenne", "Average momentum")}</strong><br />
                  {pick(language, "Le momentum 20 jours transversal est de", "Cross-sectional 20-day momentum is")} {snapshot.average_momentum_20d == null ? "N/D" : formatPercent(snapshot.average_momentum_20d, 2, language)}.
                </article>
                <article className={styles.notice}>
                  <strong>{pick(language, "Actualisation", "Refresh")}</strong><br />
                  {pick(language, "Calcul généré à", "Calculation generated at")} {generatedAt}. {refreshing ? pick(language, "Actualisation en cours…", "Refresh in progress…") : pick(language, "Surveillance active.", "Monitoring active.")}
                </article>
              </section>

              <footer className={styles.methodology}>
                {language === "fr" ? snapshot.methodology : "The regime combines market breadth, moving-average position, average Anatole score, cross-sectional momentum, and weighted change. Radar items are research signals, not buy or sell recommendations."}
                <button
                  type="button"
                  className={styles.secondaryLink}
                  disabled={refreshing}
                  onClick={() => void load(true)}
                >
                  <RefreshCw size={13} /> {refreshing ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Actualiser", "Refresh")}
                </button>
              </footer>
            </div>
          </details>
        </>
      ) : (
        <section className={`panel ${styles.loadingPanel}`}>
          <div className={styles.loadingCopy}>
            <Zap size={30} />
            <strong>{pick(language, "Terminal Pro n’a pas reçu de snapshot.", "Pro Terminal did not receive a snapshot.")}</strong>
            <button type="button" className={styles.compareButton} onClick={() => void load(false)}>
              {pick(language, "Réessayer", "Try again")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
