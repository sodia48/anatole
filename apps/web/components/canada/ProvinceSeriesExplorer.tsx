"use client";

import {
  BarChart3,
  LoaderCircle,
  TrendingUp,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./ProvinceSeriesExplorer.module.css";
import { pick } from "@/lib/i18n";
import { resilientFetch } from "@/lib/resilient-fetch";

type Lang = "fr" | "en";
type Opt = { key: string; label: string };
type Pt = { period: string; value: number };

type Lb = {
  years: 1 | 3 | 5;
  change: number | null;
  change_kind: "percent" | "points";
  from_period: string | null;
  to_period: string | null;
};

type Fc = {
  years_ahead: 1 | 3 | 5;
  value: number;
  change_from_latest: number | null;
  change_kind: "percent" | "points";
};

type Snap = {
  province_code: string;
  province_name: string;
  metric_key: string;
  metric_label: string;
  unit: string;
  cadence: "monthly" | "quarterly" | "annual";
  source_name: string;
  source_url: string;
  history: Pt[];
  lookbacks: Lb[];
  forecasts: Fc[];
  forecast_note: string;
};

type LoadResult = {
  cacheKey: string;
  series: Snap | null;
  error: boolean;
};

const ORDER = [
  "real_gdp",
  "population",
  "inflation_yoy",
  "unemployment_rate",
  "employment",
  "retail_sales",
  "housing_starts",
];

function val(
  value: number,
  unit: string,
  language: Lang,
): string {
  const locale =
    language === "fr" ? "fr-CA" : "en-CA";

  if (unit === "percent") {
    return `${value.toLocaleString(locale, {
      maximumFractionDigits: 2,
    })} %`;
  }

  return (
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value) +
    (unit === "currency" ? " CAD" : "")
  );
}

function ch(
  value: number | null,
  kind: "percent" | "points",
  language: Lang,
): string {
  if (value === null) return "N/D";

  const locale =
    language === "fr" ? "fr-CA" : "en-CA";
  return `${value > 0 ? "+" : ""}${value.toLocaleString(
    locale,
    { maximumFractionDigits: 2 },
  )}${kind === "points" ? " pt" : " %"}`;
}

function cadence(
  value: Snap["cadence"],
  language: Lang,
): string {
  if (value === "annual") {
    return pick(language, "Annuel", "Annual");
  }
  if (value === "quarterly") {
    return pick(
      language,
      "Trimestriel",
      "Quarterly",
    );
  }
  return pick(language, "Mensuel", "Monthly");
}

function Chart({
  series,
  language,
}: {
  series: Snap;
  language: Lang;
}) {
  if (series.history.length < 2) return null;

  const allValues = [
    ...series.history.map((point) => point.value),
    ...series.forecasts.map((point) => point.value),
  ];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const width = 760;
  const height = 220;
  const plotHeight = 174;
  const historyWidth = width * 0.72;

  const historyCoordinates = series.history.map(
    (point, index) => ({
      x:
        (index / (series.history.length - 1)) *
        historyWidth,
      y:
        18 +
        (1 - (point.value - min) / span) *
          plotHeight,
    }),
  );

  const last =
    historyCoordinates[
      historyCoordinates.length - 1
    ];

  const forecastCoordinates =
    series.forecasts.map((point, index) => ({
      x:
        historyWidth +
        ((index + 1) / series.forecasts.length) *
          (width - historyWidth),
      y:
        18 +
        (1 - (point.value - min) / span) *
          plotHeight,
    }));

  return (
    <div className={styles.chartWrap}>
      <div className={styles.legend}>
        {pick(
          language,
          "Historique",
          "History",
        )}{" "}
        ·{" "}
        {pick(
          language,
          "Projection Anatole",
          "Anatole projection",
        )}
      </div>

      <svg
        className={styles.chart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${series.metric_label} — ${series.province_name}`}
      >
        <polyline
          points={historyCoordinates
            .map(
              (point) =>
                `${point.x},${point.y}`,
            )
            .join(" ")}
          className={styles.history}
        />
        {forecastCoordinates.length ? (
          <polyline
            points={[
              `${last.x},${last.y}`,
              ...forecastCoordinates.map(
                (point) =>
                  `${point.x},${point.y}`,
              ),
            ].join(" ")}
            className={styles.forecast}
          />
        ) : null}
      </svg>

      <div className={styles.chartFoot}>
        <span>{series.history[0].period}</span>
        <strong>
          {val(
            series.history.at(-1)?.value ?? 0,
            series.unit,
            language,
          )}
        </strong>
        <span>
          {pick(
            language,
            "+5 ans",
            "+5 years",
          )}
        </span>
      </div>
    </div>
  );
}

export function ProvinceSeriesExplorer({
  provinceCode,
  provinceName,
  language,
  metrics,
}: {
  provinceCode: string;
  provinceName: string;
  language: Lang;
  metrics: Opt[];
}) {
  const options = useMemo(() => {
    const byKey = new Map(
      metrics.map((item) => [
        item.key,
        item,
      ]),
    );

    return ORDER.flatMap((key) => {
      const option = byKey.get(key);
      return option ? [option] : [];
    });
  }, [metrics]);

  const [
    requestedKey,
    setRequestedKey,
  ] = useState<string | null>(null);

  const key =
    requestedKey &&
    options.some(
      (option) =>
        option.key === requestedKey,
    )
      ? requestedKey
      : (options[0]?.key ?? "");

  const cache = useRef(
    new Map<string, Snap>(),
  );

  const [result, setResult] =
    useState<LoadResult>({
      cacheKey: "",
      series: null,
      error: false,
    });

  const currentCacheKey = key
    ? `${provinceCode}:${key}:${language}`
    : "";

  const series =
    result.cacheKey === currentCacheKey
      ? result.series
      : null;

  const error =
    result.cacheKey === currentCacheKey &&
    result.error;

  const loading =
    Boolean(currentCacheKey) &&
    result.cacheKey !== currentCacheKey;

  useEffect(() => {
    if (!currentCacheKey || !key) {
      return;
    }

    const cached =
      cache.current.get(currentCacheKey);

    if (cached) {
      queueMicrotask(() => {
        setResult({
          cacheKey: currentCacheKey,
          series: cached,
          error: false,
        });
      });
      return;
    }

    const controller =
      new AbortController();

    void resilientFetch(
      `/api/anatole/api/v1/canada/provinces/${provinceCode}/series/${key}?lang=${language}`,
      {
        cache: "no-store",
        signal: controller.signal,
        timeoutMs: 15_000,
        idempotent: true,
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`,
          );
        }

        const payload =
          (await response.json()) as Snap;

        cache.current.set(
          currentCacheKey,
          payload,
        );

        setResult({
          cacheKey: currentCacheKey,
          series: payload,
          error: false,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setResult({
          cacheKey: currentCacheKey,
          series: null,
          error: true,
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    currentCacheKey,
    key,
    language,
    provinceCode,
  ]);

  if (!options.length) {
    return null;
  }

  return (
    <section className={styles.root}>
      <div className={styles.head}>
        <div>
          <div className="eyebrow">
            {pick(
              language,
              "HISTORIQUE & SCÉNARIOS",
              "HISTORY & SCENARIOS",
            )}
          </div>
          <h3>
            {pick(
              language,
              `Trajectoire — ${provinceName}`,
              `Trajectory — ${provinceName}`,
            )}
          </h3>
          <p>
            {pick(
              language,
              "Choisissez un indicateur pour voir cinq ans d’historique, les variations sur 1, 3 et 5 ans et une projection à 1, 3 et 5 ans.",
              "Choose an indicator to see five years of history, 1/3/5-year changes and 1/3/5-year projections.",
            )}
          </p>
        </div>
        <BarChart3 size={20} />
      </div>

      <div className={styles.tabs}>
        {options.map((option) => (
          <button
            type="button"
            key={option.key}
            aria-pressed={
              option.key === key
            }
            onClick={() =>
              setRequestedKey(option.key)
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && !series ? (
        <div className={styles.loading}>
          <LoaderCircle size={17} />
          {pick(
            language,
            "Chargement…",
            "Loading…",
          )}
        </div>
      ) : null}

      {error ? (
        <div className={styles.error}>
          {pick(
            language,
            "Historique temporairement indisponible.",
            "History temporarily unavailable.",
          )}
        </div>
      ) : null}

      {series ? (
        <>
          <div className={styles.meta}>
            <span>
              {cadence(
                series.cadence,
                language,
              )}
            </span>
            <a
              href={series.source_url}
              target="_blank"
              rel="noreferrer"
            >
              {series.source_name}
            </a>
          </div>

          <Chart
            series={series}
            language={language}
          />

          <div className={styles.summary}>
            <div>
              <h4>
                {pick(
                  language,
                  "Variations passées",
                  "Historical changes",
                )}
              </h4>
              <div className={styles.horizons}>
                {series.lookbacks.map(
                  (item) => (
                    <article
                      key={item.years}
                    >
                      <small>
                        {item.years}{" "}
                        {pick(
                          language,
                          item.years === 1
                            ? "an"
                            : "ans",
                          item.years === 1
                            ? "year"
                            : "years",
                        )}
                      </small>
                      <strong>
                        {ch(
                          item.change,
                          item.change_kind,
                          language,
                        )}
                      </strong>
                      <span>
                        {item.from_period ??
                          "N/D"}{" "}
                        →{" "}
                        {item.to_period ??
                          "N/D"}
                      </span>
                    </article>
                  ),
                )}
              </div>
            </div>

            <div>
              <h4>
                <TrendingUp size={14} />
                {pick(
                  language,
                  "Projection Anatole",
                  "Anatole projection",
                )}
              </h4>
              <div className={styles.horizons}>
                {series.forecasts.map(
                  (item) => (
                    <article
                      key={
                        item.years_ahead
                      }
                    >
                      <small>
                        +{item.years_ahead}{" "}
                        {pick(
                          language,
                          item.years_ahead ===
                            1
                            ? "an"
                            : "ans",
                          item.years_ahead ===
                            1
                            ? "year"
                            : "years",
                        )}
                      </small>
                      <strong>
                        {val(
                          item.value,
                          series.unit,
                          language,
                        )}
                      </strong>
                      <span>
                        {ch(
                          item.change_from_latest,
                          item.change_kind,
                          language,
                        )}
                      </span>
                    </article>
                  ),
                )}
              </div>
            </div>
          </div>

          <p className={styles.note}>
            {series.forecast_note}
          </p>
        </>
      ) : null}
    </section>
  );
}