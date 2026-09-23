import { Activity, Info } from "lucide-react";

import styles from "./Canada360Freshness.module.css";
import {
  formatMetricPeriod,
  metricCadence,
  type Canada360Language,
} from "./canada360-periods";

type Metric = {
  key: string;
  label: string;
  value: number | null;
  change: number | null;
  change_kind: "points" | "percent" | "absolute";
  unit: string;
  reference_period: string | null;
  official: boolean;
};

type Province = { metrics: Metric[] };

const RECENT_KEYS = [
  "unemployment_rate",
  "employment",
  "inflation_yoy",
  "retail_sales",
  "housing_starts",
] as const;

function valueLabel(
  metric: Metric,
  language: Canada360Language,
): string {
  if (metric.value === null || !Number.isFinite(metric.value)) return "N/D";
  const locale = language === "fr" ? "fr-CA" : "en-CA";

  if (metric.unit === "percent") {
    return `${metric.value.toLocaleString(locale, { maximumFractionDigits: 2 })} %`;
  }
  if (metric.unit === "currency") {
    return `${new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(metric.value)} CAD`;
  }
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(metric.value);
}

function changeLabel(
  metric: Metric,
  language: Canada360Language,
): string {
  if (metric.change === null || !Number.isFinite(metric.change)) {
    return language === "fr" ? "Variation N/D" : "Change N/A";
  }
  const locale = language === "fr" ? "fr-CA" : "en-CA";
  const sign = metric.change > 0 ? "+" : "";
  const value = metric.change.toLocaleString(locale, { maximumFractionDigits: 2 });
  if (metric.change_kind === "points") return `${sign}${value} pt`;
  if (metric.change_kind === "percent") return `${sign}${value} %`;
  return `${sign}${value}`;
}

export function RecentEconomicPulse({
  metrics,
  language,
}: {
  metrics: Metric[];
  language: Canada360Language;
}) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const recent = RECENT_KEYS.flatMap((key) => {
    const metric = byKey.get(key);
    return metric && metric.value !== null ? [metric] : [];
  });

  return (
    <section className={`panel ${styles.panel}`} data-testid="recent-economic-pulse">
      <div className={styles.heading}>
        <div>
          <div className="eyebrow">
            {language === "fr" ? "DONNEES RECENTES" : "RECENT DATA"}
          </div>
          <h2>
            {language === "fr" ? "Pouls economique recent" : "Recent economic pulse"}
          </h2>
          <p>
            {language === "fr"
              ? "Le PIB reel provincial est annuel. Ces series mensuelles completent la lecture avec des observations plus recentes."
              : "Provincial real GDP is annual. These monthly series add a more recent view of economic activity."}
          </p>
        </div>
        <Activity size={20} />
      </div>

      <div className={styles.grid}>
        {recent.map((metric) => (
          <article className={styles.card} key={metric.key}>
            <small>{metric.label}</small>
            <strong>{valueLabel(metric, language)}</strong>
            <span>{changeLabel(metric, language)}</span>
            <footer>
              <span>{formatMetricPeriod(metric, language) ?? "N/D"}</span>
              <small>{metricCadence(metric, language)}</small>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AnnualGdpContext({
  provinces,
  language,
  visible,
}: {
  provinces: Province[];
  language: Canada360Language;
  visible: boolean;
}) {
  if (!visible) return null;

  const latest =
    provinces
      .flatMap((province) =>
        province.metrics.filter(
          (metric) =>
            metric.key === "real_gdp" &&
            metric.official &&
            metric.reference_period,
        ),
      )
      .sort((left, right) =>
        (right.reference_period ?? "").localeCompare(left.reference_period ?? ""),
      )[0] ?? null;

  if (!latest) return null;

  const period = formatMetricPeriod(latest, language) ?? latest.reference_period ?? "N/D";

  return (
    <div className={styles.context} data-testid="annual-gdp-context">
      <Info size={15} />
      <span>
        {language === "fr"
          ? `Le PIB reel provincial est une serie annuelle. Derniere annee disponible dans la serie officielle chargee : ${period}. Le Pouls economique recent ci-dessus utilise des series plus frequentes.`
          : `Provincial real GDP is an annual series. Latest year available in the loaded official series: ${period}. The Recent economic pulse above uses higher-frequency series.`}
      </span>
    </div>
  );
}
