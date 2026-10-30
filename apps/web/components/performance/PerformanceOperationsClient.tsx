"use client";

import {
  Activity,
  CheckCircle2,
  Database,
  Gauge,
  RefreshCw,
  Server,
  TriangleAlert,
  Zap,
} from "@/components/layout/AppIcons";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import "@/components/workspace/Workspace.css";
import { getReliabilityStatus } from "@/lib/api";
import { localeFor, pick } from "@/lib/i18n";
import type { ReliabilitySnapshot } from "@/lib/types";

type RouteMetric = {
  path: string;
  requests: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  max_duration_ms: number;
  error_rate_5xx: number;
  budget_ms: number;
  within_budget: boolean;
};

type PerformanceLatency = {
  kind: string;
  name: string;
  samples: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
  budget_ms: number | null;
  within_budget: boolean;
};

type PerformanceMetrics = {
  sample_window: number;
  cache: {
    memory_hits: number;
    memory_misses: number;
    memory_stale_served: number;
    local_singleflight_joins: number;
    redis_hits: number;
    redis_misses: number;
    redis_errors: number;
    memory_hit_rate_percent: number;
    redis_hit_rate_percent: number;
  };
  singleflight: {
    owners: number;
    peer_stale_served: number;
    peer_wait_hits: number;
    fallback_provider: number;
  };
  latency: PerformanceLatency[];
  budget_violations: PerformanceLatency[];
};

type ReliabilityWithPerformance = ReliabilitySnapshot & {
  performance_metrics?: PerformanceMetrics;
  route_metrics?: RouteMetric[];
};

function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} s`;
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)} %`;
}

function shortName(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

export function PerformanceOperationsClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [snapshot, setSnapshot] = useState<ReliabilityWithPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const next = await getReliabilityStatus(signal);
      setSnapshot(next);
      setError(null);
    } catch {
      setError(pick(language, "Métriques de performance temporairement indisponibles.", "Performance metrics are temporarily unavailable."));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      controller.abort();
    };
  }, [refresh]);

  const performance = snapshot?.performance_metrics;

  const routes = useMemo(() => {
    return [...(snapshot?.route_metrics ?? [])]
      .sort((a, b) => {
        if (a.within_budget !== b.within_budget) return a.within_budget ? 1 : -1;
        return b.p95_duration_ms - a.p95_duration_ms;
      })
      .slice(0, 12);
  }, [snapshot]);

  const providers = useMemo(() => {
    return [...(performance?.latency ?? [])]
      .filter((item) => item.kind === "upstream")
      .sort((a, b) => b.p95_ms - a.p95_ms)
      .slice(0, 10);
  }, [performance]);

  const internal = useMemo(() => {
    return [...(performance?.latency ?? [])]
      .filter((item) => item.kind !== "upstream")
      .sort((a, b) => {
        if (a.within_budget !== b.within_budget) return a.within_budget ? 1 : -1;
        return b.p95_ms - a.p95_ms;
      })
      .slice(0, 10);
  }, [performance]);

  const avoidedLoads =
    (performance?.cache.local_singleflight_joins ?? 0) +
    (performance?.singleflight.peer_wait_hits ?? 0) +
    (performance?.singleflight.peer_stale_served ?? 0);

  const routeViolations = routes.filter((item) => !item.within_budget).length;
  const perfViolations = performance?.budget_violations.length ?? 0;

  return (
    <main className={"anatole-ws_page__"}>
      <section className={`panel ${"anatole-ws_hero__"}`}>
        <div className={"anatole-ws_heroCopy__"}>
          <span className="eyebrow">PERFORMANCE · PHASE 3G</span>
          <h1>{pick(language, "Centre d’opérations performance", "Performance operations center")}</h1>
          <p>
            {pick(
              language,
              "p50/p95, cache mémoire et Redis, single-flight et fournisseurs externes. Cette vue sert à prioriser les prochains gains avec des mesures réelles plutôt qu’avec des suppositions.",
              "p50/p95, memory and Redis cache, single-flight and external providers. This view prioritizes the next gains using real measurements instead of assumptions.",
            )}
          </p>
        </div>
        <div className={"anatole-ws_actionRow__"}>
          <button className={"anatole-ws_secondaryButton__"} type="button" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw size={15} /> {loading ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Actualiser", "Refresh")}
          </button>
        </div>
      </section>

      {error ? <div className={"anatole-ws_errorNotice__"}>{error}</div> : null}

      <section className={"anatole-ws_qualityMetricGrid__"}>
        <article className={`panel ${"anatole-ws_kpiCard__"}`}>
          <span><Gauge size={14} /> {pick(language, "p95 API global", "Global API p95")}</span>
          <strong>{snapshot ? formatMs(snapshot.p95_duration_ms) : "—"}</strong>
          <small>{snapshot?.total_requests ?? 0} {pick(language, "requêtes observées", "observed requests")}</small>
        </article>
        <article className={`panel ${"anatole-ws_kpiCard__"}`}>
          <span><Database size={14} /> {pick(language, "Hit-rate mémoire", "Memory hit rate")}</span>
          <strong>{formatRate(performance?.cache.memory_hit_rate_percent)}</strong>
          <small>{performance?.cache.memory_hits ?? 0} hits · {performance?.cache.memory_misses ?? 0} misses</small>
        </article>
        <article className={`panel ${"anatole-ws_kpiCard__"}`}>
          <span><Server size={14} /> Redis</span>
          <strong>{formatRate(performance?.cache.redis_hit_rate_percent)}</strong>
          <small>{performance?.cache.redis_hits ?? 0} hits · {performance?.cache.redis_errors ?? 0} {pick(language, "erreurs", "errors")}</small>
        </article>
        <article className={`panel ${"anatole-ws_kpiCard__"}`}>
          <span><Zap size={14} /> Single-flight</span>
          <strong>{avoidedLoads}</strong>
          <small>{pick(language, "chargements dupliqués évités/réutilisés", "duplicate loads avoided/reused")}</small>
        </article>
        <article className={`panel ${"anatole-ws_kpiCard__"}`}>
          <span><TriangleAlert size={14} /> {pick(language, "Budgets dépassés", "Budget violations")}</span>
          <strong className={routeViolations + perfViolations ? "anatole-ws_negative__" : "anatole-ws_positive__"}>{routeViolations + perfViolations}</strong>
          <small>{pick(language, "routes + dépendances", "routes + dependencies")}</small>
        </article>
        <article className={`panel ${"anatole-ws_kpiCard__"}`}>
          <span><Activity size={14} /> {pick(language, "Fenêtre télémétrie", "Telemetry window")}</span>
          <strong>{performance?.sample_window ?? 0}</strong>
          <small>{pick(language, "échantillons bornés en mémoire", "bounded in-memory samples")}</small>
        </article>
      </section>

      <section className={`panel ${"anatole-ws_panel__"}`}>
        <div className={"anatole-ws_sectionHeading__"}>
          <div>
            <span className="eyebrow">ROUTES</span>
            <h2>{pick(language, "p50 / p95 par route", "p50 / p95 by route")}</h2>
            <p>{pick(language, "Les dépassements de budget remontent en premier.", "Budget violations are surfaced first.")}</p>
          </div>
        </div>
        <div className={"anatole-ws_compactList__"}>
          {routes.length ? routes.map((route) => (
            <div className={"anatole-ws_endpointRow__"} key={route.path}>
              <div>
                <strong>{route.path}</strong>
                <small style={{ display: "block", marginTop: 4 }}>
                  {route.requests} req · p50 {formatMs(route.p50_duration_ms)} · max {formatMs(route.max_duration_ms)} · 5xx {formatRate(route.error_rate_5xx)}
                </small>
              </div>
              <code>p95 {formatMs(route.p95_duration_ms)} / {formatMs(route.budget_ms)}</code>
              <span className={`${"anatole-ws_statusPill__"} ${route.within_budget ? "anatole-ws_statusHealthy__" : "anatole-ws_statusDegraded__"}`}>
                {route.within_budget ? pick(language, "Budget OK", "Budget OK") : pick(language, "À optimiser", "Optimize")}
              </span>
            </div>
          )) : <div className={"anatole-ws_notice__"}>{pick(language, "Pas encore assez de trafic observé.", "Not enough observed traffic yet.")}</div>}
        </div>
      </section>

      <div className={"anatole-ws_gridTwo__"}>
        <section className={`panel ${"anatole-ws_panel__"}`}>
          <div className={"anatole-ws_sectionHeading__"}>
            <div><span className="eyebrow">UPSTREAM</span><h2>{pick(language, "Fournisseurs les plus lents", "Slowest providers")}</h2></div>
          </div>
          <div className={"anatole-ws_compactList__"}>
            {providers.length ? providers.map((item) => (
              <div className={"anatole-ws_endpointRow__"} key={`${item.kind}-${item.name}`}>
                <div>
                  <strong>{shortName(item.name)}</strong>
                  <small style={{ display: "block", marginTop: 4 }}>{item.samples} samples · p50 {formatMs(item.p50_ms)} · max {formatMs(item.max_ms)}</small>
                </div>
                <code>p95 {formatMs(item.p95_ms)}</code>
                <span className={`${"anatole-ws_statusPill__"} ${item.within_budget ? "anatole-ws_statusHealthy__" : "anatole-ws_statusDegraded__"}`}>{item.within_budget ? "OK" : pick(language, "Lent", "Slow")}</span>
              </div>
            )) : <div className={"anatole-ws_notice__"}>{pick(language, "Aucun fournisseur mesuré pour l’instant.", "No provider measurements yet.")}</div>}
          </div>
        </section>

        <section className={`panel ${"anatole-ws_panel__"}`}>
          <div className={"anatole-ws_sectionHeading__"}>
            <div><span className="eyebrow">CACHE & SINGLE-FLIGHT</span><h2>{pick(language, "Coûts internes", "Internal costs")}</h2></div>
          </div>
          <div className={"anatole-ws_compactList__"}>
            {internal.length ? internal.map((item) => (
              <div className={"anatole-ws_endpointRow__"} key={`${item.kind}-${item.name}`}>
                <div>
                  <strong>{item.kind} · {item.name}</strong>
                  <small style={{ display: "block", marginTop: 4 }}>{item.samples} samples · p50 {formatMs(item.p50_ms)} · max {formatMs(item.max_ms)}</small>
                </div>
                <code>p95 {formatMs(item.p95_ms)}</code>
                <span className={`${"anatole-ws_statusPill__"} ${item.within_budget ? "anatole-ws_statusHealthy__" : "anatole-ws_statusDegraded__"}`}>{item.within_budget ? "OK" : pick(language, "À optimiser", "Optimize")}</span>
              </div>
            )) : <div className={"anatole-ws_notice__"}>{pick(language, "Aucune mesure interne disponible.", "No internal measurements available.")}</div>}
          </div>
        </section>
      </div>

      <div className={"anatole-ws_notice__"}>
        <CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 7 }} />
        {pick(
          language,
          "Les métriques se réinitialisent au redémarrage du processus Render. Aucun budget de production n’est modifié tant qu’un volume suffisant n’a pas été observé.",
          "Metrics reset when the Render process restarts. No production budget is changed until enough traffic has been observed.",
        )}
        {snapshot?.generated_at ? ` · ${pick(language, "Dernière mesure", "Last measurement")} ${new Date(snapshot.generated_at).toLocaleString(localeFor(language))}` : ""}
      </div>
    </main>
  );
}
