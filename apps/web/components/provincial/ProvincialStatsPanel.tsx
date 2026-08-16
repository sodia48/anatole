"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./ProvincialStatsPanel.module.css";

type Language = "fr" | "en";
type Context = "news" | "calendar";

type Metric = {
  key: string;
  label: string;
  category: string;
  value: number | null;
  previous_value: number | null;
  change: number | null;
  change_kind: "points" | "percent" | "absolute";
  unit_kind: "percent" | "persons" | "currency" | "units" | "index";
  reference_period: string | null;
  previous_reference_period: string | null;
  released_at: string | null;
  table_id: string;
  table_url: string;
  status: "available" | "unavailable";
  note: string | null;
};

type Province = {
  code: string;
  name: string;
  metrics: Metric[];
  official_source_name: string | null;
  official_source_url: string | null;
};

type Snapshot = {
  requested_region: string;
  language: Language;
  provinces: Province[];
  source_statuses: Array<{
    source: string;
    status: "ok" | "partial" | "unavailable";
    detail: string | null;
  }>;
  generated_at: string;
  refresh_after_seconds: number;
};

function apiBase(): string {
  const value =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://anatole-api.onrender.com";
  return value.replace(/\/+$/, "");
}

function normalizeRegion(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const aliases: Record<string, string> = {
    "terre-neuve-et-labrador": "NL",
    "terre neuve et labrador": "NL",
    "newfoundland and labrador": "NL",
    "ile-du-prince-edouard": "PE",
    "ile du prince edouard": "PE",
    "prince edward island": "PE",
    "nouvelle-ecosse": "NS",
    "nouvelle ecosse": "NS",
    "nova scotia": "NS",
    "nouveau-brunswick": "NB",
    "nouveau brunswick": "NB",
    "new brunswick": "NB",
    "quebec": "QC",
    "ontario": "ON",
    "manitoba": "MB",
    "saskatchewan": "SK",
    "alberta": "AB",
    "colombie-britannique": "BC",
    "colombie britannique": "BC",
    "british columbia": "BC",
    "toutes": "all",
    "tous": "all",
    "all": "all",
    "canada": "all",
  };

  const upper = value.trim().toUpperCase();
  if (["NL", "PE", "NS", "NB", "QC", "ON", "MB", "SK", "AB", "BC"].includes(upper)) {
    return upper;
  }
  return aliases[normalized] ?? "all";
}

function formatCompact(
  value: number | null,
  language: Language,
): string {
  if (value === null || !Number.isFinite(value)) return "N/D";
  return new Intl.NumberFormat(
    language === "fr" ? "fr-CA" : "en-CA",
    {
      notation: "compact",
      maximumFractionDigits: 1,
    },
  ).format(value);
}

function formatValue(
  metric: Metric | undefined,
  language: Language,
): string {
  if (!metric || metric.value === null || !Number.isFinite(metric.value)) {
    return "N/D";
  }
  if (metric.unit_kind === "percent") {
    return `${metric.value.toFixed(1)} %`;
  }
  if (metric.unit_kind === "currency") {
    return `${formatCompact(metric.value, language)} $`;
  }
  return formatCompact(metric.value, language);
}

function formatChange(
  metric: Metric,
  language: Language,
): string {
  const value = metric.change;
  if (value === null || !Number.isFinite(value)) {
    return language === "fr" ? "variation N/D" : "change N/A";
  }
  const sign = value > 0 ? "+" : "";
  if (metric.change_kind === "percent") {
    return `${sign}${value.toFixed(1)} %`;
  }
  if (metric.change_kind === "points") {
    return language === "fr"
      ? `${sign}${value.toFixed(1)} pt`
      : `${sign}${value.toFixed(1)} pt`;
  }
  return `${sign}${formatCompact(value, language)}`;
}

function periodLabel(
  value: string | null,
  language: Language,
): string {
  if (!value) return language === "fr" ? "Période N/D" : "Period N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    language === "fr" ? "fr-CA" : "en-CA",
    {
      year: "numeric",
      month: "short",
    },
  ).format(date);
}

function metricMap(province: Province): Map<string, Metric> {
  return new Map(province.metrics.map((metric) => [metric.key, metric]));
}

export function ProvincialStatsPanel({
  region,
  language = "fr",
  context = "news",
}: {
  region: string;
  language?: Language;
  context?: Context;
}) {
  const normalizedRegion = useMemo(
    () => normalizeRegion(region),
    [region],
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          region: normalizedRegion,
          lang: language,
        });
        const response = await fetch(
          `${apiBase()}/api/v1/discovery/provincial-statistics?${params.toString()}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
            cache: "no-store",
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as Snapshot;
        if (active) setSnapshot(body);
      } catch (reason) {
        if (!controller.signal.aborted && active) {
          setError(
            reason instanceof Error ? reason.message : "Unavailable",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [normalizedRegion, language]);

  const copy = language === "fr"
    ? {
        eyebrow: "ÉCONOMIE DES PROVINCES",
        titleNews: "Portrait statistique",
        titleCalendar: "Derniers indicateurs provinciaux",
        allTitle: "Comparaison des provinces",
        loading: "Chargement des statistiques officielles…",
        unavailable: "Les statistiques provinciales sont temporairement indisponibles.",
        source: "Donnée comparable",
        provincialSource: "Source provinciale",
        province: "Province",
        inflation: "Inflation",
        unemployment: "Chômage",
        employment: "Emploi",
        population: "Population",
        partial: "Certaines séries sont N/D lorsqu’aucune coordonnée officielle ne peut être résolue sans ambiguïté.",
      }
    : {
        eyebrow: "PROVINCIAL ECONOMY",
        titleNews: "Statistical profile",
        titleCalendar: "Latest provincial indicators",
        allTitle: "Province comparison",
        loading: "Loading official statistics…",
        unavailable: "Provincial statistics are temporarily unavailable.",
        source: "Comparable data",
        provincialSource: "Provincial source",
        province: "Province",
        inflation: "Inflation",
        unemployment: "Unemployment",
        employment: "Employment",
        population: "Population",
        partial: "Some series show N/A when an official coordinate cannot be resolved unambiguously.",
      };

  if (loading && !snapshot) {
    return <section className={styles.panel}><div className={styles.loading}>{copy.loading}</div></section>;
  }

  if (!snapshot || snapshot.provinces.length === 0) {
    return (
      <section className={styles.panel}>
        <div className={styles.empty}>
          <strong>{copy.unavailable}</strong>
          {error ? <small>{error}</small> : null}
        </div>
      </section>
    );
  }

  const allMode = normalizedRegion === "all";
  const sourceState = snapshot.source_statuses[0]?.status ?? "partial";

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <span>{copy.eyebrow}</span>
          <h2>
            {allMode
              ? copy.allTitle
              : context === "calendar"
                ? copy.titleCalendar
                : copy.titleNews}
          </h2>
        </div>
        <div className={styles.status} data-state={sourceState}>
          <i />
          <span>Statistique Canada · WDS</span>
        </div>
      </header>

      {allMode ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{copy.province}</th>
                <th>{copy.inflation}</th>
                <th>{copy.unemployment}</th>
                <th>{copy.employment}</th>
                <th>{copy.population}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.provinces.map((province) => {
                const metrics = metricMap(province);
                return (
                  <tr key={province.code}>
                    <th>{province.name}</th>
                    <td>{formatValue(metrics.get("inflation_yoy"), language)}</td>
                    <td>{formatValue(metrics.get("unemployment_rate"), language)}</td>
                    <td>{formatValue(metrics.get("employment"), language)}</td>
                    <td>{formatValue(metrics.get("population"), language)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        snapshot.provinces.map((province) => (
          <div key={province.code} className={styles.provinceBlock}>
            <div className={styles.provinceHeading}>
              <div>
                <strong>{province.name}</strong>
                <small>{province.code}</small>
              </div>
              {province.official_source_url && province.official_source_name ? (
                <a
                  href={province.official_source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.provincialSource} ↗
                </a>
              ) : null}
            </div>

            <div className={styles.metricGrid}>
              {province.metrics.map((metric) => (
                <article className={styles.metricCard} key={metric.key}>
                  <div className={styles.metricTop}>
                    <span>{metric.category}</span>
                    <a
                      href={metric.table_url}
                      target="_blank"
                      rel="noreferrer"
                      title={`${copy.source}: ${metric.table_id}`}
                    >
                      {metric.table_id} ↗
                    </a>
                  </div>
                  <h3>{metric.label}</h3>
                  <strong>{formatValue(metric, language)}</strong>
                  <div className={styles.metricMeta}>
                    <span>{formatChange(metric, language)}</span>
                    <span>{periodLabel(metric.reference_period, language)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))
      )}

      <footer className={styles.footer}>
        <span>{copy.partial}</span>
        <small>{snapshot.source_statuses[0]?.detail ?? ""}</small>
      </footer>
    </section>
  );
}
