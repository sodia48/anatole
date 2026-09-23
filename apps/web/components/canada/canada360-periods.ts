export type Canada360Language = "fr" | "en";

export type Canada360PeriodMetric = {
  key: string;
  reference_period: string | null;
};

const ANNUAL_KEYS = new Set(["real_gdp"]);
const QUARTERLY_KEYS = new Set(["population"]);

export function metricCadence(
  metric: Canada360PeriodMetric,
  language: Canada360Language,
): string {
  if (ANNUAL_KEYS.has(metric.key)) {
    return language === "fr" ? "Annuel" : "Annual";
  }
  if (QUARTERLY_KEYS.has(metric.key)) {
    return language === "fr" ? "Trimestriel" : "Quarterly";
  }
  return language === "fr" ? "Mensuel" : "Monthly";
}

export function formatMetricPeriod(
  metric: Canada360PeriodMetric,
  language: Canada360Language,
): string | null {
  const raw = metric.reference_period?.trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(raw);
  const yearOnly = /^(\d{4})$/.exec(raw);

  if (ANNUAL_KEYS.has(metric.key)) {
    return iso?.[1] ?? yearOnly?.[1] ?? raw;
  }

  if (QUARTERLY_KEYS.has(metric.key) && iso) {
    const quarter = Math.floor((Number(iso[2]) - 1) / 3) + 1;
    return language === "fr"
      ? `T${quarter} ${iso[1]}`
      : `Q${quarter} ${iso[1]}`;
  }

  if (iso) {
    const date = new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, 1),
    );
    return new Intl.DateTimeFormat(
      language === "fr" ? "fr-CA" : "en-CA",
      { month: "short", year: "numeric", timeZone: "UTC" },
    ).format(date);
  }

  return raw;
}
