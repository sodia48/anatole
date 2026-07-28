"use client";

import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { getDataQuality } from "@/lib/api";
import type {
  DataQualitySnapshot,
  DataQualitySource,
} from "@/lib/types";

import styles from "./Workspace.module.css";

function sourceStatusClass(status: DataQualitySource["status"]): string {
  if (status === "healthy") return styles.statusHealthy;
  if (status === "degraded") return styles.statusDegraded;
  if (status === "stale") return styles.statusStale;
  if (status === "unavailable") return styles.statusUnavailable;
  return styles.statusIdle;
}

function sourceStatusLabel(status: DataQualitySource["status"]): string {
  return {
    healthy: "Saine",
    degraded: "Dégradée",
    stale: "Périmée",
    unavailable: "Indisponible",
    idle: "À réchauffer",
  }[status];
}

function ageLabel(seconds: number | null): string {
  if (seconds === null) return "Aucun cache actif";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export function DataQualityClient() {
  const [snapshot, setSnapshot] = useState<DataQualitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("Toutes");

  const refresh = async () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getDataQuality(controller.signal));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Qualité des données indisponible.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const categories = useMemo(
    () => ["Toutes", ...new Set(snapshot?.sources.map((item) => item.category) ?? [])],
    [snapshot],
  );
  const sources = snapshot?.sources.filter((item) => category === "Toutes" || item.category === category) ?? [];
  const healthyCount = snapshot?.sources.filter((item) => item.status === "healthy").length ?? 0;
  const degradedCount = snapshot?.sources.filter((item) => ["degraded", "stale", "unavailable"].includes(item.status)).length ?? 0;

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">INTELLIGENCE · V0.7</span>
          <h1>Qualité des données</h1>
          <p>Couverture, fraîcheur, mode fournisseur, retries, erreurs upstream et état des principales routes. Cette vue distingue clairement les données publiques, les caches et les données de secours.</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{snapshot ? snapshot.overall_score.toFixed(0) : "—"}</strong>
          <span>{snapshot?.overall_status ?? "analyse"}</span>
          <small>{healthyCount} source{healthyCount > 1 ? "s" : ""} saine{healthyCount > 1 ? "s" : ""} · {degradedCount} à surveiller</small>
        </div>
      </section>

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">OBSERVABILITÉ</span><h2>État du pipeline Anatole</h2><p>Une source « à réchauffer » n’est pas en panne : elle n’a simplement pas encore été sollicitée depuis le démarrage.</p></div>
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} /> {loading ? "Actualisation…" : "Actualiser"}</button>
          </div>
        </div>
        <div className={styles.filterRow} style={{ marginTop: 14 }}>
          {categories.map((item) => <button className={item === category ? styles.primaryButton : styles.secondaryButton} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
      </section>

      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      {!snapshot && loading ? <div className={styles.skeleton} /> : null}

      {snapshot ? (
        <>
          <section className={styles.qualityMetricGrid}>
            {snapshot.metrics.map((metric) => (
              <article className={`panel ${styles.kpiCard}`} key={metric.key}>
                <span>{metric.label}</span>
                <strong className={metric.status === "healthy" ? styles.positive : metric.status === "critical" ? styles.negative : metric.status === "degraded" ? styles.info : ""}>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </section>

          <section className={`panel ${styles.panel}`}>
            <div className={styles.sectionHeading}>
              <div><span className="eyebrow">SOURCES</span><h2>Couverture et fraîcheur</h2><p>{sources.length} source{sources.length > 1 ? "s" : ""} affichée{sources.length > 1 ? "s" : ""}.</p></div>
              <span className={`${styles.statusPill} ${snapshot.overall_score >= 80 ? styles.statusHealthy : snapshot.overall_score >= 55 ? styles.statusDegraded : styles.statusUnavailable}`}>{snapshot.overall_status}</span>
            </div>
            <div className={styles.sourceGrid}>
              {sources.map((source) => (
                <article className={styles.sourceCard} key={source.key}>
                  <div className={styles.sourceHeader}>
                    <div><small>{source.category}</small><h3>{source.label}</h3></div>
                    <span className={`${styles.statusPill} ${sourceStatusClass(source.status)}`}>{sourceStatusLabel(source.status)}</span>
                  </div>
                  <p style={{ margin: 0, color: "#9eb2c1", fontSize: 10, lineHeight: 1.55 }}>{source.detail}</p>
                  <div>
                    <div className={styles.sourceMeta}><span>Couverture</span><strong>{source.coverage_percent.toFixed(0)} %</strong></div>
                    <div className={styles.coverageBar} style={{ marginTop: 7 }}><i style={{ width: `${source.coverage_percent}%` }} /></div>
                  </div>
                  <div className={styles.sourceMeta}><span><Database size={11} /> {source.source}</span><span><Clock3 size={11} /> {ageLabel(source.freshness_seconds)}</span>{source.item_count !== null ? <span>{source.item_count} élément{source.item_count > 1 ? "s" : ""}</span> : null}</div>
                </article>
              ))}
            </div>
          </section>

          <div className={styles.gridTwo}>
            <section className={`panel ${styles.panel}`}>
              <div className={styles.sectionHeading}><div><span className="eyebrow">ROUTES</span><h2>Disponibilité fonctionnelle</h2><p>État du dernier processus FastAPI courant.</p></div></div>
              <div className={styles.compactList}>
                {snapshot.endpoints.map((endpoint) => (
                  <div className={styles.endpointRow} key={endpoint.path}>
                    <div><strong>{endpoint.label}</strong><small style={{ display: "block", marginTop: 4 }}>{endpoint.detail}</small></div>
                    <code>{endpoint.path}</code>
                    <span className={`${styles.statusPill} ${endpoint.status === "available" ? styles.statusHealthy : endpoint.status === "degraded" ? styles.statusDegraded : styles.statusIdle}`}>{endpoint.status === "available" ? "Disponible" : endpoint.status === "degraded" ? "Dégradée" : "À réchauffer"}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={`panel ${styles.panel}`}>
              <div className={styles.sectionHeading}><div><span className="eyebrow">ACTIONS</span><h2>Recommandations</h2><p>Priorités dérivées des métriques observées.</p></div></div>
              <div className={styles.compactList}>
                {snapshot.recommendations.map((item, index) => (
                  <div className={styles.recommendation} key={item}>
                    <div className={styles.instrument}><span className={styles.symbolBadge}>{index + 1}</span><span><b>{item}</b></span></div>
                  </div>
                ))}
              </div>
              <div className={styles.notice} style={{ marginTop: 12 }}><ShieldCheck size={14} style={{ verticalAlign: "middle", marginRight: 7 }} />Le score mesure l’état du processus et des caches visibles. Il ne certifie pas l’exactitude économique d’une donnée externe.</div>
            </section>
          </div>

          <section className={styles.gridThree}>
            <article className={`panel ${styles.kpiCard}`}><span>Processus API</span><strong className={styles.positive}><Server size={20} /> En ligne</strong><small>Uptime {(snapshot.uptime_seconds / 3600).toFixed(1)} h</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>Mode fournisseur</span><strong>{snapshot.provider_mode === "public" ? "Public" : "Démonstration"}</strong><small>Cotations et historiques</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>Lecture</span><strong>{degradedCount ? <><AlertTriangle size={20} /> À surveiller</> : <><CheckCircle2 size={20} /> Stable</>}</strong><small>{degradedCount} source{degradedCount > 1 ? "s" : ""} dégradée{degradedCount > 1 ? "s" : ""}</small></article>
          </section>

          <div style={{ textAlign: "right", color: "#5f7c91", fontSize: 10 }}><Activity size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />Généré {new Date(snapshot.generated_at).toLocaleString("fr-CA")} · actualisation 60 s</div>
        </>
      ) : null}
    </main>
  );
}
