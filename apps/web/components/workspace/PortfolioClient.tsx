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

function money(value: number, currency = "CAD"): string {
  return new Intl.NumberFormat("fr-CA", {
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

function PerformanceChart({ points }: { points: PortfolioPerformancePoint[] }) {
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
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Performance du portefeuille et du TSX Composite">
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

function AllocationCard({ title, items, totalLabel }: { title: string; items: PortfolioAllocation[]; totalLabel: string }) {
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += item.weight_percent;
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`;
  });
  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.cardHeader}>
        <div><span className="eyebrow">ALLOCATION</span><h3>{title}</h3></div>
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
      setError(reason instanceof Error ? reason.message : "Analyse du portefeuille indisponible.");
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
      setError("Entre un symbole, une quantité positive et un coût moyen valide.");
      return;
    }
    if (positions.some((item) => item.symbol === clean)) {
      setError(`${clean} est déjà dans le portefeuille.`);
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
      else setError("Le CSV doit contenir les colonnes symbol, quantity et average_cost.");
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
          <span className="eyebrow">MON ESPACE · V0.7</span>
          <h1>Portefeuille</h1>
          <p>Positions locales, performance, P&amp;L, allocation sectorielle, concentration et risque. Aucun ordre n’est exécuté et les positions restent dans ce navigateur.</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{snapshot ? snapshot.portfolio_score.toFixed(0) : "—"}</strong>
          <span>score portefeuille</span>
          <small>{positions.length} position{positions.length > 1 ? "s" : ""} · {liveCount} cotation{liveCount > 1 ? "s" : ""} publique{liveCount > 1 ? "s" : ""}</small>
        </div>
      </section>

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">CONSTRUCTION</span><h2>Ajouter ou importer des positions</h2><p>Le coût moyen est saisi dans la devise de cotation du titre.</p></div>
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} type="button" onClick={loadExample}>Charger un exemple</button>
            <button className={styles.secondaryButton} type="button" onClick={() => importedRef.current?.click()}><Upload size={15} /> Importer CSV</button>
            <button className={styles.secondaryButton} type="button" disabled={!positions.length} onClick={exportCsv}><Download size={15} /> Exporter</button>
            <input ref={importedRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} />
          </div>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.searchField}>
            <label htmlFor="portfolio-symbol">Symbole ou entreprise</label>
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "#7393aa" }} /><input id="portfolio-symbol" className={styles.searchInput} style={{ paddingLeft: 36 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="RY, SHOP, XIC…" /></div>
            {suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button className={styles.suggestion} key={item.symbol} type="button" onClick={() => { setSymbol(item.symbol); setSuggestions([]); }}><strong>{item.symbol}</strong><span><b>{item.name}</b><small>{item.sector} · {item.exchange}</small></span></button>)}</div> : null}
          </div>
          <div className={styles.field}><label htmlFor="portfolio-quantity">Quantité</label><input id="portfolio-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="portfolio-average-cost">Coût moyen</label><input id="portfolio-average-cost" inputMode="decimal" value={averageCost} onChange={(event) => setAverageCost(event.target.value)} placeholder="0,00" /></div>
          <button className={styles.primaryButton} type="button" onClick={addPosition}><Plus size={16} /> Ajouter</button>
        </div>
      </section>

      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      {!positions.length ? (
        <section className={`panel ${styles.emptyState}`}>
          <BarChart3 size={30} />
          <strong>Ton portefeuille est vide</strong>
          <span>Ajoute une position ou charge l’exemple pour voir le diagnostic complet.</span>
          <button className={styles.primaryButton} type="button" onClick={loadExample}>Charger l’exemple</button>
        </section>
      ) : (
        <>
          <section className={styles.kpiGrid}>
            <article className={`panel ${styles.kpiCard}`}><span>Valeur actuelle</span><strong>{snapshot ? money(snapshot.total_market_value, snapshot.base_currency) : "…"}</strong><small>Base CAD</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>P&amp;L latent</span><strong className={snapshot ? tone(snapshot.total_unrealized_pnl) : ""}>{snapshot ? money(snapshot.total_unrealized_pnl, snapshot.base_currency) : "…"}</strong><small>{snapshot ? percent(snapshot.total_unrealized_pnl_percent) : "Calcul"}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>Séance</span><strong className={snapshot ? tone(snapshot.total_day_pnl) : ""}>{snapshot ? money(snapshot.total_day_pnl, snapshot.base_currency) : "…"}</strong><small>{snapshot ? percent(snapshot.total_day_change_percent) : "Calcul"}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>Performance 1 an</span><strong className={tone(performanceReturn)}>{snapshot ? percent(performanceReturn) : "…"}</strong><small>Portefeuille reconstitué aux poids actuels</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>Risque</span><strong>{snapshot?.risk.risk_level ?? "…"}</strong><small>{snapshot ? `Diversification ${snapshot.risk.diversification_score.toFixed(0)}/100` : "Calcul"}</small></article>
          </section>

          <section className={`panel ${styles.panel}`}>
            <div className={styles.sectionHeading}><div><span className="eyebrow">POSITIONS</span><h2>Détail du portefeuille</h2><p>Modifie les quantités ou coûts moyens directement dans le tableau.</p></div><button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} /> {loading ? "Actualisation…" : "Actualiser"}</button></div>
            <div className={styles.tableWrap}>
              <table className={styles.table} data-mobile-cards="portfolio">
                <thead><tr><th>Titre</th><th>Quantité</th><th>Coût moyen</th><th>Prix</th><th>Valeur</th><th>Poids</th><th>P&amp;L</th><th>Jour</th><th>Score</th><th /></tr></thead>
                <tbody>
                  {positions.map((position, index) => {
                    const result = snapshot?.positions.find((item) => item.symbol === position.symbol);
                    return <tr key={position.symbol}>
                      <td data-label="Titre"><div className={styles.instrument}><span className={styles.symbolBadge}>{position.symbol}</span><span><b>{result?.name ?? position.symbol}</b><small>{result?.sector ?? "En attente"}</small></span></div></td>
                      <td data-label="Quantité"><input style={{ width: 82, background: "transparent", border: "1px solid #23465d", borderRadius: 8, color: "inherit", padding: "7px 8px", textAlign: "right" }} value={position.quantity} onChange={(event) => updatePosition(index, { quantity: Math.max(0.0001, Number(event.target.value) || 0.0001) })} /></td>
                      <td data-label="Coût moyen"><input style={{ width: 96, background: "transparent", border: "1px solid #23465d", borderRadius: 8, color: "inherit", padding: "7px 8px", textAlign: "right" }} value={position.average_cost} onChange={(event) => updatePosition(index, { average_cost: Math.max(0, Number(event.target.value) || 0) })} /></td>
                      <td data-label="Prix">{result ? money(result.price, result.currency) : "…"}</td>
                      <td data-label="Valeur">{result ? money(result.market_value, snapshot?.base_currency) : "…"}</td>
                      <td data-label="Poids">{result ? `${result.weight_percent.toFixed(1)} %` : "…"}</td>
                      <td data-label="P&L latent" className={result ? tone(result.unrealized_pnl) : ""}>{result ? `${money(result.unrealized_pnl, snapshot?.base_currency)} · ${percent(result.unrealized_pnl_percent)}` : "…"}</td>
                      <td data-label="Séance" className={result ? tone(result.day_pnl) : ""}>{result ? `${money(result.day_pnl, snapshot?.base_currency)} · ${percent(result.day_change_percent)}` : "…"}</td>
                      <td data-label="Score">{result ? <span className={styles.scorePill}>{result.score.toFixed(0)}</span> : "…"}</td>
                      <td data-label="Action"><button className={styles.iconButton} type="button" aria-label={`Supprimer ${position.symbol}`} onClick={() => setPositions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></td>
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
                  <div className={styles.sectionHeading}><div><span className="eyebrow">PERFORMANCE</span><h2>Portefeuille vs TSX Composite</h2><p>Indice base 100 fondé sur les poids actuels, et non sur les flux historiques réels.</p></div></div>
                  <div className={styles.legend}><span style={{ color: "#2d76ff" }}><i /> Portefeuille</span><span style={{ color: "#16c79a" }}><i /> TSX Composite</span></div>
                  <PerformanceChart points={snapshot.performance} />
                </section>
                <section className={`panel ${styles.panel}`}>
                  <div className={styles.cardHeader}><div><span className="eyebrow">RISQUE</span><h3>Diagnostic</h3><p>Concentration, volatilité et sensibilité au marché.</p></div><span className={`${styles.statusPill} ${snapshot.risk.risk_level === "Faible" ? styles.statusHealthy : snapshot.risk.risk_level === "Modéré" ? styles.statusMonitoring : styles.statusDegraded}`}>{snapshot.risk.risk_level}</span></div>
                  <div className={styles.riskGrid}>
                    <div className={styles.riskMetric}><span>Volatilité</span><strong>{snapshot.risk.volatility_percent === null ? "N/D" : `${snapshot.risk.volatility_percent.toFixed(1)} %`}</strong></div>
                    <div className={styles.riskMetric}><span>Bêta TSX</span><strong>{snapshot.risk.beta?.toFixed(2) ?? "N/D"}</strong></div>
                    <div className={styles.riskMetric}><span>Drawdown max</span><strong className={styles.negative}>{snapshot.risk.max_drawdown_percent === null ? "N/D" : `${snapshot.risk.max_drawdown_percent.toFixed(1)} %`}</strong></div>
                    <div className={styles.riskMetric}><span>Sharpe</span><strong>{snapshot.risk.sharpe_ratio?.toFixed(2) ?? "N/D"}</strong></div>
                    <div className={styles.riskMetric}><span>Plus grande position</span><strong>{snapshot.risk.top_position_percent.toFixed(1)} %</strong></div>
                    <div className={styles.riskMetric}><span>Top 3</span><strong>{snapshot.risk.top_three_percent.toFixed(1)} %</strong></div>
                  </div>
                  {snapshot.notes.map((note) => <div className={styles.notice} style={{ marginTop: 10 }} key={note}>{note}</div>)}
                </section>
              </div>

              <div className={styles.gridEqual}>
                <AllocationCard title="Répartition sectorielle" items={snapshot.sector_allocation} totalLabel="secteurs" />
                <AllocationCard title="Exposition par devise" items={snapshot.currency_allocation} totalLabel="devises" />
              </div>

              <div className={styles.gridEqual}>
                <section className={`panel ${styles.panel}`}><div className={styles.cardHeader}><div><span className="eyebrow">CONTRIBUTEURS</span><h3>Moteurs de la séance</h3></div></div><div className={styles.compactList} style={{ marginTop: 14 }}>{snapshot.contributors.length ? snapshot.contributors.map((item) => <div className={styles.contributorRow} key={item.symbol}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><strong className={styles.positive}>{money(item.value, snapshot.base_currency)} · {percent(item.value_percent)}</strong></div>) : <div className={styles.notice}>Aucun contributeur positif aujourd’hui.</div>}</div></section>
                <section className={`panel ${styles.panel}`}><div className={styles.cardHeader}><div><span className="eyebrow">DÉTRACTEURS</span><h3>Pressions de la séance</h3></div></div><div className={styles.compactList} style={{ marginTop: 14 }}>{snapshot.detractors.length ? snapshot.detractors.map((item) => <div className={styles.contributorRow} key={item.symbol}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><strong className={styles.negative}>{money(item.value, snapshot.base_currency)} · {percent(item.value_percent)}</strong></div>) : <div className={styles.notice}>Aucun détracteur négatif aujourd’hui.</div>}</div></section>
              </div>
            </>
          ) : loading ? <div className={styles.skeleton} /> : null}
        </>
      )}

      <div className={styles.notice}>Portefeuille de suivi uniquement. Les quantités et coûts moyens restent sur cet appareil en mode anonyme et sont synchronisés uniquement lorsqu’un compte Anatole est connecté.</div>
      <div style={{ textAlign: "right", color: "#5f7c91", fontSize: 10 }}>{snapshot ? <>Dernière analyse {new Date(snapshot.generated_at).toLocaleString("fr-CA")} · <Link href="/parametres?section=quality">Vérifier les sources</Link></> : null}</div>
    </main>
  );
}
