"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { analyzePortfolio } from "@/lib/api";
import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  PortfolioPositionInput,
  PortfolioSnapshot,
} from "@/lib/types";
import {
  WORKSPACE_SYNC_EVENT,
  readLocalWorkspace,
} from "@/lib/workspace-sync";
import { PortfolioIntelligence } from "@/components/workspace/PortfolioIntelligence";

import styles from "./InstitutionalRiskCenter.module.css";

type LoadState = "idle" | "loading" | "partial" | "ready" | "error";

function fmt(
  value: number | null | undefined,
  language: AnatoleLanguage,
  suffix = "",
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) {
    return pick(language, "N/D", "N/A");
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function riskLabel(
  value: NonNullable<PortfolioSnapshot["risk"]>["risk_level"],
  language: AnatoleLanguage,
): string {
  if (!value) return pick(language, "N/D", "N/A");
  if (language === "fr") return value;
  return ({
    Faible: "Low",
    Modéré: "Moderate",
    Élevé: "High",
    "Très élevé": "Very high",
  } as Record<string, string>)[value] ?? value;
}

export function InstitutionalRiskCenter() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [positions, setPositions] = useState<PortfolioPositionInput[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reload = () => setPositions(readLocalWorkspace().data.portfolio);
    const timer = window.setTimeout(reload, 0);
    window.addEventListener(WORKSPACE_SYNC_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(WORKSPACE_SYNC_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (!positions.length) {
        setSnapshot(null);
        setState("ready");
        setError(null);
        return;
      }

      setState("loading");
      setError(null);

      try {
        const fast = await analyzePortfolio(positions, controller.signal, true);
        if (controller.signal.aborted) return;
        setSnapshot(fast);
        setState("partial");

        const full = await analyzePortfolio(positions, controller.signal);
        if (controller.signal.aborted) return;
        setSnapshot(full);
        setState("ready");
      } catch (reason) {
        if (controller.signal.aborted) return;
        setState((current) => (snapshot || current === "partial" ? "partial" : "error"));
        setError(
          reason instanceof Error
            ? reason.message
            : pick(
                language,
                "Analyse risque temporairement indisponible.",
                "Risk analysis is temporarily unavailable.",
              ),
        );
      }
    };

    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [language, positions]);

  const risk = snapshot?.risk ?? null;
  const metrics = [
    [pick(language, "NIVEAU", "LEVEL"), riskLabel(risk?.risk_level ?? null, language)],
    [pick(language, "VOLATILITÉ", "VOLATILITY"), fmt(risk?.volatility_percent, language, " %")],
    ["BETA", fmt(risk?.beta, language, "", 2)],
    [pick(language, "MAX DRAWDOWN", "MAX DRAWDOWN"), fmt(risk?.max_drawdown_percent, language, " %")],
    ["SHARPE", fmt(risk?.sharpe_ratio, language, "", 2)],
    [pick(language, "TOP POSITION", "TOP POSITION"), fmt(risk?.top_position_percent, language, " %")],
    [pick(language, "TOP 3", "TOP 3"), fmt(risk?.top_three_percent, language, " %")],
    [
      pick(language, "COUVERTURE", "COVERAGE"),
      fmt(risk?.history_coverage_percent, language, " %", 0),
    ],
  ];

  return (
    <section
      className={styles.shell}
      data-testid="institutional-risk-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel" className={styles.back}>
            ← {pick(language, "Command Center", "Command Center")}
          </Link>
          <span className={styles.kicker}>ANATOLE INSTITUTIONAL · RISK</span>
          <h1>Risk Center</h1>
          <p>
            {pick(
              language,
              "Volatilité, bêta, drawdown, concentration, corrélations et stress tests à partir des analytics portefeuille déjà vérifiées par Anatole. Toute métrique absente reste N/D.",
              "Volatility, beta, drawdown, concentration, correlations and stress tests from Anatole's existing verified portfolio analytics. Missing metrics remain N/A.",
            )}
          </p>
        </div>

        <div className={styles.state} aria-live="polite">
          <strong>
            {state === "loading"
              ? pick(language, "Analyse en cours", "Analyzing")
              : state === "partial"
                ? pick(language, "Analyse partielle", "Partial analysis")
                : state === "error"
                  ? pick(language, "Flux indisponible", "Feed unavailable")
                  : pick(language, "Analyse prête", "Analysis ready")}
          </strong>
          <span>
            {snapshot
              ? `${snapshot.positions.length} ${pick(language, "positions", "positions")}`
              : pick(language, "Aucun snapshot", "No snapshot")}
          </span>
        </div>
      </header>

      {!positions.length ? (
        <section className={styles.empty} data-testid="institutional-risk-empty">
          <div>
            <h2>
              {pick(
                language,
                "Le Risk Center a besoin d'un portefeuille.",
                "The Risk Center needs a portfolio.",
              )}
            </h2>
            <p>
              {pick(
                language,
                "Ajoute ou synchronise les positions dans Anatole; elles seront analysées ici sans duplication.",
                "Add or sync positions in Anatole; they will be analyzed here without duplication.",
              )}
            </p>
          </div>
          <Link href="/portefeuille">
            {pick(language, "Ouvrir Portefeuille", "Open Portfolio")} →
          </Link>
        </section>
      ) : null}

      <section
        className={styles.metrics}
        data-testid="institutional-risk-metrics"
      >
        {metrics.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      {error ? <div className={styles.notice}>{error}</div> : null}

      {snapshot ? (
        <div data-testid="institutional-risk-intelligence">
          <PortfolioIntelligence
            snapshot={snapshot}
            language={language}
            initialTab="risk"
          />
        </div>
      ) : null}

      <footer className={styles.footer}>
        <span>
          {pick(
            language,
            "VaR, crowding, budget de risque factoriel et liquidité institutionnelle restent séparés tant qu'Anatole ne dispose pas des entrées dédiées nécessaires.",
            "VaR, crowding, factor risk budgeting and institutional liquidity remain separate until Anatole has the dedicated inputs they require.",
          )}
        </span>
        <Link href="/portefeuille">
          {pick(language, "Gérer le portefeuille", "Manage portfolio")} →
        </Link>
      </footer>
    </section>
  );
}
