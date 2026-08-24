"use client";

import { Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import { INDICATOR_DEFINITIONS } from "./indicators/engine";
import type {
  FocusIndicatorConfig,
  IndicatorId,
  IndicatorInputValue,
} from "./types";
import styles from "./FocusPro.module.css";

export function FocusIndicatorPanel({
  indicators,
  language,
  onChange,
  onClose,
}: {
  indicators: FocusIndicatorConfig[];
  language: AnatoleLanguage;
  onChange: (items: FocusIndicatorConfig[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<IndicatorId>("ema");

  const add = () => {
    if (indicators.length >= 20) return;
    const definition = INDICATOR_DEFINITIONS.find((item) => item.id === selected);
    if (!definition) return;
    onChange([...indicators, {
      id: `${definition.id}-${Date.now()}`,
      definition_id: definition.id,
      inputs: { ...definition.inputs },
      colors: [...definition.colors],
      line_width: 2,
      visible: true,
    }]);
  };

  const update = (id: string, patch: Partial<FocusIndicatorConfig>) => {
    onChange(indicators.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const updateInput = (
    item: FocusIndicatorConfig,
    key: string,
    value: IndicatorInputValue,
  ) => update(item.id, { inputs: { ...item.inputs, [key]: value } });

  return (
    <section className={styles.panel} aria-label={pick(language, "Panneau des indicateurs", "Indicator panel")}>
      <header className={styles.sectionHeader}>
        <div><span className={styles.eyebrow}>INDICATOR ENGINE</span><h2>{pick(language, "Indicateurs", "Indicators")}</h2></div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label={pick(language, "Fermer", "Close")}><X size={14} /></button>
      </header>
      <div className={styles.sectionBody}>
        <div className={styles.inlineActions}>
          <select className={styles.select} style={{ flex: 1 }} value={selected} onChange={(event) => setSelected(event.target.value as IndicatorId)}>
            {INDICATOR_DEFINITIONS.map((definition) => (
              <option key={definition.id} value={definition.id}>{definition.name} · {definition.category}</option>
            ))}
          </select>
          <button className={styles.primaryButton} type="button" onClick={add} disabled={indicators.length >= 20}><Plus size={14} /> {pick(language, "Ajouter", "Add")}</button>
        </div>
        <span className={styles.muted}>{indicators.length}/20 · {pick(language, "calcul mémorisé par série, sans recalcul au tick", "memoized per series, no tick recalculation")}</span>
        <ul className={styles.list}>
          {indicators.map((item) => {
            const definition = INDICATOR_DEFINITIONS.find((candidate) => candidate.id === item.definition_id);
            if (!definition) return null;
            return (
              <li className={styles.listItem} key={item.id} style={{ display: "grid" }}>
                <div className={styles.between}>
                  <span><strong>{definition.name}</strong><small>{definition.pane === "main" ? pick(language, "Graphique principal", "Main chart") : pick(language, "Panneau séparé", "Separate pane")}</small></span>
                  <div className={styles.inlineActions}>
                    <button className={styles.iconButton} type="button" onClick={() => update(item.id, { visible: !item.visible })} aria-label={pick(language, "Visibilité", "Visibility")}>{item.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                    <button className={styles.iconButton} type="button" onClick={() => onChange(indicators.filter((candidate) => candidate.id !== item.id))} aria-label={pick(language, "Supprimer", "Delete")}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className={styles.inlineActions} style={{ flexWrap: "wrap" }}>
                  {Object.entries(item.inputs).map(([key, value]) => (
                    <label className={styles.field} key={key} style={{ minWidth: 72, flex: 1 }}>
                      {key}
                      {key === "source" ? (
                        <select className={styles.select} value={String(value)} onChange={(event) => updateInput(item, key, event.target.value)}>
                          {['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].map((source) => <option key={source}>{source}</option>)}
                        </select>
                      ) : (
                        <input className={styles.input} type="number" step="any" value={String(value)} onChange={(event) => updateInput(item, key, Number(event.target.value))} />
                      )}
                    </label>
                  ))}
                </div>
                <div className={styles.inlineActions}>
                  <label className={styles.field}>{pick(language, "Couleur", "Color")}<input type="color" value={item.colors[0] ?? definition.colors[0]} onChange={(event) => update(item.id, { colors: [event.target.value, ...item.colors.slice(1)] })} /></label>
                  <label className={styles.field}>{pick(language, "Épaisseur", "Width")}<input className={styles.input} type="number" min={1} max={4} value={item.line_width} onChange={(event) => update(item.id, { line_width: Number(event.target.value) })} /></label>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
