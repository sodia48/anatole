"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Edit3,
  Flag,
  Gauge,
  Landmark,
  LineChart,
  PiggyBank,
  Plus,
  Save,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";

import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  AdvisorGoalType,
  AdvisorPlan,
  AdvisorProfile,
} from "@/lib/types";

import styles from "./AdvisorCommandCenter.module.css";

const HISTORY_KEY = "anatole:advisor-progress:v3";
const SCENARIO_KEY = "anatole:advisor-scenarios:v3";
const TWIN_KEY = "anatole:advisor-financial-twin:v3";
const GOALS_KEY = "anatole:advisor-goals:v3";
const DISMISSED_ALERTS_KEY = "anatole:advisor-dismissed-alerts:v3";

type CommandTab = "overview" | "scenarios" | "timeline" | "twin";

type ProgressSnapshot = {
  date: string;
  goalType: AdvisorGoalType | null;
  currentSavings: number;
  monthlyContribution: number;
  targetAmount: number | null;
};

type SavedScenario = {
  id: string;
  name: string;
  createdAt: string;
  monthlyDelta: number;
  yearsDelta: number;
  annualReturn: number;
  inflation: number;
  projectedValue: number;
  targetValue: number;
  gap: number | null;
  targetMonths: number | null;
};

type HouseholdTwin = {
  monthlyIncome: number | null;
  monthlyDebtPayments: number | null;
  totalDebt: number | null;
  otherAssets: number | null;
};

type SavedGoal = {
  id: string;
  name: string;
  createdAt: string;
  profile: AdvisorProfile;
};

type PlanAlert = {
  id: string;
  tone: "attention" | "progress" | "info";
  title: string;
  detail: string;
};

type SensitivityLever = {
  id: string;
  title: string;
  value: string;
  detail: string;
  strength: number;
};

function safeNumber(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatMoney(
  value: number | null | undefined,
  currency: string,
  language: AnatoleLanguage,
): string {
  if (value == null || !Number.isFinite(value)) {
    return pick(language, "N/D", "N/A");
  }
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function futureValue(
  initial: number,
  monthly: number,
  months: number,
  annualReturnPercent: number,
): number {
  if (months <= 0) return initial;
  const monthlyRate = annualReturnPercent / 100 / 12;
  if (Math.abs(monthlyRate) < 0.0000001) {
    return initial + monthly * months;
  }
  const factor = (1 + monthlyRate) ** months;
  return initial * factor + monthly * ((factor - 1) / monthlyRate);
}

function requiredMonthly(
  initial: number,
  target: number,
  months: number,
  annualReturnPercent: number,
): number | null {
  if (target <= initial) return 0;
  if (months <= 0) return null;
  const monthlyRate = annualReturnPercent / 100 / 12;
  if (Math.abs(monthlyRate) < 0.0000001) {
    return Math.max(0, (target - initial) / months);
  }
  const factor = (1 + monthlyRate) ** months;
  const annuityFactor = (factor - 1) / monthlyRate;
  if (annuityFactor <= 0) return null;
  return Math.max(0, (target - initial * factor) / annuityFactor);
}

function monthsToTarget(
  initial: number,
  monthly: number,
  target: number,
  annualReturnPercent: number,
): number | null {
  if (target <= 0 || initial >= target) return 0;
  if (monthly <= 0 && annualReturnPercent <= 0) return null;
  for (let month = 1; month <= 600; month += 1) {
    if (
      futureValue(initial, monthly, month, annualReturnPercent) >= target
    ) {
      return month;
    }
  }
  return null;
}

function monthLabel(
  monthsFromNow: number | null,
  language: AnatoleLanguage,
): string {
  if (monthsFromNow == null) {
    return pick(
      language,
      "Au-delà de 50 ans / non calculé",
      "Beyond 50 years / not calculated",
    );
  }
  if (monthsFromNow === 0) {
    return pick(language, "Déjà atteint", "Already reached");
  }
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  return new Intl.DateTimeFormat(localeFor(language), {
    month: "short",
    year: "numeric",
  }).format(date);
}

function horizonDateLabel(
  years: number,
  language: AnatoleLanguage,
): string {
  if (!years) {
    return pick(language, "Horizon à définir", "Define horizon");
  }
  const date = new Date();
  date.setMonth(date.getMonth() + Math.round(years * 12));
  return new Intl.DateTimeFormat(localeFor(language), {
    month: "short",
    year: "numeric",
  }).format(date);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is an enhancement. The planning UI still works without it.
  }
}

function readPreviousSnapshot(): ProgressSnapshot | null {
  const history = readJson<ProgressSnapshot[]>(HISTORY_KEY, []);
  return Array.isArray(history) && history.length
    ? history[history.length - 1] ?? null
    : null;
}

function readScenarios(): SavedScenario[] {
  const items = readJson<SavedScenario[]>(SCENARIO_KEY, []);
  return Array.isArray(items) ? items.slice(-6) : [];
}

function readTwin(): HouseholdTwin {
  return readJson<HouseholdTwin>(TWIN_KEY, {
    monthlyIncome: null,
    monthlyDebtPayments: null,
    totalDebt: null,
    otherAssets: null,
  });
}

function readGoals(): SavedGoal[] {
  const items = readJson<SavedGoal[]>(GOALS_KEY, []);
  return Array.isArray(items) ? items.slice(-5) : [];
}

function readDismissedAlerts(): string[] {
  const items = readJson<string[]>(DISMISSED_ALERTS_KEY, []);
  return Array.isArray(items) ? items : [];
}

function shoppingCategory(goal: AdvisorGoalType | null): string {
  if (goal === "home") return "mortgage";
  if (goal === "education") return "student_loan";
  if (goal === "reserve") return "banking";
  if (goal === "flexible") return "personal_loan";
  return "banking";
}

function shoppingLabel(
  goal: AdvisorGoalType | null,
  language: AnatoleLanguage,
): string {
  if (goal === "home") {
    return pick(language, "Explorer les hypothèques", "Explore mortgages");
  }
  if (goal === "education") {
    return pick(
      language,
      "Explorer le financement étudiant",
      "Explore student financing",
    );
  }
  if (goal === "reserve") {
    return pick(
      language,
      "Comparer les comptes bancaires",
      "Compare bank accounts",
    );
  }
  if (goal === "flexible") {
    return pick(
      language,
      "Explorer les prêts personnels",
      "Explore personal loans",
    );
  }
  return pick(
    language,
    "Comparer les produits de liquidité",
    "Compare cash-management products",
  );
}

function goalTypeLabel(
  goal: AdvisorGoalType | null,
  language: AnatoleLanguage,
): string {
  const labels: Record<AdvisorGoalType, [string, string]> = {
    retirement: ["Retraite", "Retirement"],
    home: ["Propriété", "Home"],
    education: ["Études", "Education"],
    reserve: ["Réserve", "Reserve"],
    wealth: ["Croissance", "Growth"],
    flexible: ["Projet", "Project"],
  };
  if (!goal) return pick(language, "Objectif", "Goal");
  return pick(language, labels[goal][0], labels[goal][1]);
}

function adaptiveFocus(
  goal: AdvisorGoalType | null,
  language: AnatoleLanguage,
): { title: string; detail: string; chips: string[] } {
  if (goal === "home") {
    return {
      title: pick(language, "Parcours propriété", "Home-buying path"),
      detail: pick(
        language,
        "Anatole met l’accent sur la mise de fonds, la réserve, l’horizon et la capacité mensuelle.",
        "Anatole emphasizes down payment, reserve, horizon and monthly capacity.",
      ),
      chips:
        language === "fr"
          ? ["Mise de fonds", "Liquidité", "Horizon", "Paiement"]
          : ["Down payment", "Liquidity", "Horizon", "Payment"],
    };
  }
  if (goal === "education") {
    return {
      title: pick(language, "Parcours études", "Education path"),
      detail: pick(
        language,
        "Le diagnostic privilégie le manque de financement, l’échéancier, la réserve et la flexibilité.",
        "The diagnostic prioritizes funding gap, timeline, reserve and flexibility.",
      ),
      chips:
        language === "fr"
          ? ["Coût", "Échéancier", "Réserve", "Flexibilité"]
          : ["Cost", "Timeline", "Reserve", "Flexibility"],
    };
  }
  if (goal === "reserve") {
    return {
      title: pick(language, "Parcours réserve", "Reserve path"),
      detail: pick(
        language,
        "La liquidité et le nombre de mois de dépenses couvertes deviennent les mesures centrales.",
        "Liquidity and months of expenses covered become the central measures.",
      ),
      chips:
        language === "fr"
          ? ["Dépenses", "Réserve", "Stabilité", "Accès"]
          : ["Expenses", "Reserve", "Stability", "Access"],
    };
  }
  if (goal === "retirement") {
    return {
      title: pick(language, "Parcours retraite", "Retirement path"),
      detail: pick(
        language,
        "L’horizon, les contributions, la liquidité et la capacité à traverser des variations deviennent centraux.",
        "Horizon, contributions, liquidity and capacity to withstand fluctuations become central.",
      ),
      chips:
        language === "fr"
          ? ["Horizon", "Contributions", "Liquidité", "Variations"]
          : ["Horizon", "Contributions", "Liquidity", "Fluctuations"],
    };
  }
  if (goal === "wealth") {
    return {
      title: pick(language, "Parcours croissance", "Growth path"),
      detail: pick(
        language,
        "Anatole sépare capacité financière, liquidité et confort face aux variations avant toute simulation.",
        "Anatole separates financial capacity, liquidity and comfort with fluctuations before any simulation.",
      ),
      chips:
        language === "fr"
          ? ["Capacité", "Liquidité", "Horizon", "Variations"]
          : ["Capacity", "Liquidity", "Horizon", "Fluctuations"],
    };
  }
  return {
    title: pick(language, "Parcours adaptatif", "Adaptive path"),
    detail: pick(
      language,
      "Choisis un objectif : Anatole ajustera les informations, scénarios et jalons utiles.",
      "Choose a goal: Anatole will adjust the useful information, scenarios and milestones.",
    ),
    chips:
      language === "fr"
        ? ["Objectif", "Montant", "Horizon", "Contraintes"]
        : ["Goal", "Amount", "Horizon", "Constraints"],
  };
}

function pathForRange(
  values: number[],
  width: number,
  height: number,
  minValue: number,
  maxValue: number,
): string {
  if (!values.length) return "";
  const span = Math.max(1, maxValue - minValue);

  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? 0
          : (index / (values.length - 1)) * width;
      const clamped = Math.max(minValue, Math.min(maxValue, value));
      const y = height - ((clamped - minValue) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function areaForRange(
  values: number[],
  width: number,
  height: number,
  minValue: number,
  maxValue: number,
): string {
  if (!values.length) return "";
  const line = pathForRange(values, width, height, minValue, maxValue);
  return `${line} L${width.toFixed(2)} ${height.toFixed(2)} L0 ${height.toFixed(2)} Z`;
}

function TrajectoryChart({
  currentSavings,
  monthlyContribution,
  target,
  months,
  scenarioMonthly,
  annualReturn,
  inflation,
  currency,
  language,
}: {
  currentSavings: number;
  monthlyContribution: number;
  target: number;
  months: number;
  scenarioMonthly: number;
  annualReturn: number;
  inflation: number;
  currency: string;
  language: AnatoleLanguage;
}) {
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const [scaleMode, setScaleMode] =
    useState<"auto" | "zero" | "target">("auto");
  const [viewMode, setViewMode] =
    useState<"amount" | "percent">("amount");

  const safeMonths = Math.max(1, months);
  const samples = Math.min(120, Math.max(24, safeMonths));
  const monthPoints = Array.from({ length: samples + 1 }, (_, index) =>
    Math.round((index / samples) * safeMonths),
  );

  const baselineValues = monthPoints.map((month) =>
    futureValue(currentSavings, monthlyContribution, month, 0),
  );
  const scenarioValues = monthPoints.map((month) =>
    futureValue(currentSavings, scenarioMonthly, month, annualReturn),
  );
  const targetValues = monthPoints.map((month) => {
    if (target <= 0) return currentSavings;
    const years = month / 12;
    return target * (1 + inflation / 100) ** years;
  });

  const hasTarget = target > 0;
  const targetPeak = hasTarget ? Math.max(target, ...targetValues) : 0;
  const comparisonTarget = Math.max(1, targetPeak);
  const scenarioDistinct = scenarioValues.some(
    (value, index) =>
      Math.abs(value - baselineValues[index]) >
      Math.max(1, comparisonTarget * 0.002),
  );
  const projectedValue =
    scenarioValues[scenarioValues.length - 1] ?? currentSavings;
  const currentProgress = hasTarget
    ? (currentSavings / comparisonTarget) * 100
    : 0;
  const projectedProgress = hasTarget
    ? (projectedValue / comparisonTarget) * 100
    : 0;
  const gapValue = hasTarget
    ? Math.max(0, comparisonTarget - projectedValue)
    : null;

  const requiredMonthlyValue = hasTarget
    ? requiredMonthly(
        currentSavings,
        comparisonTarget,
        safeMonths,
        annualReturn,
      )
    : null;
  const monthlyGap =
    requiredMonthlyValue == null
      ? null
      : Math.max(0, requiredMonthlyValue - scenarioMonthly);
  const estimatedTargetMonth = hasTarget
    ? monthsToTarget(
        currentSavings,
        Math.max(0, scenarioMonthly),
        comparisonTarget,
        annualReturn,
      )
    : null;

  const baselinePercent = baselineValues.map((value) =>
    hasTarget ? (value / comparisonTarget) * 100 : 0,
  );
  const scenarioPercent = scenarioValues.map((value) =>
    hasTarget ? (value / comparisonTarget) * 100 : 0,
  );
  const targetPercent = monthPoints.map(() => 100);

  const displayBaseline =
    viewMode === "percent" ? baselinePercent : baselineValues;
  const displayScenario =
    viewMode === "percent" ? scenarioPercent : scenarioValues;
  const displayTarget =
    viewMode === "percent" ? targetPercent : targetValues;
  const trajectoryValues = scenarioDistinct
    ? [...displayBaseline, ...displayScenario]
    : [...displayBaseline];

  const trajectoryMin = Math.min(...trajectoryValues);
  const trajectoryMax = Math.max(1, ...trajectoryValues);
  const targetDisplayPeak = Math.max(0, ...displayTarget);
  const trajectorySpan = Math.max(1, trajectoryMax - trajectoryMin);
  const targetOffScale =
    hasTarget &&
    viewMode === "amount" &&
    targetDisplayPeak >
      Math.max(
        trajectoryMax * 1.75,
        trajectoryMax + trajectorySpan * 1.25,
      );

  const visibleValues =
    viewMode === "percent"
      ? [...trajectoryValues, ...displayTarget]
      : scaleMode === "target"
        ? [...trajectoryValues, ...displayTarget]
        : scaleMode === "zero"
          ? [
              ...trajectoryValues,
              ...(targetOffScale ? [] : displayTarget),
              0,
            ]
          : [
              ...trajectoryValues,
              ...(targetOffScale ? [] : displayTarget),
            ];

  const rawMin = Math.min(...visibleValues);
  const rawMax = Math.max(1, ...visibleValues);
  const rawSpan = Math.max(1, rawMax - rawMin);
  const padding = Math.max(
    viewMode === "percent" ? 2 : 1,
    rawSpan * 0.08,
  );

  const range =
    viewMode === "percent"
      ? {
          min: 0,
          max: Math.max(110, rawMax + 5),
        }
      : scaleMode === "target"
        ? {
            min: 0,
            max: Math.max(
              rawMax + padding,
              targetDisplayPeak + padding,
            ),
          }
        : scaleMode === "zero"
          ? {
              min: 0,
              max: Math.max(rawMax + padding, 1),
            }
          : {
              min:
                rawMin <= 0 ||
                rawMin <= Math.max(1, rawMax) * 0.15
                  ? 0
                  : Math.max(0, rawMin - padding),
              max: Math.max(rawMax + padding, 1),
            };

  const minValue = range.min;
  const maxValue = Math.max(range.max, minValue + 1);
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    maxValue - ((maxValue - minValue) * index) / 4,
  );

  const width = 760;
  const height = 220;
  const hoverIndex =
    hoverMonth == null
      ? null
      : monthPoints.reduce(
          (best, month, index) =>
            Math.abs(month - hoverMonth) <
            Math.abs(monthPoints[best] - hoverMonth)
              ? index
              : best,
          0,
        );

  const activeMonth =
    hoverIndex == null ? safeMonths : monthPoints[hoverIndex];
  const activeBaseline =
    hoverIndex == null
      ? baselineValues[baselineValues.length - 1]
      : baselineValues[hoverIndex];
  const activeScenario =
    hoverIndex == null
      ? scenarioValues[scenarioValues.length - 1]
      : scenarioValues[hoverIndex];
  const activeTarget =
    hoverIndex == null
      ? targetValues[targetValues.length - 1]
      : targetValues[hoverIndex];
  const activeGap = hasTarget
    ? Math.max(0, activeTarget - activeScenario)
    : null;

  const hoverX =
    hoverIndex == null
      ? width
      : (hoverIndex / Math.max(1, monthPoints.length - 1)) *
        width;
  const hoverScenarioValue =
    hoverIndex == null
      ? displayScenario[displayScenario.length - 1]
      : displayScenario[hoverIndex];
  const hoverScenarioClamped = Math.max(
    minValue,
    Math.min(maxValue, hoverScenarioValue),
  );
  const hoverScenarioY =
    height -
    ((hoverScenarioClamped - minValue) /
      Math.max(1, maxValue - minValue)) *
      height;

  const milestones = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const amount = comparisonTarget * ratio;
    const reachedIndex = hasTarget
      ? scenarioValues.findIndex((value) => value >= amount)
      : -1;
    return {
      ratio,
      amount,
      reachedMonth:
        reachedIndex >= 0 ? monthPoints[reachedIndex] : null,
    };
  });

  const formatAxis = (value: number) =>
    viewMode === "percent"
      ? `${Math.round(value)}%`
      : formatMoney(value, currency, language);

  const showTargetPath =
    hasTarget &&
    (
      viewMode === "percent" ||
      scaleMode === "target" ||
      !targetOffScale
    );

  return (
    <div
      className={`${styles.chartShell} ${styles.trajectoryLab}`}
      data-testid="advisor-trajectory-chart"
    >
      <div className={styles.trajectoryTopbar}>
        <div className={styles.trajectoryIntro}>
          <span>
            {pick(language, "TRAJECTOIRE LAB", "TRAJECTORY LAB")}
          </span>
          <strong>
            {pick(
              language,
              "Lis le plan, l’écart et le rythme.",
              "Read the plan, the gap and the pace.",
            )}
          </strong>
          <small>
            {pick(
              language,
              "Passe d’une simple courbe à une lecture orientée décision.",
              "Move from a simple line to a decision-oriented view.",
            )}
          </small>
        </div>

        <div className={styles.trajectoryControls}>
          <div
            className={styles.segmentedControl}
            aria-label={pick(
              language,
              "Mode d’affichage",
              "Display mode",
            )}
          >
            <button
              type="button"
              data-testid="advisor-trajectory-mode-amount"
              className={
                viewMode === "amount" ? styles.activeSegment : undefined
              }
              onClick={() => setViewMode("amount")}
            >
              {pick(language, "Montant", "Amount")}
            </button>
            <button
              type="button"
              data-testid="advisor-trajectory-mode-percent"
              className={
                viewMode === "percent" ? styles.activeSegment : undefined
              }
              disabled={!hasTarget}
              onClick={() => setViewMode("percent")}
            >
              {pick(language, "% objectif", "% target")}
            </button>
          </div>

          <div
            className={styles.segmentedControl}
            aria-label={pick(
              language,
              "Échelle du graphique",
              "Chart scale",
            )}
          >
            <button
              type="button"
              data-testid="advisor-trajectory-scale-auto"
              className={
                scaleMode === "auto" ? styles.activeSegment : undefined
              }
              onClick={() => setScaleMode("auto")}
            >
              Auto
            </button>
            <button
              type="button"
              data-testid="advisor-trajectory-scale-zero"
              className={
                scaleMode === "zero" ? styles.activeSegment : undefined
              }
              onClick={() => setScaleMode("zero")}
            >
              {pick(language, "Depuis 0", "From 0")}
            </button>
            <button
              type="button"
              data-testid="advisor-trajectory-scale-target"
              className={
                scaleMode === "target"
                  ? styles.activeSegment
                  : undefined
              }
              disabled={!hasTarget}
              onClick={() => {
                setViewMode("amount");
                setScaleMode("target");
              }}
            >
              {pick(language, "Voir la cible", "See target")}
            </button>
          </div>
        </div>
      </div>

      <div
        className={styles.trajectoryKpis}
        data-testid="advisor-trajectory-summary"
      >
        <article>
          <span>{pick(language, "Valeur projetée", "Projected value")}</span>
          <strong>
            {formatMoney(projectedValue, currency, language)}
          </strong>
          <small>
            {pick(
              language,
              "Selon le scénario affiché",
              "Under the displayed scenario",
            )}
          </small>
        </article>

        <article>
          <span>{pick(language, "Objectif", "Target")}</span>
          <strong>
            {hasTarget
              ? formatMoney(comparisonTarget, currency, language)
              : pick(language, "N/D", "N/A")}
          </strong>
          <small>
            {pick(
              language,
              "Cible finale, ajustée selon les hypothèses",
              "Final target under the assumptions",
            )}
          </small>
        </article>

        <article>
          <span>{pick(language, "Écart à combler", "Gap to close")}</span>
          <strong
            className={
              gapValue === 0
                ? styles.positiveValue
                : styles.negativeValue
            }
          >
            {gapValue == null
              ? pick(language, "N/D", "N/A")
              : gapValue === 0
                ? pick(language, "Objectif atteint", "Target reached")
                : formatMoney(gapValue, currency, language)}
          </strong>
          <small>
            {pick(
              language,
              "Scénario projeté vs cible",
              "Projected scenario vs target",
            )}
          </small>
        </article>

        <article>
          <span>{pick(language, "Progression", "Progress")}</span>
          <strong>
            {hasTarget
              ? `${Math.round(projectedProgress)}%`
              : pick(language, "N/D", "N/A")}
          </strong>
          <small>
            {hasTarget
              ? pick(
                  language,
                  `Aujourd’hui ${Math.round(currentProgress)}%`,
                  `Today ${Math.round(currentProgress)}%`,
                )
              : pick(
                  language,
                  "Ajoute une cible pour mesurer la progression",
                  "Add a target to measure progress",
                )}
          </small>
        </article>
      </div>

      <div className={styles.trajectoryPace}>
        <article>
          <span>
            {pick(
              language,
              "Contribution actuelle",
              "Current contribution",
            )}
          </span>
          <strong>
            {formatMoney(scenarioMonthly, currency, language)}
            <small>/mois</small>
          </strong>
        </article>
        <article>
          <span>
            {pick(
              language,
              "Contribution requise",
              "Required contribution",
            )}
          </span>
          <strong>
            {formatMoney(
              requiredMonthlyValue,
              currency,
              language,
            )}
            {requiredMonthlyValue != null ? <small>/mois</small> : null}
          </strong>
        </article>
        <article>
          <span>
            {pick(language, "Écart mensuel", "Monthly gap")}
          </span>
          <strong>
            {formatMoney(monthlyGap, currency, language)}
            {monthlyGap != null ? <small>/mois</small> : null}
          </strong>
        </article>
        <article>
          <span>
            {pick(
              language,
              "Atteinte estimée",
              "Estimated achievement",
            )}
          </span>
          <strong>
            {hasTarget
              ? monthLabel(estimatedTargetMonth, language)
              : pick(language, "N/D", "N/A")}
          </strong>
        </article>
      </div>

      {hasTarget ? (
        <div className={styles.trajectoryMilestones}>
          {milestones.map((milestone) => (
            <div key={milestone.ratio}>
              <strong>{Math.round(milestone.ratio * 100)}%</strong>
              <span>
                {formatMoney(
                  milestone.amount,
                  currency,
                  language,
                )}
              </span>
              <small>
                {milestone.reachedMonth == null
                  ? pick(language, "Non atteint", "Not reached")
                  : monthLabel(
                      milestone.reachedMonth,
                      language,
                    )}
              </small>
            </div>
          ))}
        </div>
      ) : null}

      {targetOffScale &&
      scaleMode !== "target" &&
      viewMode === "amount" ? (
        <div
          className={styles.offScaleBanner}
          data-testid="advisor-target-offscale"
        >
          <div>
            <strong>
              {pick(
                language,
                "La cible est hors échelle dans la vue compacte.",
                "The target is off scale in compact view.",
              )}
            </strong>
            <span>
              {pick(
                language,
                "Anatole protège la lisibilité de la trajectoire. Utilise « Voir la cible » ou « % objectif » pour la remettre dans le contexte.",
                "Anatole preserves trajectory readability. Use “See target” or “% target” to restore the full context.",
              )}
            </span>
          </div>
          <b>
            {formatMoney(targetDisplayPeak, currency, language)}
          </b>
        </div>
      ) : null}

      <div className={styles.chartLegend}>
        <span>
          <i className={styles.legendBaseline} />
          {pick(
            language,
            "Trajectoire actuelle",
            "Current trajectory",
          )}
        </span>
        {scenarioDistinct ? (
          <span>
            <i className={styles.legendScenario} />
            {pick(language, "Scénario", "Scenario")}
          </span>
        ) : (
          <span>
            <i className={styles.legendScenario} />
            {pick(
              language,
              "Scénario identique à l’actuel",
              "Scenario identical to current",
            )}
          </span>
        )}
        {showTargetPath ? (
          <span>
            <i className={styles.legendTarget} />
            {viewMode === "percent"
              ? pick(language, "Objectif = 100%", "Target = 100%")
              : pick(language, "Cible", "Target")}
          </span>
        ) : null}
      </div>

      <div className={styles.chartCanvas}>
        <div
          className={styles.yAxis}
          data-testid="advisor-trajectory-y-axis"
        >
          {yTicks.map((value, index) => (
            <span key={`${index}-${value.toFixed(2)}`}>
              {formatAxis(value)}
            </span>
          ))}
        </div>

        <svg
          data-testid="advisor-trajectory-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={pick(
            language,
            "Trajectoire financière manipulable",
            "Interactive financial trajectory",
          )}
          onPointerMove={(event) => {
            const bounds =
              event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(
              0,
              Math.min(
                1,
                (event.clientX - bounds.left) /
                  Math.max(1, bounds.width),
              ),
            );
            setHoverMonth(
              Math.round(ratio * safeMonths),
            );
          }}
          onPointerLeave={() => setHoverMonth(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={height * ratio}
              x2={width}
              y2={height * ratio}
              className={styles.gridLine}
            />
          ))}

          {scenarioDistinct ? (
            <path
              d={areaForRange(
                displayScenario,
                width,
                height,
                minValue,
                maxValue,
              )}
              className={styles.scenarioArea}
            />
          ) : null}

          {showTargetPath ? (
            <path
              data-testid="advisor-target-path"
              d={pathForRange(
                displayTarget,
                width,
                height,
                minValue,
                maxValue,
              )}
              className={styles.targetPath}
            />
          ) : null}

          <path
            data-testid="advisor-baseline-path"
            d={pathForRange(
              displayBaseline,
              width,
              height,
              minValue,
              maxValue,
            )}
            className={styles.baselinePath}
          />

          {scenarioDistinct ? (
            <path
              data-testid="advisor-scenario-path"
              d={pathForRange(
                displayScenario,
                width,
                height,
                minValue,
                maxValue,
              )}
              className={styles.scenarioPath}
            />
          ) : null}

          {milestones
            .filter(
              (milestone) =>
                milestone.reachedMonth != null,
            )
            .map((milestone) => {
              const x =
                ((milestone.reachedMonth ?? 0) /
                  Math.max(1, safeMonths)) *
                width;
              return (
                <line
                  key={milestone.ratio}
                  x1={x}
                  y1="0"
                  x2={x}
                  y2={height}
                  className={styles.milestoneLine}
                />
              );
            })}

          {hoverMonth != null ? (
            <>
              <line
                x1={hoverX}
                y1="0"
                x2={hoverX}
                y2={height}
                className={styles.hoverLine}
              />
              <circle
                cx={hoverX}
                cy={hoverScenarioY}
                r="5"
                className={styles.hoverDot}
              />
            </>
          ) : null}
        </svg>
      </div>

      <div className={styles.xAxis}>
        <span>{pick(language, "Aujourd’hui", "Today")}</span>
        <span>
          {monthLabel(
            Math.round(safeMonths * 0.25),
            language,
          )}
        </span>
        <span>
          {monthLabel(
            Math.round(safeMonths * 0.5),
            language,
          )}
        </span>
        <span>
          {monthLabel(
            Math.round(safeMonths * 0.75),
            language,
          )}
        </span>
        <span>{monthLabel(safeMonths, language)}</span>
      </div>

      <div className={styles.chartReadout}>
        <strong>{monthLabel(activeMonth, language)}</strong>
        <span>
          {pick(language, "Actuel", "Current")}{" "}
          <b>
            {formatMoney(
              activeBaseline,
              currency,
              language,
            )}
          </b>
        </span>
        <span>
          {pick(language, "Scénario", "Scenario")}{" "}
          <b>
            {formatMoney(
              activeScenario,
              currency,
              language,
            )}
          </b>
        </span>
        <span>
          {pick(language, "Cible réelle", "Actual target")}{" "}
          <b>
            {hasTarget
              ? formatMoney(
                  activeTarget,
                  currency,
                  language,
                )
              : pick(language, "N/D", "N/A")}
          </b>
        </span>
        <span>
          {pick(language, "Écart", "Gap")}{" "}
          <b>
            {activeGap == null
              ? pick(language, "N/D", "N/A")
              : activeGap === 0
                ? pick(language, "Atteint", "Met")
                : formatMoney(
                    activeGap,
                    currency,
                    language,
                  )}
          </b>
        </span>
      </div>

      <div className={styles.trajectoryNarrative}>
        {hasTarget
          ? pick(
              language,
              `À tes hypothèses actuelles, la trajectoire se termine à ${formatMoney(
                projectedValue,
                currency,
                language,
              )}, soit ${Math.round(
                projectedProgress,
              )}% de la cible. ${
                gapValue && gapValue > 0
                  ? `Il manque ${formatMoney(
                      gapValue,
                      currency,
                      language,
                    )}.`
                  : "La cible est atteinte ou dépassée."
              }`,
              `Under the current assumptions, the trajectory ends at ${formatMoney(
                projectedValue,
                currency,
                language,
              )}, or ${Math.round(
                projectedProgress,
              )}% of the target. ${
                gapValue && gapValue > 0
                  ? `${formatMoney(
                      gapValue,
                      currency,
                      language,
                    )} remains.`
                  : "The target is reached or exceeded."
              }`,
            )
          : pick(
              language,
              "Ajoute une cible pour obtenir la progression, le gap et le rythme requis.",
              "Add a target to calculate progress, gap and required pace.",
            )}
      </div>
    </div>
  );
}

export function AdvisorCommandCenter({
  profile,
  plan,
  profileProgress,
  goalLabel,
  language,
  step,
  portfolioCount,
  dashboardMode,
  onEditProfile,
  onNewGoal,
  onApplyProfile,
  onOpenAnalysis,
}: {
  profile: AdvisorProfile;
  plan: AdvisorPlan | null;
  profileProgress: number;
  goalLabel: string;
  language: AnatoleLanguage;
  step: number;
  portfolioCount: number;
  dashboardMode: boolean;
  onEditProfile: () => void;
  onNewGoal: () => void;
  onApplyProfile: (profile: AdvisorProfile) => void;
  onOpenAnalysis: () => void;
}) {
  const [tab, setTab] = useState<CommandTab>("overview");
  const [monthlyDelta, setMonthlyDelta] = useState(0);
  const [yearsDelta, setYearsDelta] = useState(0);
  const [returnAssumption, setReturnAssumption] = useState(0);
  const [inflationAssumption, setInflationAssumption] = useState(0);
  const [scenarioName, setScenarioName] = useState("");
  const [savedScenarios, setSavedScenarios] =
    useState<SavedScenario[]>(readScenarios);
  const [household, setHousehold] = useState<HouseholdTwin>(readTwin);
  const [savedGoals, setSavedGoals] = useState<SavedGoal[]>(readGoals);
  const [dismissedAlerts, setDismissedAlerts] =
    useState<string[]>(readDismissedAlerts);
  const [previousSnapshot] =
    useState<ProgressSnapshot | null>(readPreviousSnapshot);

  const currentSavings = safeNumber(profile.current_savings);
  const monthlyContribution = safeNumber(profile.monthly_contribution);
  const target = safeNumber(profile.target_amount);
  const baseYears = safeNumber(profile.horizon_years);
  const expenses = safeNumber(profile.essential_monthly_expenses);
  const reserve = safeNumber(profile.liquid_reserve);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      profile.goal_type == null ||
      profile.current_savings == null
    ) {
      return;
    }
    const snapshot: ProgressSnapshot = {
      date: new Date().toISOString(),
      goalType: profile.goal_type,
      currentSavings,
      monthlyContribution,
      targetAmount: profile.target_amount,
    };
    const parsed = readJson<ProgressSnapshot[]>(HISTORY_KEY, []);
    const history = Array.isArray(parsed) ? parsed.slice(-29) : [];
    const today = snapshot.date.slice(0, 10);
    const last = history[history.length - 1];
    if (last?.date?.slice(0, 10) === today) {
      history[history.length - 1] = snapshot;
    } else {
      history.push(snapshot);
    }
    writeJson(HISTORY_KEY, history);
  }, [
    currentSavings,
    monthlyContribution,
    profile.current_savings,
    profile.goal_type,
    profile.target_amount,
  ]);

  const adjustedYears = Math.max(0.25, baseYears + yearsDelta);
  const adjustedMonths = Math.max(1, Math.round(adjustedYears * 12));
  const baseMonths = Math.max(1, Math.round(Math.max(baseYears, 0.25) * 12));
  const adjustedMonthly = Math.max(0, monthlyContribution + monthlyDelta);
  const inflationAdjustedTarget =
    target > 0
      ? target * (1 + inflationAssumption / 100) ** adjustedYears
      : 0;
  const scenarioValue = futureValue(
    currentSavings,
    adjustedMonthly,
    adjustedMonths,
    returnAssumption,
  );
  const baselineValue = futureValue(
    currentSavings,
    monthlyContribution,
    baseMonths,
    0,
  );
  const scenarioGap =
    inflationAdjustedTarget > 0
      ? scenarioValue - inflationAdjustedTarget
      : null;
  const monthlyNeeded = requiredMonthly(
    currentSavings,
    inflationAdjustedTarget,
    adjustedMonths,
    returnAssumption,
  );
  const progress =
    target > 0 ? Math.min(100, (currentSavings / target) * 100) : 0;
  const reserveMonths =
    expenses > 0 ? reserve / expenses : plan?.reserve_months ?? null;
  const targetMonths = monthsToTarget(
    currentSavings,
    adjustedMonthly,
    inflationAdjustedTarget,
    returnAssumption,
  );
  const baseTargetMonths = monthsToTarget(
    currentSavings,
    monthlyContribution,
    target,
    0,
  );
  const previousDelta =
    previousSnapshot &&
    previousSnapshot.goalType === profile.goal_type
      ? currentSavings - previousSnapshot.currentSavings
      : null;

  const focus = adaptiveFocus(profile.goal_type, language);
  const shopCategory = shoppingCategory(profile.goal_type);

  const nextMilestonePercent =
    [25, 50, 75, 100].find((value) => progress < value) ?? 100;
  const nextMilestoneAmount =
    target > 0 ? (target * nextMilestonePercent) / 100 : 0;
  const nextMilestoneMonths = monthsToTarget(
    currentSavings,
    monthlyContribution,
    nextMilestoneAmount,
    0,
  );

  const baselineRequired = requiredMonthly(
    currentSavings,
    target,
    baseMonths,
    0,
  );
  const plus200Months = monthsToTarget(
    currentSavings,
    monthlyContribution + 200,
    target,
    0,
  );
  const plus5000Months = monthsToTarget(
    currentSavings + 5000,
    monthlyContribution,
    target,
    0,
  );
  const longerRequired = requiredMonthly(
    currentSavings,
    target,
    baseMonths + 12,
    0,
  );

  const sensitivity: SensitivityLever[] = [
    {
      id: "monthly",
      title: pick(
        language,
        "+200 $ / mois — test",
        "+$200 / month — test",
      ),
      value:
        baseTargetMonths != null && plus200Months != null
          ? pick(
              language,
              `${Math.max(0, baseTargetMonths - plus200Months)} mois d’écart`,
              `${Math.max(0, baseTargetMonths - plus200Months)} months difference`,
            )
          : "N/D",
      detail: pick(
        language,
        "Mesure uniquement l’effet mathématique d’une contribution plus élevée.",
        "Measures only the mathematical effect of a higher contribution.",
      ),
      strength:
        baseTargetMonths != null && plus200Months != null
          ? Math.max(0, baseTargetMonths - plus200Months)
          : 0,
    },
    {
      id: "upfront",
      title: pick(
        language,
        "+5 000 $ aujourd’hui — test",
        "+$5,000 today — test",
      ),
      value:
        baseTargetMonths != null && plus5000Months != null
          ? pick(
              language,
              `${Math.max(0, baseTargetMonths - plus5000Months)} mois d’écart`,
              `${Math.max(0, baseTargetMonths - plus5000Months)} months difference`,
            )
          : "N/D",
      detail: pick(
        language,
        "Mesure l’effet d’un capital initial hypothétique plus élevé.",
        "Measures the effect of a hypothetical higher starting amount.",
      ),
      strength:
        baseTargetMonths != null && plus5000Months != null
          ? Math.max(0, baseTargetMonths - plus5000Months)
          : 0,
    },
    {
      id: "horizon",
      title: pick(language, "+1 an d’horizon — test", "+1 year horizon — test"),
      value:
        baselineRequired != null && longerRequired != null
          ? pick(
              language,
              `${formatMoney(Math.max(0, baselineRequired - longerRequired), profile.currency, language)} / mois de rythme requis en moins`,
              `${formatMoney(Math.max(0, baselineRequired - longerRequired), profile.currency, language)} / month less required pace`,
            )
          : "N/D",
      detail: pick(
        language,
        "Mesure l’effet du temps sur le rythme mensuel requis.",
        "Measures how additional time changes the required monthly pace.",
      ),
      strength:
        baselineRequired != null && longerRequired != null
          ? Math.max(
              0,
              ((baselineRequired - longerRequired) /
                Math.max(1, baselineRequired)) *
                12,
            )
          : 0,
    },
  ].sort((a, b) => b.strength - a.strength);

  const missingInputs: Array<{
    missing: boolean;
    label: string;
    detail: string;
    target: "profile" | "twin";
  }> = [
    {
      missing: profile.target_amount == null,
      label: pick(language, "Montant cible", "Target amount"),
      detail: pick(
        language,
        "Sans cible, Anatole ne peut pas mesurer l’écart ni les jalons.",
        "Without a target, Anatole cannot measure the gap or milestones.",
      ),
      target: "profile",
    },
    {
      missing: profile.horizon_years == null,
      label: pick(language, "Horizon", "Horizon"),
      detail: pick(
        language,
        "L’horizon détermine le rythme mathématique nécessaire.",
        "The horizon determines the mathematical pace required.",
      ),
      target: "profile",
    },
    {
      missing: profile.current_savings == null,
      label: pick(language, "Capital disponible", "Available capital"),
      detail: pick(
        language,
        "Le point de départ est nécessaire pour situer la progression.",
        "The starting point is required to position progress.",
      ),
      target: "profile",
    },
    {
      missing: profile.essential_monthly_expenses == null,
      label: pick(language, "Dépenses essentielles", "Essential expenses"),
      detail: pick(
        language,
        "Ce chiffre permet de mesurer la couverture de la réserve.",
        "This figure measures reserve coverage.",
      ),
      target: "profile",
    },
    {
      missing: profile.liquid_reserve == null,
      label: pick(language, "Réserve liquide", "Liquid reserve"),
      detail: pick(
        language,
        "La réserve précise la marge de sécurité à court terme.",
        "The reserve clarifies short-term financial flexibility.",
      ),
      target: "profile",
    },
    {
      missing: household.monthlyIncome == null,
      label: pick(language, "Revenu mensuel net", "Net monthly income"),
      detail: pick(
        language,
        "Il complète le jumeau financier et permet de calculer un flux mensuel déclaré.",
        "It completes the financial twin and enables a declared monthly cash-flow view.",
      ),
      target: "twin",
    },
  ];
  const nextBestInput =
    missingInputs.find((item) => item.missing) ?? null;

  const alerts: PlanAlert[] = [];
  if (
    target > 0 &&
    baseTargetMonths != null &&
    baseYears > 0 &&
    baseTargetMonths > baseMonths
  ) {
    alerts.push({
      id: "pace",
      tone: "attention",
      title: pick(
        language,
        "La trajectoire actuelle dépasse l’horizon choisi",
        "Current trajectory extends beyond the chosen horizon",
      ),
      detail: pick(
        language,
        `Au rythme déclaré, l’atteinte mathématique se situe vers ${monthLabel(baseTargetMonths, language)}, contre une cible de ${horizonDateLabel(baseYears, language)}.`,
        `At the declared pace, the mathematical target date is around ${monthLabel(baseTargetMonths, language)}, versus a target of ${horizonDateLabel(baseYears, language)}.`,
      ),
    });
  }
  if (baseTargetMonths != null && baseTargetMonths <= 18 && target > currentSavings) {
    alerts.push({
      id: "near_target",
      tone: "info",
      title: pick(
        language,
        "L’objectif entre dans une fenêtre de 18 mois",
        "The goal is entering an 18-month window",
      ),
      detail: pick(
        language,
        "Les hypothèses de liquidité et d’échéancier deviennent particulièrement sensibles à mesure que la date approche.",
        "Liquidity and timing assumptions become especially sensitive as the date approaches.",
      ),
    });
  }
  if (reserveMonths != null && reserveMonths < 3) {
    alerts.push({
      id: "reserve",
      tone: "attention",
      title: pick(
        language,
        "Réserve déclarée sous 3 mois de dépenses",
        "Declared reserve is below 3 months of expenses",
      ),
      detail: pick(
        language,
        `La couverture actuelle est d’environ ${reserveMonths.toFixed(1)} mois. Anatole la signale comme contrainte de liquidité, sans prescrire de niveau.`,
        `Current coverage is about ${reserveMonths.toFixed(1)} months. Anatole flags it as a liquidity constraint without prescribing a level.`,
      ),
    });
  }
  if (previousDelta != null && previousDelta !== 0) {
    alerts.push({
      id: "progress_change",
      tone: "progress",
      title: pick(
        language,
        "Le capital déclaré a changé depuis la référence précédente",
        "Declared capital changed since the previous reference",
      ),
      detail: pick(
        language,
        `${previousDelta >= 0 ? "+" : ""}${formatMoney(previousDelta, profile.currency, language)} depuis le dernier snapshot local disponible.`,
        `${previousDelta >= 0 ? "+" : ""}${formatMoney(previousDelta, profile.currency, language)} since the last available local snapshot.`,
      ),
    });
  }
  if (progress >= 25) {
    const reached = [25, 50, 75, 100]
      .filter((value) => progress >= value)
      .at(-1);
    if (reached != null) {
      alerts.push({
        id: `milestone_${reached}`,
        tone: "progress",
        title: pick(
          language,
          `Jalon ${reached} % atteint`,
          `${reached}% milestone reached`,
        ),
        detail: pick(
          language,
          "Le jalon est calculé uniquement à partir du capital déclaré et de la cible.",
          "The milestone is calculated only from declared capital and target.",
        ),
      });
    }
  }
  const visibleAlerts = alerts.filter(
    (alert) => !dismissedAlerts.includes(alert.id),
  );

  const twinAssets =
    safeNumber(household.otherAssets) + currentSavings;
  const twinDebt = safeNumber(household.totalDebt);
  const twinNetWorth =
    household.otherAssets == null &&
    household.totalDebt == null &&
    profile.current_savings == null
      ? null
      : twinAssets - twinDebt;
  const monthlyFreeFlow =
    household.monthlyIncome == null
      ? null
      : household.monthlyIncome -
        expenses -
        safeNumber(household.monthlyDebtPayments) -
        monthlyContribution;

  const timelineThresholds = [25, 50, 75, 100].map((percent) => {
    const amount = target > 0 ? (target * percent) / 100 : 0;
    const months = monthsToTarget(
      currentSavings,
      monthlyContribution,
      amount,
      0,
    );
    return { percent, amount, months, reached: progress >= percent };
  });

  const saveCurrentScenario = () => {
    const scenario: SavedScenario = {
      id: `scenario-${Date.now()}`,
      name:
        scenarioName.trim() ||
        pick(
          language,
          `Scénario ${savedScenarios.length + 1}`,
          `Scenario ${savedScenarios.length + 1}`,
        ),
      createdAt: new Date().toISOString(),
      monthlyDelta,
      yearsDelta,
      annualReturn: returnAssumption,
      inflation: inflationAssumption,
      projectedValue: scenarioValue,
      targetValue: inflationAdjustedTarget,
      gap: scenarioGap,
      targetMonths,
    };
    const next = [...savedScenarios, scenario].slice(-6);
    setSavedScenarios(next);
    writeJson(SCENARIO_KEY, next);
    setScenarioName("");
  };

  const deleteScenario = (id: string) => {
    const next = savedScenarios.filter((item) => item.id !== id);
    setSavedScenarios(next);
    writeJson(SCENARIO_KEY, next);
  };

  const updateTwin = (key: keyof HouseholdTwin, value: string) => {
    const parsed =
      value === "" || !Number.isFinite(Number(value))
        ? null
        : Math.max(0, Number(value));
    const next = { ...household, [key]: parsed };
    setHousehold(next);
    writeJson(TWIN_KEY, next);
  };

  const saveGoal = () => {
    if (!profile.goal_type) return;
    const nextGoal: SavedGoal = {
      id: `goal-${Date.now()}`,
      name:
        profile.goal_name?.trim() ||
        goalTypeLabel(profile.goal_type, language),
      createdAt: new Date().toISOString(),
      profile: { ...profile },
    };
    const deduped = savedGoals.filter(
      (item) =>
        item.profile.goal_type !== profile.goal_type ||
        item.name !== nextGoal.name,
    );
    const next = [...deduped, nextGoal].slice(-5);
    setSavedGoals(next);
    writeJson(GOALS_KEY, next);
  };

  const deleteGoal = (id: string) => {
    const next = savedGoals.filter((item) => item.id !== id);
    setSavedGoals(next);
    writeJson(GOALS_KEY, next);
  };

  const dismissAlert = (id: string) => {
    const next = [...new Set([...dismissedAlerts, id])];
    setDismissedAlerts(next);
    writeJson(DISMISSED_ALERTS_KEY, next);
  };

  return (
    <section
      className={styles.command}
      data-testid="advisor-command-center"
    >
      <header className={styles.commandHeader}>
        <div>
          <span className={styles.eyebrow}>
            <Sparkles size={13} />
            ANATOLE CONSEIL · {dashboardMode ? "COCKPIT" : "LIVE"}
          </span>
          <h2>
            {dashboardMode
              ? pick(
                  language,
                  "Voici où en est ton plan.",
                  "Here is where your plan stands.",
                )
              : pick(
                  language,
                  "Ton plan se met à jour pendant que tu réponds.",
                  "Your plan updates as you answer.",
                )}
          </h2>
          <p>
            {dashboardMode
              ? pick(
                  language,
                  "Progression, trajectoire, scénarios, jalons et données manquantes réunis dans un seul cockpit.",
                  "Progress, trajectory, scenarios, milestones and missing inputs in one cockpit.",
                )
              : pick(
                  language,
                  "Le cockpit se construit en parallèle du questionnaire et devient ta page d’accueil Conseil une fois le premier parcours terminé.",
                  "The cockpit is built alongside the questionnaire and becomes your Advice home after the first journey.",
                )}
          </p>
        </div>

        <div className={styles.headerActions}>
          {dashboardMode ? (
            <>
              <button type="button" onClick={onEditProfile}>
                <Edit3 size={13} />
                {pick(language, "Modifier", "Edit")}
              </button>
              <button type="button" onClick={onNewGoal}>
                <Plus size={13} />
                {pick(language, "Nouvel objectif", "New goal")}
              </button>
            </>
          ) : null}
          <div className={styles.liveBadge}>
            <span>{profileProgress}%</span>
            <small>{pick(language, "profil utile", "useful profile")}</small>
          </div>
        </div>
      </header>

      {dashboardMode && profile.goal_type ? (
        <section className={styles.goalShelf} data-testid="advisor-goal-shelf">
          <div className={styles.goalShelfTitle}>
            <div>
              <span>{pick(language, "MES OBJECTIFS", "MY GOALS")}</span>
              <strong>
                {pick(
                  language,
                  "Passe d’un objectif à l’autre sans recréer le profil.",
                  "Switch goals without rebuilding the profile.",
                )}
              </strong>
            </div>
            <button type="button" onClick={saveGoal}>
              <Save size={12} />
              {pick(language, "Enregistrer l’objectif actuel", "Save current goal")}
            </button>
          </div>

          <div className={styles.goalCards}>
            <article className={styles.currentGoalCard}>
              <span>{pick(language, "ACTIF", "ACTIVE")}</span>
              <strong>{profile.goal_name || goalLabel}</strong>
              <small>
                {formatMoney(profile.current_savings, profile.currency, language)}
                {" / "}
                {formatMoney(profile.target_amount, profile.currency, language)}
              </small>
            </article>
            {savedGoals.map((goal) => (
              <article key={goal.id}>
                <span>{goalTypeLabel(goal.profile.goal_type, language)}</span>
                <strong>{goal.name}</strong>
                <small>
                  {formatMoney(goal.profile.current_savings, goal.profile.currency, language)}
                  {" / "}
                  {formatMoney(goal.profile.target_amount, goal.profile.currency, language)}
                </small>
                <div>
                  <button
                    type="button"
                    onClick={() => onApplyProfile(goal.profile)}
                  >
                    {pick(language, "Activer", "Activate")}
                  </button>
                  <button
                    type="button"
                    aria-label={pick(language, "Supprimer l’objectif", "Delete goal")}
                    onClick={() => deleteGoal(goal.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.adaptiveStrip}>
        <div className={styles.adaptiveIcon}>
          <Target size={17} />
        </div>
        <div>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
        </div>
        <div className={styles.adaptiveChips}>
          {focus.chips.map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
      </div>

      <nav
        className={styles.tabs}
        aria-label={pick(language, "Vues du plan", "Plan views")}
      >
        <button
          type="button"
          className={tab === "overview" ? styles.tabActive : styles.tab}
          onClick={() => setTab("overview")}
        >
          <Gauge size={14} />
          {pick(language, "Vue d’ensemble", "Overview")}
        </button>
        <button
          type="button"
          data-testid="advisor-tab-scenarios"
          className={tab === "scenarios" ? styles.tabActive : styles.tab}
          onClick={() => setTab("scenarios")}
        >
          <LineChart size={14} />
          {pick(language, "Scénarios", "Scenarios")}
        </button>
        <button
          type="button"
          className={tab === "timeline" ? styles.tabActive : styles.tab}
          onClick={() => setTab("timeline")}
        >
          <CalendarClock size={14} />
          Timeline
        </button>
        <button
          type="button"
          className={tab === "twin" ? styles.tabActive : styles.tab}
          onClick={() => setTab("twin")}
        >
          <Activity size={14} />
          {pick(language, "Jumeau financier", "Financial twin")}
        </button>
      </nav>

      {tab === "overview" ? (
        <div className={styles.overview}>
          <section className={styles.primaryPlan} data-testid="advisor-primary-plan">
            <div className={styles.primaryCopy}>
              <span>{pick(language, "PLAN PRINCIPAL", "PRIMARY PLAN")}</span>
              <h3>{profile.goal_name || goalLabel}</h3>
              <div className={styles.bigNumbers}>
                <strong>
                  {formatMoney(currentSavings, profile.currency, language)}
                </strong>
                <span>
                  / {formatMoney(target || null, profile.currency, language)}
                </span>
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label={pick(language, "Progression vers lâ€™objectif", "Progress toward goal")}
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.progressMeta}>
                <b>{Math.round(progress)}%</b>
                <span>
                  {pick(language, "cible", "target")}{" "}
                  {horizonDateLabel(baseYears, language)}
                </span>
              </div>
            </div>

            <div className={styles.primaryDates}>
              <article>
                <span>{pick(language, "Projection actuelle", "Current projection")}</span>
                <strong>{monthLabel(baseTargetMonths, language)}</strong>
                <small>
                  {pick(
                    language,
                    "Rythme déclaré, sans hypothèse de croissance",
                    "Declared pace, with no growth assumption",
                  )}
                </small>
              </article>
              <article>
                <span>{pick(language, "Rythme déclaré", "Declared pace")}</span>
                <strong>
                  {formatMoney(
                    monthlyContribution,
                    profile.currency,
                    language,
                  )}{" "}
                  / {pick(language, "mois", "month")}
                </strong>
                <small>
                  {baselineRequired == null
                    ? pick(language, "Rythme requis N/D", "Required pace N/A")
                    : pick(
                        language,
                        `Rythme mathématique cible : ${formatMoney(baselineRequired, profile.currency, language)} / mois`,
                        `Mathematical target pace: ${formatMoney(baselineRequired, profile.currency, language)} / month`,
                      )}
                </small>
              </article>
              <article className={styles.nextMilestone}>
                <Flag size={15} />
                <div>
                  <span>
                    {pick(language, "Prochain jalon", "Next milestone")}{" "}
                    {nextMilestonePercent}%
                  </span>
                  <strong>
                    {formatMoney(
                      nextMilestoneAmount,
                      profile.currency,
                      language,
                    )}
                  </strong>
                  <small>{monthLabel(nextMilestoneMonths, language)}</small>
                </div>
              </article>
            </div>
          </section>

          {visibleAlerts.length ? (
            <section className={styles.alertRail}>
              <div className={styles.sectionTitleRow}>
                <div>
                  <span><Bell size={13} />{pick(language, "VEILLE DU PLAN", "PLAN WATCH")}</span>
                  <strong>
                    {pick(
                      language,
                      "Signaux calculés à partir de ton plan",
                      "Signals calculated from your plan",
                    )}
                  </strong>
                </div>
              </div>
              <div className={styles.alertGrid}>
                {visibleAlerts.slice(0, 4).map((alert) => (
                  <article
                    key={alert.id}
                    data-tone={alert.tone}
                  >
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      ×
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className={styles.sensitivityBlock}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span>{pick(language, "SENSIBILITÉ", "SENSITIVITY")}</span>
                <strong>
                  {pick(
                    language,
                    "Qu’est-ce qui change le plus la trajectoire ?",
                    "What changes the trajectory most?",
                  )}
                </strong>
              </div>
              <small>
                {pick(
                  language,
                  "Tests mathématiques comparatifs — aucune option n’est une recommandation.",
                  "Comparative mathematical tests — no option is a recommendation.",
                )}
              </small>
            </div>
            <div className={styles.sensitivityGrid}>
              {sensitivity.map((lever, index) => (
                <article key={lever.id}>
                  <span>#{index + 1}</span>
                  <strong>{lever.title}</strong>
                  <b>{lever.value}</b>
                  <small>{lever.detail}</small>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.nextBest}>
            <div className={styles.nextBestIcon}>
              <Sparkles size={18} />
            </div>
            <div>
              <span>{pick(language, "PROCHAINE INFORMATION UTILE", "NEXT USEFUL INPUT")}</span>
              <strong>
                {nextBestInput
                  ? nextBestInput.label
                  : pick(
                      language,
                      "Le profil de base est suffisamment documenté",
                      "The base profile is sufficiently documented",
                    )}
              </strong>
              <p>
                {nextBestInput
                  ? nextBestInput.detail
                  : pick(
                      language,
                      "Tu peux maintenant utiliser les scénarios, la timeline ou compléter le jumeau financier pour enrichir le suivi.",
                      "You can now use scenarios, the timeline or complete the financial twin to enrich tracking.",
                    )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (nextBestInput?.target === "twin") setTab("twin");
                else onEditProfile();
              }}
            >
              {nextBestInput
                ? pick(language, "Compléter", "Complete")
                : pick(language, "Voir le jumeau", "View twin")}
              <ArrowRight size={13} />
            </button>
          </section>

          <div className={styles.overviewActions}>
            <Link
              href={`/assistant/magasiner?category=${shopCategory}`}
              className={styles.shoppingCta}
              data-testid="advisor-contextual-shopping"
            >
              <div>
                <WalletCards size={18} />
                <span>
                  <strong>{shoppingLabel(profile.goal_type, language)}</strong>
                  <small>
                    {pick(
                      language,
                      "Ouvre directement la catégorie liée à cet objectif.",
                      "Open the category linked to this goal.",
                    )}
                  </small>
                </span>
              </div>
              <ArrowRight size={17} />
            </Link>

            {plan ? (
              <button
                type="button"
                className={styles.analysisButton}
                onClick={onOpenAnalysis}
              >
                <Landmark size={16} />
                <span>
                  <strong>
                    {pick(
                      language,
                      "Analyse détaillée & conversation",
                      "Detailed analysis & conversation",
                    )}
                  </strong>
                  <small>
                    {pick(
                      language,
                      "Retrouver les priorités calculées et le chat Conseil.",
                      "Open calculated priorities and Advice chat.",
                    )}
                  </small>
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "scenarios" ? (
        <div className={styles.scenarioWorkspace} data-testid="advisor-scenario-lab">
          <section className={styles.chartCard}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span>{pick(language, "TRAJECTOIRE", "TRAJECTORY")}</span>
                <strong>
                  {pick(
                    language,
                    "Manipule les hypothèses, pas seulement les chiffres.",
                    "Manipulate assumptions, not just numbers.",
                  )}
                </strong>
              </div>
              <small>
                {pick(
                  language,
                  "Survole le graphique pour lire une date précise.",
                  "Hover the chart to read a specific date.",
                )}
              </small>
            </div>
            <TrajectoryChart
              currentSavings={currentSavings}
              monthlyContribution={monthlyContribution}
              target={target}
              months={adjustedMonths}
              scenarioMonthly={adjustedMonthly}
              annualReturn={returnAssumption}
              inflation={inflationAssumption}
              currency={profile.currency}
              language={language}
            />
          </section>

          <div className={styles.lab}>
            <section className={styles.labControls}>
              <div className={styles.sectionTitleRow}>
                <div>
                  <span>{pick(language, "HYPOTHÈSES", "ASSUMPTIONS")}</span>
                  <strong>
                    {pick(
                      language,
                      "Teste une trajectoire",
                      "Test a trajectory",
                    )}
                  </strong>
                </div>
              </div>

              <label>
                <span>
                  {pick(language, "Épargne mensuelle", "Monthly contribution")}
                  <strong>
                    {monthlyDelta >= 0 ? "+" : ""}
                    {formatMoney(monthlyDelta, profile.currency, language)}
                  </strong>
                </span>
                <input
                  data-testid="advisor-monthly-delta"
                  type="range"
                  min="-500"
                  max="1500"
                  step="50"
                  value={monthlyDelta}
                  onChange={(event) =>
                    setMonthlyDelta(Number(event.target.value))
                  }
                />
              </label>

              <label>
                <span>
                  {pick(language, "Horizon", "Horizon")}
                  <strong>
                    {yearsDelta >= 0 ? "+" : ""}
                    {yearsDelta} {pick(language, "an(s)", "year(s)")}
                  </strong>
                </span>
                <input
                  type="range"
                  min="-2"
                  max="5"
                  step="1"
                  value={yearsDelta}
                  onChange={(event) =>
                    setYearsDelta(Number(event.target.value))
                  }
                />
              </label>

              <label>
                <span>
                  {pick(language, "Hypothèse de croissance", "Growth assumption")}
                  <strong>{returnAssumption.toFixed(1)}%</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="0.5"
                  value={returnAssumption}
                  onChange={(event) =>
                    setReturnAssumption(Number(event.target.value))
                  }
                />
              </label>

              <label>
                <span>
                  {pick(
                    language,
                    "Inflation appliquée à la cible",
                    "Inflation applied to target",
                  )}
                  <strong>{inflationAssumption.toFixed(1)}%</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.5"
                  value={inflationAssumption}
                  onChange={(event) =>
                    setInflationAssumption(Number(event.target.value))
                  }
                />
              </label>

              <div className={styles.saveScenario}>
                <input
                  value={scenarioName}
                  onChange={(event) => setScenarioName(event.target.value)}
                  placeholder={pick(
                    language,
                    "Nom du scénario (optionnel)",
                    "Scenario name (optional)",
                  )}
                />
                <button type="button" onClick={saveCurrentScenario}>
                  <Save size={13} />
                  {pick(language, "Enregistrer", "Save")}
                </button>
              </div>
            </section>

            <section className={styles.labResults}>
              <article>
                <span>{pick(language, "Valeur projetée", "Projected value")}</span>
                <strong>
                  {formatMoney(scenarioValue, profile.currency, language)}
                </strong>
                <small>
                  {pick(
                    language,
                    `Base sans croissance : ${formatMoney(baselineValue, profile.currency, language)}`,
                    `No-growth baseline: ${formatMoney(baselineValue, profile.currency, language)}`,
                  )}
                </small>
              </article>
              <article>
                <span>{pick(language, "Cible ajustée", "Adjusted target")}</span>
                <strong>
                  {formatMoney(
                    inflationAdjustedTarget || null,
                    profile.currency,
                    language,
                  )}
                </strong>
                <small>
                  {adjustedYears.toFixed(1)} {pick(language, "an(s)", "year(s)")}
                </small>
              </article>
              <article>
                <span>{pick(language, "Écart du scénario", "Scenario gap")}</span>
                <strong>
                  {scenarioGap == null
                    ? "N/D"
                    : scenarioGap >= 0
                      ? `+${formatMoney(scenarioGap, profile.currency, language)}`
                      : `-${formatMoney(Math.abs(scenarioGap), profile.currency, language)}`}
                </strong>
                <small>
                  {pick(
                    language,
                    "Écart mathématique, pas recommandation",
                    "Mathematical gap, not a recommendation",
                  )}
                </small>
              </article>
              <article>
                <span>{pick(language, "Rythme requis", "Required pace")}</span>
                <strong>
                  {monthlyNeeded == null
                    ? "N/D"
                    : `${formatMoney(monthlyNeeded, profile.currency, language)} / ${pick(language, "mois", "month")}`}
                </strong>
                <small>
                  {pick(
                    language,
                    "Selon les hypothèses choisies",
                    "Under selected assumptions",
                  )}
                </small>
              </article>
            </section>
          </div>

          <section className={styles.savedScenarioBlock}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span>{pick(language, "SCÉNARIOS ENREGISTRÉS", "SAVED SCENARIOS")}</span>
                <strong>
                  {pick(
                    language,
                    "Compare tes hypothèses côte à côte",
                    "Compare assumptions side by side",
                  )}
                </strong>
              </div>
            </div>

            {savedScenarios.length ? (
              <div className={styles.savedScenarioGrid}>
                {savedScenarios.map((scenario) => (
                  <article key={scenario.id}>
                    <div>
                      <strong>{scenario.name}</strong>
                      <button
                        type="button"
                        aria-label={pick(language, "Supprimer", "Delete")}
                        onClick={() => deleteScenario(scenario.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <span>
                      {scenario.monthlyDelta >= 0 ? "+" : ""}
                      {formatMoney(
                        scenario.monthlyDelta,
                        profile.currency,
                        language,
                      )}{" "}
                      / {pick(language, "mois", "month")}
                    </span>
                    <span>
                      {scenario.yearsDelta >= 0 ? "+" : ""}
                      {scenario.yearsDelta} {pick(language, "an(s)", "year(s)")}
                    </span>
                    <b>
                      {formatMoney(
                        scenario.projectedValue,
                        profile.currency,
                        language,
                      )}
                    </b>
                    <small>
                      {pick(language, "Atteinte", "Target")}{" "}
                      {monthLabel(scenario.targetMonths, language)}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                {pick(
                  language,
                  "Aucun scénario enregistré. Ajuste les curseurs puis enregistre une hypothèse.",
                  "No saved scenarios. Adjust the sliders and save an assumption.",
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div className={styles.timeline}>
          <div className={styles.sectionTitleRow}>
            <div>
              <span>{pick(language, "TIMELINE DU PLAN", "PLAN TIMELINE")}</span>
              <strong>
                {pick(
                  language,
                  "Chaque jalon se recalcule avec le capital et le rythme déclarés.",
                  "Each milestone recalculates from declared capital and pace.",
                )}
              </strong>
            </div>
          </div>

          <section className={styles.timelineHero}>
            <div>
              <span>{pick(language, "PROCHAINE ÉTAPE", "NEXT MILESTONE")}</span>
              <strong>{nextMilestonePercent}%</strong>
              <h3>
                {formatMoney(
                  nextMilestoneAmount,
                  profile.currency,
                  language,
                )}
              </h3>
              <p>
                {pick(language, "Estimation au rythme actuel :", "Estimate at current pace:")}{" "}
                <b>{monthLabel(nextMilestoneMonths, language)}</b>
              </p>
            </div>
            <Flag size={32} />
          </section>

          <div className={styles.timelineList}>
            <article className={styles.timelineReached}>
              <i><CheckCircle2 size={13} /></i>
              <div>
                <span>{pick(language, "Aujourd’hui", "Today")}</span>
                <strong>
                  {formatMoney(currentSavings, profile.currency, language)}
                </strong>
                <small>{pick(language, "Point de départ déclaré", "Declared starting point")}</small>
              </div>
            </article>

            {timelineThresholds.map((item) => (
              <article
                key={item.percent}
                className={item.reached ? styles.timelineReached : ""}
              >
                <i>
                  {item.reached ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <Flag size={12} />
                  )}
                </i>
                <div>
                  <span>{item.percent}%</span>
                  <strong>
                    {formatMoney(item.amount, profile.currency, language)}
                  </strong>
                  <small>
                    {item.reached
                      ? pick(language, "Atteint", "Reached")
                      : monthLabel(item.months, language)}
                  </small>
                </div>
              </article>
            ))}

            <article className={styles.timelineContext}>
              <i><WalletCards size={12} /></i>
              <div>
                <span>{pick(language, "ÉTAPE CONTEXTUELLE", "CONTEXTUAL STEP")}</span>
                <strong>{shoppingLabel(profile.goal_type, language)}</strong>
                <small>
                  {pick(
                    language,
                    "À explorer lorsque le produit devient pertinent pour ton échéancier.",
                    "Explore when the product becomes relevant to your timeline.",
                  )}
                </small>
              </div>
              <Link href={`/assistant/magasiner?category=${shopCategory}`}>
                {pick(language, "Ouvrir", "Open")} <ArrowRight size={12} />
              </Link>
            </article>
          </div>
        </div>
      ) : null}

      {tab === "twin" ? (
        <div className={styles.twin} data-testid="advisor-financial-twin">
          <section className={styles.twinHeader}>
            <div>
              <span>{pick(language, "JUMEAU FINANCIER", "FINANCIAL TWIN")}</span>
              <h3>
                {pick(
                  language,
                  "Un mini-bilan basé uniquement sur ce que tu déclares.",
                  "A mini balance sheet based only on what you declare.",
                )}
              </h3>
              <p>
                {pick(
                  language,
                  "Les champs supplémentaires restent locaux à cet appareil et ne sont pas envoyés au moteur Conseil.",
                  "Additional fields stay local to this device and are not sent to the Advice engine.",
                )}
              </p>
            </div>
            <Activity size={28} />
          </section>

          <section className={styles.twinInputs}>
            <label>
              <span>{pick(language, "Revenu mensuel net", "Net monthly income")}</span>
              <input
                type="number"
                min="0"
                value={household.monthlyIncome ?? ""}
                onChange={(event) =>
                  updateTwin("monthlyIncome", event.target.value)
                }
                placeholder="Ex. 5000"
              />
            </label>
            <label>
              <span>{pick(language, "Paiements mensuels de dettes", "Monthly debt payments")}</span>
              <input
                type="number"
                min="0"
                value={household.monthlyDebtPayments ?? ""}
                onChange={(event) =>
                  updateTwin("monthlyDebtPayments", event.target.value)
                }
                placeholder="Ex. 650"
              />
            </label>
            <label>
              <span>{pick(language, "Dette totale", "Total debt")}</span>
              <input
                type="number"
                min="0"
                value={household.totalDebt ?? ""}
                onChange={(event) =>
                  updateTwin("totalDebt", event.target.value)
                }
                placeholder="Ex. 12000"
              />
            </label>
            <label>
              <span>{pick(language, "Autres actifs déclarés", "Other declared assets")}</span>
              <input
                type="number"
                min="0"
                value={household.otherAssets ?? ""}
                onChange={(event) =>
                  updateTwin("otherAssets", event.target.value)
                }
                placeholder="Ex. 20000"
              />
            </label>
          </section>

          <div className={styles.twinGrid}>
            <article>
              <span>{pick(language, "Actifs saisis", "Entered assets")}</span>
              <strong>
                {formatMoney(twinAssets, profile.currency, language)}
              </strong>
              <small>
                {pick(
                  language,
                  "Capital objectif + autres actifs saisis",
                  "Goal capital + other entered assets",
                )}
              </small>
            </article>
            <article>
              <span>{pick(language, "Dette saisie", "Entered debt")}</span>
              <strong>
                {household.totalDebt == null
                  ? "N/D"
                  : formatMoney(twinDebt, profile.currency, language)}
              </strong>
              <small>{pick(language, "Aucune dette n’est inférée", "No debt is inferred")}</small>
            </article>
            <article>
              <span>{pick(language, "Valeur nette partielle", "Partial net worth")}</span>
              <strong>
                {twinNetWorth == null
                  ? "N/D"
                  : formatMoney(twinNetWorth, profile.currency, language)}
              </strong>
              <small>
                {pick(
                  language,
                  "Uniquement les actifs et dettes renseignés",
                  "Only entered assets and debts",
                )}
              </small>
            </article>
            <article>
              <span>{pick(language, "Flux mensuel disponible", "Available monthly flow")}</span>
              <strong>
                {monthlyFreeFlow == null
                  ? "N/D"
                  : formatMoney(monthlyFreeFlow, profile.currency, language)}
              </strong>
              <small>
                {pick(
                  language,
                  "Revenu − dépenses essentielles − dettes − contribution",
                  "Income − essential expenses − debt payments − contribution",
                )}
              </small>
            </article>
            <article>
              <span>{pick(language, "Réserve liquide", "Liquid reserve")}</span>
              <strong>
                {formatMoney(reserve, profile.currency, language)}
              </strong>
              <small>
                {reserveMonths != null
                  ? `${reserveMonths.toFixed(1)} ${pick(language, "mois de dépenses", "months of expenses")}`
                  : pick(language, "Dépenses à compléter", "Complete expenses")}
              </small>
            </article>
            <article>
              <span>{pick(language, "Portefeuille relié", "Linked portfolio")}</span>
              <strong>{portfolioCount}</strong>
              <small>
                {pick(
                  language,
                  "Positions locales détectées par Conseil",
                  "Local positions detected by Advice",
                )}
              </small>
            </article>
          </div>

          <div className={styles.twinBoundary}>
            <Landmark size={16} />
            <p>
              {pick(
                language,
                "Le jumeau n’infère jamais un compte, un revenu, une dette ou une valeur que tu n’as pas fournis. N/D signifie réellement que la donnée manque.",
                "The twin never infers an account, income, debt or value you did not provide. N/A genuinely means the data is missing.",
              )}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
