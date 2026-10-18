"use client";

import { FocusGlyph } from "./FocusGlyph";
import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import type { FocusComparisonConfig } from "./types";
import "./FocusPro.css";

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
    <section className="fp-panel" aria-label={pick(language, "Comparaisons", "Comparisons")}>
      <header className="fp-sectionHeader">
        <div><span className="fp-eyebrow">+ COMPARE</span><h2>{pick(language, "Comparer jusqu’à 5 actifs", "Compare up to 5 assets")}</h2></div>
        <button className="fp-iconButton" type="button" onClick={onClose} aria-label={pick(language, "Fermer", "Close")}><FocusGlyph name="X" size={14} /></button>
      </header>
      <div className="fp-sectionBody">
        <div className="fp-inlineActions">
          <input className="fp-input" style={{ flex: 1 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} placeholder="RY, XIU, ^GSPTSE…" />
          <button className="fp-primaryButton" type="button" onClick={() => add()} disabled={comparisons.length >= 5}><FocusGlyph name="Plus" size={14} /></button>
        </div>
        <select className="fp-select" value={mode} onChange={(event) => setMode(event.target.value as FocusComparisonConfig["mode"])}>
          <option value="normalized_percent">{pick(language, "Normalisé · base 0 %", "Normalized · base 0%")}</option>
          <option value="price">{pick(language, "Prix", "Price")}</option>
        </select>
        <div className="fp-inlineActions">
          <button className="fp-button" type="button" onClick={() => add("XIU")}>TSX 60 · XIU</button>
          <button className="fp-button" type="button" onClick={() => add("^GSPTSE")}>TSX Composite</button>
        </div>
        <ul className="fp-list">
          {comparisons.map((item) => (
            <li className="fp-listItem" key={item.symbol}>
              <span><strong style={{ color: item.color }}>{item.symbol}</strong><small>{item.mode === "normalized_percent" ? "0 %" : pick(language, "Prix", "Price")}</small></span>
              <button className="fp-iconButton" type="button" onClick={() => onChange(comparisons.filter((candidate) => candidate.symbol !== item.symbol))} aria-label={pick(language, "Retirer", "Remove")}><FocusGlyph name="Trash2" size={13} /></button>
            </li>
          ))}
        </ul>
        <p className="fp-notice">{pick(language, "Les séries utilisent uniquement leurs timestamps communs. Aucun forward-fill n’est appliqué entre des séances incompatibles.", "Series use only shared timestamps. No forward fill is applied across incompatible sessions.")}</p>
      </div>
    </section>
  );
}
