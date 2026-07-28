"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Gauge,
  Radar,
  RefreshCw,
  ShieldAlert,
  Sparkles,
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

function formatPercent(value: number, digits = 2): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value) + " %";
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

function OpportunityCard({
  item,
}: {
  item: TerminalOpportunity;
}) {
  return (
    <article className={`panel ${styles.opportunityCard}`}>
      <div className={styles.opportunityHeader}>
        <div>
          <h3>{item.symbol}</h3>
          <p>{item.name}</p>
        </div>
        <span className={styles.opportunityScore}>{item.score.toFixed(0)}</span>
      </div>
      <span className={styles.typePill}>{item.opportunity_type}</span>
      <div className={styles.opportunityMetrics}>
        <div>
          <span>Séance</span>
          <strong className={valueClass(item.change_percent)}>
            {formatPercent(item.change_percent)}
          </strong>
        </div>
        <div>
          <span>Momentum</span>
          <strong className={valueClass(item.momentum_20d)}>
            {formatPercent(item.momentum_20d, 1)}
          </strong>
        </div>
        <div>
          <span>Vol. relatif</span>
          <strong>{item.relative_volume.toFixed(1)}×</strong>
        </div>
      </div>
      <ul className={styles.reasonList}>
        {item.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <Link className={styles.secondaryLink} href={`/focus/${item.symbol}`}>
        Étudier dans Focus <ArrowRight size={13} />
      </Link>
    </article>
  );
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
        <table className={styles.rankTable} style={{ minWidth: 660 }}>
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
                <td>
                  <div className={styles.instrumentCell}>
                    <span className={styles.rankBadge}>{index + 1}</span>
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.sector}</small>
                    </span>
                  </div>
                </td>
                <td className={valueClass(item.change_percent)}>
                  {formatPercent(item.change_percent)}
                </td>
                <td className={valueClass(item.momentum_20d)}>
                  {formatPercent(item.momentum_20d, 1)}
                </td>
                <td>{item.relative_volume.toFixed(1)}×</td>
                <td>{item.rsi_14?.toFixed(1) ?? "—"}</td>
                <td><span className={styles.scorePill}>{item.score.toFixed(0)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function TerminalClient() {
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (
    background = false,
    signal?: AbortSignal,
  ) => {
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
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const interval = window.setInterval(
      () => void load(true),
      Math.max(snapshot.refresh_after_seconds, 60) * 1000,
    );

    return () => window.clearInterval(interval);
  }, [load, snapshot]);

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
            <span>Analyse de la largeur, des tendances, des secteurs et des anomalies prix-volume.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={`panel ${styles.hero} ${styles.terminalHero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">RADAR INSTITUTIONNEL · V0.6</span>
          <h1>Terminal Pro</h1>
          <p>
            Lis le régime du TSX 60, la rotation sectorielle, les accélérations,
            les dislocations et le risque de concentration dans un seul centre de décision.
          </p>
        </div>
        {snapshot ? (
          <div className={styles.regimeBlock}>
            <div
              className={styles.scoreRing}
              style={{
                background: `conic-gradient(#20caa3 0 ${snapshot.regime_score}%, rgba(52, 83, 102, 0.32) ${snapshot.regime_score}% 100%)`,
              }}
            >
              <span>
                <strong>{snapshot.regime_score.toFixed(0)}</strong>
                <small>/100</small>
              </span>
            </div>
            <div className={styles.regimeCopy}>
              <span>Régime de marché</span>
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
          <section className={styles.kpiGrid}>
            <article className={`panel ${styles.kpiCard}`}>
              <span>TSX 60 pondéré</span>
              <strong className={valueClass(snapshot.weighted_change_percent)}>
                {formatPercent(snapshot.weighted_change_percent)}
              </strong>
              <small>Séance courante</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>Largeur du marché</span>
              <strong>{snapshot.advance_ratio.toFixed(0)} %</strong>
              <small>Ratio hausses / mouvements</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>Au-dessus de la MM50</span>
              <strong>{snapshot.above_sma50_percent.toFixed(0)} %</strong>
              <small>Structure intermédiaire</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>Volume inhabituel</span>
              <strong>{snapshot.high_relative_volume_count}</strong>
              <small>Titres à 1,5× ou plus</small>
            </article>
          </section>

          <section className={styles.componentGrid}>
            {snapshot.components.map((component) => (
              <article className={`panel ${styles.componentCard}`} key={component.key}>
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
            <article className={`panel ${styles.sectionPanel}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className="eyebrow">ROTATION SECTORIELLE</span>
                  <h2>Leadership du TSX 60</h2>
                  <p>Score sectoriel combinant séance, momentum 20 jours et qualité des composantes.</p>
                </div>
                <Waves size={21} color="#55a0ff" />
              </div>
              <div className={styles.sectorList}>
                {snapshot.sectors.map((sector) => (
                  <div className={styles.sectorRow} key={sector.sector}>
                    <div className={styles.sectorName}>
                      <strong>{sector.sector}</strong>
                      <small>{sector.advancers} hausses · {sector.decliners} baisses</small>
                    </div>
                    <div className={styles.sectorMetric}>
                      <span>Séance</span>
                      <strong className={valueClass(sector.change_percent)}>
                        {formatPercent(sector.change_percent)}
                      </strong>
                    </div>
                    <div className={styles.sectorMetric}>
                      <span>Momentum</span>
                      <strong className={valueClass(sector.momentum_20d)}>
                        {formatPercent(sector.momentum_20d, 1)}
                      </strong>
                    </div>
                    <div className={styles.sectorMetric}>
                      <span>Score</span>
                      <strong>{sector.leadership_score.toFixed(0)}</strong>
                    </div>
                    <div className={styles.sectorTrack}>
                      <span style={{ width: `${sector.leadership_score}%` }} />
                    </div>
                    <span className={`${styles.statePill} ${stateClass(sector)}`}>
                      {sector.state}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className={`panel ${styles.sectionPanel}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className="eyebrow">SURVEILLANCE</span>
                  <h2>Alertes et dislocations</h2>
                  <p>Signaux qui méritent une vérification dans Focus.</p>
                </div>
                <Radar size={21} color="#f2b84b" />
              </div>
              <div className={styles.alertList}>
                {snapshot.alerts.length ? snapshot.alerts.map((alert) => (
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
                  </article>
                )) : (
                  <div className={styles.emptyInline}>
                    Aucune anomalie majeure détectée dans le dernier calcul.
                  </div>
                )}
              </div>
            </article>
          </section>

          <section>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">RADAR D’OPPORTUNITÉS</span>
                <h2>Configurations à approfondir</h2>
                <p>Les titres sont filtrés sur le score, le momentum et l’absence d’extension extrême.</p>
              </div>
              <Sparkles size={21} color="#27d5ae" />
            </div>
            {snapshot.opportunities.length ? (
              <div className={styles.opportunityGrid}>
                {snapshot.opportunities.map((item) => (
                  <OpportunityCard item={item} key={item.symbol} />
                ))}
              </div>
            ) : (
              <div className={`panel ${styles.emptyInline}`}>
                Le régime actuel ne produit aucune configuration répondant à tous les critères.
              </div>
            )}
          </section>

          <section className={styles.terminalColumns}>
            <RankingTable title="Leaders du score Anatole" items={snapshot.leaders} direction="leaders" />
            <RankingTable title="Titres sous pression" items={snapshot.laggards} direction="laggards" />
          </section>

          <section className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">SYNTHÈSE DE ROTATION</span>
                <h2>Ce que le marché dit maintenant</h2>
              </div>
              <Gauge size={21} color="#55a0ff" />
            </div>
            <div className={styles.kpiGrid}>
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
            </div>
          </section>

          <footer className={`panel ${styles.methodology}`}>
            {snapshot.methodology}
            <button
              type="button"
              className={styles.secondaryLink}
              style={{ marginLeft: 12 }}
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              <RefreshCw size={13} /> {refreshing ? "Actualisation…" : "Actualiser"}
            </button>
          </footer>
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
