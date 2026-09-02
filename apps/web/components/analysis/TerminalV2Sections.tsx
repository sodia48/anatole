"use client";

import { deleteTerminalPreset, filterTerminalRadar, TERMINAL_RADAR_DEFAULT_PRESETS, upsertTerminalPreset } from "@anatole/shared";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAccount } from "@/components/providers/AccountProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type { TerminalAnomalyType, TerminalRadarFilters, TerminalRadarPreset, TerminalSnapshot } from "@/lib/types";
import { readLocalWorkspace, writeLocalWorkspace } from "@/lib/workspace-sync";

import styles from "./Analysis.module.css";

function number(value: number | null, digits = 1, language: AnatoleLanguage = "fr"): string {
  return value == null ? "N/D" : new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: digits, signDisplay: "exceptZero" }).format(value);
}

const TERMINAL_ANOMALIES: TerminalAnomalyType[] = ["volume_spike", "gap", "momentum_acceleration", "rsi_extreme", "sma_cross", "price_volume_divergence", "sector_dislocation", "score_shift"];
const TERMINAL_TRENDS = ["Haussière", "Mixte", "Baissière", "Indéterminée"];
const TERMINAL_SIGNALS = ["Momentum fort", "Constructif", "Neutre", "Fragile", "Sous pression"];
type NumericFilterKey = "score_min" | "score_max" | "momentum_20d_min" | "momentum_20d_max" | "relative_volume_min" | "rsi_min" | "rsi_max" | "change_percent_min" | "change_percent_max";

const ANOMALY_LABELS: Record<TerminalAnomalyType, readonly [string, string]> = {
  volume_spike: ["Pic de volume", "Volume spike"], gap: ["Gap", "Gap"], momentum_acceleration: ["Accélération momentum", "Momentum acceleration"],
  rsi_extreme: ["RSI extrême", "RSI extreme"], sma_cross: ["Croisement MM", "MA cross"], price_volume_divergence: ["Divergence prix-volume", "Price-volume divergence"],
  sector_dislocation: ["Dislocation sectorielle", "Sector dislocation"], score_shift: ["Variation du score", "Score shift"],
};

function trendLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({ Haussière: "Bullish", Mixte: "Mixed", Baissière: "Bearish", Indéterminée: "Undetermined" } as Record<string, string>)[value] ?? value;
}

function signalLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({ "Momentum fort": "Strong momentum", Constructif: "Constructive", Neutre: "Neutral", Fragile: "Fragile", "Sous pression": "Under pressure" } as Record<string, string>)[value] ?? value;
}

function RadarFilters({ filters, language, sectors, onChange }: { filters: TerminalRadarFilters; language: AnatoleLanguage; sectors: string[]; onChange: (filters: TerminalRadarFilters) => void }) {
  const numericFields: { key: NumericFilterKey; label: string; min?: number; max?: number; step?: string }[] = [
    { key: "score_min", label: "Score min", min: 0, max: 100 }, { key: "score_max", label: "Score max", min: 0, max: 100 },
    { key: "momentum_20d_min", label: pick(language, "Momentum 20j min", "20d momentum min") }, { key: "momentum_20d_max", label: pick(language, "Momentum 20j max", "20d momentum max") },
    { key: "relative_volume_min", label: pick(language, "Volume relatif min", "Relative volume min"), min: 0, step: ".1" },
    { key: "rsi_min", label: "RSI min", min: 0, max: 100 }, { key: "rsi_max", label: "RSI max", min: 0, max: 100 },
    { key: "change_percent_min", label: pick(language, "Variation séance min", "Session change min") }, { key: "change_percent_max", label: pick(language, "Variation séance max", "Session change max") },
  ];
  const activeFilters: { key: string; label: string }[] = [];
  const add = (key: NumericFilterKey, label: string, operator: string) => { const value = filters[key]; if (value != null) activeFilters.push({ key, label: `${label} ${operator} ${value}` }); };
  add("score_min", "Score", "≥"); add("score_max", "Score", "≤"); add("momentum_20d_min", pick(language, "Momentum 20j", "20d momentum"), "≥"); add("momentum_20d_max", pick(language, "Momentum 20j", "20d momentum"), "≤");
  add("relative_volume_min", pick(language, "Volume relatif", "Relative volume"), "≥"); add("rsi_min", "RSI", "≥"); add("rsi_max", "RSI", "≤"); add("change_percent_min", pick(language, "Séance", "Session"), "≥"); add("change_percent_max", pick(language, "Séance", "Session"), "≤");
  if (filters.sector) activeFilters.push({ key: "sector", label: filters.sector }); if (filters.trend) activeFilters.push({ key: "trend", label: trendLabel(filters.trend, language) }); if (filters.signal) activeFilters.push({ key: "signal", label: signalLabel(filters.signal, language) });
  for (const type of filters.anomaly_types ?? []) activeFilters.push({ key: `anomaly:${type}`, label: pick(language, ANOMALY_LABELS[type][0], ANOMALY_LABELS[type][1]) });
  const clear = (key: string) => key.startsWith("anomaly:")
    ? onChange({ ...filters, anomaly_types: (filters.anomaly_types ?? []).filter((type) => type !== key.slice(8)) })
    : onChange({ ...filters, [key]: null });
  return <>
    <div className={styles.radarControls}>{numericFields.map((field) => <label key={field.key}>{field.label}<input max={field.max} min={field.min} onChange={(event) => onChange({ ...filters, [field.key]: event.target.value ? Number(event.target.value) : null })} step={field.step} type="number" value={filters[field.key] ?? ""} /></label>)}
      <label>{pick(language, "Secteur", "Sector")}<select onChange={(event) => onChange({ ...filters, sector: event.target.value || null })} value={filters.sector ?? ""}><option value="">{pick(language, "Tous", "All")}</option>{sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></label>
      <label>{pick(language, "Tendance", "Trend")}<select onChange={(event) => onChange({ ...filters, trend: event.target.value || null })} value={filters.trend ?? ""}><option value="">{pick(language, "Toutes", "All")}</option>{TERMINAL_TRENDS.map((trend) => <option key={trend} value={trend}>{trendLabel(trend, language)}</option>)}</select></label>
      <label>{pick(language, "Signal", "Signal")}<select onChange={(event) => onChange({ ...filters, signal: event.target.value || null })} value={filters.signal ?? ""}><option value="">{pick(language, "Tous", "All")}</option>{TERMINAL_SIGNALS.map((signal) => <option key={signal} value={signal}>{signalLabel(signal, language)}</option>)}</select></label>
    </div>
    <fieldset className={styles.anomalyFilters}><legend>{pick(language, "Anomalies", "Anomalies")}</legend>{TERMINAL_ANOMALIES.map((type) => <label key={type}><input checked={(filters.anomaly_types ?? []).includes(type)} onChange={() => onChange({ ...filters, anomaly_types: (filters.anomaly_types ?? []).includes(type) ? (filters.anomaly_types ?? []).filter((value) => value !== type) : [...(filters.anomaly_types ?? []), type] })} type="checkbox" />{pick(language, ANOMALY_LABELS[type][0], ANOMALY_LABELS[type][1])}</label>)}</fieldset>
    {activeFilters.length ? <div className={styles.activeFilters} data-testid="terminal-active-filters">{activeFilters.map((item) => <button key={item.key} onClick={() => clear(item.key)} type="button">{item.label} ×</button>)}</div> : null}
  </>;
}

function PulseChart({ snapshot, range }: { snapshot: TerminalSnapshot; range: "3m" | "6m" | "1y" }) {
  const points = useMemo(() => {
    const days = range === "3m" ? 93 : range === "6m" ? 186 : 370;
    const latestTimestamp = snapshot.regime_history.at(-1)?.timestamp ?? 0;
    const cutoff = latestTimestamp - days * 86_400;
    return snapshot.regime_history.filter((point) => point.timestamp >= cutoff && point.regime_score != null);
  }, [range, snapshot.regime_history]);
  if (points.length < 2) return <div className={styles.v2Empty}>N/D</div>;
  const x = (index: number) => index / Math.max(points.length - 1, 1) * 1000;
  const scorePath = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${300 - (point.regime_score ?? 0) * 3}`).join(" ");
  const benchmark = points.filter((point) => point.benchmark_value != null);
  const min = Math.min(...benchmark.map((point) => point.benchmark_value ?? 100));
  const max = Math.max(...benchmark.map((point) => point.benchmark_value ?? 100));
  const benchmarkPath = benchmark.map((point, index) => `${index ? "L" : "M"}${x(index)},${280 - ((point.benchmark_value ?? min) - min) / Math.max(max - min, 1) * 240}`).join(" ");
  return <svg aria-label="Market Pulse" className={styles.pulseChart} viewBox="0 0 1000 300">
    <rect fill="rgba(255,74,104,.06)" height="84" width="1000" y="216" /><rect fill="rgba(246,185,74,.06)" height="81" width="1000" y="135" /><rect fill="rgba(32,202,163,.06)" height="135" width="1000" y="0" />
    <path d={benchmarkPath} fill="none" stroke="#7894a8" strokeWidth="3" /><path d={scorePath} fill="none" stroke="#2c9cff" strokeWidth="5" />
  </svg>;
}

function RotationMatrix({ snapshot, language }: { snapshot: TerminalSnapshot; language: AnatoleLanguage }) {
  const scale = (value: number) => 250 + Math.max(-20, Math.min(20, value)) * 10;
  const drawable = snapshot.sector_rotation.filter((item) => item.x != null && item.y != null);
  const unavailable = snapshot.sector_rotation.filter((item) => item.x == null || item.y == null);
  return <><svg aria-label={pick(language, "Matrice de rotation sectorielle", "Sector rotation matrix")} className={styles.rotationMatrix} viewBox="0 0 500 500">
    <rect fill="rgba(255,90,120,.05)" height="250" width="250" x="0" y="250" /><rect fill="rgba(246,185,74,.05)" height="250" width="250" x="250" y="250" /><rect fill="rgba(44,156,255,.05)" height="250" width="250" x="0" y="0" /><rect fill="rgba(32,202,163,.06)" height="250" width="250" x="250" y="0" />
    <line stroke="#34566c" x1="250" x2="250" y1="0" y2="500" /><line stroke="#34566c" x1="0" x2="500" y1="250" y2="250" />
    {drawable.map((item) => {
      const cx = scale(item.x!); const cy = 500 - scale(item.y!); const hasPrevious = item.previous_x != null && item.previous_y != null;
      return <g data-testid={`terminal-rotation-bubble-${item.sector}`} key={item.sector}>{hasPrevious ? <line data-testid={`terminal-rotation-path-${item.sector}`} stroke="#7894a8" strokeWidth="2" x1={scale(item.previous_x!)} x2={cx} y1={500 - scale(item.previous_y!)} y2={cy} /> : null}<circle cx={cx} cy={cy} fill="#2c9cff" opacity=".85" r={Math.max(9, Math.min(25, 7 + item.member_count * 1.5))} /><text fill="#fff" fontSize="11" textAnchor="middle" x={cx} y={cy - 16}>{item.sector}</text></g>;
    })}
  </svg>{unavailable.length ? <div className={styles.rotationUnavailable}>{unavailable.map((item) => <span data-testid={`terminal-rotation-unavailable-${item.sector}`} key={item.sector}>{item.sector} — {pick(language, "données insuffisantes", "insufficient data")} · N/D</span>)}</div> : null}</>;
}

export function TerminalV2Sections({ snapshot, language }: { snapshot: TerminalSnapshot; language: AnatoleLanguage }) {
  const account = useAccount();
  const [range, setRange] = useState<"3m" | "6m" | "1y">("3m");
  const [filters, setFilters] = useState<TerminalRadarFilters>({});
  const [sort, setSort] = useState<TerminalRadarPreset["sort"]>("score_desc");
  const [presets, setPresets] = useState<TerminalRadarPreset[]>(() => readLocalWorkspace().data.terminal_presets ?? []);
  const [activePreset, setActivePreset] = useState("");
  const visibleRadar = useMemo(() => filterTerminalRadar(snapshot.radar_items, filters, sort), [filters, snapshot.radar_items, sort]);
  const sectors = useMemo(() => [...new Set(snapshot.radar_items.map((item) => item.sector))].sort(), [snapshot.radar_items]);
  const allPresets = [...TERMINAL_RADAR_DEFAULT_PRESETS, ...presets];

  function selectPreset(preset: TerminalRadarPreset) { setActivePreset(preset.id); setFilters(preset.filters); setSort(preset.sort); }
  async function persist(next: TerminalRadarPreset[]) {
    setPresets(next);
    const workspace = readLocalWorkspace().data;
    writeLocalWorkspace({ ...workspace, terminal_presets: next });
    await account.syncNow().catch(() => undefined);
  }
  async function savePreset() {
    const name = window.prompt(pick(language, "Nom du preset", "Preset name"), "Mon radar")?.trim();
    if (!name) return;
    const id = activePreset && presets.some((item) => item.id === activePreset) ? activePreset : `terminal-${Date.now()}`;
    const now = new Date().toISOString();
    await persist(upsertTerminalPreset(presets, { id, name: name.slice(0, 80), filters, sort, created_at: now, updated_at: now }));
    setActivePreset(id);
  }
  async function removePreset() {
    if (!activePreset) return;
    await persist(deleteTerminalPreset(presets, activePreset));
    setActivePreset("");
  }

  return <div className={styles.v2Stack} data-testid="terminal-v2">
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">MULTI-HORIZON</span><h2>{pick(language, "Régime de marché", "Market regime")}</h2></div><small>{pick(language, `Couverture : ${snapshot.data_quality.real_symbols}/${snapshot.data_quality.expected_symbols} titres · Historique : ${snapshot.data_quality.history_symbols}/${snapshot.data_quality.expected_symbols}`, `Coverage: ${snapshot.data_quality.real_symbols}/${snapshot.data_quality.expected_symbols} securities · History: ${snapshot.data_quality.history_symbols}/${snapshot.data_quality.expected_symbols}`)}</small></div>
      <div className={styles.horizonGrid}>{snapshot.regime_horizons.map((item) => <article key={item.key}><span>{item.label}</span><strong>{item.regime ?? "N/D"}</strong><b>{item.score == null ? "N/D" : `${item.score.toFixed(0)}/100`}</b><small>{number(item.change_percent, 2, language)} %</small></article>)}</div>
      {snapshot.data_quality.warnings.map((warning) => <p className={styles.v2Warning} key={warning}>{warning}</p>)}
    </section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">MARKET PULSE</span><h2>{pick(language, "Historique du régime", "Regime history")}</h2></div><div className={styles.v2Actions}>{(["3m", "6m", "1y"] as const).map((value) => <button className={range === value ? styles.v2Active : ""} key={value} onClick={() => setRange(value)}>{value.toUpperCase()}</button>)}</div></div><PulseChart range={range} snapshot={snapshot} /></section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">BREADTH PRO</span><h2>{pick(language, "Participation du marché", "Market participation")}</h2></div><small>{snapshot.breadth_pro.coverage_percent.toFixed(0)} %</small></div><div className={styles.v2MetricGrid}>{[
      [pick(language, "Hausses / baisses", "Advancers / decliners"), `${snapshot.breadth_pro.advancers ?? "N/D"} / ${snapshot.breadth_pro.decliners ?? "N/D"}`],
      ["MM20 / MM50 / MM200", `${number(snapshot.breadth_pro.above_sma20_percent, 0, language)} / ${number(snapshot.breadth_pro.above_sma50_percent, 0, language)} / ${number(snapshot.breadth_pro.above_sma200_percent, 0, language)} %`],
      [pick(language, "Nouveaux hauts / bas 52S", "New 52W highs / lows"), `${snapshot.breadth_pro.new_highs_52w ?? "N/D"} / ${snapshot.breadth_pro.new_lows_52w ?? "N/D"}`],
      [pick(language, "Couverture 52S", "52W coverage"), `${snapshot.breadth_pro.high_low_52w_eligible_symbols} · ${number(snapshot.breadth_pro.high_low_52w_coverage_percent, 0, language)} %`],
      [pick(language, "Volume titres positifs", "Positive-session securities volume"), number(snapshot.breadth_pro.up_volume, 0, language)],
      [pick(language, "Volume titres négatifs", "Negative-session securities volume"), number(snapshot.breadth_pro.down_volume, 0, language)],
      [pick(language, "Écart concentration", "Concentration spread"), `${number(snapshot.breadth_pro.concentration_spread_percent_points, 2, language)} pts`],
    ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>{snapshot.breadth_pro.divergence.active ? <p className={styles.v2Warning}><b>{snapshot.breadth_pro.divergence.title}</b> · {snapshot.breadth_pro.divergence.explanation}</p> : null}</section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">ROTATION 2.0</span><h2>{pick(language, "Rotation quantitative observée", "Observed quantitative rotation")}</h2></div></div><RotationMatrix language={language} snapshot={snapshot} /><div className={styles.sectorLinks}>{snapshot.sector_rotation.map((item) => <Link href={`/cockpit?universe=tsx60&sector=${encodeURIComponent(item.sector)}`} key={item.sector}>{item.sector} · {item.quadrant}</Link>)}</div></section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">DRIVERS DU MARCHÉ CANADIEN</span><h2>{pick(language, "Marchés liés et taux", "Related markets and rates")}</h2></div></div><div className={styles.driverGrid}>{snapshot.market_drivers.map((item) => <article key={item.key}><div className={styles.driverTitle}><span>{item.label}</span><i className={item.status === "stale" ? styles.statusStale : item.status === "unavailable" ? styles.statusUnavailable : styles.statusAvailable}>{item.status === "available" ? pick(language, "À jour", "Up to date") : item.status === "stale" ? pick(language, "Dernières données", "Latest available") : pick(language, "Indisponible", "Unavailable")}</i></div><strong>{item.value == null ? "N/D" : `${number(item.value, 3, language)} ${item.unit}`}</strong><b>{item.change_5d == null ? "N/D" : `${number(item.change_5d, 2, language)} ${item.change_unit} / 5J`}</b><small>{item.relationship_label ?? pick(language, "Corrélation N/D", "Correlation N/A")}</small></article>)}</div></section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">ANOMALY ENGINE</span><h2>{pick(language, "Rareté statistique", "Statistical rarity")}</h2></div></div><div className={styles.anomalyGrid}>{snapshot.anomalies.map((item) => <Link href={item.symbol ? `/focus/${encodeURIComponent(item.symbol)}` : "/terminal"} key={item.id}><span>{item.type.replaceAll("_", " ")}</span><strong>{item.title}</strong><b>{item.rarity_score.toFixed(0)}/100</b><small>{item.detail}</small></Link>)}</div></section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">RADAR PRO</span><h2>{pick(language, "Filtres personnalisables", "Custom filters")}</h2></div><small>{visibleRadar.length}/{snapshot.radar_items.length}</small></div><div className={styles.presetBar}>{allPresets.map((preset) => <button className={activePreset === preset.id ? styles.v2Active : ""} key={preset.id} onClick={() => selectPreset(preset)}>{preset.name}</button>)}<button onClick={() => { setActivePreset(""); setFilters({}); setSort("score_desc"); }}>{pick(language, "Réinitialiser", "Reset")}</button></div><RadarFilters filters={filters} language={language} onChange={setFilters} sectors={sectors} /><div className={styles.radarActions}><button onClick={() => void savePreset()}>{pick(language, "Enregistrer le preset", "Save preset")}</button>{activePreset && presets.some((preset) => preset.id === activePreset) ? <button onClick={() => void removePreset()}>{pick(language, "Supprimer", "Delete")}</button> : null}</div><div className={styles.radarTable}>{visibleRadar.map((item) => <Link href={`/focus/${encodeURIComponent(item.symbol)}`} key={item.symbol}><strong>{item.symbol}</strong><span>{item.sector}</span><b>{item.score.toFixed(0)}</b><small>{number(item.change_percent, 2, language)} % · {item.relative_volume.toFixed(1)}× · RSI {number(item.rsi_14, 0, language)}</small></Link>)}</div></section>
  </div>;
}
