"use client";

import {
  Activity,
  Database,
  Landmark,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./Canada360Client.module.css";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";
import { resilientFetch } from "@/lib/resilient-fetch";

type Freshness =
  | "live"
  | "fresh"
  | "stale"
  | "unavailable";

type SourceStatus =
  | "ok"
  | "partial"
  | "unavailable";

type Metric = {
  key: string;
  label: string;
  category: string;
  value: number | null;
  change: number | null;
  change_kind: "points" | "percent" | "absolute";
  unit: string;
  source_name: string;
  source_url: string | null;
  reference_period: string | null;
  observed_at: string | null;
  freshness: Freshness;
  official: boolean;
  derived: boolean;
  delayed: boolean;
};

type Province = {
  code: string;
  name: string;
  status: SourceStatus;
  metrics: Metric[];
  source_name: string | null;
  source_url: string | null;
};

type Source = {
  key: string;
  label: string;
  status: SourceStatus;
  detail: string | null;
};

type Snapshot = {
  language: "fr" | "en";
  status: SourceStatus;
  macro: Metric[];
  rates: Metric[];
  markets: Metric[];
  provinces: Province[];
  sources: Source[];
  issues: string[];
  generated_at: string;
  refresh_after_seconds: number;
};

function compactNumber(
  value: number,
  language: "fr" | "en",
): string {
  return new Intl.NumberFormat(
    language === "fr" ? "fr-CA" : "en-CA",
    {
      notation: "compact",
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function metricValue(
  metric: Metric,
  language: "fr" | "en",
): string {
  if (
    metric.value === null ||
    !Number.isFinite(metric.value)
  ) {
    return "N/D";
  }

  const locale =
    language === "fr" ? "fr-CA" : "en-CA";
  const value = metric.value;

  if (metric.unit === "percent") {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(value)} %`;
  }

  if (metric.unit === "persons") {
    return compactNumber(value, language);
  }

  if (metric.unit === "currency") {
    return `${compactNumber(value, language)} $`;
  }

  if (metric.unit === "units") {
    return compactNumber(value, language);
  }

  if (metric.unit === "cad_per_usd") {
    return `${value.toLocaleString(locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 4,
    })} CAD`;
  }

  if (metric.unit === "usd_per_barrel") {
    return `${value.toLocaleString(locale, {
      maximumFractionDigits: 2,
    })} $ US/b`;
  }

  if (metric.unit === "usd_per_ounce") {
    return `${value.toLocaleString(locale, {
      maximumFractionDigits: 2,
    })} $ US/oz`;
  }

  return value.toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
}

function metricChange(
  metric: Metric,
  language: "fr" | "en",
): string | null {
  if (
    metric.change === null ||
    !Number.isFinite(metric.change)
  ) {
    return null;
  }

  const locale =
    language === "fr" ? "fr-CA" : "en-CA";
  const sign = metric.change > 0 ? "+" : "";
  const formatted = metric.change.toLocaleString(
    locale,
    { maximumFractionDigits: 2 },
  );

  if (metric.change_kind === "percent") {
    return `${sign}${formatted} %`;
  }

  if (metric.change_kind === "points") {
    return `${sign}${formatted} pt`;
  }

  return `${sign}${formatted}`;
}

function sourceStatusLabel(
  status: SourceStatus,
  language: "fr" | "en",
): string {
  if (status === "ok") {
    return pick(language, "Disponible", "Available");
  }
  if (status === "partial") {
    return pick(language, "Partiel", "Partial");
  }
  return pick(language, "Indisponible", "Unavailable");
}

function MetricCard({
  metric,
  language,
}: {
  metric: Metric;
  language: "fr" | "en";
}) {
  const change = metricChange(metric, language);
  const positive =
    metric.change !== null && metric.change > 0;
  const negative =
    metric.change !== null && metric.change < 0;

  return (
    <article className={styles.metricCard}>
      <div className={styles.metricTopline}>
        <span>{metric.category}</span>
        <div className={styles.badges}>
          {metric.official ? (
            <small>
              {pick(language, "Officiel", "Official")}
            </small>
          ) : null}
          {metric.derived ? (
            <small>
              {pick(language, "Dérivé", "Derived")}
            </small>
          ) : null}
        </div>
      </div>

      <h3>{metric.label}</h3>

      <div className={styles.metricValue}>
        {metricValue(metric, language)}
      </div>

      <div className={styles.metricMeta}>
        {change ? (
          <strong
            className={
              positive
                ? styles.positive
                : negative
                  ? styles.negative
                  : undefined
            }
          >
            {change}
          </strong>
        ) : (
          <span>
            {metric.reference_period ??
              pick(
                language,
                "Dernière donnée",
                "Latest observation",
              )}
          </span>
        )}

        <span>
          {metric.delayed
            ? pick(
                language,
                "Potentiellement différé",
                "Potentially delayed",
              )
            : metric.freshness === "stale"
              ? pick(
                  language,
                  "Dernier portrait disponible",
                  "Latest available snapshot",
                )
              : ""}
        </span>
      </div>

      {metric.source_url ? (
        <a
          className={styles.sourceLink}
          href={metric.source_url}
          target="_blank"
          rel="noreferrer"
        >
          {metric.source_name}
        </a>
      ) : (
        <span className={styles.sourceLink}>
          {metric.source_name}
        </span>
      )}
    </article>
  );
}

export function Canada360Client() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [snapshot, setSnapshot] =
    useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [clientStale, setClientStale] =
    useState(false);

  const load = useCallback(
    async (
      signal?: AbortSignal,
      force = false,
    ) => {
      if (force) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          lang: language,
        });
        if (force) params.set("refresh", "true");

        const response = await resilientFetch(
          `/api/anatole/api/v1/canada/overview?${params.toString()}`,
          {
            signal,
            timeoutMs: 8_500,
            retries: 0,
            allowStale: true,
            staleTtlMs: 30 * 60 * 1000,
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            pick(
              language,
              `Canada 360 indisponible (${response.status})`,
              `Canada 360 unavailable (${response.status})`,
            ),
          );
        }

        const next = (await response.json()) as Snapshot;
        setSnapshot(next);
        setClientStale(
          response.headers.get("X-Anatole-Stale") ===
            "true",
        );
        setError(null);
      } catch (reason) {
        if (
          reason instanceof DOMException &&
          reason.name === "AbortError"
        ) {
          return;
        }
        setError(
          reason instanceof Error
            ? reason.message
            : pick(
                language,
                "Canada 360 est temporairement indisponible.",
                "Canada 360 is temporarily unavailable.",
              ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();

    // La requête démarre hors du corps synchrone de l'effet pour éviter
    // une cascade de rendu React, tout en conservant l'annulation.
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const usdCad = useMemo(
    () =>
      snapshot?.markets.find(
        (item) => item.key === "usd_cad",
      ) ?? null,
    [snapshot],
  );
  const marketCore = useMemo(
    () =>
      snapshot?.markets.filter(
        (item) => item.key !== "usd_cad",
      ) ?? [],
    [snapshot],
  );

  if (loading && !snapshot) {
    return (
      <main className={styles.page}>
        <section className={`panel ${styles.hero}`}>
          <div>
            <div className="eyebrow">CANADA 360</div>
            <h1>
              {pick(
                language,
                "Le Canada en un coup d’œil",
                "Canada at a glance",
              )}
            </h1>
            <p>
              {pick(
                language,
                "Connexion aux données économiques et de marché…",
                "Connecting economic and market data…",
              )}
            </p>
          </div>
          <RefreshCw className={styles.spinning} />
        </section>
        <div className={styles.loadingGrid}>
          {Array.from({ length: 8 }).map(
            (_, index) => (
              <div
                className={`skeleton ${styles.skeleton}`}
                key={index}
              />
            ),
          )}
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className={styles.page}>
        <section className={`panel ${styles.errorPanel}`}>
          <Database size={30} />
          <h1>Canada 360</h1>
          <p>
            {error ??
              pick(
                language,
                "Les données sont temporairement indisponibles.",
                "Data is temporarily unavailable.",
              )}
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void load(undefined, true)}
          >
            {pick(language, "Réessayer", "Retry")}
          </button>
        </section>
      </main>
    );
  }

  const generated = new Date(
    snapshot.generated_at,
  ).toLocaleString(
    language === "fr" ? "fr-CA" : "en-CA",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.hero}`}>
        <div>
          <div className="eyebrow">CANADA 360</div>
          <h1>
            {pick(
              language,
              "Le tableau de bord du Canada financier",
              "Canada’s financial command centre",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Économie, taux, dollar canadien, matières premières, marché et provinces — reliés dans une seule vue.",
              "Economy, rates, the Canadian dollar, commodities, market and provinces — connected in one view.",
            )}
          </p>
        </div>

        <div className={styles.heroStatus}>
          <span
            className={`${styles.statusPill} ${styles[snapshot.status]}`}
          >
            {sourceStatusLabel(
              snapshot.status,
              language,
            )}
          </span>
          <small>
            {clientStale
              ? pick(
                  language,
                  "Dernier portrait disponible",
                  "Latest available snapshot",
                )
              : generated}
          </small>
          <button
            className={styles.refreshButton}
            type="button"
            disabled={refreshing}
            onClick={() =>
              void load(undefined, true)
            }
          >
            <RefreshCw
              size={15}
              className={
                refreshing
                  ? styles.spinning
                  : undefined
              }
            />
            {pick(
              language,
              refreshing
                ? "Actualisation…"
                : "Actualiser",
              refreshing
                ? "Refreshing…"
                : "Refresh",
            )}
          </button>
        </div>
      </section>

      {error ? (
        <div className={styles.warning}>
          {error}
        </div>
      ) : null}

      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <div className="eyebrow">
              {pick(language, "ÉCONOMIE", "ECONOMY")}
            </div>
            <h2>
              {pick(
                language,
                "Macro Canada",
                "Canada macro",
              )}
            </h2>
          </div>
          <Activity size={20} />
        </div>
        <div className={styles.metricGrid}>
          {snapshot.macro.length ? (
            snapshot.macro.map((item) => (
              <MetricCard
                key={item.key}
                metric={item}
                language={language}
              />
            ))
          ) : (
            <div className={styles.empty}>
              {pick(
                language,
                "Les statistiques nationales sont en cours de récupération.",
                "National statistics are being retrieved.",
              )}
            </div>
          )}
        </div>
      </section>

      <section className={styles.twoColumns}>
        <div className={styles.section}>
          <div className={styles.heading}>
            <div>
              <div className="eyebrow">
                {pick(
                  language,
                  "TAUX & DEVISE",
                  "RATES & FX",
                )}
              </div>
              <h2>
                {pick(
                  language,
                  "Conditions financières",
                  "Financial conditions",
                )}
              </h2>
            </div>
            <Landmark size={20} />
          </div>
          <div className={styles.metricGridCompact}>
            {[
              ...snapshot.rates,
              ...(usdCad ? [usdCad] : []),
            ].map((item) => (
              <MetricCard
                key={item.key}
                metric={item}
                language={language}
              />
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.heading}>
            <div>
              <div className="eyebrow">
                {pick(
                  language,
                  "MARCHÉS",
                  "MARKETS",
                )}
              </div>
              <h2>
                {pick(
                  language,
                  "TSX & matières premières",
                  "TSX & commodities",
                )}
              </h2>
            </div>
            <TrendingUp size={20} />
          </div>
          <div className={styles.metricGridCompact}>
            {marketCore.map((item) => (
              <MetricCard
                key={item.key}
                metric={item}
                language={language}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <div className="eyebrow">
              {pick(
                language,
                "PROVINCES",
                "PROVINCES",
              )}
            </div>
            <h2>
              {pick(
                language,
                "Carte économique provinciale",
                "Provincial economic map",
              )}
            </h2>
          </div>
          <span className={styles.count}>
            {snapshot.provinces.length}/10
          </span>
        </div>

        <div className={styles.provinceGrid}>
          {snapshot.provinces.map((province) => (
            <article
              className={styles.provinceCard}
              key={province.code}
            >
              <div className={styles.provinceTitle}>
                <div>
                  <small>{province.code}</small>
                  <h3>{province.name}</h3>
                </div>
                <span
                  className={`${styles.dot} ${styles[province.status]}`}
                  aria-label={sourceStatusLabel(
                    province.status,
                    language,
                  )}
                />
              </div>

              {province.metrics.length ? (
                <dl>
                  {province.metrics
                    .slice(0, 4)
                    .map((item) => (
                      <div key={item.key}>
                        <dt>{item.label}</dt>
                        <dd>
                          {metricValue(
                            item,
                            language,
                          )}
                        </dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <p className={styles.provinceEmpty}>
                  {pick(
                    language,
                    "Chargement en arrière-plan",
                    "Loading in background",
                  )}
                </p>
              )}

              {province.source_url ? (
                <a
                  href={province.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.sourceLink}
                >
                  {province.source_name}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className={`panel ${styles.quality}`}>
        <div className={styles.heading}>
          <div>
            <div className="eyebrow">
              {pick(
                language,
                "PROVENANCE",
                "PROVENANCE",
              )}
            </div>
            <h2>
              {pick(
                language,
                "Sources & qualité",
                "Sources & quality",
              )}
            </h2>
          </div>
          <Database size={20} />
        </div>

        <div className={styles.sourceGrid}>
          {snapshot.sources.map((source) => (
            <div
              className={styles.sourceStatus}
              key={source.key}
            >
              <span
                className={`${styles.dot} ${styles[source.status]}`}
              />
              <div>
                <strong>{source.label}</strong>
                <small>
                  {sourceStatusLabel(
                    source.status,
                    language,
                  )}
                  {source.detail
                    ? ` · ${source.detail}`
                    : ""}
                </small>
              </div>
            </div>
          ))}
        </div>

        {snapshot.issues.length ? (
          <div className={styles.issues}>
            {snapshot.issues.map((issue) => (
              <span key={issue}>{issue}</span>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
