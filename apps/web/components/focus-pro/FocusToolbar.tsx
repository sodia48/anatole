"use client";

import {
  BellPlus,
  ChartNoAxesCombined,
  Columns3,
  Expand,
  Layers3,
  FlaskConical,
  WalletCards,
  Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import type { FocusChartType, FocusTimeframe } from "./types";
import { TIMEFRAMES } from "./types";
import styles from "./FocusPro.module.css";

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
    <nav className={styles.toolbar} aria-label="Focus Pro toolbar">
      <div className={styles.toolbarGroup}>
        <ChartNoAxesCombined size={17} color="#65b8f5" aria-hidden="true" />
        <input
          className={styles.tickerInput}
          aria-label={pick(language, "Symbole", "Ticker")}
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") navigate();
          }}
          onBlur={navigate}
        />
      </div>
      <div className={styles.toolbarGroup}>
        <select
          className={styles.select}
          aria-label={pick(language, "Unité de temps", "Timeframe")}
          value={timeframe}
          onChange={(event) => onTimeframe(event.target.value as FocusTimeframe)}
        >
          {TIMEFRAMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select
          className={styles.select}
          aria-label={pick(language, "Type de graphique", "Chart type")}
          value={chartType}
          onChange={(event) => onChartType(event.target.value as FocusChartType)}
        >
          {CHART_TYPES.map((item) => (
            <option key={item.id} value={item.id}>{pick(language, item.label[0], item.label[1])}</option>
          ))}
        </select>
      </div>
      <div className={styles.toolbarActions}>
        <button className={styles.button} type="button" onClick={onToggleIndicators}>
          <Layers3 size={14} /> {pick(language, "Indicateurs", "Indicators")}
        </button>
        <button className={styles.button} type="button" onClick={onToggleCompare}>
          <Columns3 size={14} /> {pick(language, "Comparer", "Compare")}
        </button>
        <button className={styles.button} type="button" onClick={onCreateAlert}>
          <BellPlus size={14} /> {pick(language, "Alerte", "Alert")}
        </button>
        <button className={styles.button} type="button" onClick={onToggleLayouts}>
          <Save size={14} /> Layout
        </button>
        <button className={styles.button} type="button" onClick={onToggleStrategy}>
          <FlaskConical size={14} /> Strategy
        </button>
        <button className={styles.button} type="button" onClick={onTogglePaper}>
          <WalletCards size={14} /> PAPER
        </button>
        <button className={styles.iconButton} type="button" onClick={onSaveLayout} aria-label={pick(language, "Sauvegarder le layout", "Save layout")}>
          <Save size={14} />
        </button>
        <button className={styles.iconButton} type="button" onClick={fullscreen} aria-label={pick(language, "Plein écran", "Fullscreen")}>
          <Expand size={14} />
        </button>
      </div>
    </nav>
  );
}
