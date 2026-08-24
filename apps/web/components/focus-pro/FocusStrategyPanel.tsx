"use client";

import { Play, Save, ShieldCheck, X } from "lucide-react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  AnatoleScriptValidation,
  BacktestStrategy,
} from "@/lib/types";

import type { FocusScript } from "./types";
import styles from "./FocusPro.module.css";

const STRATEGIES: Array<{ id: BacktestStrategy; fr: string; en: string }> = [
  { id: "sma_crossover", fr: "Croisement SMA", en: "SMA crossover" },
  { id: "ema_crossover", fr: "Croisement EMA", en: "EMA crossover" },
  { id: "rsi_mean_reversion", fr: "Retour à la moyenne RSI", en: "RSI mean reversion" },
  { id: "macd_crossover", fr: "Croisement MACD", en: "MACD crossover" },
  { id: "bollinger_breakout", fr: "Cassure Bollinger", en: "Bollinger breakout" },
  { id: "donchian_breakout", fr: "Cassure Donchian", en: "Donchian breakout" },
  { id: "anatole_script", fr: "Anatole Script", en: "Anatole Script" },
];

export const DEFAULT_ANATOLE_SCRIPT = `strategy "SMA 20/50"
fast = sma(close, 20)
slow = sma(close, 50)
enter_long(crossover(fast, slow))
exit_long(crossunder(fast, slow))
plot(fast)
plot(slow)`;

export function FocusStrategyPanel({
  language,
  strategy,
  parameters,
  script,
  scripts,
  validation,
  validating,
  onStrategy,
  onParameters,
  onScript,
  onValidate,
  onSaveScript,
  onLoadScript,
  onRun,
  onClose,
}: {
  language: AnatoleLanguage;
  strategy: BacktestStrategy;
  parameters: Record<string, number | string>;
  script: string;
  scripts: FocusScript[];
  validation: AnatoleScriptValidation | null;
  validating: boolean;
  onStrategy: (strategy: BacktestStrategy) => void;
  onParameters: (parameters: Record<string, number | string>) => void;
  onScript: (source: string) => void;
  onValidate: () => void;
  onSaveScript: () => void;
  onLoadScript: (script: FocusScript) => void;
  onRun: () => void;
  onClose: () => void;
}) {
  const updateNumber = (key: string, fallback: number) => (value: string) => {
    const parsed = Number(value);
    onParameters({ ...parameters, [key]: Number.isFinite(parsed) ? parsed : fallback });
  };
  return (
    <section className={styles.panel} aria-label="Strategy Lab">
      <header className={styles.sectionHeader}>
        <div><span className={styles.eyebrow}>STRATEGY LAB</span><h2>{pick(language, "Stratégies et Anatole Script", "Strategies and Anatole Script")}</h2></div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label={pick(language, "Fermer", "Close")}><X size={14} /></button>
      </header>
      <div className={styles.sectionBody}>
        <label className={styles.field}>{pick(language, "Stratégie", "Strategy")}
          <select className={styles.select} value={strategy} onChange={(event) => onStrategy(event.target.value as BacktestStrategy)}>
            {STRATEGIES.map((item) => <option key={item.id} value={item.id}>{pick(language, item.fr, item.en)}</option>)}
          </select>
        </label>
        {strategy !== "anatole_script" ? (
          <div className={styles.inlineActions}>
            <label className={styles.field}>{pick(language, "Période rapide", "Fast period")}<input className={styles.input} type="number" min="1" max="500" value={Number(parameters.fast ?? 20)} onChange={(event) => updateNumber("fast", 20)(event.target.value)} /></label>
            <label className={styles.field}>{pick(language, "Période lente", "Slow period")}<input className={styles.input} type="number" min="2" max="500" value={Number(parameters.slow ?? 50)} onChange={(event) => updateNumber("slow", 50)(event.target.value)} /></label>
          </div>
        ) : (
          <>
            <textarea className={styles.textarea} spellCheck={false} value={script} onChange={(event) => onScript(event.target.value)} aria-label="Anatole Script editor" />
            <div className={styles.inlineActions}>
              <button className={styles.button} type="button" onClick={onValidate} disabled={validating}><ShieldCheck size={14} />{validating ? "…" : pick(language, "Valider", "Validate")}</button>
              <button className={styles.button} type="button" onClick={onSaveScript}><Save size={14} />{pick(language, "Sauver", "Save")}</button>
            </div>
            {validation ? (
              <div className={validation.valid ? styles.successNotice : styles.errorNotice} role="status">
                {validation.valid
                  ? `${pick(language, "Script sûr", "Safe script")} · ${validation.statements_count} statements · ${validation.indicators_count} indicators`
                  : validation.diagnostics.map((item) => `L${item.line}:${item.column} ${item.message}`).join(" · ")}
              </div>
            ) : null}
            {scripts.length ? (
              <label className={styles.field}>{pick(language, "Scripts sauvegardés", "Saved scripts")}
                <select className={styles.select} defaultValue="" onChange={(event) => {
                  const selected = scripts.find((item) => item.id === event.target.value);
                  if (selected) onLoadScript(selected);
                }}><option value="">—</option>{scripts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </label>
            ) : null}
            <p className={styles.notice}>{pick(language, "Interpréteur AST borné : aucun eval, import, accès réseau, fichier ou code utilisateur natif.", "Bounded AST interpreter: no eval, imports, network, file access, or native user code.")}</p>
          </>
        )}
        <button className={styles.primaryButton} type="button" onClick={onRun}><Play size={14} />{pick(language, "Lancer le backtest", "Run backtest")}</button>
      </div>
    </section>
  );
}
