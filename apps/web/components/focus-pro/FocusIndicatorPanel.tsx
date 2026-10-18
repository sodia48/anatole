"use client";

import { FocusGlyph } from "./FocusGlyph";
import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import { INDICATOR_DEFINITIONS } from "./indicators/engine";
import type {
  FocusIndicatorConfig,
  IndicatorId,
  IndicatorInputValue,
} from "./types";
import "./FocusPro.css";

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
    <section className="fp-panel" aria-label={pick(language, "Panneau des indicateurs", "Indicator panel")}>
      <header className="fp-sectionHeader">
        <div><span className="fp-eyebrow">INDICATOR ENGINE</span><h2>{pick(language, "Indicateurs", "Indicators")}</h2></div>
        <button type="button" className="fp-iconButton" onClick={onClose} aria-label={pick(language, "Fermer", "Close")}><FocusGlyph name="X" size={14} /></button>
      </header>
      <div className="fp-sectionBody">
        <div className="fp-inlineActions">
          <select className="fp-select" style={{ flex: 1 }} value={selected} onChange={(event) => setSelected(event.target.value as IndicatorId)}>
            {INDICATOR_DEFINITIONS.map((definition) => (
              <option key={definition.id} value={definition.id}>{definition.name} · {definition.category}</option>
            ))}
          </select>
          <button className="fp-primaryButton" type="button" onClick={add} disabled={indicators.length >= 20}><FocusGlyph name="Plus" size={14} /> {pick(language, "Ajouter", "Add")}</button>
        </div>
        <span className="fp-muted">{indicators.length}/20 · {pick(language, "calcul mémorisé par série, sans recalcul au tick", "memoized per series, no tick recalculation")}</span>
        <ul className="fp-list">
          {indicators.map((item) => {
            const definition = INDICATOR_DEFINITIONS.find((candidate) => candidate.id === item.definition_id);
            if (!definition) return null;
            return (
              <li className="fp-listItem" key={item.id} style={{ display: "grid" }}>
                <div className="fp-between">
                  <span><strong>{definition.name}</strong><small>{definition.pane === "main" ? pick(language, "Graphique principal", "Main chart") : pick(language, "Panneau séparé", "Separate pane")}</small></span>
                  <div className="fp-inlineActions">
                    <button className="fp-iconButton" type="button" onClick={() => update(item.id, { visible: !item.visible })} aria-label={pick(language, "Visibilité", "Visibility")}>{item.visible ? <FocusGlyph name="Eye" size={13} /> : <FocusGlyph name="EyeOff" size={13} />}</button>
                    <button className="fp-iconButton" type="button" onClick={() => onChange(indicators.filter((candidate) => candidate.id !== item.id))} aria-label={pick(language, "Supprimer", "Delete")}><FocusGlyph name="Trash2" size={13} /></button>
                  </div>
                </div>
                <div className="fp-inlineActions" style={{ flexWrap: "wrap" }}>
                  {Object.entries(item.inputs).map(([key, value]) => (
                    <label className="fp-field" key={key} style={{ minWidth: 72, flex: 1 }}>
                      {key}
                      {key === "source" ? (
                        <select className="fp-select" value={String(value)} onChange={(event) => updateInput(item, key, event.target.value)}>
                          {['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].map((source) => <option key={source}>{source}</option>)}
                        </select>
                      ) : (
                        <input className="fp-input" type="number" step="any" value={String(value)} onChange={(event) => updateInput(item, key, Number(event.target.value))} />
                      )}
                    </label>
                  ))}
                </div>
                <div className="fp-inlineActions">
                  <label className="fp-field">{pick(language, "Couleur", "Color")}<input type="color" value={item.colors[0] ?? definition.colors[0]} onChange={(event) => update(item.id, { colors: [event.target.value, ...item.colors.slice(1)] })} /></label>
                  <label className="fp-field">{pick(language, "Épaisseur", "Width")}<input className="fp-input" type="number" min={1} max={4} value={item.line_width} onChange={(event) => update(item.id, { line_width: Number(event.target.value) })} /></label>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
