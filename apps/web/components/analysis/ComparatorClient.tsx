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
): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value) + " %";
}

function formatNumber(
  value: number | null,
  digits = 2,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCurrency(
  value: number,
  currency: string,
): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(value)} ${currency}`;
  }
}

function formatCompactCurrency(
  value: number | null,
  currency: string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "CAD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("fr-FR", {
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
}: {
  series: ComparisonSeries[];
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
        Historique insuffisant pour tracer la comparaison.
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
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
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
          aria-label="Performance normalisée des titres comparés"
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
}: {
  instrument: ComparisonInstrument;
}) {
  return (
    <article className={`panel ${styles.profileCard}`}>
      <div className={styles.profileHeader}>
        <div>
          <h3>{instrument.symbol}</h3>
          <p>{instrument.name}</p>
        </div>
        <span className={styles.profileScore}>{instrument.score}</span>
      </div>
      <div className={styles.prosCons}>
        <div className={styles.pros}>
          <h4>Forces</h4>
          <ul>
            {instrument.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className={styles.cons}>
          <h4>Points de vigilance</h4>
          <ul>
            {instrument.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.profileActions}>
        <Link className={styles.secondaryLink} href={`/focus/${instrument.symbol}`}>
          <BarChart3 size={14} /> Focus
        </Link>
        <Link className={styles.secondaryLink} href={`/watchlist?add=${instrument.symbol}`}>
          Ajouter à la Watchlist <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}

export function ComparatorClient() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [range, setRange] = useState<ComparisonRange>("1y");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolSearchItem[]>([]);
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
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
      setSuggestions([]);
      return;
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
      setError("Sélectionne au moins deux titres.");
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
            : "Le comparateur est temporairement indisponible.",
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
      setError("Le Comparateur doit conserver au moins deux titres.");
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
          <span className="eyebrow">ANALYSE PROFESSIONNELLE · V0.6</span>
          <h1>Comparateur</h1>
          <p>
            Mets jusqu’à cinq actions ou ETF sur la même base et compare rendement,
            risque, momentum, valorisation et corrélations sans multiplier les écrans.
          </p>
        </div>
        <div className={styles.heroScore}>
          <GitCompareArrows size={24} color="#27d5ae" />
          <strong>{snapshot?.instruments.length ?? symbols.length}</strong>
          <span>titres analysés</span>
          <small>{snapshot?.range_label ?? "Préparation des données"}</small>
        </div>
      </header>

      <section className={`panel ${styles.controlPanel}`}>
        <div className={styles.controlTop}>
          <div className={styles.controlTitle}>
            <span className="eyebrow">UNIVERS DE COMPARAISON</span>
            <h2>Construis ton groupe</h2>
            <p>Deux titres minimum, cinq maximum. Actions et ETF canadiens acceptés.</p>
          </div>
          <div className={styles.rangeRow} aria-label="Période de comparaison">
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
                placeholder="Ajouter un ticker — ex. ENB, XIU, MDA"
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
            {loading ? "Analyse…" : "Actualiser"}
          </button>
        </div>

        <div className={styles.selectionRow}>
          {symbols.map((symbol) => (
            <span className={styles.symbolChip} key={symbol}>
              {symbol}
              <button
                type="button"
                aria-label={`Retirer ${symbol}`}
                onClick={() => removeSymbol(symbol)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {symbols.length < 5 ? (
            <span className="muted small-copy">
              <Plus size={12} /> Ajoute encore {5 - symbols.length} titre(s)
            </span>
          ) : null}
        </div>
        {error ? <div className={styles.errorNotice}>{error}</div> : null}
      </section>

      {loading && !snapshot ? (
        <section className={`panel ${styles.loadingPanel}`}>
          <div className={styles.loadingCopy}>
            <span className={styles.spinner} />
            <strong>Construction de la comparaison</strong>
            <span>Historique, risque, momentum et valorisation sont calculés ensemble.</span>
          </div>
        </section>
      ) : null}

      {snapshot ? (
        <>
          <section className={styles.kpiGrid}>
            <article className={`panel ${styles.kpiCard}`}>
              <span>Meilleure performance</span>
              <strong>{bestPerformance?.symbol ?? "—"}</strong>
              <small>{formatPercent(bestPerformance?.total_return_percent ?? null)}</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>Meilleur Sharpe</span>
              <strong>{bestSharpe?.symbol ?? "—"}</strong>
              <small>{formatNumber(bestSharpe?.sharpe_ratio ?? null)}</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>Volatilité la plus basse</span>
              <strong>{lowestRisk?.symbol ?? "—"}</strong>
              <small>{formatPercent(lowestRisk?.volatility_percent ?? null)}</small>
            </article>
            <article className={`panel ${styles.kpiCard}`}>
              <span>Référence bêta</span>
              <strong>TSX</strong>
              <small>{snapshot.benchmark_name}</small>
            </article>
          </section>

          <section className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">BASE 100</span>
                <h2>Performance normalisée</h2>
                <p>Chaque série débute à 100 pour rendre les trajectoires comparables.</p>
              </div>
              <span className={styles.sectionHeadingMeta}>
                Période : {snapshot.range_label}<br />
                Données différées selon la source
              </span>
            </div>
            <PerformanceChart series={snapshot.series} />
          </section>

          <section className={`panel ${styles.sectionPanel}`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">CLASSEMENT ANATOLE</span>
                <h2>Rendement, risque et valorisation</h2>
                <p>Le rang résume plusieurs dimensions; les métriques restent visibles séparément.</p>
              </div>
              <Trophy size={21} color="#f2b84b" />
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.compareTable} data-mobile-cards="compare">
                <thead>
                  <tr>
                    <th>Titre</th>
                    <th>Type</th>
                    <th>Prix</th>
                    <th>Période</th>
                    <th>Annualisé</th>
                    <th>Volatilité</th>
                    <th>Sharpe</th>
                    <th>Bêta</th>
                    <th>Drawdown</th>
                    <th>Momentum 20j</th>
                    <th>RSI</th>
                    <th>P/E prév.</th>
                    <th>Dividende</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.instruments.map((instrument) => (
                    <tr key={instrument.symbol}>
                      <td data-label="Titre">
                        <div className={styles.instrumentCell}>
                          <span className={styles.rankBadge}>{instrument.rank}</span>
                          <span>
                            <strong>{instrument.symbol}</strong>
                            <small>{instrument.name}</small>
                          </span>
                        </div>
                      </td>
                      <td data-label="Type"><span className={styles.typePill}>{instrument.instrument_type}</span></td>
                      <td data-label="Prix">{formatCurrency(instrument.price, instrument.currency)}</td>
                      <td data-label="Période" className={valueClass(instrument.total_return_percent)}>{formatPercent(instrument.total_return_percent)}</td>
                      <td data-label="Annualisé" className={valueClass(instrument.annualized_return_percent)}>{formatPercent(instrument.annualized_return_percent)}</td>
                      <td data-label="Volatilité">{formatPercent(instrument.volatility_percent)}</td>
                      <td data-label="Sharpe">{formatNumber(instrument.sharpe_ratio)}</td>
                      <td data-label="Bêta">{formatNumber(instrument.beta)}</td>
                      <td data-label="Drawdown" className="negative">{formatPercent(instrument.max_drawdown_percent)}</td>
                      <td data-label="Momentum 20j" className={valueClass(instrument.momentum_20d)}>{formatPercent(instrument.momentum_20d)}</td>
                      <td data-label="RSI">{formatNumber(instrument.rsi_14, 1)}</td>
                      <td data-label="P/E prévu">{instrument.forward_pe === null ? "—" : `${formatNumber(instrument.forward_pe, 1)}×`}</td>
                      <td data-label="Dividende">{formatPercent(instrument.dividend_yield_percent)}</td>
                      <td data-label="Score"><span className={styles.scorePill}>{instrument.score}</span></td>
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
                  <h2>Matrice de corrélation</h2>
                  <p>+1 évolue ensemble, 0 indique peu de lien, −1 évolue en sens opposé.</p>
                </div>
                <ShieldCheck size={20} color="#27d5ae" />
              </div>
              <CorrelationGrid snapshot={snapshot} />
            </article>
            <article className={`panel ${styles.sectionPanel}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className="eyebrow">REPÈRES</span>
                  <h2>Lecture du risque</h2>
                </div>
              </div>
              <div className={styles.notice}>
                Le ratio de Sharpe utilise un taux sans risque technique de {snapshot.risk_free_rate_percent.toFixed(1)} %.
                Le bêta est estimé contre le S&amp;P/TSX Composite. Les données manquantes restent marquées « — » plutôt que remplacées par des estimations.
              </div>
            </article>
          </section>

          <section>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">LECTURE TITRE PAR TITRE</span>
                <h2>Forces et points de vigilance</h2>
              </div>
            </div>
            <div className={styles.profileGrid}>
              {snapshot.instruments.map((instrument) => (
                <InstrumentProfile instrument={instrument} key={instrument.symbol} />
              ))}
            </div>
          </section>

          <footer className={`panel ${styles.methodology}`}>
            {snapshot.methodology} Capitalisations : {snapshot.instruments.map((item) => `${item.symbol} ${formatCompactCurrency(item.market_cap, item.currency)}`).join(" · ")}.
          </footer>
        </>
      ) : null}
    </div>
  );
}
