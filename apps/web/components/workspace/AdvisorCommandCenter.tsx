"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Landmark,
  LineChart,
  PiggyBank,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
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

const HISTORY_KEY = "anatole:advisor-progress:v2";

type CommandTab = "overview" | "scenarios" | "timeline" | "twin";
type ProgressSnapshot = {
  date: string;
  goalType: AdvisorGoalType | null;
  currentSavings: number;
  monthlyContribution: number;
  targetAmount: number | null;
};
type StatusTone = "favorable" | "watch" | "incomplete" | "neutral";

function safeNumber(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatMoney(
  value: number | null | undefined,
  currency: string,
  language: AnatoleLanguage,
): string {
  if (value == null || !Number.isFinite(value)) return pick(language, "N/D", "N/A");
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function futureValue(initial: number, monthly: number, months: number, annualReturnPercent: number): number {
  if (months <= 0) return initial;
  const monthlyRate = annualReturnPercent / 100 / 12;
  if (Math.abs(monthlyRate) < 0.0000001) return initial + monthly * months;
  const factor = (1 + monthlyRate) ** months;
  return initial * factor + monthly * ((factor - 1) / monthlyRate);
}

function requiredMonthly(initial: number, target: number, months: number, annualReturnPercent: number): number | null {
  if (target <= initial) return 0;
  if (months <= 0) return null;
  const monthlyRate = annualReturnPercent / 100 / 12;
  if (Math.abs(monthlyRate) < 0.0000001) return Math.max(0, (target - initial) / months);
  const factor = (1 + monthlyRate) ** months;
  const annuityFactor = (factor - 1) / monthlyRate;
  if (annuityFactor <= 0) return null;
  return Math.max(0, (target - initial * factor) / annuityFactor);
}

function monthsToTarget(initial: number, monthly: number, target: number, annualReturnPercent: number): number | null {
  if (target <= 0 || initial >= target) return 0;
  if (monthly <= 0 && annualReturnPercent <= 0) return null;
  for (let months = 1; months <= 600; months += 1) {
    if (futureValue(initial, monthly, months, annualReturnPercent) >= target) return months;
  }
  return null;
}

function monthLabel(monthsFromNow: number | null, language: AnatoleLanguage): string {
  if (monthsFromNow == null) return pick(language, "Au-delà de 50 ans / non calculé", "Beyond 50 years / not calculated");
  if (monthsFromNow === 0) return pick(language, "Déjà atteint", "Already reached");
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  return new Intl.DateTimeFormat(localeFor(language), { month: "short", year: "numeric" }).format(date);
}

function horizonDateLabel(years: number, language: AnatoleLanguage): string {
  if (!years) return pick(language, "Horizon à définir", "Define horizon");
  const date = new Date();
  date.setMonth(date.getMonth() + Math.round(years * 12));
  return new Intl.DateTimeFormat(localeFor(language), { month: "short", year: "numeric" }).format(date);
}

function readPreviousSnapshot(): ProgressSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProgressSnapshot[];
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return parsed[parsed.length - 1] ?? null;
  } catch {
    return null;
  }
}

function shoppingCategory(goal: AdvisorGoalType | null): string {
  if (goal === "home") return "mortgage";
  if (goal === "education") return "student_loan";
  if (goal === "reserve") return "banking";
  if (goal === "flexible") return "personal_loan";
  return "banking";
}

function shoppingLabel(goal: AdvisorGoalType | null, language: AnatoleLanguage): string {
  if (goal === "home") return pick(language, "Explorer les hypothèques", "Explore mortgages");
  if (goal === "education") return pick(language, "Explorer le financement étudiant", "Explore student financing");
  if (goal === "reserve") return pick(language, "Comparer les comptes bancaires", "Compare bank accounts");
  if (goal === "flexible") return pick(language, "Explorer les prêts personnels", "Explore personal loans");
  return pick(language, "Comparer les produits de liquidité", "Compare cash-management products");
}

function adaptiveFocus(goal: AdvisorGoalType | null, language: AnatoleLanguage) {
  if (goal === "home") return {
    title: pick(language, "Parcours propriété", "Home-buying path"),
    detail: pick(language, "Anatole met l’accent sur la mise de fonds, la réserve, l’horizon et la capacité mensuelle plutôt que sur le risque de marché.", "Anatole emphasizes down payment, reserve, horizon and monthly capacity rather than market risk."),
    chips: language === "fr" ? ["Mise de fonds", "Liquidité", "Horizon", "Paiement"] : ["Down payment", "Liquidity", "Horizon", "Payment"],
  };
  if (goal === "education") return {
    title: pick(language, "Parcours études", "Education path"),
    detail: pick(language, "Le diagnostic privilégie le manque de financement, l’échéancier, la réserve et la flexibilité de remboursement.", "The diagnostic prioritizes funding gap, timeline, reserve and repayment flexibility."),
    chips: language === "fr" ? ["Coût des études", "Échéancier", "Aide publique", "Flexibilité"] : ["Education cost", "Timeline", "Public aid", "Flexibility"],
  };
  if (goal === "reserve") return {
    title: pick(language, "Parcours réserve", "Reserve path"),
    detail: pick(language, "Ici, la priorité du diagnostic est la liquidité et le nombre de mois de dépenses couvertes.", "Here, the diagnostic focuses on liquidity and months of essential expenses covered."),
    chips: language === "fr" ? ["Dépenses", "Réserve", "Stabilité", "Accessibilité"] : ["Expenses", "Reserve", "Stability", "Access"],
  };
  if (goal === "retirement") return {
    title: pick(language, "Parcours retraite", "Retirement path"),
    detail: pick(language, "L’horizon, les contributions, la liquidité et la capacité à traverser des variations deviennent centraux.", "Horizon, contributions, liquidity and capacity to withstand fluctuations become central."),
    chips: language === "fr" ? ["Horizon", "Contributions", "Liquidité", "Variations"] : ["Horizon", "Contributions", "Liquidity", "Fluctuations"],
  };
  if (goal === "wealth") return {
    title: pick(language, "Parcours croissance", "Growth path"),
    detail: pick(language, "Anatole sépare la capacité financière, le besoin de liquidité et le confort face aux variations avant toute simulation.", "Anatole separates financial capacity, liquidity needs and comfort with fluctuations before any simulation."),
    chips: language === "fr" ? ["Capacité", "Liquidité", "Horizon", "Variations"] : ["Capacity", "Liquidity", "Horizon", "Fluctuations"],
  };
  return {
    title: pick(language, "Parcours adaptatif", "Adaptive path"),
    detail: pick(language, "Choisis un objectif : Anatole ajustera les informations mises en avant et les scénarios utiles.", "Choose a goal: Anatole will adjust the information it emphasizes and the useful scenarios."),
    chips: language === "fr" ? ["Objectif", "Montant", "Horizon", "Contraintes"] : ["Goal", "Amount", "Horizon", "Constraints"],
  };
}

function toneClass(tone: StatusTone): string {
  if (tone === "favorable") return styles.favorable;
  if (tone === "watch") return styles.watch;
  if (tone === "incomplete") return styles.incomplete;
  return styles.neutral;
}

export function AdvisorCommandCenter({
  profile,
  plan,
  profileProgress,
  goalLabel,
  language,
  step,
  portfolioCount,
}: {
  profile: AdvisorProfile;
  plan: AdvisorPlan | null;
  profileProgress: number;
  goalLabel: string;
  language: AnatoleLanguage;
  step: number;
  portfolioCount: number;
}) {
  const [tab, setTab] = useState<CommandTab>("overview");
  const [monthlyDelta, setMonthlyDelta] = useState(0);
  const [yearsDelta, setYearsDelta] = useState(0);
  const [returnAssumption, setReturnAssumption] = useState(0);
  const [inflationAssumption, setInflationAssumption] = useState(0);
  const [previousSnapshot] = useState<ProgressSnapshot | null>(readPreviousSnapshot);

  const currentSavings = safeNumber(profile.current_savings);
  const monthlyContribution = safeNumber(profile.monthly_contribution);
  const target = safeNumber(profile.target_amount);
  const baseYears = safeNumber(profile.horizon_years);
  const expenses = safeNumber(profile.essential_monthly_expenses);
  const reserve = safeNumber(profile.liquid_reserve);

  useEffect(() => {
    if (typeof window === "undefined" || profile.goal_type == null || profile.current_savings == null) return;
    const snapshot: ProgressSnapshot = {
      date: new Date().toISOString(),
      goalType: profile.goal_type,
      currentSavings,
      monthlyContribution,
      targetAmount: profile.target_amount,
    };
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? (JSON.parse(raw) as ProgressSnapshot[]) : [];
      const history = Array.isArray(parsed) ? parsed.slice(-23) : [];
      const today = snapshot.date.slice(0, 10);
      const last = history[history.length - 1];
      if (last?.date?.slice(0, 10) === today) history[history.length - 1] = snapshot;
      else history.push(snapshot);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Local history is optional.
    }
  }, [currentSavings, monthlyContribution, profile.current_savings, profile.goal_type, profile.target_amount]);

  const adjustedYears = Math.max(0.25, baseYears + yearsDelta);
  const adjustedMonths = Math.max(1, Math.round(adjustedYears * 12));
  const adjustedMonthly = Math.max(0, monthlyContribution + monthlyDelta);
  const inflationAdjustedTarget = target > 0 ? target * (1 + inflationAssumption / 100) ** adjustedYears : 0;
  const scenarioValue = futureValue(currentSavings, adjustedMonthly, adjustedMonths, returnAssumption);
  const baselineValue = futureValue(currentSavings, monthlyContribution, Math.max(1, Math.round(Math.max(baseYears, 0.25) * 12)), 0);
  const scenarioGap = inflationAdjustedTarget > 0 ? scenarioValue - inflationAdjustedTarget : null;
  const monthlyNeeded = requiredMonthly(currentSavings, inflationAdjustedTarget, adjustedMonths, returnAssumption);
  const progress = target > 0 ? Math.min(100, (currentSavings / target) * 100) : 0;
  const reserveMonths = expenses > 0 ? reserve / expenses : plan?.reserve_months ?? null;
  const targetMonths = monthsToTarget(currentSavings, adjustedMonthly, inflationAdjustedTarget, returnAssumption);
  const halfwayMonths = monthsToTarget(currentSavings, adjustedMonthly, inflationAdjustedTarget * 0.5, returnAssumption);
  const previousDelta = previousSnapshot && previousSnapshot.goalType === profile.goal_type ? currentSavings - previousSnapshot.currentSavings : null;

  const focus = adaptiveFocus(profile.goal_type, language);
  const shopCategory = shoppingCategory(profile.goal_type);
  const marketRiskRelevant = profile.goal_type === "retirement" || profile.goal_type === "wealth" || baseYears >= 5;

  const capacityTone: StatusTone = profile.income_stability === "high" ? "favorable" : profile.income_stability === "low" ? "watch" : profile.income_stability == null ? "incomplete" : "neutral";
  const liquidityTone: StatusTone = reserveMonths == null ? "incomplete" : reserveMonths >= 6 ? "favorable" : reserveMonths < 3 ? "watch" : "neutral";
  const debtTone: StatusTone = profile.high_interest_debt === false ? "favorable" : profile.high_interest_debt === true ? "watch" : "incomplete";
  const progressTone: StatusTone = target <= 0 ? "incomplete" : progress >= 75 ? "favorable" : progress < 25 ? "watch" : "neutral";

  const explanations: string[] = [];
  if (target > 0 && baseYears > 0) {
    const baseNeeded = requiredMonthly(currentSavings, target, Math.round(baseYears * 12), 0);
    explanations.push(pick(language, `Sans hypothèse de rendement, le rythme mathématique pour combler l’écart dans l’horizon choisi est d’environ ${formatMoney(baseNeeded, profile.currency, language)} par mois.`, `With no return assumption, the mathematical pace required to close the gap within the chosen horizon is about ${formatMoney(baseNeeded, profile.currency, language)} per month.`));
  }
  if (reserveMonths != null) explanations.push(pick(language, `La réserve déclarée couvre environ ${reserveMonths.toFixed(1)} mois de dépenses essentielles; cette mesure influence la marge de manœuvre du plan.`, `The declared reserve covers about ${reserveMonths.toFixed(1)} months of essential expenses; this affects the plan’s financial flexibility.`));
  if (profile.high_interest_debt === true) explanations.push(pick(language, "Une dette à taux élevé est déclarée. Anatole la traite comme une contrainte de flux de trésorerie dans la lecture du plan.", "High-interest debt is declared. Anatole treats it as a cash-flow constraint when reading the plan."));
  if (!marketRiskRelevant) explanations.push(pick(language, "Comme l’objectif est plutôt court terme, Anatole donne davantage de poids à la liquidité qu’à la tolérance aux fluctuations de marché.", "Because the goal is relatively short term, Anatole gives more weight to liquidity than to tolerance for market fluctuations."));

  const timelineThird = profile.goal_type === "home"
    ? pick(language, "Comparer les options hypothécaires", "Compare mortgage options")
    : profile.goal_type === "education"
      ? pick(language, "Comparer les sources de financement", "Compare funding sources")
      : profile.goal_type === "reserve"
        ? pick(language, "Valider l’accessibilité de la réserve", "Validate reserve accessibility")
        : pick(language, "Réviser les hypothèses du plan", "Review plan assumptions");

  return (
    <section className={styles.command} data-testid="advisor-command-center">
      <header className={styles.commandHeader}>
        <div>
          <span className={styles.eyebrow}><Sparkles size={13} />ANATOLE CONSEIL · LIVE</span>
          <h2>{pick(language, "Ton plan se met à jour pendant que tu réponds.", "Your plan updates as you answer.")}</h2>
          <p>{pick(language, "Objectif, écart, liquidité, scénarios et prochaines étapes restent visibles sans attendre la dernière page.", "Goal, gap, liquidity, scenarios and next steps stay visible without waiting for the last page.")}</p>
        </div>
        <div className={styles.liveBadge}><span>{profileProgress}%</span><small>{pick(language, "profil utile", "useful profile")}</small></div>
      </header>

      <div className={styles.adaptiveStrip}>
        <div className={styles.adaptiveIcon}><Target size={17} /></div>
        <div><strong>{focus.title}</strong><p>{focus.detail}</p></div>
        <div className={styles.adaptiveChips}>{focus.chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
      </div>

      <nav className={styles.tabs} aria-label={pick(language, "Vues du plan", "Plan views")}>
        <button type="button" className={tab === "overview" ? styles.tabActive : styles.tab} onClick={() => setTab("overview")}><Gauge size={14} />{pick(language, "Vue d’ensemble", "Overview")}</button>
        <button type="button" data-testid="advisor-tab-scenarios" className={tab === "scenarios" ? styles.tabActive : styles.tab} onClick={() => setTab("scenarios")}><LineChart size={14} />{pick(language, "Laboratoire", "Scenario lab")}</button>
        <button type="button" className={tab === "timeline" ? styles.tabActive : styles.tab} onClick={() => setTab("timeline")}><CalendarClock size={14} />Timeline</button>
        <button type="button" className={tab === "twin" ? styles.tabActive : styles.tab} onClick={() => setTab("twin")}><Activity size={14} />{pick(language, "Jumeau financier", "Financial twin")}</button>
      </nav>

      {tab === "overview" ? (
        <div className={styles.overview}>
          <section className={styles.liveSummary}>
            <div className={styles.summaryLead}><span>{pick(language, "OBJECTIF", "GOAL")}</span><strong>{goalLabel}</strong><small>{profile.goal_name || pick(language, "Nom à définir", "Name not defined")}</small></div>
            <div><span>{pick(language, "CIBLE", "TARGET")}</span><strong>{formatMoney(profile.target_amount, profile.currency, language)}</strong><small>{horizonDateLabel(baseYears, language)}</small></div>
            <div><span>{pick(language, "DÉJÀ DISPONIBLE", "AVAILABLE NOW")}</span><strong>{formatMoney(profile.current_savings, profile.currency, language)}</strong><small>{target > 0 ? `${Math.round(progress)}%` : pick(language, "Cible manquante", "Missing target")}</small></div>
            <div><span>{pick(language, "ÉCART", "GAP")}</span><strong>{target > 0 ? formatMoney(Math.max(0, target - currentSavings), profile.currency, language) : pick(language, "À calculer", "To calculate")}</strong><small>{pick(language, `${formatMoney(monthlyContribution, profile.currency, language)} / mois déclaré`, `${formatMoney(monthlyContribution, profile.currency, language)} / month stated`)}</small></div>
          </section>

          <section className={styles.resilience}>
            <div className={styles.sectionHeading}><div><span>{pick(language, "ROBUSTESSE DU PLAN", "PLAN RESILIENCE")}</span><h3>{pick(language, "Des dimensions explicites, pas un score mystérieux.", "Explicit dimensions, not a mysterious score.")}</h3></div></div>
            <div className={styles.dimensionGrid}>
              <article className={toneClass(capacityTone)}><CircleDollarSign size={17} /><span>{pick(language, "Capacité", "Capacity")}</span><strong>{profile.income_stability === "high" ? pick(language, "Revenus très réguliers", "Very regular income") : profile.income_stability === "medium" ? pick(language, "Revenus assez réguliers", "Fairly regular income") : profile.income_stability === "low" ? pick(language, "Revenus irréguliers", "Irregular income") : pick(language, "À documenter", "Document this")}</strong></article>
              <article className={toneClass(liquidityTone)}><PiggyBank size={17} /><span>{pick(language, "Liquidité", "Liquidity")}</span><strong>{reserveMonths != null ? `${reserveMonths.toFixed(1)} ${pick(language, "mois", "months")}` : pick(language, "À calculer", "To calculate")}</strong></article>
              <article className={toneClass(debtTone)}><Scale size={17} /><span>{pick(language, "Dette coûteuse", "High-cost debt")}</span><strong>{profile.high_interest_debt === false ? pick(language, "Aucune déclarée", "None declared") : profile.high_interest_debt === true ? pick(language, "Déclarée", "Declared") : pick(language, "À préciser", "To specify")}</strong></article>
              <article className={toneClass(progressTone)}><Target size={17} /><span>{pick(language, "Progression", "Progress")}</span><strong>{target > 0 ? `${Math.round(progress)}%` : "N/D"}</strong></article>
            </div>
          </section>

          <section className={styles.explanation}>
            <div><span>{pick(language, "POURQUOI ?", "WHY?")}</span><h3>{pick(language, "Ce qui influence le plus ton plan", "What influences your plan most")}</h3></div>
            <ul>{explanations.length ? explanations.slice(0, 4).map((item) => <li key={item}><CheckCircle2 size={14} />{item}</li>) : <li><ShieldCheck size={14} />{pick(language, "Ajoute l’objectif, le montant, l’horizon et la base financière pour activer une explication chiffrée.", "Add the goal, amount, horizon and financial foundation to activate a quantified explanation.")}</li>}</ul>
          </section>

          <Link href={`/assistant/magasiner?category=${shopCategory}`} className={styles.shoppingCta} data-testid="advisor-contextual-shopping">
            <div><WalletCards size={18} /><span><strong>{shoppingLabel(profile.goal_type, language)}</strong><small>{pick(language, "Le questionnaire Magasiner s’ouvre directement dans la catégorie liée à cet objectif.", "The Shopping questionnaire opens directly in the category linked to this goal.")}</small></span></div><ArrowRight size={17} />
          </Link>
        </div>
      ) : null}

      {tab === "scenarios" ? (
        <div className={styles.lab} data-testid="advisor-scenario-lab">
          <section className={styles.labControls}>
            <div className={styles.sectionHeading}><div><span>{pick(language, "LABORATOIRE DE SCÉNARIOS", "SCENARIO LAB")}</span><h3>{pick(language, "Change une hypothèse et vois l’impact immédiatement.", "Change one assumption and see the impact immediately.")}</h3></div><small>{pick(language, "Illustratif — aucune hypothèse n’est une prévision.", "Illustrative — no assumption is a forecast.")}</small></div>
            <label><span>{pick(language, "Épargne mensuelle", "Monthly contribution")}<strong>{monthlyDelta >= 0 ? "+" : ""}{formatMoney(monthlyDelta, profile.currency, language)}</strong></span><input data-testid="advisor-monthly-delta" type="range" min="-500" max="1500" step="50" value={monthlyDelta} onChange={(event) => setMonthlyDelta(Number(event.target.value))} /></label>
            <label><span>{pick(language, "Horizon", "Horizon")}<strong>{yearsDelta >= 0 ? "+" : ""}{yearsDelta} {pick(language, "an(s)", "year(s)")}</strong></span><input type="range" min="-2" max="5" step="1" value={yearsDelta} onChange={(event) => setYearsDelta(Number(event.target.value))} /></label>
            <label><span>{pick(language, "Hypothèse de croissance", "Growth assumption")}<strong>{returnAssumption.toFixed(1)}%</strong></span><input type="range" min="0" max="8" step="0.5" value={returnAssumption} onChange={(event) => setReturnAssumption(Number(event.target.value))} /></label>
            <label><span>{pick(language, "Inflation appliquée à la cible", "Inflation applied to target")}<strong>{inflationAssumption.toFixed(1)}%</strong></span><input type="range" min="0" max="5" step="0.5" value={inflationAssumption} onChange={(event) => setInflationAssumption(Number(event.target.value))} /></label>
          </section>
          <section className={styles.labResults}>
            <article><span>{pick(language, "Valeur projetée", "Projected value")}</span><strong>{formatMoney(scenarioValue, profile.currency, language)}</strong><small>{pick(language, `Base sans croissance : ${formatMoney(baselineValue, profile.currency, language)}`, `No-growth baseline: ${formatMoney(baselineValue, profile.currency, language)}`)}</small></article>
            <article><span>{pick(language, "Cible ajustée", "Adjusted target")}</span><strong>{formatMoney(inflationAdjustedTarget || null, profile.currency, language)}</strong><small>{pick(language, `${adjustedYears.toFixed(1)} an(s) · inflation ${inflationAssumption.toFixed(1)}%`, `${adjustedYears.toFixed(1)} year(s) · inflation ${inflationAssumption.toFixed(1)}%`)}</small></article>
            <article><span>{pick(language, "Écart du scénario", "Scenario gap")}</span><strong>{scenarioGap == null ? "N/D" : scenarioGap >= 0 ? `+${formatMoney(scenarioGap, profile.currency, language)}` : `-${formatMoney(Math.abs(scenarioGap), profile.currency, language)}`}</strong><small>{pick(language, "Écart mathématique, pas recommandation", "Mathematical gap, not a recommendation")}</small></article>
            <article><span>{pick(language, "Rythme requis", "Required pace")}</span><strong>{monthlyNeeded == null ? "N/D" : `${formatMoney(monthlyNeeded, profile.currency, language)} / ${pick(language, "mois", "month")}`}</strong><small>{pick(language, "Selon les hypothèses choisies", "Under selected assumptions")}</small></article>
            <article className={styles.wideResult}><span>{pick(language, "Atteinte mathématique de la cible", "Mathematical target date")}</span><strong>{monthLabel(targetMonths, language)}</strong><small>{pick(language, "La date change instantanément avec les curseurs. Elle ne constitue pas une promesse de résultat.", "The date changes instantly with the sliders. It is not a promise of outcome.")}</small></article>
          </section>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div className={styles.timeline}>
          <div className={styles.sectionHeading}><div><span>TIMELINE</span><h3>{pick(language, "Du point de départ à l’objectif", "From today to the goal")}</h3></div></div>
          <div className={styles.timelineTrack}>
            <article className={styles.timelineDone}><i /><span>{pick(language, "Aujourd’hui", "Today")}</span><strong>{formatMoney(currentSavings, profile.currency, language)}</strong><small>{pick(language, "Point de départ déclaré", "Declared starting point")}</small></article>
            <article className={progress >= 50 ? styles.timelineDone : ""}><i /><span>50%</span><strong>{target > 0 ? formatMoney(target * 0.5, profile.currency, language) : "N/D"}</strong><small>{monthLabel(halfwayMonths, language)}</small></article>
            <article><i /><span>{pick(language, "Étape contextuelle", "Contextual step")}</span><strong>{timelineThird}</strong><small>{pick(language, "À explorer au moment pertinent, sans automatiser la décision.", "Explore at the relevant time without automating the decision.")}</small></article>
            <article className={progress >= 100 ? styles.timelineDone : ""}><i /><span>{pick(language, "Objectif", "Goal")}</span><strong>{formatMoney(target || null, profile.currency, language)}</strong><small>{targetMonths != null ? monthLabel(targetMonths, language) : horizonDateLabel(baseYears, language)}</small></article>
          </div>
        </div>
      ) : null}

      {tab === "twin" ? (
        <div className={styles.twin}>
          <section className={styles.twinHeader}><div><span>{pick(language, "JUMEAU FINANCIER", "FINANCIAL TWIN")}</span><h3>{pick(language, "Une image vivante de ta situation déclarée", "A living view of your declared situation")}</h3><p>{pick(language, "Cette V1 reste sur ton appareil. Elle synchronise les champs Conseil et signale l’évolution depuis la dernière session disponible.", "This V1 stays on your device. It synchronizes Advice fields and shows change since the last available session.")}</p></div><Activity size={26} /></section>
          <div className={styles.twinGrid}>
            <article><span>{pick(language, "Capital objectif", "Goal capital")}</span><strong>{formatMoney(currentSavings, profile.currency, language)}</strong><small>{previousDelta == null ? pick(language, "Première référence locale", "First local reference") : pick(language, `${previousDelta >= 0 ? "+" : ""}${formatMoney(previousDelta, profile.currency, language)} depuis la référence précédente`, `${previousDelta >= 0 ? "+" : ""}${formatMoney(previousDelta, profile.currency, language)} since the previous reference`)}</small></article>
            <article><span>{pick(language, "Flux mensuel déclaré", "Declared monthly flow")}</span><strong>{formatMoney(monthlyContribution, profile.currency, language)}</strong><small>{pick(language, "Contribution au projet", "Goal contribution")}</small></article>
            <article><span>{pick(language, "Réserve liquide", "Liquid reserve")}</span><strong>{formatMoney(reserve, profile.currency, language)}</strong><small>{reserveMonths != null ? `${reserveMonths.toFixed(1)} ${pick(language, "mois de dépenses", "months of expenses")}` : pick(language, "Dépenses à compléter", "Complete expenses")}</small></article>
            <article><span>{pick(language, "Portefeuille relié", "Linked portfolio")}</span><strong>{portfolioCount}</strong><small>{pick(language, `Étape actuelle du parcours : ${step}/4`, `Current journey step: ${step}/4`)}</small></article>
          </div>
          <div className={styles.twinBoundary}><Landmark size={16} /><p>{pick(language, "Le jumeau n’infère pas de comptes, revenus ou dettes que tu n’as pas déclarés. Les valeurs manquantes restent manquantes.", "The twin does not infer accounts, income or debts you did not declare. Missing values remain missing.")}</p></div>
        </div>
      ) : null}
    </section>
  );
}
