"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  Download,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  analyzePortfolio,
  searchSymbols,
} from "@/lib/api";
import type {
  PortfolioAllocation,
  PortfolioPerformancePoint,
  PortfolioPositionInput,
  PortfolioSnapshot,
  SymbolSearchItem,
} from "@/lib/types";

import { WORKSPACE_SYNC_EVENT } from "@/lib/workspace-sync";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./Workspace.module.css";

const STORAGE_KEY = "anatole:portfolio:v1";
const COLORS = [
  "#2d76ff",
  "#16c79a",
  "#8a63ff",
  "#f5a742",
  "#00b8d9",
  "#ff6b8a",
  "#7ecb55",
  "#c58cff",
];

function money(value: number, currency = "CAD", language: AnatoleLanguage = "fr"): string {
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "N/D" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)} %`;
}

function tone(value: number): string {
  return value > 0.001 ? styles.positive : value < -0.001 ? styles.negative : "";
}

function loadPositions(): PortfolioPositionInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PortfolioPositionInput[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            item &&
            typeof item.symbol === "string" &&
            Number(item.quantity) > 0 &&
            Number(item.average_cost) >= 0,
        )
      : [];
  } catch {
    return [];
  }
}

function linePath(
  values: Array<{ time: number; value: number }>,
  minValue: number,
  maxValue: number,
  width: number,
  height: number,
): string {
  if (!values.length) return "";
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 30;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const minTime = values[0].time;
  const maxTime = values[values.length - 1].time || minTime + 1;
  const range = Math.max(maxValue - minValue, 1);
  return values
    .map((point, index) => {
      const x = left + ((point.time - minTime) / Math.max(maxTime - minTime, 1)) * chartWidth;
      const y = top + (1 - (point.value - minValue) / range) * chartHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function PerformanceChart({ points, language }: { points: PortfolioPerformancePoint[]; language: AnatoleLanguage }) {
  const width = 980;
  const height = 330;
  const portfolio = points.map((point) => ({ time: point.time, value: point.portfolio }));
  const benchmark = points
    .filter((point) => point.benchmark !== null)
    .map((point) => ({ time: point.time, value: point.benchmark as number }));
  const allValues = [...portfolio, ...benchmark].map((point) => point.value);
  const minValue = allValues.length ? Math.min(...allValues) : 90;
  const maxValue = allValues.length ? Math.max(...allValues) : 110;
  const padding = Math.max((maxValue - minValue) * 0.12, 2);
  const low = minValue - padding;
  const high = maxValue + padding;
  const ticks = Array.from({ length: 5 }, (_, index) => high - ((high - low) / 4) * index);

  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={pick(language, "Performance du portefeuille et du TSX Composite", "Portfolio and TSX Composite performance")}>
        {ticks.map((tick, index) => {
          const y = 18 + (index / 4) * (height - 48);
          return (
            <g key={tick}>
              <line x1="46" x2={width - 18} y1={y} y2={y} stroke="rgba(75,111,135,.22)" />
              <text className={styles.chartAxis} x="8" y={y + 4}>{tick.toFixed(0)}</text>
            </g>
          );
        })}
        <path d={linePath(portfolio, low, high, width, height)} fill="none" stroke="#2d76ff" strokeWidth="3" strokeLinejoin="round" />
        <path d={linePath(benchmark, low, high, width, height)} fill="none" stroke="#16c79a" strokeWidth="2" strokeDasharray="7 6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function AllocationCard({ title, items, totalLabel, language }: { title: string; items: PortfolioAllocation[]; totalLabel: string; language: AnatoleLanguage }) {
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += item.weight_percent;
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`;
  });
  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.cardHeader}>
        <div><span className="eyebrow">{pick(language, "RÉPARTITION", "ALLOCATION")}</span><h3>{title}</h3></div>
      </div>
      <div className={styles.allocationLayout}>
        <div className={styles.donut} style={{ background: items.length ? `conic-gradient(${stops.join(",")})` : "#173246" }}>
          <strong>{items.length}</strong><small>{totalLabel}</small>
        </div>
        <div className={styles.allocationList}>
          {items.slice(0, 8).map((item, index) => (
            <div className={styles.allocationRow} key={item.key}>
              <span><i style={{ display: "inline-block", width: 7, height: 7, marginRight: 7, borderRadius: 99, background: COLORS[index % COLORS.length] }} />{item.label}</span>
              <span className={styles.progress}><i style={{ width: `${Math.min(item.weight_percent, 100)}%` }} /></span>
              <strong>{item.weight_percent.toFixed(1)} %</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PortfolioClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const searchParams = useSearchParams();
  const importedRef = useRef<HTMLInputElement>(null);
  const [positions, setPositions] = useState<PortfolioPositionInput[]>([]);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [averageCost, setAverageCost] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolSearchItem[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadPositions();
    const add = searchParams.get("add")?.toUpperCase().replace(/\.TO$/, "");
    const timer = window.setTimeout(() => {
      setPositions(add && !saved.some((item) => item.symbol === add) ? [...saved, { symbol: add, quantity: 1, average_cost: 0 }] : saved);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  useEffect(() => {
    const applySyncedPositions = () => setPositions(loadPositions());
    window.addEventListener(WORKSPACE_SYNC_EVENT, applySyncedPositions);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, applySyncedPositions);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  }, [hydrated, positions]);

  useEffect(() => {
    if (!symbol.trim()) {
      const timer = window.setTimeout(() => setSuggestions([]), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await searchSymbols(symbol, controller.signal);
        setSuggestions(response.items.slice(0, 6));
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [symbol]);

  const refresh = async (current = positions) => {
    if (!current.length) {
      setSnapshot(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await analyzePortfolio(current, controller.signal));
    } catch (reason) {
      setError(language === "fr" && reason instanceof Error ? reason.message : pick(language, "Analyse du portefeuille indisponible.", "Portfolio analysis is unavailable."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !positions.length) return;
    const timer = window.setTimeout(() => void refresh(positions), 450);
    return () => window.clearTimeout(timer);
    // refresh intentionally follows the position state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, positions]);

  const addPosition = () => {
    const clean = symbol.trim().toUpperCase().replace(/\.TO$/, "");
    const qty = Number(quantity);
    const cost = Number(averageCost || 0);
    if (!clean || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) {
      setError(pick(language, "Entre un symbole, une quantité positive et un coût moyen valide.", "Enter a symbol, a positive quantity, and a valid average cost."));
      return;
    }
    if (positions.some((item) => item.symbol === clean)) {
      setError(pick(language, `${clean} est déjà dans le portefeuille.`, `${clean} is already in the portfolio.`));
      return;
    }
    setPositions((current) => [...current, { symbol: clean, quantity: qty, average_cost: cost }]);
    setSymbol("");
    setQuantity("10");
    setAverageCost("");
    setSuggestions([]);
    setError(null);
  };

  const updatePosition = (index: number, patch: Partial<PortfolioPositionInput>) => {
    setPositions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const loadExample = () => {
    setPositions([
      { symbol: "RY", quantity: 12, average_cost: 122 },
      { symbol: "TD", quantity: 18, average_cost: 78 },
      { symbol: "XIC", quantity: 25, average_cost: 33 },
      { symbol: "SHOP", quantity: 6, average_cost: 92 },
    ]);
  };

  const exportCsv = () => {
    const rows = ["symbol,quantity,average_cost", ...positions.map((item) => `${item.symbol},${item.quantity},${item.average_cost}`)];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "anatole-portefeuille.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result ?? "").split(/\r?\n/).slice(1);
      const parsed = lines.flatMap((line) => {
        const [rawSymbol, rawQuantity, rawCost] = line.split(",");
        const clean = rawSymbol?.trim().toUpperCase().replace(/\.TO$/, "");
        const qty = Number(rawQuantity);
        const cost = Number(rawCost);
        return clean && qty > 0 && cost >= 0 ? [{ symbol: clean, quantity: qty, average_cost: cost }] : [];
      });
      if (parsed.length) setPositions(parsed.slice(0, 30));
      else setError(pick(language, "Le CSV doit contenir les colonnes symbol, quantity et average_cost.", "The CSV must contain symbol, quantity, and average_cost columns."));
    };
    reader.readAsText(file);
  };

  const performanceReturn = snapshot?.performance.length
    ? snapshot.performance[snapshot.performance.length - 1].portfolio - 100
    : 0;

  const liveCount = useMemo(
    () => snapshot?.positions.filter((item) => !item.source.startsWith("demo")).length ?? 0,
    [snapshot],
  );

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">{pick(language, "MON ESPACE", "MY WORKSPACE")} · V0.7</span>
          <h1>{pick(language, "Portefeuille", "Portfolio")}</h1>
          <p>{pick(language, "Positions locales, performance, P&L, allocation sectorielle, concentration et risque. Aucun ordre n’est exécuté et les positions restent dans ce navigateur.", "Local positions, performance, P&L, sector allocation, concentration, and risk. No order is executed and positions remain in this browser.")}</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{snapshot ? snapshot.portfolio_score.toFixed(0) : "—"}</strong>
          <span>{pick(language, "score portefeuille", "portfolio score")}</span>
          <small>{positions.length} {pick(language, `position${positions.length > 1 ? "s" : ""}`, `position${positions.length === 1 ? "" : "s"}`)} · {liveCount} {pick(language, `cotation${liveCount > 1 ? "s" : ""} publique${liveCount > 1 ? "s" : ""}`, `public quote${liveCount === 1 ? "" : "s"}`)}</small>
        </div>
      </section>

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">{pick(language, "CONSTRUCTION", "BUILD")}</span><h2>{pick(language, "Ajouter ou importer des positions", "Add or import positions")}</h2><p>{pick(language, "Le coût moyen est saisi dans la devise de cotation du titre.", "Average cost is entered in the security’s quote currency.")}</p></div>
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} type="button" onClick={loadExample}>{pick(language, "Charger un exemple", "Load example")}</button>
            <button className={styles.secondaryButton} type="button" onClick={() => importedRef.current?.click()}><Upload size={15} /> {pick(language, "Importer CSV", "Import CSV")}</button>
            <button className={styles.secondaryButton} type="button" disabled={!positions.length} onClick={exportCsv}><Download size={15} /> {pick(language, "Exporter", "Export")}</button>
            <input ref={importedRef} aria-label={pick(language, "Importer un portefeuille CSV", "Import a CSV portfolio")} hidden type="file" accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} />
          </div>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.searchField}>
            <label htmlFor="portfolio-symbol">{pick(language, "Symbole ou entreprise", "Symbol or company")}</label>
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "#7393aa" }} /><input id="portfolio-symbol" className={styles.searchInput} style={{ paddingLeft: 36 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="RY, SHOP, XIC…" /></div>
            {suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button className={styles.suggestion} key={item.symbol} type="button" onClick={() => { setSymbol(item.symbol); setSuggestions([]); }}><strong>{item.symbol}</strong><span><b>{item.name}</b><small>{item.sector} · {item.exchange}</small></span></button>)}</div> : null}
          </div>
          <div className={styles.field}><label htmlFor="portfolio-quantity">{pick(language, "Quantité", "Quantity")}</label><input id="portfolio-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="portfolio-average-cost">{pick(language, "Coût moyen", "Average cost")}</label><input id="portfolio-average-cost" inputMode="decimal" value={averageCost} onChange={(event) => setAverageCost(event.target.value)} placeholder="0.00" /></div>
          <button className={styles.primaryButton} type="button" onClick={addPosition}><Plus size={16} /> {pick(language, "Ajouter", "Add")}</button>
        </div>
      </section>

      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      {!positions.length ? (
        <section className={`panel ${styles.emptyState}`}>
          <BarChart3 size={30} />
          <strong>{pick(language, "Ton portefeuille est vide", "Your portfolio is empty")}</strong>
          <span>{pick(language, "Ajoute une position ou charge l’exemple pour voir le diagnostic complet.", "Add a position or load the example to view the full analysis.")}</span>
          <button className={styles.primaryButton} type="button" onClick={loadExample}>{pick(language, "Charger l’exemple", "Load example")}</button>
        </section>
      ) : (
        <>
          <section className={styles.kpiGrid}>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Valeur actuelle", "Current value")}</span><strong>{snapshot ? money(snapshot.total_market_value, snapshot.base_currency, language) : "…"}</strong><small>CAD</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "P&L latent", "Unrealized P&L")}</span><strong className={snapshot ? tone(snapshot.total_unrealized_pnl) : ""}>{snapshot ? money(snapshot.total_unrealized_pnl, snapshot.base_currency, language) : "…"}</strong><small>{snapshot ? percent(snapshot.total_unrealized_pnl_percent) : pick(language, "Calcul", "Calculating")}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Séance", "Session")}</span><strong className={snapshot ? tone(snapshot.total_day_pnl) : ""}>{snapshot ? money(snapshot.total_day_pnl, snapshot.base_currency, language) : "…"}</strong><small>{snapshot ? percent(snapshot.total_day_change_percent) : pick(language, "Calcul", "Calculating")}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Performance 1 an", "1-year performance")}</span><strong className={tone(performanceReturn)}>{snapshot ? percent(performanceReturn) : "…"}</strong><small>{pick(language, "Portefeuille reconstitué aux poids actuels", "Portfolio reconstructed using current weights")}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Risque", "Risk")}</span><strong>{snapshot ? (language === "en" ? ({ Faible: "Low", Modéré: "Moderate", Élevé: "High", "Très élevé": "Very high" } as Record<string, string>)[snapshot.risk.risk_level] ?? snapshot.risk.risk_level : snapshot.risk.risk_level) : "…"}</strong><small>{snapshot ? `${pick(language, "Diversification", "Diversification")} ${snapshot.risk.diversification_score.toFixed(0)}/100` : pick(language, "Calcul", "Calculating")}</small></article>
          </section>

          <section className={`panel ${styles.panel}`}>
            <div className={styles.sectionHeading}><div><span className="eyebrow">POSITIONS</span><h2>{pick(language, "Détail du portefeuille", "Portfolio details")}</h2><p>{pick(language, "Modifie les quantités ou coûts moyens directement dans le tableau.", "Edit quantities or average costs directly in the table.")}</p></div><button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} /> {loading ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Actualiser", "Refresh")}</button></div>
            <div className={styles.tableWrap}>
              <table className={styles.table} data-mobile-cards="portfolio">
                <thead><tr><th>{pick(language, "Titre", "Security")}</th><th>{pick(language, "Quantité", "Quantity")}</th><th>{pick(language, "Coût moyen", "Average cost")}</th><th>{pick(language, "Prix", "Price")}</th><th>{pick(language, "Valeur", "Value")}</th><th>{pick(language, "Poids", "Weight")}</th><th>P&amp;L</th><th>{pick(language, "Jour", "Day")}</th><th>Score</th><th /></tr></thead>
                <tbody>
                  {positions.map((position, index) => {
                    const result = snapshot?.positions.find((item) => item.symbol === position.symbol);
                    return <tr key={position.symbol}>
                      <td data-label={pick(language, "Titre", "Security")}><div className={styles.instrument}><span className={styles.symbolBadge}>{position.symbol}</span><span><b>{result?.name ?? position.symbol}</b><small>{result?.sector ?? pick(language, "En attente", "Pending")}</small></span></div></td>
                      <td data-label={pick(language, "Quantité", "Quantity")}><input aria-label={pick(language, `Quantité de ${position.symbol}`, `${position.symbol} quantity`)} style={{ width: 82, background: "transparent", border: "1px solid #23465d", borderRadius: 8, color: "inherit", padding: "7px 8px", textAlign: "right" }} value={position.quantity} onChange={(event) => updatePosition(index, { quantity: Math.max(0.0001, Number(event.target.value) || 0.0001) })} /></td>
                      <td data-label={pick(language, "Coût moyen", "Average cost")}><input aria-label={pick(language, `Coût moyen de ${position.symbol}`, `${position.symbol} average cost`)} style={{ width: 96, background: "transparent", border: "1px solid #23465d", borderRadius: 8, color: "inherit", padding: "7px 8px", textAlign: "right" }} value={position.average_cost} onChange={(event) => updatePosition(index, { average_cost: Math.max(0, Number(event.target.value) || 0) })} /></td>
                      <td data-label={pick(language, "Prix", "Price")}>{result ? money(result.price, result.currency, language) : "…"}</td>
                      <td data-label={pick(language, "Valeur", "Value")}>{result ? money(result.market_value, snapshot?.base_currency, language) : "…"}</td>
                      <td data-label={pick(language, "Poids", "Weight")}>{result ? `${result.weight_percent.toFixed(1)} %` : "…"}</td>
                      <td data-label={pick(language, "P&L latent", "Unrealized P&L")} className={result ? tone(result.unrealized_pnl) : ""}>{result ? `${money(result.unrealized_pnl, snapshot?.base_currency, language)} · ${percent(result.unrealized_pnl_percent)}` : "…"}</td>
                      <td data-label={pick(language, "Séance", "Session")} className={result ? tone(result.day_pnl) : ""}>{result ? `${money(result.day_pnl, snapshot?.base_currency, language)} · ${percent(result.day_change_percent)}` : "…"}</td>
                      <td data-label="Score">{result ? <span className={styles.scorePill}>{result.score.toFixed(0)}</span> : "…"}</td>
                      <td data-label="Action"><button className={styles.iconButton} type="button" aria-label={pick(language, `Supprimer ${position.symbol}`, `Delete ${position.symbol}`)} onClick={() => setPositions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot ? (
            <>
              <div className={styles.gridTwo}>
                <section className={`panel ${styles.panel}`}>
                  <div className={styles.sectionHeading}><div><span className="eyebrow">PERFORMANCE</span><h2>{pick(language, "Portefeuille vs TSX Composite", "Portfolio vs TSX Composite")}</h2><p>{pick(language, "Indice base 100 fondé sur les poids actuels, et non sur les flux historiques réels.", "Base-100 index using current weights rather than actual historical cash flows.")}</p></div></div>
                  <div className={styles.legend}><span style={{ color: "#2d76ff" }}><i /> {pick(language, "Portefeuille", "Portfolio")}</span><span style={{ color: "#16c79a" }}><i /> TSX Composite</span></div>
                  <PerformanceChart points={snapshot.performance} language={language} />
                </section>
                <section className={`panel ${styles.panel}`}>
                  <div className={styles.cardHeader}><div><span className="eyebrow">{pick(language, "RISQUE", "RISK")}</span><h3>{pick(language, "Diagnostic", "Assessment")}</h3><p>{pick(language, "Concentration, volatilité et sensibilité au marché.", "Concentration, volatility, and market sensitivity.")}</p></div><span className={`${styles.statusPill} ${snapshot.risk.risk_level === "Faible" ? styles.statusHealthy : snapshot.risk.risk_level === "Modéré" ? styles.statusMonitoring : styles.statusDegraded}`}>{language === "en" ? ({ Faible: "Low", Modéré: "Moderate", Élevé: "High", "Très élevé": "Very high" } as Record<string, string>)[snapshot.risk.risk_level] ?? snapshot.risk.risk_level : snapshot.risk.risk_level}</span></div>
                  <div className={styles.riskGrid}>
                    <div className={styles.riskMetric}><span>{pick(language, "Volatilité", "Volatility")}</span><strong>{snapshot.risk.volatility_percent === null ? pick(language, "N/D", "N/A") : `${snapshot.risk.volatility_percent.toFixed(1)} %`}</strong></div>
                    <div className={styles.riskMetric}><span>{pick(language, "Bêta TSX", "TSX beta")}</span><strong>{snapshot.risk.beta?.toFixed(2) ?? pick(language, "N/D", "N/A")}</strong></div>
                    <div className={styles.riskMetric}><span>{pick(language, "Drawdown max", "Max drawdown")}</span><strong className={styles.negative}>{snapshot.risk.max_drawdown_percent === null ? pick(language, "N/D", "N/A") : `${snapshot.risk.max_drawdown_percent.toFixed(1)} %`}</strong></div>
                    <div className={styles.riskMetric}><span>Sharpe</span><strong>{snapshot.risk.sharpe_ratio?.toFixed(2) ?? pick(language, "N/D", "N/A")}</strong></div>
                    <div className={styles.riskMetric}><span>{pick(language, "Plus grande position", "Largest position")}</span><strong>{snapshot.risk.top_position_percent.toFixed(1)} %</strong></div>
                    <div className={styles.riskMetric}><span>Top 3</span><strong>{snapshot.risk.top_three_percent.toFixed(1)} %</strong></div>
                  </div>
                  {snapshot.notes.map((note, index) => <div className={styles.notice} style={{ marginTop: 10 }} key={note}>{language === "fr" ? note : pick(language, "", [
                    "This portfolio risk note is based on the current positions and available market history.",
                    "Concentration and volatility should be reviewed alongside the underlying data coverage.",
                    "Risk indicators are informational and do not constitute financial advice.",
                  ][index] ?? "Additional portfolio risk information is available.")}</div>)}
                </section>
              </div>

              <div className={styles.gridEqual}>
                <AllocationCard language={language} title={pick(language, "Répartition sectorielle", "Sector allocation")} items={snapshot.sector_allocation} totalLabel={pick(language, "secteurs", "sectors")} />
                <AllocationCard language={language} title={pick(language, "Exposition par devise", "Currency exposure")} items={snapshot.currency_allocation} totalLabel={pick(language, "devises", "currencies")} />
              </div>

              <div className={styles.gridEqual}>
                <section className={`panel ${styles.panel}`}><div className={styles.cardHeader}><div><span className="eyebrow">{pick(language, "CONTRIBUTEURS", "CONTRIBUTORS")}</span><h3>{pick(language, "Moteurs de la séance", "Session drivers")}</h3></div></div><div className={styles.compactList} style={{ marginTop: 14 }}>{snapshot.contributors.length ? snapshot.contributors.map((item) => <div className={styles.contributorRow} key={item.symbol}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><strong className={styles.positive}>{money(item.value, snapshot.base_currency, language)} · {percent(item.value_percent)}</strong></div>) : <div className={styles.notice}>{pick(language, "Aucun contributeur positif aujourd’hui.", "No positive contributor today.")}</div>}</div></section>
                <section className={`panel ${styles.panel}`}><div className={styles.cardHeader}><div><span className="eyebrow">{pick(language, "DÉTRACTEURS", "DETRACTORS")}</span><h3>{pick(language, "Pressions de la séance", "Session pressures")}</h3></div></div><div className={styles.compactList} style={{ marginTop: 14 }}>{snapshot.detractors.length ? snapshot.detractors.map((item) => <div className={styles.contributorRow} key={item.symbol}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><strong className={styles.negative}>{money(item.value, snapshot.base_currency, language)} · {percent(item.value_percent)}</strong></div>) : <div className={styles.notice}>{pick(language, "Aucun détracteur négatif aujourd’hui.", "No negative detractor today.")}</div>}</div></section>
              </div>
            </>
          ) : loading ? <div className={styles.skeleton} /> : null}
        </>
      )}

      <div className={styles.notice}>{pick(language, "Portefeuille de suivi uniquement. Les quantités et coûts moyens restent sur cet appareil en mode anonyme et sont synchronisés uniquement lorsqu’un compte Anatole est connecté.", "Tracking portfolio only. Quantities and average costs remain on this device while anonymous and synchronize only when an Anatole account is connected.")}</div>
      <div style={{ textAlign: "right", color: "#5f7c91", fontSize: 10 }}>{snapshot ? <>{pick(language, "Dernière analyse", "Last analysis")} {new Date(snapshot.generated_at).toLocaleString(localeFor(language))} · <Link href="/parametres?section=quality">{pick(language, "Vérifier les sources", "Check sources")}</Link></> : null}</div>
    </main>
  );
}
