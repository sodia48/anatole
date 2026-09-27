"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Target,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { analyzePortfolio } from "@/lib/api";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  PortfolioPositionInput,
  PortfolioSnapshot,
} from "@/lib/types";
import {
  WORKSPACE_SYNC_EVENT,
  readLocalWorkspace,
} from "@/lib/workspace-sync";

import styles from "./InstitutionalRiskCenter.module.css";

type LoadState = "idle" | "loading" | "partial" | "ready" | "error";

function percent(
  value: number | null | undefined,
  language: AnatoleLanguage,
  digits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return pick(language, "N/D", "N/A");
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} %`;
}

function numberValue(
  value: number | null | undefined,
  language: AnatoleLanguage,
  digits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return pick(language, "N/D", "N/A");
  }
  return value.toFixed(digits);
}

function timestamp(
  value: string | null | undefined,
  language: AnatoleLanguage,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(localeFor(language), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function shockLabel(
  shock: number,
  unit: "percent" | "basis_points",
): string {
  if (unit === "basis_points") {
    const sign = shock > 0 ? "+" : "";
    return `${sign}${shock.toFixed(0)} bps`;
  }

  const sign = shock > 0 ? "+" : "";
  return `${sign}${shock.toFixed(1)} %`;
}

export function InstitutionalRiskCenter() {
  const { preferences } = usePreferences();
  const language = preferences.language;

  const [positions, setPositions] = useState<PortfolioPositionInput[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const reload = () => {
      setPositions(readLocalWorkspace().data.portfolio);
    };

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
        setLoadState("ready");
        setMessage(null);
        return;
      }

      setLoadState("loading");
      setMessage(null);

      try {
        const fast = await analyzePortfolio(
          positions,
          controller.signal,
          true,
        );

        if (controller.signal.aborted) return;
        setSnapshot(fast);
        setLoadState("partial");

        try {
          const full = await analyzePortfolio(
            positions,
            controller.signal,
          );

          if (controller.signal.aborted) return;
          setSnapshot(full);
          setLoadState("ready");
        } catch (reason) {
          if (controller.signal.aborted) return;
          setLoadState("partial");
          setMessage(
            reason instanceof Error
              ? reason.message
              : pick(
                  language,
                  "L'analyse historique complète est temporairement indisponible.",
                  "The full historical analysis is temporarily unavailable.",
                ),
          );
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setSnapshot(null);
        setLoadState("error");
        setMessage(
          reason instanceof Error
            ? reason.message
            : pick(
                language,
                "Les données de risque sont temporairement indisponibles.",
                "Risk data is temporarily unavailable.",
              ),
        );
      }
    };

    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [language, positions]);

  const topPositions = useMemo(
    () =>
      [...(snapshot?.positions ?? [])]
        .sort((left, right) => right.weight_percent - left.weight_percent)
        .slice(0, 8),
    [snapshot],
  );

  const topSectors = useMemo(
    () =>
      [...(snapshot?.sector_allocation ?? [])]
        .sort((left, right) => right.weight_percent - left.weight_percent)
        .slice(0, 6),
    [snapshot],
  );

  const correlation = snapshot?.correlation ?? null;
  const matrixSymbols = correlation?.symbols.slice(0, 8) ?? [];
  const matrixIndexes = matrixSymbols.map((symbol) =>
    correlation?.symbols.indexOf(symbol) ?? -1,
  );

  const risk = snapshot?.risk ?? null;
  const stressTests = snapshot?.stress_tests ?? [];
  const riskReading = snapshot?.risk_reading ?? [];

  const metrics = [
    {
      label: pick(language, "NIVEAU DE RISQUE", "RISK LEVEL"),
      value: riskLabel(risk?.risk_level ?? null, language),
      detail: pick(
        language,
        "Classification produite par l'analyse portefeuille Anatole.",
        "Classification produced by Anatole portfolio analytics.",
      ),
    },
    {
      label: pick(language, "VOLATILITÉ", "VOLATILITY"),
      value: percent(risk?.volatility_percent, language),
      detail: pick(
        language,
        "Mesure historique selon la couverture disponible.",
        "Historical measure based on available coverage.",
      ),
    },
    {
      label: "BETA",
      value: numberValue(risk?.beta, language),
      detail: snapshot?.benchmark_name ?? snapshot?.benchmark ?? "—",
    },
    {
      label: pick(language, "MAX DRAWDOWN", "MAX DRAWDOWN"),
      value: percent(risk?.max_drawdown_percent, language),
      detail: pick(
        language,
        "Baisse maximale observée dans l'historique analysé.",
        "Maximum decline observed in the analyzed history.",
      ),
    },
    {
      label: "SHARPE",
      value: numberValue(risk?.sharpe_ratio, language),
      detail: pick(
        language,
        "Rendement ajusté du risque selon la méthodologie actuelle.",
        "Risk-adjusted return under the current methodology.",
      ),
    },
    {
      label: pick(language, "DIVERSIFICATION", "DIVERSIFICATION"),
      value:
        risk?.diversification_score === null ||
        risk?.diversification_score === undefined
          ? pick(language, "N/D", "N/A")
          : `${risk.diversification_score.toFixed(0)}/100`,
      detail: pick(
        language,
        `Top 3 ${percent(risk?.top_three_percent, language)}`,
        `Top 3 ${percent(risk?.top_three_percent, language)}`,
      ),
    },
    {
      label: pick(language, "CORRÉLATION MOY.", "AVG. CORRELATION"),
      value: numberValue(correlation?.average_correlation, language),
      detail: correlation
        ? `${correlation.symbols.length} ${pick(language, "titres", "securities")}`
        : pick(language, "Historique requis", "History required"),
    },
    {
      label: pick(language, "COUVERTURE HIST.", "HISTORY COVERAGE"),
      value: percent(risk?.history_coverage_percent, language, 0),
      detail: risk
        ? `${risk.history_observations} ${pick(language, "observations", "observations")}`
        : pick(language, "N/D", "N/A"),
    },
  ];

  return (
    <section
      className={styles.shell}
      data-testid="institutional-risk-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel" className={styles.back}>
            <ArrowLeft size={14} />
            {pick(
              language,
              "Command Center",
              "Command Center",
            )}
          </Link>

          <span className={styles.kicker}>
            ANATOLE INSTITUTIONAL · RISK
          </span>
          <h1>
            {pick(
              language,
              "Risk Center",
              "Risk Center",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Une vue institutionnelle du risque réellement calculable aujourd'hui : volatilité, bêta, drawdown, concentration, corrélations et stress tests. Les métriques absentes restent N/D au lieu d'être simulées.",
              "An institutional view of risk that Anatole can actually calculate today: volatility, beta, drawdown, concentration, correlations and stress tests. Missing metrics remain N/A instead of being simulated.",
            )}
          </p>
        </div>

        <div className={styles.state} aria-live="polite">
          <RefreshCw
            size={16}
            className={loadState === "loading" ? styles.spinning : undefined}
          />
          <div>
            <strong>
              {loadState === "loading"
                ? pick(language, "Analyse en cours", "Analyzing")
                : loadState === "partial"
                  ? pick(language, "Analyse partielle", "Partial analysis")
                  : loadState === "error"
                    ? pick(language, "Flux indisponible", "Feed unavailable")
                    : pick(language, "Analyse prête", "Analysis ready")}
            </strong>
            <span>
              {snapshot
                ? pick(
                    language,
                    `Généré ${timestamp(snapshot.generated_at, language)}`,
                    `Generated ${timestamp(snapshot.generated_at, language)}`,
                  )
                : pick(
                    language,
                    "Aucune donnée de portefeuille chargée",
                    "No portfolio data loaded",
                  )}
            </span>
          </div>
        </div>
      </header>

      {!positions.length ? (
        <section
          className={styles.empty}
          data-testid="institutional-risk-empty"
        >
          <ShieldAlert size={24} />
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
                "Ajoute des positions dans Anatole. Elles seront ensuite analysées ici sans dupliquer le portefeuille.",
                "Add positions in Anatole. They will then be analyzed here without duplicating the portfolio.",
              )}
            </p>
          </div>
          <Link href="/portefeuille">
            {pick(language, "Ouvrir Portefeuille", "Open Portfolio")}
            <ArrowUpRight size={14} />
          </Link>
        </section>
      ) : null}

      <section
        className={styles.metrics}
        data-testid="institutional-risk-metrics"
      >
        {metrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      {message ? (
        <div className={styles.notice}>
          <ShieldAlert size={15} />
          <span>{message}</span>
        </div>
      ) : null}

      <div className={styles.twoColumns}>
        <section
          className={styles.panel}
          data-testid="institutional-risk-concentration"
        >
          <header>
            <div>
              <span className={styles.kicker}>
                {pick(language, "CONCENTRATION", "CONCENTRATION")}
              </span>
              <h2>
                {pick(
                  language,
                  "Expositions dominantes",
                  "Dominant exposures",
                )}
              </h2>
            </div>
            <Target size={18} />
          </header>

          <div className={styles.list}>
            {topPositions.length ? (
              topPositions.map((position) => (
                <Link
                  key={position.symbol}
                  href={`/focus/${encodeURIComponent(position.symbol)}`}
                  className={styles.listRow}
                >
                  <div>
                    <strong>{position.symbol}</strong>
                    <span>{position.name}</span>
                  </div>
                  <div className={styles.bar}>
                    <i
                      style={{
                        width: `${Math.min(100, Math.max(0, position.weight_percent))}%`,
                      }}
                    />
                  </div>
                  <strong>{percent(position.weight_percent, language)}</strong>
                </Link>
              ))
            ) : (
              <p className={styles.muted}>
                {pick(
                  language,
                  "Aucune position disponible.",
                  "No position available.",
                )}
              </p>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <span className={styles.kicker}>
                {pick(language, "SECTEURS", "SECTORS")}
              </span>
              <h2>
                {pick(
                  language,
                  "Concentration économique directe",
                  "Direct economic concentration",
                )}
              </h2>
            </div>
            <Boxes size={18} />
          </header>

          <div className={styles.list}>
            {topSectors.length ? (
              topSectors.map((sector) => (
                <div key={sector.key} className={styles.listRow}>
                  <div>
                    <strong>{sector.label}</strong>
                    <span>
                      {pick(language, "Allocation", "Allocation")}
                    </span>
                  </div>
                  <div className={styles.bar}>
                    <i
                      style={{
                        width: `${Math.min(100, Math.max(0, sector.weight_percent))}%`,
                      }}
                    />
                  </div>
                  <strong>{percent(sector.weight_percent, language)}</strong>
                </div>
              ))
            ) : (
              <p className={styles.muted}>
                {pick(
                  language,
                  "Allocation sectorielle indisponible.",
                  "Sector allocation unavailable.",
                )}
              </p>
            )}
          </div>
        </section>
      </div>

      <section
        className={styles.panel}
        data-testid="institutional-risk-stress"
      >
        <header>
          <div>
            <span className={styles.kicker}>
              {pick(language, "STRESS LAB", "STRESS LAB")}
            </span>
            <h2>
              {pick(
                language,
                "Stress tests disponibles",
                "Available stress tests",
              )}
            </h2>
          </div>
          <Gauge size={18} />
        </header>

        {stressTests.length ? (
          <div className={styles.stressGrid}>
            {stressTests.map((test) => (
              <article key={test.key}>
                <div>
                  <span>{test.label}</span>
                  <strong>{shockLabel(test.shock, test.shock_unit)}</strong>
                </div>
                <b>
                  {percent(
                    test.estimated_portfolio_change_percent,
                    language,
                  )}
                </b>
                <p>
                  {pick(
                    language,
                    `Couverture ${test.coverage.coverage_percent.toFixed(0)} % · ${test.coverage.symbols_available}/${test.coverage.symbols_expected} titres`,
                    `Coverage ${test.coverage.coverage_percent.toFixed(0)}% · ${test.coverage.symbols_available}/${test.coverage.symbols_expected} securities`,
                  )}
                </p>
                <small>{test.methodology}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.muted}>
            {loadState === "loading" || loadState === "partial"
              ? pick(
                  language,
                  "L'analyse historique complète charge les stress tests.",
                  "The full historical analysis is loading stress tests.",
                )
              : pick(
                  language,
                  "Aucun stress test disponible pour ce portefeuille.",
                  "No stress test is available for this portfolio.",
                )}
          </p>
        )}
      </section>

      <section
        className={styles.panel}
        data-testid="institutional-risk-correlation"
      >
        <header>
          <div>
            <span className={styles.kicker}>
              {pick(language, "CORRÉLATIONS", "CORRELATIONS")}
            </span>
            <h2>
              {pick(
                language,
                "Matrice de dépendance",
                "Dependency matrix",
              )}
            </h2>
          </div>
          <BarChart3 size={18} />
        </header>

        {correlation && matrixSymbols.length ? (
          <>
            <div className={styles.correlationSummary}>
              <span>
                {pick(language, "Plus forte", "Highest")}
                <strong>
                  {correlation.highest_pair
                    ? `${correlation.highest_pair[0]} / ${correlation.highest_pair[1]} · ${correlation.highest_pair[2].toFixed(2)}`
                    : pick(language, "N/D", "N/A")}
                </strong>
              </span>
              <span>
                {pick(language, "Plus faible", "Lowest")}
                <strong>
                  {correlation.lowest_pair
                    ? `${correlation.lowest_pair[0]} / ${correlation.lowest_pair[1]} · ${correlation.lowest_pair[2].toFixed(2)}`
                    : pick(language, "N/D", "N/A")}
                </strong>
              </span>
            </div>

            <div className={styles.matrixWrap}>
              <table>
                <thead>
                  <tr>
                    <th />
                    {matrixSymbols.map((symbol) => (
                      <th key={symbol}>{symbol}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixSymbols.map((rowSymbol, rowVisibleIndex) => {
                    const rowIndex = matrixIndexes[rowVisibleIndex] ?? -1;
                    return (
                      <tr key={rowSymbol}>
                        <th>{rowSymbol}</th>
                        {matrixSymbols.map((columnSymbol, columnVisibleIndex) => {
                          const columnIndex =
                            matrixIndexes[columnVisibleIndex] ?? -1;
                          const value =
                            rowIndex >= 0 && columnIndex >= 0
                              ? correlation.values[rowIndex]?.[columnIndex]
                              : null;

                          return (
                            <td key={columnSymbol}>
                              {value === null || value === undefined
                                ? "—"
                                : value.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className={styles.muted}>
            {pick(
              language,
              "La matrice apparaîtra quand l'historique de plusieurs positions sera suffisant.",
              "The matrix will appear when sufficient history exists for multiple positions.",
            )}
          </p>
        )}
      </section>

      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <header>
            <div>
              <span className={styles.kicker}>
                {pick(language, "LECTURE RISQUE", "RISK READING")}
              </span>
              <h2>
                {pick(
                  language,
                  "Ce que les données signalent",
                  "What the data signals",
                )}
              </h2>
            </div>
            <Activity size={18} />
          </header>

          {riskReading.length ? (
            <ul className={styles.reading}>
              {riskReading.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>
              {pick(
                language,
                "Aucune lecture risque additionnelle n'est disponible.",
                "No additional risk reading is available.",
              )}
            </p>
          )}
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <span className={styles.kicker}>
                {pick(language, "MÉTHODOLOGIE", "METHODOLOGY")}
              </span>
              <h2>
                {pick(
                  language,
                  "Preuve et limites",
                  "Evidence and limits",
                )}
              </h2>
            </div>
            <ShieldAlert size={18} />
          </header>

          <p className={styles.methodology}>
            {snapshot?.methodology ??
              pick(
                language,
                "La méthodologie détaillée sera affichée lorsque l'analyse complète est disponible.",
                "Detailed methodology will appear when the full analysis is available.",
              )}
          </p>

          {snapshot?.notes.length ? (
            <ul className={styles.reading}>
              {snapshot.notes.slice(0, 5).map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <footer className={styles.footer}>
        <span>
          {pick(
            language,
            "Risk Center V1 utilise uniquement les analytics portefeuille existantes. Budget de risque factoriel, crowding, VaR et liquidité institutionnelle restent des chantiers distincts tant que leurs données dédiées ne sont pas disponibles.",
            "Risk Center V1 uses existing portfolio analytics only. Factor risk budgeting, crowding, VaR and institutional liquidity remain separate workstreams until dedicated data is available.",
          )}
        </span>
        <Link href="/portefeuille">
          {pick(
            language,
            "Gérer le portefeuille",
            "Manage portfolio",
          )}
          <ArrowUpRight size={14} />
        </Link>
      </footer>
    </section>
  );
}
