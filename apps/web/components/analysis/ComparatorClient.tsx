"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  GitCompareArrows,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  compareInstruments,
  searchSymbols,
} from "@/lib/api";
import type {
  ComparisonInstrument,
  ComparisonRange,
  ComparisonSeries,
  ComparisonSnapshot,
  SymbolSearchItem,
} from "@/lib/types";

import { WORKSPACE_SYNC_EVENT } from "@/lib/workspace-sync";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./Analysis.module.css";

const RANGE_OPTIONS: Array<{
  value: ComparisonRange;
  label: string;
}> = [
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1A" },
  { value: "3y", label: "3A" },
  { value: "5y", label: "5A" },
];

const CHART_COLORS = [
  "#4f91ff",
  "#18c8a0",
  "#f2b84b",
  "#b27cff",
  "#ff6f8b",
];

const DEFAULT_SYMBOLS = ["RY", "TD", "SHOP"];
const STORAGE_KEY = "anatole:comparison-symbols:v1";

function cleanSymbol(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\.TO$/i, "")
    .replace(/[^A-Z0-9.^-]/g, "")
    .slice(0, 15);
}

function formatPercent(
  value: number | null,
  digits = 2,
  language: AnatoleLanguage = "fr",
): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value) + " %";
}

function formatNumber(
  value: number | null,
  digits = 2,
  language: AnatoleLanguage = "fr",
): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCurrency(
  value: number,
  currency: string,
  language: AnatoleLanguage,
): string {
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: "currency",
      currency: currency || "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(value, 2, language)} ${currency}`;
  }
}

function formatCompactCurrency(
  value: number | null,
  currency: string,
  language: AnatoleLanguage,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: "currency",
      currency: currency || "CAD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(localeFor(language), {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
}

function valueClass(value: number | null): string {
  if (value === null || value === 0) {
    return "";
  }

  return value > 0 ? "positive" : "negative";
}

function PerformanceChart({
  series,
  language,
}: {
  series: ComparisonSeries[];
  language: AnatoleLanguage;
}) {
  const chart = useMemo(() => {
    const points = series.flatMap((item) => item.points);

    if (!points.length) {
      return null;
    }

    const minTime = Math.min(...points.map((item) => item.time));
    const maxTime = Math.max(...points.map((item) => item.time));
    const rawMin = Math.min(...points.map((item) => item.value));
    const rawMax = Math.max(...points.map((item) => item.value));
    const range = Math.max(rawMax - rawMin, 4);
    const minValue = rawMin - range * 0.12;
    const maxValue = rawMax + range * 0.12;
    const width = 1000;
    const height = 360;
    const left = 62;
    const right = 24;
    const top = 20;
    const bottom = 38;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const timeSpan = Math.max(maxTime - minTime, 1);
    const valueSpan = Math.max(maxValue - minValue, 1);

    const toX = (time: number) =>
      left + ((time - minTime) / timeSpan) * plotWidth;
    const toY = (value: number) =>
      top + ((maxValue - value) / valueSpan) * plotHeight;

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      minTime,
      maxTime,
      minValue,
      maxValue,
      toX,
      toY,
    };
  }, [series]);

  if (!chart) {
    return (
      <div className={styles.emptyInline}>
        {pick(language, "Historique insuffisant pour tracer la comparaison.", "Insufficient history to chart the comparison.")}
      </div>
    );
  }

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return chart.maxValue -
      (chart.maxValue - chart.minValue) * ratio;
  });
  const xTicks = [
    chart.minTime,
    chart.minTime + (chart.maxTime - chart.minTime) / 2,
    chart.maxTime,
  ];
  const dateFormatter = new Intl.DateTimeFormat(localeFor(language), {
    month: "short",
    year: "2-digit",
  });

  return (
    <>
      <div className={styles.chartLegend}>
        {series.map((item, index) => (
          <span
            className={styles.legendItem}
            style={{ color: CHART_COLORS[index % CHART_COLORS.length] }}
            key={item.symbol}
          >
            <span className={styles.legendDot} />
            {item.symbol}
          </span>
        ))}
      </div>
      <div className={styles.chartWrap}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label={pick(language, "Performance normalisée des titres comparés", "Normalized performance of compared securities")}
          preserveAspectRatio="none"
        >
          {yTicks.map((tick) => {
            const y = chart.toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={chart.left}
                  x2={chart.width - chart.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(84, 124, 149, 0.22)"
                  strokeWidth="1"
                />
                <text
                  x={chart.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className={styles.chartAxis}
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            );
          })}

          <line
            x1={chart.left}
            x2={chart.width - chart.right}
            y1={chart.toY(100)}
            y2={chart.toY(100)}
            stroke="rgba(238, 247, 255, 0.35)"
            strokeDasharray="5 7"
          />

          {xTicks.map((tick, index) => (
            <text
              x={chart.toX(tick)}
              y={chart.height - 11}
              textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
              className={styles.chartAxis}
              key={tick}
            >
              {dateFormatter.format(new Date(tick * 1000))}
            </text>
          ))}

          {series.map((item, index) => {
            const path = item.points
              .map((point, pointIndex) => {
                const command = pointIndex === 0 ? "M" : "L";
                return `${command}${chart.toX(point.time).toFixed(2)},${chart
                  .toY(point.value)
                  .toFixed(2)}`;
              })
              .join(" ");

            return (
              <path
                d={path}
                fill="none"
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth="2.6"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                key={item.symbol}
              />
            );
          })}
        </svg>
      </div>
    </>
  );
}

function CorrelationGrid({
  snapshot,
}: {
  snapshot: ComparisonSnapshot;
}) {
  const symbols = snapshot.correlation.symbols;
  const columns = `repeat(${symbols.length + 1}, minmax(0, 1fr))`;

  return (
    <div className={styles.tableWrap}>
      <div
        className={styles.correlationGrid}
        style={{ gridTemplateColumns: columns }}
      >
        <span className={styles.correlationHeader}>Corr.</span>
        {symbols.map((symbol) => (
          <span className={styles.correlationHeader} key={`head:${symbol}`}>
            {symbol}
          </span>
        ))}
        {symbols.map((symbol, rowIndex) => (
          <div style={{ display: "contents" }} key={`row:${symbol}`}>
            <span className={styles.correlationHeader}>{symbol}</span>
            {snapshot.correlation.values[rowIndex].map((value, columnIndex) => {
              const intensity = Math.min(Math.abs(value ?? 0), 1);
              const background = value === null
                ? "rgba(44, 65, 80, 0.28)"
                : value >= 0
                  ? `rgba(22, 199, 154, ${0.08 + intensity * 0.48})`
                  : `rgba(255, 77, 103, ${0.08 + intensity * 0.48})`;

              return (
                <span
                  className={styles.correlationCell}
                  style={{ background }}
                  title={`${symbol} / ${symbols[columnIndex]}`}
                  key={`${symbol}:${symbols[columnIndex]}`}
                >
                  {value === null ? "—" : value.toFixed(2)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function InstrumentProfile({
  instrument,
  language,
}: {
  instrument: ComparisonInstrument;
  language: AnatoleLanguage;
}) {
  const translatePoint = (value: string): string => {
    if (language === "fr") return value;
    return ({
      "Performance de période solide": "Strong period performance",
      "Performance de période négative": "Negative period performance",
      "Rendement ajusté au risque favorable": "Favourable risk-adjusted return",
      "Rendement ajusté au risque négatif": "Negative risk-adjusted return",
      "Volatilité contenue": "Contained volatility",
      "Volatilité élevée": "High volatility",
      "Momentum 20 jours positif": "Positive 20-day momentum",
      "Momentum 20 jours sous pression": "20-day momentum under pressure",
      "Tendance technique haussière": "Bullish technical trend",
      "Tendance technique baissière": "Bearish technical trend",
      "RSI en zone de surachat": "RSI in overbought territory",
      "RSI dans une zone constructive": "RSI in a constructive range",
      "Valorisation prospective modérée": "Moderate forward valuation",
      "Valorisation prospective exigeante": "Demanding forward valuation",
      "Rendement du dividende notable": "Notable dividend yield",
      "Profil équilibré sans avantage dominant": "Balanced profile with no dominant advantage",
      "Aucune faiblesse majeure détectée dans les données disponibles": "No major weakness detected in available data",
    } as Record<string, string>)[value] ?? value;
  };
  return (
    <article className={`panel ${styles.profileCard}`}>
      <div className={styles.profileHeader}>
        <div>
          <h3>{instrument.symbol}</h3>
          <p>{instrument.name}</p>
        </div>
        <span className={styles.profileScore}>{instrument.score ?? "—"}</span>
      </div>
      <div className={styles.prosCons}>
        <div className={styles.pros}>
          <h4>{pick(language, "Forces", "Strengths")}</h4>
          <ul>
            {instrument.strengths.map((item) => (
              <li key={item}>{translatePoint(item)}</li>
            ))}
          </ul>
        </div>
        <div className={styles.cons}>
          <h4>{pick(language, "Points de vigilance", "Watch points")}</h4>
          <ul>
            {instrument.weaknesses.map((item) => (
              <li key={item}>{translatePoint(item)}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.profileActions}>
        <Link className={styles.secondaryLink} href={`/focus/${instrument.symbol}`}>
          <BarChart3 size={14} /> Focus
        </Link>
        <Link className={styles.secondaryLink} href={`/watchlist?add=${instrument.symbol}`}>
          {pick(language, "Ajouter à la Watchlist", "Add to Watchlist")} <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}

export function ComparatorClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [range, setRange] = useState<ComparisonRange>("1y");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolSearchItem[]>([]);
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const applySyncedSymbols = () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
        if (Array.isArray(stored)) {
          const next = [...new Set(stored.filter((value): value is string => typeof value === "string").map(cleanSymbol).filter(Boolean))].slice(0, 5);
          if (next.length >= 2) setSymbols(next);
        }
      } catch {
        // Le comparateur conserve les symboles courants.
      }
    };
    window.addEventListener(WORKSPACE_SYNC_EVENT, applySyncedSymbols);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, applySyncedSymbols);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = (params.get("symbols") ?? "")
          .split(",")
          .map(cleanSymbol)
          .filter(Boolean);
        const uniqueFromUrl = [...new Set(fromUrl)].slice(0, 5);

        if (uniqueFromUrl.length >= 2) {
          setSymbols(uniqueFromUrl);
          return;
        }

        const stored = JSON.parse(
          window.localStorage.getItem(STORAGE_KEY) ?? "null",
        ) as unknown;
        if (
          Array.isArray(stored) &&
          stored.length >= 2 &&
          stored.length <= 5 &&
          stored.every((value) => typeof value === "string")
        ) {
          setSymbols(stored.map(cleanSymbol).filter(Boolean));
        }
      } catch {
        // Les valeurs par défaut restent actives.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
    } catch {
      // La comparaison fonctionne sans stockage local.
    }
  }, [symbols]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 1) {
      const timer = window.setTimeout(() => setSuggestions([]), 0);
      return () => window.clearTimeout(timer);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await searchSymbols(clean, controller.signal);
        setSuggestions(
          response.items.filter((item) => !symbols.includes(item.symbol)).slice(0, 7),
        );
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") {
          setSuggestions([]);
        }
      }
    }, 170);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, symbols]);

  async function loadComparison(
    selectedSymbols = symbols,
    selectedRange = range,
  ): Promise<void> {
    if (selectedSymbols.length < 2) {
      setError(pick(language, "Sélectionne au moins deux titres.", "Select at least two securities."));
      return;
    }

    const version = requestVersion.current + 1;
    requestVersion.current = version;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const response = await compareInstruments(
        selectedSymbols,
        selectedRange,
        controller.signal,
      );
      if (requestVersion.current === version) {
        setSnapshot(response);
      }
    } catch (reason) {
      if (
        requestVersion.current === version &&
        (reason as Error).name !== "AbortError"
      ) {
        setError(
          reason instanceof Error
            ? reason.message
            : pick(language, "Le comparateur est temporairement indisponible.", "The comparator is temporarily unavailable."),
        );
      }
    } finally {
      if (requestVersion.current === version) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadComparison(symbols, range);
    }, 180);

    return () => window.clearTimeout(timeout);
    // loadComparison est volontairement déclenché uniquement par la sélection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, range]);

  function addSymbol(rawValue: string): void {
    const symbol = cleanSymbol(rawValue);
    if (!symbol || symbols.includes(symbol) || symbols.length >= 5) {
      setQuery("");
      setSuggestions([]);
      return;
    }

    setSymbols((current) => [...current, symbol]);
    setQuery("");
    setSuggestions([]);
  }

  function removeSymbol(symbol: string): void {
    if (symbols.length <= 2) {
      setError(pick(language, "Le Comparateur doit conserver au moins deux titres.", "The Comparator must keep at least two securities."));
      return;
    }
    setSymbols((current) => current.filter((item) => item !== symbol));
  }

  const bestPerformance = snapshot?.instruments
    .slice()
    .sort((left, right) => right.total_return_percent - left.total_return_percent)[0];
  const bestSharpe = snapshot?.instruments
    .filter((item) => item.sharpe_ratio !== null)
    .slice()
    .sort((left, right) => (right.sharpe_ratio ?? -999) - (left.sharpe_ratio ?? -999))[0];
  const lowestRisk = snapshot?.instruments
    .filter((item) => item.volatility_percent !== null)
    .slice()
    .sort((left, right) => (left.volatility_percent ?? 999) - (right.volatility_percent ?? 999))[0];

  return (
    <div className={styles.page}>
      <header className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">{pick(language, "ANALYSE PROFESSIONNELLE", "PROFESSIONAL ANALYSIS")} · V0.6</span>
          <h1>{pick(language, "Comparateur", "Comparator")}</h1>
          <p>
            {pick(language, "Mets jusqu’à cinq actions ou ETF sur la même base et compare rendement, risque, momentum, valorisation et corrélations sans multiplier les écrans.", "Place up to five stocks or ETFs on the same basis and compare return, risk, momentum, valuation, and correlations in one screen.")}
          </p>
        </div>
        <div className={styles.heroScore}>
          <GitCompareArrows size={24} color="#27d5ae" />
          <strong>{snapshot?.instruments.length ?? symbols.length}</strong>
          <span>{pick(language, "titres analysés", "securities analyzed")}</span>
          <small>{snapshot?.range_label ?? pick(language, "Préparation des données", "Preparing data")}</small>
        </div>
      </header>

      <section className={`panel ${styles.controlPanel}`}>
        <div className={styles.controlTop}>
          <div className={styles.controlTitle}>
            <span className="eyebrow">{pick(language, "UNIVERS DE COMPARAISON", "COMPARISON UNIVERSE")}</span>
            <h2>{pick(language, "Construis ton groupe", "Build your group")}</h2>
            <p>{pick(language, "Deux titres minimum, cinq maximum. Actions et ETF canadiens acceptés.", "Minimum two, maximum five securities. Canadian stocks and ETFs are supported.")}</p>
          </div>
          <div className={styles.rangeRow} aria-label={pick(language, "Période de comparaison", "Comparison period")}>
            {RANGE_OPTIONS.map((option) => (
              <button
                type="button"
                className={`${styles.rangeButton} ${
                  range === option.value ? styles.rangeButtonActive : ""
                }`}
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
                key={option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.symbolComposer}>
          <div className={styles.symbolSearchWrap}>
            <label className={styles.symbolSearch}>
              <Search size={18} />
              <input
                value={query}
                placeholder={pick(language, "Ajouter un ticker — ex. ENB, XIU, MDA", "Add a ticker — e.g. ENB, XIU, MDA")}
                aria-label={pick(language, "Ajouter un titre à la comparaison", "Add a security to the comparison")}
                spellCheck={false}
                autoComplete="off"
                disabled={symbols.length >= 5}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSymbol(query);
                  }
                }}
              />
              <small>{symbols.length}/5</small>
            </label>
            {query && suggestions.length ? (
              <div className={styles.suggestions}>
                {suggestions.map((item) => (
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => addSymbol(item.symbol)}
                    key={item.symbol}
                  >
                    <strong>{item.symbol}</strong>
                    <span>
                      <b>{item.name}</b>
                      <small>{item.sector} · {item.exchange}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.compareButton}
            disabled={loading || symbols.length < 2}
            onClick={() => void loadComparison()}
          >
            {loading ? <RefreshCw size={17} className={styles.spinIcon} /> : <Sparkles size={17} />}
            {loading ? pick(language, "Analyse…", "Analyzing…") : pick(language, "Actualiser", "Refresh")}
          </button>
        </div>

        <div className={styles.selectionRow}>
          {symbols.map((symbol) => (
            <span className={styles.symbolChip} key={symbol}>
              {symbol}
              <button
                type="button"
                aria-label={pick(language, `Retirer ${symbol}`, `Remove ${symbol}`)}
                onClick={() => removeSymbol(symbol)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {symbols.length < 5 ? (
            <span className="muted small-copy">
              <Plus size={12} /> {pick(language, `Ajoute encore ${5 - symbols.length} titre(s)`, `Add ${5 - symbols.length} more securities`)}
            </span>
          ) : null}
        </div>
        {error ? <div className={styles.errorNotice}>{language === "fr" ? error : "The comparison could not be updated."}</div> : null}
      </section>

      {loading && !snapshot ? (
        <section className={`panel ${styles.loadingPanel}`}>
          <div className={styles.loadingCopy}>
            <span className={styles.spinner} />
            <strong>{pick(language, "Construction de la comparaison", "Building comparison")}</strong>
            <span>{pick(language, "Historique, risque, momentum et valorisation sont calculés ensemble.", "History, risk, momentum, and valuation are calculated together.")}</span>
          </div>
        </section>
      ) : null}

      {snapshot ? (
        <>
          <section className={styles.kpiGrid}>
            <article className={`panel ${styles.kpiCard}`}>
              <span>{pick(language, "Meilleure performance", "Best performance")}</span>
              <strong>{bestPerformance?.symbol ?? "—"}</strong>
              <small>{formatPercent(bestPerformance?.total_return_percent ?? null, 2, language)}</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>{pick(language, "Meilleur Sharpe", "Best Sharpe")}</span>
              <strong>{bestSharpe?.symbol ?? "—"}</strong>
              <small>{formatNumber(bestSharpe?.sharpe_ratio ?? null, 2, language)}</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>{pick(language, "Volatilité la plus basse", "Lowest volatility")}</span>
              <strong>{lowestRisk?.symbol ?? "—"}</strong>
              <small>{formatPercent(lowestRisk?.volatility_percent ?? null, 2, language)}</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>{pick(language, "Référence bêta", "Beta benchmark")}</span>
              <strong>TSX</strong>
              <small>{snapshot.benchmark_name}</small>
            </article>
          </section>

          <section className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">BASE 100</span>
                <h2>{pick(language, "Performance normalisée", "Normalized performance")}</h2>
                <p>{pick(language, "Chaque série débute à 100 pour rendre les trajectoires comparables.", "Each series begins at 100 to make paths comparable.")}</p>
              </div>
              <span className={styles.sectionHeadingMeta}>
                {pick(language, "Période", "Period")}: {snapshot.range_label}<br />
                {pick(language, "Données différées selon la source", "Data delayed depending on source")}
              </span>
            </div>
            <PerformanceChart series={snapshot.series} language={language} />
          </section>

          <section className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">{pick(language, "CLASSEMENT ANATOLE", "ANATOLE RANKING")}</span>
                <h2>{pick(language, "Rendement, risque et valorisation", "Return, risk, and valuation")}</h2>
                <p>{pick(language, "Le rang résume plusieurs dimensions; les métriques restent visibles séparément.", "The rank summarizes several dimensions; each metric remains visible separately.")}</p>
              </div>
              <Trophy size={21} color="#f2b84b" />
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.compareTable} data-mobile-cards="compare">
                <thead>
                  <tr>
                    <th>{pick(language, "Titre", "Security")}</th>
                    <th>{pick(language, "Type", "Type")}</th>
                    <th>{pick(language, "Prix", "Price")}</th>
                    <th>{pick(language, "Période", "Period")}</th>
                    <th>{pick(language, "Annualisé", "Annualized")}</th>
                    <th>{pick(language, "Volatilité", "Volatility")}</th>
                    <th>Sharpe</th>
                    <th>{pick(language, "Bêta", "Beta")}</th>
                    <th>Drawdown</th>
                    <th>Momentum 20j</th>
                    <th>RSI</th>
                    <th>{pick(language, "P/E prév.", "Fwd P/E")}</th>
                    <th>{pick(language, "Dividende", "Dividend")}</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.instruments.map((instrument) => (
                    <tr key={instrument.symbol}>
                      <td data-label={pick(language, "Titre", "Security")}>
                        <div className={styles.instrumentCell}>
                          <span className={styles.rankBadge}>{instrument.rank}</span>
                          <span>
                            <strong>{instrument.symbol}</strong>
                            <small>{instrument.name}</small>
                          </span>
                        </div>
                      </td>
                      <td data-label={pick(language, "Type", "Type")}><span className={styles.typePill}>{language === "en" ? ({ Action: "Stock", ETF: "ETF", Indice: "Index" } as Record<string, string>)[instrument.instrument_type] ?? instrument.instrument_type : instrument.instrument_type}</span></td>
                      <td data-label={pick(language, "Prix", "Price")}>{formatCurrency(instrument.price, instrument.currency, language)}</td>
                      <td data-label={pick(language, "Période", "Period")} className={valueClass(instrument.total_return_percent)}>{formatPercent(instrument.total_return_percent, 2, language)}</td>
                      <td data-label={pick(language, "Annualisé", "Annualized")} className={valueClass(instrument.annualized_return_percent)}>{formatPercent(instrument.annualized_return_percent, 2, language)}</td>
                      <td data-label={pick(language, "Volatilité", "Volatility")}>{formatPercent(instrument.volatility_percent, 2, language)}</td>
                      <td data-label="Sharpe">{formatNumber(instrument.sharpe_ratio, 2, language)}</td>
                      <td data-label={pick(language, "Bêta", "Beta")}>{formatNumber(instrument.beta, 2, language)}</td>
                      <td data-label="Drawdown" className="negative">{formatPercent(instrument.max_drawdown_percent, 2, language)}</td>
                      <td data-label="Momentum 20d" className={valueClass(instrument.momentum_20d)}>{formatPercent(instrument.momentum_20d, 2, language)}</td>
                      <td data-label="RSI">{formatNumber(instrument.rsi_14, 1, language)}</td>
                      <td data-label={pick(language, "P/E prévu", "Forward P/E")}>{instrument.forward_pe === null ? "—" : `${formatNumber(instrument.forward_pe, 1, language)}×`}</td>
                      <td data-label={pick(language, "Dividende", "Dividend")}>{formatPercent(instrument.dividend_yield_percent, 2, language)}</td>
                      <td data-label="Score"><span className={styles.scorePill}>{instrument.score ?? "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.terminalColumns}>
            <article className={`panel ${styles.sectionPanel}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className="eyebrow">DIVERSIFICATION</span>
                  <h2>{pick(language, "Matrice de corrélation", "Correlation matrix")}</h2>
                  <p>{pick(language, "+1 évolue ensemble, 0 indique peu de lien, −1 évolue en sens opposé.", "+1 moves together, 0 indicates little relationship, and −1 moves in opposite directions.")}</p>
                </div>
                <ShieldCheck size={20} color="#27d5ae" />
              </div>
              <CorrelationGrid snapshot={snapshot} />
            </article>
            <article className={`panel ${styles.sectionPanel}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className="eyebrow">{pick(language, "REPÈRES", "GUIDANCE")}</span>
                  <h2>{pick(language, "Lecture du risque", "Risk interpretation")}</h2>
                </div>
              </div>
              <div className={styles.notice}>
                {pick(language, `Le ratio de Sharpe utilise un taux sans risque technique de ${snapshot.risk_free_rate_percent.toFixed(1)} %. Le bêta est estimé contre le S&P/TSX Composite. Les données manquantes restent marquées « — » plutôt que remplacées par des estimations.`, `The Sharpe ratio uses a technical risk-free rate of ${snapshot.risk_free_rate_percent.toFixed(1)}%. Beta is estimated against the S&P/TSX Composite. Missing data remains marked “—” instead of being replaced with estimates.`)}
              </div>
            </article>
          </section>

          <section>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">{pick(language, "LECTURE TITRE PAR TITRE", "SECURITY-BY-SECURITY REVIEW")}</span>
                <h2>{pick(language, "Forces et points de vigilance", "Strengths and watch points")}</h2>
              </div>
            </div>
            <div className={styles.profileGrid}>
              {snapshot.instruments.map((instrument) => (
                <InstrumentProfile instrument={instrument} language={language} key={instrument.symbol} />
              ))}
            </div>
          </section>

          <footer className={`panel ${styles.methodology}`}>
            {language === "fr" ? snapshot.methodology : "The composite score uses performance, risk-adjusted return, volatility, momentum, RSI, trend, and available valuation data. It is an analysis tool, not a recommendation."} {pick(language, "Capitalisations", "Market capitalizations")}: {snapshot.instruments.map((item) => `${item.symbol} ${formatCompactCurrency(item.market_cap, item.currency, language)}`).join(" · ")}.
          </footer>
        </>
      ) : null}
    </div>
  );
}
