"use client";

import { deleteTerminalPreset, filterTerminalRadar, TERMINAL_RADAR_DEFAULT_PRESETS, upsertTerminalPreset } from "@anatole/shared";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAccount } from "@/components/providers/AccountProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type { TerminalRadarFilters, TerminalRadarPreset, TerminalSnapshot } from "@/lib/types";
import { readLocalWorkspace, writeLocalWorkspace } from "@/lib/workspace-sync";

import styles from "./Analysis.module.css";

function number(value: number | null, digits = 1, language: AnatoleLanguage = "fr"): string {
  return value == null ? "N/D" : new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: digits, signDisplay: "exceptZero" }).format(value);
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
  const scale = (value: number | null) => 250 + Math.max(-20, Math.min(20, value ?? 0)) * 10;
  return <svg aria-label={pick(language, "Matrice de rotation sectorielle", "Sector rotation matrix")} className={styles.rotationMatrix} viewBox="0 0 500 500">
    <rect fill="rgba(255,90,120,.05)" height="250" width="250" x="0" y="250" /><rect fill="rgba(246,185,74,.05)" height="250" width="250" x="250" y="250" /><rect fill="rgba(44,156,255,.05)" height="250" width="250" x="0" y="0" /><rect fill="rgba(32,202,163,.06)" height="250" width="250" x="250" y="0" />
    <line stroke="#34566c" x1="250" x2="250" y1="0" y2="500" /><line stroke="#34566c" x1="0" x2="500" y1="250" y2="250" />
    {snapshot.sector_rotation.map((item) => {
      const cx = scale(item.x); const cy = 500 - scale(item.y); const px = scale(item.previous_x); const py = 500 - scale(item.previous_y);
      return <g key={item.sector}><line stroke="#7894a8" strokeWidth="2" x1={px} x2={cx} y1={py} y2={cy} /><circle cx={cx} cy={cy} fill="#2c9cff" opacity=".85" r={Math.max(9, Math.min(25, 7 + item.member_count * 1.5))} /><text fill="#fff" fontSize="11" textAnchor="middle" x={cx} y={cy - 16}>{item.sector}</text></g>;
    })}
  </svg>;
}

export function TerminalV2Sections({ snapshot, language }: { snapshot: TerminalSnapshot; language: AnatoleLanguage }) {
  const account = useAccount();
  const [range, setRange] = useState<"3m" | "6m" | "1y">("3m");
  const [filters, setFilters] = useState<TerminalRadarFilters>({});
  const [sort, setSort] = useState<TerminalRadarPreset["sort"]>("score_desc");
  const [presets, setPresets] = useState<TerminalRadarPreset[]>(() => readLocalWorkspace().data.terminal_presets ?? []);
  const [activePreset, setActivePreset] = useState("");
  const visibleRadar = useMemo(() => filterTerminalRadar(snapshot.radar_items, filters, sort), [filters, snapshot.radar_items, sort]);
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
      [pick(language, "Volume titres positifs", "Positive-session securities volume"), number(snapshot.breadth_pro.up_volume, 0, language)],
      [pick(language, "Volume titres négatifs", "Negative-session securities volume"), number(snapshot.breadth_pro.down_volume, 0, language)],
      [pick(language, "Écart concentration", "Concentration spread"), `${number(snapshot.breadth_pro.concentration_spread_percent_points, 2, language)} pts`],
    ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>{snapshot.breadth_pro.divergence.active ? <p className={styles.v2Warning}><b>{snapshot.breadth_pro.divergence.title}</b> · {snapshot.breadth_pro.divergence.explanation}</p> : null}</section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">ROTATION 2.0</span><h2>{pick(language, "Rotation quantitative observée", "Observed quantitative rotation")}</h2></div></div><RotationMatrix language={language} snapshot={snapshot} /><div className={styles.sectorLinks}>{snapshot.sector_rotation.map((item) => <Link href={`/cockpit?universe=tsx60&sector=${encodeURIComponent(item.sector)}`} key={item.sector}>{item.sector} · {item.quadrant}</Link>)}</div></section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">DRIVERS DU MARCHÉ CANADIEN</span><h2>{pick(language, "Marchés liés et taux", "Related markets and rates")}</h2></div></div><div className={styles.driverGrid}>{snapshot.market_drivers.map((item) => <article key={item.key}><span>{item.label}</span><strong>{item.value == null ? "N/D" : `${number(item.value, 3, language)} ${item.unit}`}</strong><b>{item.change_5d == null ? "N/D" : `${number(item.change_5d, 2, language)} ${item.change_unit} / 5J`}</b><small>{item.relationship_label ?? pick(language, "Corrélation N/D", "Correlation N/A")}</small></article>)}</div></section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">ANOMALY ENGINE</span><h2>{pick(language, "Rareté statistique", "Statistical rarity")}</h2></div></div><div className={styles.anomalyGrid}>{snapshot.anomalies.map((item) => <Link href={item.symbol ? `/focus/${encodeURIComponent(item.symbol)}` : "/terminal"} key={item.id}><span>{item.type.replaceAll("_", " ")}</span><strong>{item.title}</strong><b>{item.rarity_score.toFixed(0)}/100</b><small>{item.detail}</small></Link>)}</div></section>
    <section className={`panel ${styles.v2Section}`}><div className={styles.v2Heading}><div><span className="eyebrow">RADAR PRO</span><h2>{pick(language, "Filtres personnalisables", "Custom filters")}</h2></div><small>{visibleRadar.length}/{snapshot.radar_items.length}</small></div><div className={styles.presetBar}>{allPresets.map((preset) => <button className={activePreset === preset.id ? styles.v2Active : ""} key={preset.id} onClick={() => selectPreset(preset)}>{preset.name}</button>)}<button onClick={() => { setActivePreset(""); setFilters({}); setSort("score_desc"); }}>{pick(language, "Réinitialiser", "Reset")}</button></div><div className={styles.radarControls}><label>Score min<input max="100" min="0" onChange={(event) => setFilters((current) => ({ ...current, score_min: event.target.value ? Number(event.target.value) : null }))} type="number" value={filters.score_min ?? ""} /></label><label>Momentum min<input onChange={(event) => setFilters((current) => ({ ...current, momentum_20d_min: event.target.value ? Number(event.target.value) : null }))} type="number" value={filters.momentum_20d_min ?? ""} /></label><label>Volume relatif min<input min="0" onChange={(event) => setFilters((current) => ({ ...current, relative_volume_min: event.target.value ? Number(event.target.value) : null }))} step=".1" type="number" value={filters.relative_volume_min ?? ""} /></label><button onClick={() => void savePreset()}>{pick(language, "Enregistrer", "Save")}</button>{activePreset && presets.some((preset) => preset.id === activePreset) ? <button onClick={() => void persist(deleteTerminalPreset(presets, activePreset))}>{pick(language, "Supprimer", "Delete")}</button> : null}</div><div className={styles.radarTable}>{visibleRadar.map((item) => <Link href={`/focus/${encodeURIComponent(item.symbol)}`} key={item.symbol}><strong>{item.symbol}</strong><span>{item.sector}</span><b>{item.score.toFixed(0)}</b><small>{number(item.change_percent, 2, language)} % · {item.relative_volume.toFixed(1)}× · RSI {number(item.rsi_14, 0, language)}</small></Link>)}</div></section>
  </div>;
}
