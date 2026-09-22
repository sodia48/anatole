"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Grid3X3,
  ShieldAlert,
  Waves,
} from "lucide-react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  PortfolioContributionResult,
  PortfolioHorizon,
  PortfolioSnapshot,
  PortfolioStressTest,
} from "@/lib/types";

import styles from "./Workspace.module.css";

type IntelligenceTab =
  | "performance"
  | "contribution"
  | "risk"
  | "correlation"
  | "stress";

const HORIZONS: PortfolioHorizon["horizon"][] = [
  "1d",
  "1w",
  "1m",
  "3m",
  "ytd",
  "1y",
];

function horizonLabel(value: PortfolioHorizon["horizon"], language: AnatoleLanguage): string {
  const labels = language === "fr"
    ? { "1d": "1 j", "1w": "1 sem.", "1m": "1 mois", "3m": "3 mois", ytd: "YTD", "1y": "1 an" }
    : { "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M", ytd: "YTD", "1y": "1Y" };
  return labels[value];
}

function number(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value)
    ? "N/D"
    : value.toFixed(digits);
}

function signedPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)} %`;
}

function stressLabel(item: PortfolioStressTest, language: AnatoleLanguage): string {
  if (language === "fr") return item.label;
  return ({
    tsx: "TSX -5%",
    wti: "WTI -10%",
    cad_usd: "CAD/USD +5%",
    canada_10y: "Canada 10Y +50 bps",
  } as const)[item.key];
}

function riskReading(snapshot: PortfolioSnapshot, language: AnatoleLanguage): string[] {
  if (language === "fr" && snapshot.risk_reading?.length) {
    return snapshot.risk_reading;
  }

  const rows: string[] = [];
  const topSector = snapshot.sector_allocation[0];
  if (topSector) {
    rows.push(
      `${topSector.weight_percent.toFixed(1)}% of the portfolio is allocated to ${topSector.label}.`,
    );
  }
  if (snapshot.risk?.top_three_percent != null) {
    rows.push(
      `The three largest positions represent ${snapshot.risk.top_three_percent.toFixed(1)}% of the portfolio.`,
    );
  }
  if (snapshot.correlation?.highest_pair) {
    const [left, right, value] = snapshot.correlation.highest_pair;
    rows.push(
      `${left} and ${right} have a recent daily-return correlation of ${value.toFixed(2)}.`,
    );
  }
  return rows;
}

function coverageText(
  coverage: { symbols_available: number; symbols_expected: number; coverage_percent: number },
  language: AnatoleLanguage,
): string {
  return `${pick(language, "Couverture", "Coverage")} ${coverage.coverage_percent.toFixed(0)} % · ${coverage.symbols_available}/${coverage.symbols_expected}`;
}

function toneClass(value: number | null | undefined): string {
  if (value == null) return "";
  return value > 0.001 ? styles.positive : value < -0.001 ? styles.negative : "";
}

function PerformanceView({
  items,
  language,
}: {
  items: PortfolioHorizon[];
  language: AnatoleLanguage;
}) {
  return (
    <div className={styles.intelligenceHorizonGrid}>
      {HORIZONS.map((horizon) => {
        const item = items.find((candidate) => candidate.horizon === horizon);
        return (
          <article className={styles.intelligenceMetricCard} key={horizon}>
            <span>{horizonLabel(horizon, language)}</span>
            <strong className={toneClass(item?.return_percent)}>
              {signedPercent(item?.return_percent)}
            </strong>
            <small>
              {item
                ? coverageText(item.coverage, language)
                : pick(language, "Historique insuffisant", "Insufficient history")}
            </small>
            <i>
              {item?.methodology === "observed_day"
                ? pick(language, "Observé", "Observed")
                : pick(language, "Reconstitué", "Reconstructed")}
            </i>
          </article>
        );
      })}
    </div>
  );
}

function ContributionView({
  items,
  language,
}: {
  items: PortfolioContributionResult[];
  language: AnatoleLanguage;
}) {
  const [horizon, setHorizon] = useState<PortfolioHorizon["horizon"]>("1d");
  const selected = items.find((item) => item.horizon === horizon);
  const maxContribution = Math.max(
    0.01,
    ...(selected?.items.map((item) => Math.abs(item.contribution_percent)) ?? []),
  );

  return (
    <div className={styles.intelligenceStack}>
      <div className={styles.intelligenceSubtabs}>
        {HORIZONS.map((item) => (
          <button
            aria-pressed={horizon === item}
            className={horizon === item ? styles.intelligenceSubtabActive : styles.intelligenceSubtab}
            key={item}
            onClick={() => setHorizon(item)}
            type="button"
          >
            {horizonLabel(item, language)}
          </button>
        ))}
      </div>

      <div className={styles.intelligenceMeta}>
        <strong>
          {horizon === "1d"
            ? pick(language, "Contribution observée de la séance", "Observed session contribution")
            : pick(language, "Contribution reconstituée", "Reconstructed contribution")}
        </strong>
        <span>
          {selected
            ? coverageText(selected.coverage, language)
            : pick(language, "Données insuffisantes", "Insufficient data")}
        </span>
      </div>

      {selected?.items.length ? (
        <div className={styles.contributionList}>
          {selected.items.map((item) => (
            <div className={styles.contributionItem} key={item.symbol}>
              <strong>{item.symbol}</strong>
              <div>
                <span className={styles.contributionTrack}>
                  <i
                    className={item.contribution_percent >= 0 ? styles.contributionPositive : styles.contributionNegative}
                    style={{ width: `${Math.max(4, Math.abs(item.contribution_percent) / maxContribution * 100)}%` }}
                  />
                </span>
                <small>
                  {pick(language, "Rendement", "Return")} {signedPercent(item.security_return_percent)}
                  {" · "}
                  {pick(language, "Poids", "Weight")} {item.current_weight_percent.toFixed(1)} %
                </small>
              </div>
              <b className={toneClass(item.contribution_percent)}>
                {signedPercent(item.contribution_percent)}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.notice}>
          {pick(
            language,
            "Couverture insuffisante pour calculer les contributions sur cet horizon.",
            "Coverage is insufficient to calculate contributions for this horizon.",
          )}
        </div>
      )}
    </div>
  );
}

function RiskView({
  snapshot,
  language,
}: {
  snapshot: PortfolioSnapshot;
  language: AnatoleLanguage;
}) {
  const risk = snapshot.risk;
  const rows = riskReading(snapshot, language);

  return (
    <div className={styles.intelligenceStack}>
      <div className={styles.intelligenceSummaryGrid}>
        <div className={styles.intelligenceSummaryMetric}>
          <span>{pick(language, "Couverture historique", "History coverage")}</span>
          <strong>{risk ? `${risk.history_coverage_percent.toFixed(0)} %` : "N/D"}</strong>
          <small>{risk ? `${risk.history_observations} ${pick(language, "observations", "observations")}` : "—"}</small>
        </div>
        <div className={styles.intelligenceSummaryMetric}>
          <span>{pick(language, "Plus grande position", "Largest position")}</span>
          <strong>{risk?.top_position_percent == null ? "N/D" : `${risk.top_position_percent.toFixed(1)} %`}</strong>
          <small>{snapshot.positions[0]?.symbol ?? "—"}</small>
        </div>
        <div className={styles.intelligenceSummaryMetric}>
          <span>Top 3</span>
          <strong>{risk?.top_three_percent == null ? "N/D" : `${risk.top_three_percent.toFixed(1)} %`}</strong>
          <small>{pick(language, "Concentration", "Concentration")}</small>
        </div>
        <div className={styles.intelligenceSummaryMetric}>
          <span>{pick(language, "Corrélation moyenne", "Average correlation")}</span>
          <strong>{number(snapshot.correlation?.average_correlation, 2)}</strong>
          <small>{pick(language, "Rendements quotidiens", "Daily returns")}</small>
        </div>
      </div>

      {rows.length ? (
        <div className={styles.riskReadingList}>
          {rows.map((row) => (
            <div className={styles.riskReadingItem} key={row}>
              <span />
              <p>{row}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.notice}>
          {pick(
            language,
            "La lecture détaillée du risque sera disponible lorsque la couverture historique sera suffisante.",
            "The detailed risk reading will appear once historical coverage is sufficient.",
          )}
        </div>
      )}
    </div>
  );
}

function CorrelationView({
  snapshot,
  language,
}: {
  snapshot: PortfolioSnapshot;
  language: AnatoleLanguage;
}) {
  const correlation = snapshot.correlation;
  if (!correlation?.symbols.length) {
    return (
      <div className={styles.notice}>
        {pick(
          language,
          "Corrélations indisponibles : au moins 40 observations partagées sont requises.",
          "Correlations unavailable: at least 40 shared observations are required.",
        )}
      </div>
    );
  }

  const symbols = correlation.symbols.slice(0, 10);
  const indexBySymbol = new Map(correlation.symbols.map((symbol, index) => [symbol, index]));

  return (
    <div className={styles.intelligenceStack}>
      <div className={styles.intelligenceSummaryGrid}>
        <div className={styles.intelligenceSummaryMetric}>
          <span>{pick(language, "Moyenne", "Average")}</span>
          <strong>{number(correlation.average_correlation, 2)}</strong>
          <small>{pick(language, "Corrélation du portefeuille", "Portfolio correlation")}</small>
        </div>
        <div className={styles.intelligenceSummaryMetric}>
          <span>{pick(language, "Paire la plus corrélée", "Highest pair")}</span>
          <strong>{correlation.highest_pair ? `${correlation.highest_pair[0]} / ${correlation.highest_pair[1]}` : "N/D"}</strong>
          <small>{correlation.highest_pair ? number(correlation.highest_pair[2], 2) : "—"}</small>
        </div>
        <div className={styles.intelligenceSummaryMetric}>
          <span>{pick(language, "Paire la moins corrélée", "Lowest pair")}</span>
          <strong>{correlation.lowest_pair ? `${correlation.lowest_pair[0]} / ${correlation.lowest_pair[1]}` : "N/D"}</strong>
          <small>{correlation.lowest_pair ? number(correlation.lowest_pair[2], 2) : "—"}</small>
        </div>
      </div>

      <div className={styles.correlationWrap}>
        <table className={styles.correlationTable}>
          <thead>
            <tr>
              <th />
              {symbols.map((symbol) => <th key={symbol}>{symbol}</th>)}
            </tr>
          </thead>
          <tbody>
            {symbols.map((rowSymbol) => {
              const rowIndex = indexBySymbol.get(rowSymbol) ?? -1;
              return (
                <tr key={rowSymbol}>
                  <th>{rowSymbol}</th>
                  {symbols.map((columnSymbol) => {
                    const columnIndex = indexBySymbol.get(columnSymbol) ?? -1;
                    const value = correlation.values[rowIndex]?.[columnIndex] ?? null;
                    return (
                      <td
                        className={
                          value == null
                            ? styles.correlationUnavailable
                            : value >= 0.5
                              ? styles.correlationHigh
                              : value <= 0
                                ? styles.correlationLow
                                : styles.correlationMid
                        }
                        key={columnSymbol}
                        title={`${rowSymbol} / ${columnSymbol}`}
                      >
                        {number(value, 2)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {correlation.symbols.length > symbols.length ? (
        <small className={styles.intelligenceFootnote}>
          {pick(
            language,
            `Matrice limitée aux ${symbols.length} principales positions à l’écran pour préserver la fluidité.`,
            `Matrix limited to the first ${symbols.length} positions on screen to preserve responsiveness.`,
          )}
        </small>
      ) : null}
    </div>
  );
}

function StressView({
  items,
  language,
}: {
  items: PortfolioStressTest[];
  language: AnatoleLanguage;
}) {
  return (
    <div className={styles.stressGrid}>
      {items.length ? items.map((item) => (
        <article className={styles.stressCard} key={item.key}>
          <span>{stressLabel(item, language)}</span>
          <strong className={toneClass(item.estimated_portfolio_change_percent)}>
            {signedPercent(item.estimated_portfolio_change_percent)}
          </strong>
          <small>{coverageText(item.coverage, language)}</small>
          <p>
            {pick(
              language,
              "Estimation fondée sur les sensibilités historiques; ce scénario n’est pas une prévision.",
              "Estimate based on historical sensitivities; this scenario is not a forecast.",
            )}
          </p>
        </article>
      )) : (
        <div className={styles.notice}>
          {pick(language, "Aucun stress test exploitable pour le moment.", "No usable stress test is available yet.")}
        </div>
      )}
    </div>
  );
}

export function PortfolioIntelligence({
  snapshot,
  language,
}: {
  snapshot: PortfolioSnapshot;
  language: AnatoleLanguage;
}) {
  const [tab, setTab] = useState<IntelligenceTab>("performance");
  const performance = snapshot.performance_horizons ?? [];
  const contributions = snapshot.contribution_horizons ?? [];
  const oneDay = performance.find((item) => item.horizon === "1d");
  const oneMonth = performance.find((item) => item.horizon === "1m");
  const oneYear = performance.find((item) => item.horizon === "1y");

  const summary = useMemo(() => ([
    [pick(language, "Séance", "Session"), signedPercent(oneDay?.return_percent)],
    [pick(language, "1 mois", "1 month"), signedPercent(oneMonth?.return_percent)],
    [pick(language, "1 an", "1 year"), signedPercent(oneYear?.return_percent)],
    [
      pick(language, "Couverture", "Coverage"),
      snapshot.risk ? `${snapshot.risk.history_coverage_percent.toFixed(0)} %` : "N/D",
    ],
  ]), [language, oneDay?.return_percent, oneMonth?.return_percent, oneYear?.return_percent, snapshot.risk]);

  const tabs: Array<{
    id: IntelligenceTab;
    fr: string;
    en: string;
    icon: typeof Activity;
  }> = [
    { id: "performance", fr: "Horizons", en: "Horizons", icon: BarChart3 },
    { id: "contribution", fr: "Contribution", en: "Contribution", icon: Activity },
    { id: "risk", fr: "Risque", en: "Risk", icon: ShieldAlert },
    { id: "correlation", fr: "Corrélations", en: "Correlations", icon: Grid3X3 },
    { id: "stress", fr: "Stress tests", en: "Stress tests", icon: Waves },
  ];

  return (
    <section className={`panel ${styles.panel} ${styles.intelligencePanel}`} data-testid="portfolio-intelligence">
      <div className={styles.intelligenceHeader}>
        <div>
          <span className="eyebrow">PORTFOLIO INTELLIGENCE</span>
          <h2>{pick(language, "Intelligence du portefeuille", "Portfolio intelligence")}</h2>
          <p>
            {pick(
              language,
              "Horizon, contribution, concentration, corrélations et scénarios historiques. Aucun appel réseau supplémentaire n’est déclenché par les onglets.",
              "Horizon, contribution, concentration, correlations, and historical scenarios. Switching tabs triggers no additional network request.",
            )}
          </p>
        </div>
      </div>

      <div className={styles.intelligenceQuickStrip}>
        {summary.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className={styles.intelligenceTabs} role="tablist" aria-label={pick(language, "Vues d’intelligence du portefeuille", "Portfolio intelligence views")}>
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-selected={tab === item.id}
              className={tab === item.id ? styles.intelligenceTabActive : styles.intelligenceTab}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              {pick(language, item.fr, item.en)}
            </button>
          );
        })}
      </div>

      <div className={styles.intelligenceBody} role="tabpanel">
        {tab === "performance" ? (
          <PerformanceView items={performance} language={language} />
        ) : tab === "contribution" ? (
          <ContributionView items={contributions} language={language} />
        ) : tab === "risk" ? (
          <RiskView snapshot={snapshot} language={language} />
        ) : tab === "correlation" ? (
          <CorrelationView snapshot={snapshot} language={language} />
        ) : (
          <StressView items={snapshot.stress_tests ?? []} language={language} />
        )}
      </div>

      {snapshot.methodology ? (
        <small className={styles.intelligenceFootnote}>
          {language === "fr"
            ? snapshot.methodology
            : "Multi-day horizons reconstruct current positions using constant quantities. Correlations and sensitivities use only the market history actually available."}
        </small>
      ) : null}
    </section>
  );
}
