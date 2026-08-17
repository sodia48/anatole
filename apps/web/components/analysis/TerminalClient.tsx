"use client";

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
import type {
  TerminalAlert,
  TerminalOpportunity,
  TerminalSector,
  TerminalSnapshot,
} from "@/lib/types";

import styles from "./Analysis.module.css";

type FeedMode = "all" | "volume" | "momentum" | "pressure";

const FEED_MODES: Array<{ value: FeedMode; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "volume", label: "Volume" },
  { value: "momentum", label: "Momentum" },
  { value: "pressure", label: "Sous pression" },
];

function formatPercent(value: number, digits = 2): string {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value)} %`;
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function valueClass(value: number): string {
  if (value === 0) {
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
}: {
  title: string;
  items: TerminalOpportunity[];
  direction: "leaders" | "laggards";
}) {
  return (
    <article className={`panel ${styles.sectionPanel}`}>
      <div className={styles.sectionHeading}>
        <div>
          <span className="eyebrow">
            {direction === "leaders" ? "LEADERSHIP" : "PRESSION"}
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
              <th>Titre</th>
              <th>Séance</th>
              <th>Momentum</th>
              <th>Volume</th>
              <th>RSI</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.symbol}>
                <td data-label="Titre">
                  <div className={styles.instrumentCell}>
                    <span className={styles.rankBadge}>{index + 1}</span>
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.sector}</small>
                    </span>
                  </div>
                </td>
                <td data-label="Séance" className={valueClass(item.change_percent)}>
                  {formatPercent(item.change_percent)}
                </td>
                <td data-label="Momentum" className={valueClass(item.momentum_20d)}>
                  {formatPercent(item.momentum_20d, 1)}
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

function MarketSignalCard({ item }: { item: TerminalOpportunity }) {
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
      aria-label={`${item.symbol}, ${item.name}, variation ${formatPercent(item.change_percent)}, score ${item.score.toFixed(0)} sur 100`}
    >
      <div className={styles.signalCardTop}>
        <div className={styles.signalIdentity}>
          <strong>{item.symbol}</strong>
          <span>{item.name}</span>
        </div>
        <div className={styles.signalPrice}>
          <span>{formatPrice(item.price)}</span>
          <strong className={valueClass(item.change_percent)}>
            {formatPercent(item.change_percent)}
          </strong>
        </div>
      </div>

      <div className={styles.signalBar} aria-label={`Score Anatole ${item.score.toFixed(0)} sur 100`}>
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
            {formatPercent(item.momentum_20d, 1)}
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
        <span>{item.opportunity_type}</span>
        <span>
          Focus <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

export function TerminalClient() {
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
        setSnapshot(response);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") {
          setError(
            reason instanceof Error
              ? reason.message
              : "Terminal Pro est temporairement indisponible.",
          );
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
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

  const strongestSector = snapshot?.sectors[0];
  const weakestSector = snapshot?.sectors.at(-1);
  const generatedAt = useMemo(() => {
    if (!snapshot) {
      return "";
    }
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(snapshot.generated_at));
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className={styles.page}>
        <section className={`panel ${styles.loadingPanel}`}>
          <div className={styles.loadingCopy}>
            <span className={styles.spinner} />
            <strong>Initialisation du Terminal Pro</strong>
            <span>
              Analyse de la largeur, des tendances, des secteurs et des anomalies
              prix-volume.
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
          <span className="eyebrow">FLUX DE MARCHÉ · TERMINAL PRO</span>
          <h1>Terminal Pro</h1>
          <p>
            Une lecture mobile du marché canadien inspirée des meilleurs
            terminaux : régime, volume inhabituel, momentum, secteurs et alertes,
            sans recommandations de placement.
          </p>
        </div>
        {snapshot ? (
          <div className={styles.terminalPulse}>
            <div
              className={styles.scoreRing}
              style={{
                background: `conic-gradient(#20caa3 0 ${snapshot.regime_score}%, rgba(52,83,102,.32) ${snapshot.regime_score}% 100%)`,
              }}
            >
              <span>
                <strong>{snapshot.regime_score.toFixed(0)}</strong>
                <small>/100</small>
              </span>
            </div>
            <div className={styles.regimeCopy}>
              <span>Régime</span>
              <strong>{snapshot.regime}</strong>
              <small>Risque {snapshot.risk_level.toLowerCase()}</small>
            </div>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className={styles.errorNotice}>
          {error} {snapshot ? "Les dernières données valides restent affichées." : ""}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <section className={styles.marketEventStrip}>
            <div className={styles.marketEventIcon}>
              <Bell size={18} />
            </div>
            <div className={styles.marketEventCopy}>
              <span>Événements de marché</span>
              <strong>
                {snapshot.alerts.length} alertes · {snapshot.high_relative_volume_count} volumes inhabituels
              </strong>
            </div>
            <a href="#terminal-alerts">
              Voir tout <ArrowRight size={14} />
            </a>
          </section>

          <section className={styles.terminalKpiStrip}>
            <article>
              <span>TSX 60</span>
              <strong className={valueClass(snapshot.weighted_change_percent)}>
                {formatPercent(snapshot.weighted_change_percent)}
              </strong>
            </article>
            <article>
              <span>Largeur</span>
              <strong>{snapshot.advance_ratio.toFixed(0)} %</strong>
            </article>
            <article>
              <span>Au-dessus MM50</span>
              <strong>{snapshot.above_sma50_percent.toFixed(0)} %</strong>
            </article>
            <article>
              <span>Score moyen</span>
              <strong>{snapshot.average_anatole_score.toFixed(0)}</strong>
            </article>
          </section>

          <section className={`panel ${styles.terminalFeedPanel}`}>
            <div className={styles.terminalFeedHeading}>
              <div>
                <span className="eyebrow">RADAR INSTITUTIONNEL</span>
                <h2>Signaux à surveiller</h2>
                <p>
                  Les cartes classent les configurations selon le score, le volume,
                  le momentum et la pression observée.
                </p>
              </div>
              <Radar size={22} color="#55a0ff" />
            </div>

            <div className={styles.terminalTabs} role="tablist" aria-label="Filtrer le radar Terminal Pro">
              {FEED_MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={feedMode === item.value}
                  className={feedMode === item.value ? styles.terminalTabActive : styles.terminalTab}
                  onClick={() => setFeedMode(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className={styles.terminalSectorFilters} aria-label="Filtrer par secteur">
              {sectors.map((sector) => (
                <button
                  key={sector}
                  type="button"
                  className={sectorFilter === sector ? styles.terminalSectorFilterActive : styles.terminalSectorFilter}
                  onClick={() => setSectorFilter(sector)}
                >
                  {sector}
                </button>
              ))}
            </div>

            {visibleRadarItems.length ? (
              <div className={styles.marketSignalGrid}>
                {visibleRadarItems.map((item) => (
                  <MarketSignalCard key={item.symbol} item={item} />
                ))}
              </div>
            ) : (
              <div className={styles.emptyInline}>
                Aucun titre ne correspond à ce filtre pour le moment.
              </div>
            )}
          </section>

          <section className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">ROTATION SECTORIELLE</span>
                <h2>Carte de leadership</h2>
                <p>Une lecture compacte de la force, du momentum et de la largeur de chaque secteur.</p>
              </div>
              <Waves size={21} color="#55a0ff" />
            </div>
            <div className={styles.terminalSectorGrid}>
              {snapshot.sectors.map((sector) => (
                <article className={styles.terminalSectorCard} key={sector.sector}>
                  <div className={styles.terminalSectorTop}>
                    <strong>{sector.sector}</strong>
                    <span className={`${styles.statePill} ${stateClass(sector)}`}>
                      {sector.state}
                    </span>
                  </div>
                  <div className={styles.terminalSectorScore}>
                    <span style={{ width: `${sector.leadership_score}%` }} />
                    <i style={{ left: `calc(${sector.leadership_score}% - 4px)` }} />
                  </div>
                  <div className={styles.terminalSectorMetrics}>
                    <div>
                      <span>Séance</span>
                      <strong className={valueClass(sector.change_percent)}>
                        {formatPercent(sector.change_percent)}
                      </strong>
                    </div>
                    <div>
                      <span>Momentum</span>
                      <strong className={valueClass(sector.momentum_20d)}>
                        {formatPercent(sector.momentum_20d, 1)}
                      </strong>
                    </div>
                    <div>
                      <span>Largeur</span>
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
                <span className="eyebrow">SURVEILLANCE</span>
                <h2>Alertes et dislocations</h2>
                <p>Signaux qui méritent une vérification dans Focus.</p>
              </div>
              <Activity size={21} color="#f2b84b" />
            </div>
            <div className={styles.alertList}>
              {snapshot.alerts.length ? (
                snapshot.alerts.map((alert) => (
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
                      <Link href={`/focus/${encodeURIComponent(alert.symbol)}`} aria-label={`Ouvrir ${alert.symbol} dans Focus`}>
                        <ArrowRight size={15} />
                      </Link>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className={styles.emptyInline}>
                  Aucune anomalie majeure détectée dans le dernier calcul.
                </div>
              )}
            </div>
          </section>

          <details className={`panel ${styles.terminalDetails}`}>
            <summary>
              <span>
                <Gauge size={18} />
                Analyse détaillée du marché
              </span>
              <small>Composantes, leaders, pression et méthodologie</small>
            </summary>

            <div className={styles.terminalDetailsBody}>
              <section className={styles.componentGrid}>
                {snapshot.components.map((component) => (
                  <article className={styles.componentCard} key={component.key}>
                    <div className={styles.componentTop}>
                      <span>{component.label}</span>
                      <strong>{component.score.toFixed(0)}</strong>
                    </div>
                    <div className={styles.componentTrack}>
                      <span style={{ width: `${component.score}%` }} />
                    </div>
                    <b>{component.value}</b>
                    <p>{component.description}</p>
                  </article>
                ))}
              </section>

              <section className={styles.terminalColumns}>
                <RankingTable
                  title="Leaders du score Anatole"
                  items={snapshot.leaders}
                  direction="leaders"
                />
                <RankingTable
                  title="Titres sous pression"
                  items={snapshot.laggards}
                  direction="laggards"
                />
              </section>

              <section className={styles.kpiGrid}>
                <article className={styles.notice}>
                  <strong>Leadership</strong><br />
                  {strongestSector?.sector ?? "—"} domine avec un score de {strongestSector?.leadership_score.toFixed(0) ?? "—"}/100.
                </article>
                <article className={styles.notice}>
                  <strong>Faiblesse</strong><br />
                  {weakestSector?.sector ?? "—"} ferme la marche à {weakestSector?.leadership_score.toFixed(0) ?? "—"}/100.
                </article>
                <article className={styles.notice}>
                  <strong>Impulsion moyenne</strong><br />
                  Le momentum 20 jours transversal est de {formatPercent(snapshot.average_momentum_20d, 2)}.
                </article>
                <article className={styles.notice}>
                  <strong>Actualisation</strong><br />
                  Calcul généré à {generatedAt}. {refreshing ? "Actualisation en cours…" : "Surveillance active."}
                </article>
              </section>

              <footer className={styles.methodology}>
                {snapshot.methodology}
                <button
                  type="button"
                  className={styles.secondaryLink}
                  disabled={refreshing}
                  onClick={() => void load(true)}
                >
                  <RefreshCw size={13} /> {refreshing ? "Actualisation…" : "Actualiser"}
                </button>
              </footer>
            </div>
          </details>
        </>
      ) : (
        <section className={`panel ${styles.loadingPanel}`}>
          <div className={styles.loadingCopy}>
            <Zap size={30} />
            <strong>Terminal Pro n’a pas reçu de snapshot.</strong>
            <button type="button" className={styles.compareButton} onClick={() => void load(false)}>
              Réessayer
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
