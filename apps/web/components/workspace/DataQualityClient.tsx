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
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getDataQuality, getReliabilityStatus } from "@/lib/api";
import type {
  DataQualitySnapshot,
  DataQualitySource,
  ReliabilitySnapshot,
} from "@/lib/types";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./Workspace.module.css";

function sourceStatusClass(status: DataQualitySource["status"]): string {
  if (status === "healthy") return styles.statusHealthy;
  if (status === "degraded") return styles.statusDegraded;
  if (status === "stale") return styles.statusStale;
  if (status === "unavailable") return styles.statusUnavailable;
  return styles.statusIdle;
}

function sourceStatusLabel(status: DataQualitySource["status"], language: AnatoleLanguage): string {
  const labels = {
    healthy: ["Saine", "Healthy"],
    degraded: ["Dégradée", "Degraded"],
    stale: ["Périmée", "Stale"],
    unavailable: ["Indisponible", "Unavailable"],
    idle: ["À réchauffer", "Not warmed"],
  } as const;
  return pick(language, labels[status][0], labels[status][1]);
}

function ageLabel(seconds: number | null, language: AnatoleLanguage): string {
  if (seconds === null) return pick(language, "Aucun cache actif", "No active cache");
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

const QUALITY_METRIC_EN: Record<string, { label: string; detail: (value: string) => string }> = {
  provider: { label: "Provider mode", detail: () => "Active source for market quotes and history." },
  coverage: { label: "Average coverage", detail: (value) => `${value.split(" ")[0]} healthy sources are currently tracked.` },
  upstream: { label: "Upstream failures", detail: () => "Failed requests among external data calls." },
  retries: { label: "External retries", detail: () => "Peak concurrent requests; the global limit is configured at 6." },
  "api-5xx": { label: "API 5xx errors", detail: () => "5xx responses among requests received by the current process." },
  "api-p95": { label: "API p95 latency", detail: () => "Requests exceeding the 2.5-second slow-request threshold." },
  uptime: { label: "Process uptime", detail: () => "Elapsed time since the current FastAPI process started." },
};

const SOURCE_EN: Record<string, { label: string; category: string; detail: string }> = {
  quotes: { label: "TSX 60 quotes", category: "Market", detail: "Price, session change, volume, and market breadth." },
  "screener-tsx60": { label: "TSX 60 screener", category: "Analysis", detail: "History, RSI, momentum, relative volume, and score." },
  "screener-composite": { label: "S&P/TSX Composite screener", category: "Analysis", detail: "Composite universe, history, RSI, momentum, relative volume, and score." },
  "tsx-composite-universe": { label: "S&P/TSX Composite universe", category: "Market", detail: "Operational list of Canadian Composite companies, excluding cash and derivatives." },
  "etf-directory": { label: "ETF directory", category: "ETF", detail: "The full directory remains available while quotes are enriched in the background." },
  "etf-holdings": { label: "ETF holdings", category: "ETF", detail: "Holdings are loaded on demand and then cached." },
  news: { label: "Official news", category: "Discovery", detail: "Official RSS/Atom feeds with deduplication and lexical sentiment." },
  calendar: { label: "Economic calendar", category: "Discovery", detail: "Official Canadian events with importance and categories." },
  psychology: { label: "Market psychology", category: "Analysis", detail: "Momentum, volatility, trend, and sector leadership." },
  ipo: { label: "IPOs and new listings", category: "Discovery", detail: "Official Canadian and U.S. sources." },
  insiders: { label: "Insider transactions", category: "Discovery", detail: "On-demand scans cached by market, period, and universe." },
  fundamentals: { label: "Fundamentals", category: "Companies", detail: "Earnings, financial statements, and consensus loaded on demand." },
};

const ENDPOINT_EN: Record<string, { label: string; detail: string }> = {
  "/health": { label: "API health", detail: "Local liveness with no external dependency." },
  "/api/v1/market/cockpit": { label: "Cockpit", detail: "The cache is preserved during a temporary outage." },
  "/api/v1/discovery/screener": { label: "Screener", detail: "Separate TSX 60 and Composite caches with batched history and concurrency limits." },
  "/api/v1/discovery/etfs/{ticker}/holdings": { label: "ETF holdings", detail: "On-demand loading with holdings cache." },
  "/api/v1/discovery/ipo": { label: "IPO", detail: "TMX and SEC EDGAR; latest data is retained as fallback." },
  "/api/v1/discovery/insiders": { label: "Insiders", detail: "Limited scans protect the public API." },
  "/api/v1/analysis/terminal": { label: "Pro Terminal", detail: "Reuses Cockpit and Screener caches." },
  "/api/v1/workspace/portfolio": { label: "Portfolio", detail: "On-demand analysis; positions are stored only in the browser." },
  "/api/v1/reliability/status": { label: "Observability v0.8", detail: "Latency, 5xx rate, recent errors, and beta reports for the current process." },
};

function recommendationLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  if (value.includes("mode démonstration")) return "The provider is in demo mode; enable MARKET_DATA_PROVIDER=yahoo in production.";
  if (value.includes("échec upstream")) return "The upstream failure rate is high; inspect Render logs using the X-Request-ID.";
  if (value.includes("nombreux retries")) return "Public sources require many retries; avoid repeated manual refreshes.";
  if (value.includes("HTTP 5xx")) return "The process HTTP 5xx rate exceeds 1%; use the X-Request-ID to isolate affected routes.";
  if (value.includes("p95")) return "The p95 response time exceeds 2.5 seconds; review slow routes before the next deployment.";
  if (value.includes("cartes dégradées")) return "Review the degraded cards below to identify the affected source or cache.";
  return "No urgent action. Inactive sources warm up when their section is first opened.";
}

export function DataQualityClient({ embedded = false }: { embedded?: boolean }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [snapshot, setSnapshot] = useState<DataQualitySnapshot | null>(null);
  const [reliability, setReliability] = useState<ReliabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("Toutes");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [qualityResult, reliabilityResult] = await Promise.allSettled([
        getDataQuality(signal),
        getReliabilityStatus(signal),
      ]);
      if (qualityResult.status === "fulfilled") {
        setSnapshot(qualityResult.value);
      } else {
        throw qualityResult.reason;
      }
      if (reliabilityResult.status === "fulfilled") {
        setReliability(reliabilityResult.value);
      }
    } catch {
      setError(pick(language, "Qualité des données indisponible.", "Data quality is unavailable."));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      controller.abort();
    };
  }, [refresh]);

  const categories = useMemo(
    () => ["Toutes", ...new Set(snapshot?.sources.map((item) => item.category) ?? [])],
    [snapshot],
  );
  const sources = snapshot?.sources.filter((item) => category === "Toutes" || item.category === category) ?? [];
  const healthyCount = snapshot?.sources.filter((item) => item.status === "healthy").length ?? 0;
  const degradedCount = snapshot?.sources.filter((item) => ["degraded", "stale", "unavailable"].includes(item.status)).length ?? 0;

  return (
    <main className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      <section className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">{pick(language, "INTELLIGENCE", "INTELLIGENCE")} · V0.8</span>
          <h1>{pick(language, "Qualité des données", "Data quality")}</h1>
          <p>{pick(language, "Couverture, fraîcheur, mode fournisseur, retries, erreurs upstream et état des principales routes. Cette vue distingue clairement les données publiques, les caches et les données de secours.", "Coverage, freshness, provider mode, retries, upstream errors, and key route status. This view clearly distinguishes public data, caches, and fallback data.")}</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{snapshot ? snapshot.overall_score.toFixed(0) : "—"}</strong>
          <span>{snapshot ? (language === "en" ? ({ Excellent: "Excellent", Bon: "Good", "Dégradé": "Degraded", Critique: "Critical" } as Record<string, string>)[snapshot.overall_status] ?? snapshot.overall_status : snapshot.overall_status) : pick(language, "analyse", "analysis")}</span>
          <small>{healthyCount} {pick(language, `source${healthyCount > 1 ? "s" : ""} saine${healthyCount > 1 ? "s" : ""}`, `healthy source${healthyCount === 1 ? "" : "s"}`)} · {degradedCount} {pick(language, "à surveiller", "to monitor")}</small>
        </div>
      </section>

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">{pick(language, "OBSERVABILITÉ", "OBSERVABILITY")}</span><h2>{pick(language, "État du pipeline Anatole", "Anatole pipeline status")}</h2><p>{pick(language, "Une source « à réchauffer » n’est pas en panne : elle n’a simplement pas encore été sollicitée depuis le démarrage.", "A source marked not warmed is not down; it has simply not been requested since startup.")}</p></div>
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} /> {loading ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Actualiser", "Refresh")}</button>
          </div>
        </div>
        <div className={styles.filterRow} style={{ marginTop: 14 }}>
          {categories.map((item) => <button className={item === category ? styles.primaryButton : styles.secondaryButton} type="button" key={item} onClick={() => setCategory(item)}>{item === "Toutes" ? pick(language, "Toutes", "All") : language === "en" ? ({ "Marché": "Market", Analyse: "Analysis", "Découverte": "Discovery", "Sociétés": "Companies" } as Record<string, string>)[item] ?? item : item}</button>)}
        </div>
      </section>

      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      {!snapshot && loading ? <div className={styles.skeleton} /> : null}

      {snapshot ? (
        <>
          <section className={styles.qualityMetricGrid}>
            {snapshot.metrics.map((metric) => {
              const copy = language === "en" ? QUALITY_METRIC_EN[metric.key] : undefined;
              return (
              <article className={`panel ${styles.kpiCard}`} key={metric.key}>
                <span>{copy?.label ?? metric.label}</span>
                <strong className={metric.status === "healthy" ? styles.positive : metric.status === "critical" ? styles.negative : metric.status === "degraded" ? styles.info : ""}>{metric.value}</strong>
                <small>{copy?.detail(metric.detail) ?? metric.detail}</small>
              </article>
              );
            })}
          </section>


          <section className={`panel ${styles.panel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">{pick(language, "FIABILITÉ PRODUCTION", "PRODUCTION RELIABILITY")}</span>
                <h2>{pick(language, "Erreurs et latence du processus", "Process errors and latency")}</h2>
                <p>{pick(language, "Mesures réelles depuis le dernier démarrage Render, avec X-Request-ID pour retrouver chaque incident.", "Real measurements since the latest Render startup, with X-Request-ID to trace each incident.")}</p>
              </div>
              <span className={`${styles.statusPill} ${reliability?.status === "healthy" ? styles.statusHealthy : reliability?.status === "critical" ? styles.statusUnavailable : styles.statusDegraded}`}>
                {reliability?.status === "healthy" ? pick(language, "Stable", "Stable") : reliability?.status === "critical" ? pick(language, "Critique", "Critical") : pick(language, "À surveiller", "Monitor")}
              </span>
            </div>
            <div className={styles.qualityMetricGrid}>
              <article className={styles.kpiCard}><span>{pick(language, "Requêtes reçues", "Requests received")}</span><strong>{reliability?.total_requests ?? "—"}</strong><small>{pick(language, "Depuis le démarrage courant", "Since current startup")}</small></article>
              <article className={styles.kpiCard}><span>HTTP 5xx</span><strong className={(reliability?.error_rate_5xx ?? 0) >= 1 ? styles.negative : styles.positive}>{reliability ? `${reliability.error_rate_5xx.toFixed(2)} %` : "—"}</strong><small>{reliability?.total_5xx ?? 0} {pick(language, "erreur(s) serveur", "server error(s)")}</small></article>
              <article className={styles.kpiCard}><span>{pick(language, "Latence p95", "p95 latency")}</span><strong>{reliability ? `${reliability.p95_duration_ms.toFixed(0)} ms` : "—"}</strong><small>{reliability?.slow_requests ?? 0} {pick(language, "requête(s) au-delà de 2,5 s", "request(s) over 2.5 s")}</small></article>
              <article className={styles.kpiCard}><span>{pick(language, "Signalements bêta", "Beta reports")}</span><strong>{reliability?.reports_received ?? 0}</strong><small>{pick(language, "Enregistrés dans les logs opérationnels", "Recorded in operational logs")}</small></article>
            </div>
            <div className={styles.compactList} style={{ marginTop: 14 }}>
              {reliability?.recent_errors.length ? reliability.recent_errors.slice(0, 6).map((incident) => (
                <div className={styles.endpointRow} key={`${incident.request_id}-${incident.occurred_at}`}>
                  <div><strong>{incident.method} {incident.path}</strong><small style={{ display: "block", marginTop: 4 }}>{new Date(incident.occurred_at).toLocaleString("fr-CA")} · {incident.duration_ms.toFixed(0)} ms</small></div>
                  <code>{incident.request_id}</code>
                  <span className={`${styles.statusPill} ${styles.statusUnavailable}`}>HTTP {incident.status_code}</span>
                </div>
              )) : <div className={styles.notice}><CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 7 }} />{pick(language, "Aucune erreur 5xx observée dans le processus courant.", "No 5xx errors observed in the current process.")}</div>}
            </div>
          </section>

          <section className={`panel ${styles.panel}`}>
            <div className={styles.sectionHeading}>
              <div><span className="eyebrow">SOURCES</span><h2>{pick(language, "Couverture et fraîcheur", "Coverage and freshness")}</h2><p>{sources.length} {pick(language, `source${sources.length > 1 ? "s" : ""} affichée${sources.length > 1 ? "s" : ""}`, `source${sources.length === 1 ? "" : "s"} shown`)}</p></div>
              <span className={`${styles.statusPill} ${snapshot.overall_score >= 80 ? styles.statusHealthy : snapshot.overall_score >= 55 ? styles.statusDegraded : styles.statusUnavailable}`}>{snapshot.overall_status}</span>
            </div>
            <div className={styles.sourceGrid}>
              {sources.map((source) => (
                <article className={styles.sourceCard} key={source.key}>
                  <div className={styles.sourceHeader}>
                  <div><small>{language === "en" ? SOURCE_EN[source.key]?.category ?? source.category : source.category}</small><h3>{language === "en" ? SOURCE_EN[source.key]?.label ?? source.label : source.label}</h3></div>
                    <span className={`${styles.statusPill} ${sourceStatusClass(source.status)}`}>{sourceStatusLabel(source.status, language)}</span>
                  </div>
                  <p style={{ margin: 0, color: "#9eb2c1", fontSize: 10, lineHeight: 1.55 }}>{language === "en" ? SOURCE_EN[source.key]?.detail ?? source.detail : source.detail}</p>
                  <div>
                    <div className={styles.sourceMeta}><span>{pick(language, "Couverture", "Coverage")}</span><strong>{source.coverage_percent.toFixed(0)} %</strong></div>
                    <div className={styles.coverageBar} style={{ marginTop: 7 }}><i style={{ width: `${source.coverage_percent}%` }} /></div>
                  </div>
                  <div className={styles.sourceMeta}><span><Database size={11} /> {source.source}</span><span><Clock3 size={11} /> {ageLabel(source.freshness_seconds, language)}</span>{source.item_count !== null ? <span>{source.item_count} {pick(language, `élément${source.item_count > 1 ? "s" : ""}`, `item${source.item_count === 1 ? "" : "s"}`)}</span> : null}</div>
                </article>
              ))}
            </div>
          </section>

          <div className={styles.gridTwo}>
            <section className={`panel ${styles.panel}`}>
              <div className={styles.sectionHeading}><div><span className="eyebrow">ROUTES</span><h2>{pick(language, "Disponibilité fonctionnelle", "Functional availability")}</h2><p>{pick(language, "État du dernier processus FastAPI courant.", "Status of the current FastAPI process.")}</p></div></div>
              <div className={styles.compactList}>
                {snapshot.endpoints.map((endpoint) => (
                  <div className={styles.endpointRow} key={endpoint.path}>
                    <div><strong>{language === "en" ? ENDPOINT_EN[endpoint.path]?.label ?? endpoint.label : endpoint.label}</strong><small style={{ display: "block", marginTop: 4 }}>{language === "en" ? ENDPOINT_EN[endpoint.path]?.detail ?? endpoint.detail : endpoint.detail}</small></div>
                    <code>{endpoint.path}</code>
                    <span className={`${styles.statusPill} ${endpoint.status === "available" ? styles.statusHealthy : endpoint.status === "degraded" ? styles.statusDegraded : styles.statusIdle}`}>{endpoint.status === "available" ? pick(language, "Disponible", "Available") : endpoint.status === "degraded" ? pick(language, "Dégradée", "Degraded") : pick(language, "À réchauffer", "Not warmed")}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={`panel ${styles.panel}`}>
              <div className={styles.sectionHeading}><div><span className="eyebrow">ACTIONS</span><h2>{pick(language, "Recommandations", "Recommendations")}</h2><p>{pick(language, "Priorités dérivées des métriques observées.", "Priorities derived from observed metrics.")}</p></div></div>
              <div className={styles.compactList}>
                {snapshot.recommendations.map((item, index) => (
                  <div className={styles.recommendation} key={item}>
                    <div className={styles.instrument}><span className={styles.symbolBadge}>{index + 1}</span><span><b>{recommendationLabel(item, language)}</b></span></div>
                  </div>
                ))}
              </div>
              <div className={styles.notice} style={{ marginTop: 12 }}><ShieldCheck size={14} style={{ verticalAlign: "middle", marginRight: 7 }} />{pick(language, "Le score mesure l’état du processus et des caches visibles. Il ne certifie pas l’exactitude économique d’une donnée externe.", "The score measures process and visible cache status. It does not certify the economic accuracy of external data.")}</div>
            </section>
          </div>

          <section className={styles.gridThree}>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Processus API", "API process")}</span><strong className={styles.positive}><Server size={20} /> {pick(language, "En ligne", "Online")}</strong><small>Uptime {(snapshot.uptime_seconds / 3600).toFixed(1)} h</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Mode fournisseur", "Provider mode")}</span><strong>{snapshot.provider_mode === "public" ? "Public" : pick(language, "Démonstration", "Demo")}</strong><small>{pick(language, "Cotations et historiques", "Quotes and history")}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Lecture", "Assessment")}</span><strong>{degradedCount ? <><AlertTriangle size={20} /> {pick(language, "À surveiller", "Monitor")}</> : <><CheckCircle2 size={20} /> Stable</>}</strong><small>{degradedCount} {pick(language, `source${degradedCount > 1 ? "s" : ""} dégradée${degradedCount > 1 ? "s" : ""}`, `degraded source${degradedCount === 1 ? "" : "s"}`)}</small></article>
          </section>

          <div style={{ textAlign: "right", color: "#5f7c91", fontSize: 10 }}><Activity size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />{pick(language, "Généré", "Generated")} {new Date(snapshot.generated_at).toLocaleString(localeFor(language))} · {pick(language, "actualisation 60 s", "refresh 60 s")}</div>
        </>
      ) : null}
    </main>
  );
}
