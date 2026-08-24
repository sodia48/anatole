"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import type { FocusComparisonConfig } from "./types";
import styles from "./FocusPro.module.css";

const COLORS = ["#f6b94a", "#8a63ff", "#13d0c5", "#ff5f76", "#65b8f5"];

export function FocusComparePanel({
  ticker,
  comparisons,
  language,
  onChange,
  onClose,
}: {
  ticker: string;
  comparisons: FocusComparisonConfig[];
  language: AnatoleLanguage;
  onChange: (items: FocusComparisonConfig[]) => void;
  onClose: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [mode, setMode] = useState<FocusComparisonConfig["mode"]>("normalized_percent");

  const add = (candidate = symbol) => {
    const clean = candidate.trim().toUpperCase().replace(/\.TO$/, "");
    if (!clean || clean === ticker.replace(/\.TO$/, "") || comparisons.some((item) => item.symbol === clean) || comparisons.length >= 5) return;
    onChange([...comparisons, {
      symbol: clean,
      mode,
      color: COLORS[comparisons.length % COLORS.length],
    }]);
    setSymbol("");
  };

  return (
    <section className={styles.panel} aria-label={pick(language, "Comparaisons", "Comparisons")}>
      <header className={styles.sectionHeader}>
        <div><span className={styles.eyebrow}>+ COMPARE</span><h2>{pick(language, "Comparer jusqu’à 5 actifs", "Compare up to 5 assets")}</h2></div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label={pick(language, "Fermer", "Close")}><X size={14} /></button>
      </header>
      <div className={styles.sectionBody}>
        <div className={styles.inlineActions}>
          <input className={styles.input} style={{ flex: 1 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} placeholder="RY, XIU, ^GSPTSE…" />
          <button className={styles.primaryButton} type="button" onClick={() => add()} disabled={comparisons.length >= 5}><Plus size={14} /></button>
        </div>
        <select className={styles.select} value={mode} onChange={(event) => setMode(event.target.value as FocusComparisonConfig["mode"])}>
          <option value="normalized_percent">{pick(language, "Normalisé · base 0 %", "Normalized · base 0%")}</option>
          <option value="price">{pick(language, "Prix", "Price")}</option>
        </select>
        <div className={styles.inlineActions}>
          <button className={styles.button} type="button" onClick={() => add("XIU")}>TSX 60 · XIU</button>
          <button className={styles.button} type="button" onClick={() => add("^GSPTSE")}>TSX Composite</button>
        </div>
        <ul className={styles.list}>
          {comparisons.map((item) => (
            <li className={styles.listItem} key={item.symbol}>
              <span><strong style={{ color: item.color }}>{item.symbol}</strong><small>{item.mode === "normalized_percent" ? "0 %" : pick(language, "Prix", "Price")}</small></span>
              <button className={styles.iconButton} type="button" onClick={() => onChange(comparisons.filter((candidate) => candidate.symbol !== item.symbol))} aria-label={pick(language, "Retirer", "Remove")}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
        <p className={styles.notice}>{pick(language, "Les séries utilisent uniquement leurs timestamps communs. Aucun forward-fill n’est appliqué entre des séances incompatibles.", "Series use only shared timestamps. No forward fill is applied across incompatible sessions.")}</p>
      </div>
    </section>
  );
}
