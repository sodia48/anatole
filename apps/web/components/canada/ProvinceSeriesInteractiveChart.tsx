"use client";

import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type LineData,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./ProvinceSeriesInteractiveChart.module.css";
import { pick } from "@/lib/i18n";

type Lang = "fr" | "en";

type Point = {
  period: string;
  value: number;
};

type Forecast = {
  years_ahead: 1 | 3 | 5;
  value: number;
};

type Series = {
  province_name: string;
  metric_label: string;
  unit: string;
  cadence: "monthly" | "quarterly" | "annual";
  history: Point[];
  forecasts: Forecast[];
};

type WindowKey = "1y" | "3y" | "5y" | "all";

function parsePeriod(value: string): UTCTimestamp | null {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const quarter = raw.match(/^(\d{4})[- ]?Q([1-4])$/i);
  if (quarter) {
    const year = Number(quarter[1]);
    const month = (Number(quarter[2]) - 1) * 3;
    return Math.floor(
      Date.UTC(year, month, 1) / 1000,
    ) as UTCTimestamp;
  }

  const monthOnly = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) {
    return Math.floor(
      Date.UTC(
        Number(monthOnly[1]),
        Number(monthOnly[2]) - 1,
        1,
      ) / 1000,
    ) as UTCTimestamp;
  }

  if (/^\d{4}$/.test(raw)) {
    return Math.floor(
      Date.UTC(Number(raw), 0, 1) / 1000,
    ) as UTCTimestamp;
  }

  const normalized =
    raw.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00Z`
      : raw;

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000) as UTCTimestamp;
}

function addYears(
  value: UTCTimestamp,
  years: number,
): UTCTimestamp {
  const date = new Date(Number(value) * 1000);
  date.setUTCFullYear(
    date.getUTCFullYear() + years,
  );
  return Math.floor(
    date.getTime() / 1000,
  ) as UTCTimestamp;
}

function formatValue(
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

  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

  return unit === "currency"
    ? `${compact} CAD`
    : compact;
}

function formatTime(
  time: Time,
  cadence: Series["cadence"],
  language: Lang,
): string {
  let timestamp: number | null = null;

  if (typeof time === "number") {
    timestamp = time;
  } else if (
    typeof time === "object" &&
    time !== null &&
    "year" in time
  ) {
    timestamp = Math.floor(
      Date.UTC(
        time.year,
        time.month - 1,
        time.day,
      ) / 1000,
    );
  }

  if (timestamp === null) {
    return String(time);
  }

  const date = new Date(timestamp * 1000);
  const locale =
    language === "fr" ? "fr-CA" : "en-CA";

  if (cadence === "annual") {
    return String(date.getUTCFullYear());
  }

  if (cadence === "quarterly") {
    const quarter =
      Math.floor(date.getUTCMonth() / 3) + 1;
    return language === "fr"
      ? `T${quarter} ${date.getUTCFullYear()}`
      : `Q${quarter} ${date.getUTCFullYear()}`;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function lineValue(
  value: unknown,
): number | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value
  ) {
    const raw = (
      value as { value?: unknown }
    ).value;

    return typeof raw === "number" &&
      Number.isFinite(raw)
      ? raw
      : null;
  }

  return null;
}

export function ProvinceSeriesInteractiveChart({
  series,
  language,
}: {
  series: Series;
  language: Lang;
}) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(
    null,
  );
  const tooltipRef =
    useRef<HTMLDivElement | null>(null);

  const [windowKey, setWindowKey] =
    useState<WindowKey>("all");

  const historyData = useMemo(() => {
    const byTime = new Map<
      number,
      LineData<UTCTimestamp>
    >();

    for (const point of series.history) {
      const time = parsePeriod(point.period);

      if (
        time === null ||
        !Number.isFinite(point.value)
      ) {
        continue;
      }

      byTime.set(Number(time), {
        time,
        value: point.value,
      });
    }

    return [...byTime.values()].sort(
      (left, right) =>
        Number(left.time) - Number(right.time),
    );
  }, [series.history]);

  const forecastData = useMemo(() => {
    const last = historyData.at(-1);

    if (!last) {
      return [];
    }

    return [
      last,
      ...series.forecasts
        .filter((item) =>
          Number.isFinite(item.value),
        )
        .map((item) => ({
          time: addYears(
            last.time,
            item.years_ahead,
          ),
          value: item.value,
        })),
    ] satisfies LineData<UTCTimestamp>[];
  }, [historyData, series.forecasts]);

  useEffect(() => {
    const container = containerRef.current;

    if (
      !container ||
      historyData.length < 2
    ) {
      return;
    }

    const inherited =
      getComputedStyle(container);
    const textColor =
      inherited
        .getPropertyValue("--muted")
        .trim() || "#64748b";
    const borderColor =
      inherited
        .getPropertyValue("--border")
        .trim() || "#d7dde5";
    const historyColor =
      inherited
        .getPropertyValue("--blue")
        .trim() || "#1677c8";

    const chart = createChart(container, {
      width: Math.max(
        Math.floor(container.clientWidth),
        320,
      ),
      height: Math.max(
        Math.floor(container.clientHeight),
        280,
      ),
      layout: {
        background: {
          type: ColorType.Solid,
          color: "transparent",
        },
        textColor,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: {
          color: borderColor,
          style: LineStyle.Dotted,
        },
        horzLines: {
          color: borderColor,
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: textColor,
          labelBackgroundColor:
            historyColor,
        },
        horzLine: {
          color: textColor,
          labelBackgroundColor:
            historyColor,
        },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor,
        entireTextOnly: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: true,
        borderVisible: true,
        borderColor,
        timeVisible: false,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 24,
        minBarSpacing: 4,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        locale:
          language === "fr"
            ? "fr-CA"
            : "en-CA",
        priceFormatter: (price: number) =>
          formatValue(
            price,
            series.unit,
            language,
          ),
      },
    });

    chartRef.current = chart;

    const historical = chart.addSeries(
      LineSeries,
      {
        color: historyColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        title: pick(
          language,
          "Historique",
          "History",
        ),
      },
    );

    const forecast = chart.addSeries(
      LineSeries,
      {
        color: textColor,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        title: pick(
          language,
          "Projection",
          "Projection",
        ),
      },
    );

    historical.setData(historyData);
    forecast.setData(forecastData);

    chart.timeScale().fitContent();

    const onCrosshair = (param: {
      time?: Time;
      point?: { x: number; y: number };
      seriesData: Map<unknown, unknown>;
    }) => {
      const tooltip = tooltipRef.current;

      if (
        !tooltip ||
        !param.time ||
        !param.point ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        if (tooltip) {
          tooltip.hidden = true;
        }
        return;
      }

      const historicalValue = lineValue(
        param.seriesData.get(historical),
      );
      const forecastValue = lineValue(
        param.seriesData.get(forecast),
      );
      const value =
        historicalValue ??
        forecastValue;

      if (value === null) {
        tooltip.hidden = true;
        return;
      }

      tooltip.hidden = false;
      tooltip.textContent = `${formatTime(
        param.time,
        series.cadence,
        language,
      )} · ${formatValue(
        value,
        series.unit,
        language,
      )}`;

      const tooltipWidth =
        tooltip.offsetWidth || 180;
      const x = Math.min(
        Math.max(param.point.x + 14, 8),
        Math.max(
          container.clientWidth -
            tooltipWidth -
            8,
          8,
        ),
      );
      const y = Math.max(
        Math.min(
          param.point.y - 42,
          container.clientHeight - 40,
        ),
        8,
      );

      tooltip.style.transform =
        `translate(${x}px, ${y}px)`;
    };

    chart.subscribeCrosshairMove(
      onCrosshair,
    );

    const observer = new ResizeObserver(
      (entries) => {
        const entry = entries.at(0);
        if (!entry) return;

        chart.resize(
          Math.max(
            Math.floor(
              entry.contentRect.width,
            ),
            320,
          ),
          Math.max(
            Math.floor(
              entry.contentRect.height,
            ),
            280,
          ),
        );
      },
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.unsubscribeCrosshairMove(
        onCrosshair,
      );
      chart.remove();
      chartRef.current = null;
    };
  }, [
    forecastData,
    historyData,
    language,
    series.cadence,
    series.metric_label,
    series.province_name,
    series.unit,
  ]);

  function setVisibleWindow(
    next: WindowKey,
  ): void {
    setWindowKey(next);

    const chart = chartRef.current;
    const latestHistory =
      historyData.at(-1);
    const finalForecast =
      forecastData.at(-1);

    if (
      !chart ||
      !latestHistory ||
      !finalForecast
    ) {
      return;
    }

    if (next === "all") {
      chart.timeScale().fitContent();
      return;
    }

    const years =
      next === "1y"
        ? 1
        : next === "3y"
          ? 3
          : 5;

    chart.timeScale().setVisibleRange({
      from: addYears(
        latestHistory.time,
        -years,
      ),
      to: finalForecast.time,
    });
  }

  if (historyData.length < 2) {
    return null;
  }

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar}>
        <div>
          <strong>
            {series.metric_label}
          </strong>
          <span>
            {pick(
              language,
              "Axe horizontal : temps · axe vertical : valeur",
              "Horizontal axis: time · vertical axis: value",
            )}
          </span>
        </div>

        <div
          className={styles.windows}
          role="group"
          aria-label={pick(
            language,
            "Période visible",
            "Visible period",
          )}
        >
          {(
            [
              ["1y", "1A"],
              ["3y", "3A"],
              ["5y", "5A"],
              [
                "all",
                pick(
                  language,
                  "Tout",
                  "All",
                ),
              ],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={
                windowKey === key
              }
              onClick={() =>
                setVisibleWindow(key)
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.legend}>
        <span>
          <i
            className={
              styles.historyLegend
            }
          />
          {pick(
            language,
            "Données historiques",
            "Historical data",
          )}
        </span>
        <span>
          <i
            className={
              styles.forecastLegend
            }
          />
          {pick(
            language,
            "Projection Anatole",
            "Anatole projection",
          )}
        </span>
      </div>

      <div
        className={styles.chartStage}
        data-testid="province-series-interactive-chart"
      >
        <div
          ref={containerRef}
          className={styles.chart}
        />
        <div
          ref={tooltipRef}
          className={styles.tooltip}
          hidden
        />
      </div>

      <p className={styles.hint}>
        {pick(
          language,
          "Survolez pour lire une valeur précise. Glissez pour déplacer le graphique et utilisez la molette ou le pincement pour zoomer.",
          "Hover for an exact value. Drag to pan and use the mouse wheel or pinch gesture to zoom.",
        )}
      </p>
    </div>
  );
}
