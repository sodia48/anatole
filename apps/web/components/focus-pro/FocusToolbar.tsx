"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import type { FocusChartType, FocusTimeframe } from "./types";
import { TIMEFRAMES } from "./types";
import { FocusGlyph } from "./FocusGlyph";
import "./FocusPro.css";

const CHART_TYPES: Array<{
  id: FocusChartType;
  label: readonly [string, string];
}> = [
  { id: "candles", label: ["Bougies", "Candles"] },
  { id: "bars", label: ["Barres", "Bars"] },
  { id: "line", label: ["Ligne", "Line"] },
  { id: "area", label: ["Aire", "Area"] },
  { id: "heikin_ashi", label: ["Heikin Ashi", "Heikin Ashi"] },
];

export function FocusToolbar({
  ticker,
  timeframe,
  chartType,
  language,
  onTimeframe,
  onChartType,
  onToggleIndicators,
  onToggleCompare,
  onCreateAlert,
  onToggleLayouts,
  onToggleStrategy,
  onTogglePaper,
  onSaveLayout,
}: {
  ticker: string;
  timeframe: FocusTimeframe;
  chartType: FocusChartType;
  language: AnatoleLanguage;
  onTimeframe: (value: FocusTimeframe) => void;
  onChartType: (value: FocusChartType) => void;
  onToggleIndicators: () => void;
  onToggleCompare: () => void;
  onCreateAlert: () => void;
  onToggleLayouts: () => void;
  onToggleStrategy: () => void;
  onTogglePaper: () => void;
  onSaveLayout: () => void;
}) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(ticker.replace(/\.TO$/, ""));

  const navigate = () => {
    const clean = symbol.trim().toUpperCase().replace(/\.TO$/, "");
    if (clean) router.push(`/focus/${encodeURIComponent(clean)}`);
  };

  const fullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  };

  return (
    <nav className="fp-toolbar" aria-label="Focus Pro toolbar">
      <div className="fp-toolbarGroup">
        <FocusGlyph name="ChartNoAxesCombined" size={17} color="#65b8f5" />
        <input
          className="fp-tickerInput"
          aria-label={pick(language, "Symbole", "Ticker")}
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") navigate();
          }}
          onBlur={navigate}
        />
      </div>
      <div className="fp-toolbarGroup">
        <select
          className="fp-select"
          aria-label={pick(language, "Unité de temps", "Timeframe")}
          value={timeframe}
          onChange={(event) => onTimeframe(event.target.value as FocusTimeframe)}
        >
          {TIMEFRAMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select
          className="fp-select"
          aria-label={pick(language, "Type de graphique", "Chart type")}
          value={chartType}
          onChange={(event) => onChartType(event.target.value as FocusChartType)}
        >
          {CHART_TYPES.map((item) => (
            <option key={item.id} value={item.id}>{pick(language, item.label[0], item.label[1])}</option>
          ))}
        </select>
      </div>
      <div className="fp-toolbarActions">
        <button className="fp-button" type="button" onClick={onToggleIndicators}>
          <FocusGlyph name="Layers3" /> {pick(language, "Indicateurs", "Indicators")}
        </button>
        <button className="fp-button" type="button" onClick={onToggleCompare}>
          <FocusGlyph name="Columns3" /> {pick(language, "Comparer", "Compare")}
        </button>
        <button className="fp-button" type="button" onClick={onCreateAlert}>
          <FocusGlyph name="BellPlus" /> {pick(language, "Alerte", "Alert")}
        </button>
        <button className="fp-button" type="button" onClick={onToggleLayouts}>
          <FocusGlyph name="Save" /> Layout
        </button>
        <button className="fp-button" type="button" onClick={onToggleStrategy}>
          <FocusGlyph name="FlaskConical" /> Strategy
        </button>
        <button className="fp-button" type="button" onClick={onTogglePaper}>
          <FocusGlyph name="WalletCards" /> PAPER
        </button>
        <button className="fp-iconButton" type="button" onClick={onSaveLayout} aria-label={pick(language, "Sauvegarder le layout", "Save layout")}>
          <FocusGlyph name="Save" />
        </button>
        <button className="fp-iconButton" type="button" onClick={fullscreen} aria-label={pick(language, "Plein écran", "Fullscreen")}>
          <FocusGlyph name="Expand" />
        </button>
      </div>
    </nav>
  );
}
