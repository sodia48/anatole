"use client";

import { useSyncExternalStore } from "react";
import { pick } from "@/lib/i18n";
import styles from "./FocusViewMode.module.css";

export type FocusMode = "table" | "cards" | "charts";
type Language = "fr" | "en";
const current = new Map<string, FocusMode>();
const mobile = "(max-width: 700px)";

export function useFocusMode(key: string, modes: readonly FocusMode[]) {
  const event = `anatole-focus-view:${key}`;
  const read = () => {
    const cached = current.get(key);
    if (cached && modes.includes(cached)) return cached;
    try {
      const saved = window.localStorage.getItem(key) as FocusMode | null;
      if (saved && modes.includes(saved)) return saved;
    } catch { /* Local storage is optional. */ }
    return window.matchMedia(mobile).matches && modes.includes("cards") ? "cards" : modes[0];
  };
  const subscribe = (notify: () => void) => {
    const media = window.matchMedia(mobile);
    const onStorage = (change: StorageEvent) => {
      if (change.key !== key) return;
      if (change.newValue && modes.includes(change.newValue as FocusMode))
        current.set(key, change.newValue as FocusMode);
      else current.delete(key);
      notify();
    };
    window.addEventListener(event, notify);
    window.addEventListener("storage", onStorage);
    media.addEventListener("change", notify);
    return () => {
      window.removeEventListener(event, notify);
      window.removeEventListener("storage", onStorage);
      media.removeEventListener("change", notify);
    };
  };
  const mode = useSyncExternalStore(subscribe, read, () => modes[0]);
  const choose = (next: FocusMode) => {
    if (!modes.includes(next)) return;
    current.set(key, next);
    try { window.localStorage.setItem(key, next); } catch { /* Local storage is optional. */ }
    window.dispatchEvent(new Event(event));
  };
  return [mode, choose] as const;
}

export function FocusViewMode({ mode, choose, modes, language, label }: {
  mode: FocusMode; choose: (mode: FocusMode) => void; modes: readonly FocusMode[];
  language: Language; label: string;
}) {
  const titles = {
    table: pick(language, "Vue tableau", "Table view"),
    cards: pick(language, "Vue cartes", "Card view"),
    charts: pick(language, "Vue graphiques", "Chart view"),
  };
  return <div className={styles.switch} role="group" aria-label={label}>
    {modes.map(value => <button key={value} type="button" aria-pressed={mode === value}
      onClick={() => choose(value)}>{titles[value]}</button>)}
  </div>;
}
