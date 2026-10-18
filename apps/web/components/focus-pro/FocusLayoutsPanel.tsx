"use client";

import { FocusGlyph } from "./FocusGlyph";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import type { FocusLayout } from "./types";
import "./FocusPro.css";

export function FocusLayoutsPanel({
  language,
  layouts,
  currentId,
  onLoad,
  onCreate,
  onDelete,
  onClose,
}: {
  language: AnatoleLanguage;
  layouts: FocusLayout[];
  currentId: string;
  onLoad: (layout: FocusLayout) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return <section className="fp-panel" aria-label="Focus layouts">
    <header className="fp-sectionHeader"><div><span className="fp-eyebrow">LAYOUTS</span><h2>{pick(language, "Espaces synchronisés", "Synced workspaces")}</h2></div><button className="fp-iconButton" type="button" onClick={onClose}><FocusGlyph name="X" size={14} /></button></header>
    <div className="fp-sectionBody">
      <button className="fp-button" type="button" onClick={onCreate} disabled={layouts.length >= 10}><FocusGlyph name="Plus" size={14} />{pick(language, "Nouveau layout", "New layout")}</button>
      <ul className="fp-list">{layouts.map((item) => <li className="fp-listItem" key={item.id}><button className={`fp-button ${item.id === currentId ? "fp-buttonActive" : ""}`} type="button" onClick={() => onLoad(item)}><span><strong>{item.name}</strong><small>{item.ticker} · {item.timeframe} · {item.drawings.length} drawings</small></span></button><button className="fp-iconButton" type="button" onClick={() => onDelete(item.id)} aria-label={pick(language, "Supprimer", "Delete")}><FocusGlyph name="Trash2" size={13} /></button></li>)}</ul>
      <p className="fp-notice">{pick(language, "Maximum 10 layouts, 50 dessins et 20 indicateurs par layout. La synchronisation multi-appareils utilise le compte Anatole.", "Maximum 10 layouts, 50 drawings and 20 indicators per layout. Multi-device sync uses the Anatole account.")}</p>
    </div>
  </section>;
}
