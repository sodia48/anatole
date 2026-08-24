"use client";

import {
  CalendarDays,
  Columns3,
  Copy,
  EyeOff,
  Lock,
  Minus,
  MousePointer2,
  MoveRight,
  Percent,
  Redo2,
  Ruler,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
} from "lucide-react";
import type { ComponentType } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import type {
  DrawingTool,
  FocusDrawing,
  SnapMode,
} from "./types";
import styles from "./FocusPro.module.css";

type DrawingToolDefinition = {
  id: DrawingTool;
  label: readonly [string, string];
  icon: ComponentType<{ size?: number }>;
};

const TOOLS: readonly DrawingToolDefinition[] = [
  { id: "cursor", label: ["Curseur", "Cursor"], icon: MousePointer2 },
  { id: "trendline", label: ["Tendance", "Trend line"], icon: TrendingUp },
  { id: "horizontal_line", label: ["Horizontale", "Horizontal line"], icon: Minus },
  { id: "vertical_line", label: ["Verticale", "Vertical line"], icon: Columns3 },
  { id: "ray", label: ["Rayon", "Ray"], icon: MoveRight },
  { id: "rectangle", label: ["Rectangle", "Rectangle"], icon: Square },
  { id: "parallel_channel", label: ["Canal parallèle", "Parallel channel"], icon: Columns3 },
  { id: "fib_retracement", label: ["Retracement Fibonacci", "Fibonacci retracement"], icon: Percent },
  { id: "fib_extension", label: ["Extension Fibonacci", "Fibonacci extension"], icon: TrendingUp },
  { id: "price_range", label: ["Plage de prix", "Price range"], icon: Ruler },
  { id: "date_range", label: ["Plage de dates", "Date range"], icon: CalendarDays },
  { id: "text", label: ["Texte", "Text"], icon: Type },
] as const;

export function FocusDrawingToolbar({
  activeTool,
  snapMode,
  drawingsCount,
  selected,
  canUndo,
  canRedo,
  language,
  onTool,
  onSnap,
  onUndo,
  onRedo,
  onDuplicate,
  onToggleLock,
  onToggleHidden,
  onDelete,
  onFibLevels,
  onText,
}: {
  activeTool: DrawingTool;
  snapMode: SnapMode;
  drawingsCount: number;
  selected: FocusDrawing | null;
  canUndo: boolean;
  canRedo: boolean;
  language: AnatoleLanguage;
  onTool: (tool: DrawingTool) => void;
  onSnap: (mode: SnapMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onFibLevels: (levels: number[]) => void;
  onText: (text: string) => void;
}) {
  return (
    <aside className={styles.drawingToolbar} aria-label={pick(language, "Outils de dessin", "Drawing tools")}>
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.id}
            type="button"
            className={`${styles.iconButton} ${activeTool === tool.id ? styles.buttonActive : ""}`}
            aria-label={pick(language, tool.label[0], tool.label[1])}
            aria-pressed={activeTool === tool.id}
            title={pick(language, tool.label[0], tool.label[1])}
            onClick={() => onTool(tool.id)}
          >
            <Icon size={15} />
          </button>
        );
      })}
      <div className={styles.drawingDivider} />
      <select
        className={styles.select}
        style={{ minWidth: 34, width: 34, padding: 2 }}
        aria-label="Snap"
        title="Snap"
        value={snapMode}
        onChange={(event) => onSnap(event.target.value as SnapMode)}
      >
        <option value="none">∅</option>
        <option value="ohlc">O</option>
        <option value="high_low">H/L</option>
      </select>
      <button className={styles.iconButton} type="button" onClick={onUndo} disabled={!canUndo} aria-label={pick(language, "Annuler", "Undo")}><Undo2 size={14} /></button>
      <button className={styles.iconButton} type="button" onClick={onRedo} disabled={!canRedo} aria-label={pick(language, "Rétablir", "Redo")}><Redo2 size={14} /></button>
      <button className={styles.iconButton} type="button" onClick={onDuplicate} disabled={!selected} aria-label={pick(language, "Dupliquer", "Duplicate")}><Copy size={14} /></button>
      <button className={`${styles.iconButton} ${selected?.locked ? styles.buttonActive : ""}`} type="button" onClick={onToggleLock} disabled={!selected} aria-label={pick(language, "Verrouiller", "Lock")}><Lock size={14} /></button>
      <button className={`${styles.iconButton} ${selected?.hidden ? styles.buttonActive : ""}`} type="button" onClick={onToggleHidden} disabled={!selected} aria-label={pick(language, "Masquer", "Hide")}><EyeOff size={14} /></button>
      <button className={styles.iconButton} type="button" onClick={onDelete} disabled={!selected} aria-label={pick(language, "Supprimer", "Delete")}><Trash2 size={14} /></button>
      <span className={styles.drawingCount}>{drawingsCount}/50</span>
      {selected?.tool.startsWith("fib_") ? (
        <input
          key={selected.id}
          className={styles.input}
          style={{ width: 38, padding: 3, fontSize: 8 }}
          defaultValue={selected.fib_levels.join(",")}
          title={pick(language, "Niveaux Fibonacci séparés par des virgules", "Comma-separated Fibonacci levels")}
          aria-label={pick(language, "Niveaux Fibonacci", "Fibonacci levels")}
          onBlur={(event) => {
            const levels = event.target.value.split(",")
              .map((value) => Number(value.trim()))
              .filter((value) => Number.isFinite(value) && value >= -10 && value <= 10)
              .slice(0, 16);
            if (levels.length) onFibLevels(levels);
          }}
        />
      ) : null}
      {selected?.tool === "text" ? (
        <input
          key={selected.id}
          className={styles.input}
          style={{ width: 38, padding: 3, fontSize: 8 }}
          defaultValue={selected.text ?? ""}
          aria-label={pick(language, "Texte du dessin", "Drawing text")}
          onBlur={(event) => onText(event.target.value.slice(0, 200))}
        />
      ) : null}
    </aside>
  );
}
