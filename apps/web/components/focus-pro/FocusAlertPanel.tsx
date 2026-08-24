"use client";

import { BellPlus, X } from "lucide-react";
import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { AlertRule, AlertType } from "@/lib/types";

import type { FocusDrawing } from "./types";
import styles from "./FocusPro.module.css";

export function FocusAlertPanel({
  ticker,
  price,
  drawings,
  language,
  onSave,
  onClose,
}: {
  ticker: string;
  price: number;
  drawings: FocusDrawing[];
  language: AnatoleLanguage;
  onSave: (rule: AlertRule) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<AlertType>("price_level");
  const [threshold, setThreshold] = useState(price);
  const [operator, setOperator] = useState<"above" | "below">("above");
  const [primary, setPrimary] = useState("rsi");
  const [comparison, setComparison] = useState("ema");
  const [drawingId, setDrawingId] = useState(drawings[0]?.id ?? "");
  const [strategy, setStrategy] = useState("sma_crossover");
  const save = () => {
    const drawing = drawings.find((item) => item.id === drawingId);
    onSave({
      id: crypto.randomUUID(),
      symbol: ticker,
      metric: "price",
      operator,
      threshold,
      enabled: true,
      alert_type: type,
      indicator_id: primary,
      indicator_output: "value",
      indicator_inputs: primary === "rsi" ? { period: 14 } : { period: 20 },
      comparison_indicator_id: comparison,
      comparison_indicator_output: "value",
      comparison_indicator_inputs: { period: 50 },
      drawing_points: drawing?.anchors.slice(0, 2) ?? [],
      strategy_id: strategy,
      strategy_parameters: { fast: 20, slow: 50 },
      strategy_signal: "buy",
      label: `Focus Pro · ${type}`,
    });
  };
  return (
    <section className={styles.panel} aria-label="Focus alert builder">
      <header className={styles.sectionHeader}><div><span className={styles.eyebrow}>ALERTS</span><h2>{pick(language, "Créer une alerte avancée", "Create an advanced alert")}</h2></div><button className={styles.iconButton} type="button" onClick={onClose}><X size={14} /></button></header>
      <div className={styles.sectionBody}>
        <label className={styles.field}>{pick(language, "Type", "Type")}<select className={styles.select} value={type} onChange={(event) => setType(event.target.value as AlertType)}><option value="price_level">{pick(language, "Niveau de prix", "Price level")}</option><option value="indicator_threshold">{pick(language, "Seuil d’indicateur", "Indicator threshold")}</option><option value="indicator_cross">{pick(language, "Croisement d’indicateurs", "Indicator cross")}</option><option value="drawing_break">{pick(language, "Cassure de dessin", "Drawing break")}</option><option value="strategy_signal">{pick(language, "Signal de stratégie", "Strategy signal")}</option></select></label>
        <div className={styles.inlineActions}><select className={styles.select} value={operator} onChange={(event) => setOperator(event.target.value as "above" | "below")}><option value="above">{pick(language, "Au-dessus", "Above")}</option><option value="below">{pick(language, "Sous", "Below")}</option></select>{type === "price_level" || type === "indicator_threshold" ? <input className={styles.input} type="number" step="0.01" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /> : null}</div>
        {type === "indicator_threshold" || type === "indicator_cross" ? <label className={styles.field}>{pick(language, "Indicateur principal", "Primary indicator")}<select className={styles.select} value={primary} onChange={(event) => setPrimary(event.target.value)}><option value="rsi">RSI 14</option><option value="sma">SMA 20</option><option value="ema">EMA 20</option><option value="macd">MACD</option></select></label> : null}
        {type === "indicator_cross" ? <label className={styles.field}>{pick(language, "Indicateur comparé", "Compared indicator")}<select className={styles.select} value={comparison} onChange={(event) => setComparison(event.target.value)}><option value="ema">EMA 50</option><option value="sma">SMA 50</option></select></label> : null}
        {type === "drawing_break" ? <label className={styles.field}>{pick(language, "Dessin", "Drawing")}<select className={styles.select} value={drawingId} onChange={(event) => setDrawingId(event.target.value)}><option value="">—</option>{drawings.filter((item) => item.anchors.length > 0).map((item) => <option key={item.id} value={item.id}>{item.tool} · {item.id.slice(0, 6)}</option>)}</select></label> : null}
        {type === "strategy_signal" ? <label className={styles.field}>{pick(language, "Stratégie", "Strategy")}<select className={styles.select} value={strategy} onChange={(event) => setStrategy(event.target.value)}><option value="sma_crossover">SMA crossover</option><option value="ema_crossover">EMA crossover</option><option value="rsi_mean_reversion">RSI mean reversion</option><option value="macd_crossover">MACD crossover</option><option value="bollinger_breakout">Bollinger breakout</option><option value="donchian_breakout">Donchian breakout</option></select></label> : null}
        <button className={styles.primaryButton} type="button" onClick={save} disabled={type === "drawing_break" && !drawingId}><BellPlus size={14} />{pick(language, "Ajouter aux alertes", "Add to alerts")}</button>
        <p className={styles.muted}>{pick(language, "La règle est synchronisée avec l’espace de travail et évaluée par le moteur de notifications existant.", "The rule syncs with the workspace and is evaluated by the existing notification engine.")}</p>
      </div>
    </section>
  );
}
