"use client";

import { Plus, Trash2, X } from "lucide-react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import type { FocusLayout } from "./types";
import styles from "./FocusPro.module.css";

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
  return <section className={styles.panel} aria-label="Focus layouts">
    <header className={styles.sectionHeader}><div><span className={styles.eyebrow}>LAYOUTS</span><h2>{pick(language, "Espaces synchronisés", "Synced workspaces")}</h2></div><button className={styles.iconButton} type="button" onClick={onClose}><X size={14} /></button></header>
    <div className={styles.sectionBody}>
      <button className={styles.button} type="button" onClick={onCreate} disabled={layouts.length >= 10}><Plus size={14} />{pick(language, "Nouveau layout", "New layout")}</button>
      <ul className={styles.list}>{layouts.map((item) => <li className={styles.listItem} key={item.id}><button className={`${styles.button} ${item.id === currentId ? styles.buttonActive : ""}`} type="button" onClick={() => onLoad(item)}><span><strong>{item.name}</strong><small>{item.ticker} · {item.timeframe} · {item.drawings.length} drawings</small></span></button><button className={styles.iconButton} type="button" onClick={() => onDelete(item.id)} aria-label={pick(language, "Supprimer", "Delete")}><Trash2 size={13} /></button></li>)}</ul>
      <p className={styles.notice}>{pick(language, "Maximum 10 layouts, 50 dessins et 20 indicateurs par layout. La synchronisation multi-appareils utilise le compte Anatole.", "Maximum 10 layouts, 50 drawings and 20 indicators per layout. Multi-device sync uses the Anatole account.")}</p>
    </div>
  </section>;
}
