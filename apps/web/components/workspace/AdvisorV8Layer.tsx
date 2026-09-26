"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import type { AdvisorProfile } from "@/lib/types";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./AdvisorV8Layer.module.css";

const WORKSPACE_KEY = "anatole:advisor-workspace:v4";
const SYNC_EVENT = "anatole-workspace-sync-applied";

type TabKey = "today" | "goals" | "scenarios" | "decisions" | "products";
type ShockKey = "income" | "expenses" | "markets" | "rates";

type Household = {
  userIncome?: number | null;
  partnerIncome?: number | null;
  dependants?: number;
  cash?: number | null;
  investments?: number | null;
  property?: number | null;
  vehicles?: number | null;
  otherAssets?: number | null;
  essentialExpenses?: number | null;
  discretionaryExpenses?: number | null;
  housingCosts?: number | null;
  insuranceCosts?: number | null;
  otherFixedCosts?: number | null;
};

type Debt = {
  id?: string;
  label?: string;
  balance?: number;
  annualRate?: number;
  monthlyPayment?: number;
};

type Goal = {
  id?: string;
  label?: string;
  target?: number;
  current?: number;
  monthly?: number;
  horizonMonths?: number;
};

type TaxBucket = { room?: number | null; planned?: number | null };
type TaxState = {
  tfsa?: TaxBucket;
  rrsp?: TaxBucket;
  fhsa?: TaxBucket;
  resp?: TaxBucket;
};

type Mortgage = {
  purchasePrice?: number | null;
  downPayment?: number | null;
  annualRate?: number | null;
  amortizationYears?: number | null;
  annualPropertyTax?: number | null;
  monthlyCondo?: number | null;
  monthlyInsurance?: number | null;
  annualMaintenance?: number | null;
  renewalAfterYears?: number | null;
  renewalRate?: number | null;
};

type FinancialEvent = {
  id?: string;
  label?: string;
  monthOffset?: number;
  oneTimeCost?: number;
  recurringMonthlyCost?: number;
  monthlyIncomeDelta?: number;
};

type FinancialOs = {
  household?: Household;
  debts?: Debt[];
  goals?: Goal[];
  tax?: TaxState;
  mortgage?: Mortgage;
  events?: FinancialEvent[];
  forecastMonths?: 12 | 24 | 36;
};

type VisitSnapshot = {
  capturedAt: string;
  netWorth: number | null;
  monthlyMargin: number | null;
  target: number | null;
  currentSavings: number | null;
  totalDebt: number;
};

type JournalEntry = {
  id: string;
  label: string;
  capturedAt: string;
  netWorth: number | null;
  monthlyMargin: number | null;
};

type V8State = {
  province: string;
  expectedReturn: number;
  volatility: number;
  lastVisit: VisitSnapshot | null;
  journal: JournalEntry[];
};

type Workspace = {
  financialOs?: FinancialOs;
  v8?: V8State;
};

const EMPTY_V8: V8State = {
  province: "",
  expectedReturn: 4,
  volatility: 10,
  lastVisit: null,
  journal: [],
};

const TABS: Array<{ key: TabKey; fr: string; en: string; index: string }> = [
  { key: "today", fr: "Aujourd’hui", en: "Today", index: "01" },
  { key: "goals", fr: "Objectifs", en: "Goals", index: "02" },
  { key: "scenarios", fr: "Scénarios", en: "Scenarios", index: "03" },
  { key: "decisions", fr: "Décisions", en: "Decisions", index: "04" },
  { key: "products", fr: "Produits", en: "Products", index: "05" },
];

const PROVINCES = [
  ["AB", "Alberta"],
  ["BC", "Colombie-Britannique / British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "Nouveau-Brunswick / New Brunswick"],
  ["NL", "Terre-Neuve-et-Labrador / Newfoundland and Labrador"],
  ["NS", "Nouvelle-Écosse / Nova Scotia"],
  ["NT", "Territoires du Nord-Ouest / Northwest Territories"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Île-du-Prince-Édouard / Prince Edward Island"],
  ["QC", "Québec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
] as const;

function finite(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function nullable(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function readWorkspace(): Workspace {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Workspace) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeV8(value: unknown): V8State {
  const raw = value && typeof value === "object" ? (value as Partial<V8State>) : {};
  return {
    province: typeof raw.province === "string" ? raw.province : EMPTY_V8.province,
    expectedReturn:
      typeof raw.expectedReturn === "number" && Number.isFinite(raw.expectedReturn)
        ? raw.expectedReturn
        : EMPTY_V8.expectedReturn,
    volatility:
      typeof raw.volatility === "number" && Number.isFinite(raw.volatility)
        ? raw.volatility
        : EMPTY_V8.volatility,
    lastVisit:
      raw.lastVisit && typeof raw.lastVisit === "object"
        ? (raw.lastVisit as VisitSnapshot)
        : null,
    journal: Array.isArray(raw.journal) ? raw.journal.slice(-30) : [],
  };
}

function persistV8(next: V8State): Workspace {
  if (typeof window === "undefined") return {};
  const current = readWorkspace();
  const merged = { ...current, v8: next };
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  return merged;
}

function money(value: number | null | undefined, currency: string, language: AnatoleLanguage): string {
  if (value == null || !Number.isFinite(value)) return pick(language, "N/D", "N/A");
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${Math.round(value)}%`;
}

function futureValue(initial: number, monthly: number, months: number, annualReturn: number): number {
  const rate = annualReturn / 100 / 12;
  if (months <= 0) return initial;
  if (Math.abs(rate) < 1e-9) return initial + monthly * months;
  return initial * (1 + rate) ** months + monthly * (((1 + rate) ** months - 1) / rate);
}

function canadianMortgageMonthlyRate(annualRate: number): number {
  if (annualRate <= 0) return 0;
  return (1 + annualRate / 200) ** (1 / 6) - 1;
}

function mortgagePayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const n = Math.max(1, Math.round(years * 12));
  const r = canadianMortgageMonthlyRate(annualRate);
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}

function mortgageBalanceAfterMonths(
  principal: number,
  annualRate: number,
  years: number,
  elapsedMonths: number,
): number {
  if (principal <= 0) return 0;
  const payment = mortgagePayment(principal, annualRate, years);
  const r = canadianMortgageMonthlyRate(annualRate);
  const elapsed = Math.max(0, Math.round(elapsedMonths));
  if (r <= 0) return Math.max(0, principal - payment * elapsed);
  const factor = (1 + r) ** elapsed;
  return Math.max(0, principal * factor - payment * ((factor - 1) / r));
}

function debtFreeMonths(debts: Debt[], strategy: "avalanche" | "snowball", extra: number): number | null {
  const rows = debts
    .map((debt, index) => ({
      id: debt.id ?? `debt-${index}`,
      balance: Math.max(0, finite(debt.balance)),
      annualRate: Math.max(0, finite(debt.annualRate)),
      minimum: Math.max(0, finite(debt.monthlyPayment)),
    }))
    .filter((debt) => debt.balance > 0);

  if (!rows.length) return 0;

  const originalMonthlyBudget =
    rows.reduce((sum, debt) => sum + debt.minimum, 0) + Math.max(0, extra);

  if (originalMonthlyBudget <= 0) return null;

  let state = rows;
  for (let month = 1; month <= 600; month += 1) {
    state = state.map((debt) => ({
      ...debt,
      balance: debt.balance * (1 + debt.annualRate / 100 / 12),
    }));

    const active = state.filter((debt) => debt.balance > 0.01);
    if (!active.length) return month - 1;

    const ordered = [...active].sort((a, b) =>
      strategy === "avalanche"
        ? b.annualRate - a.annualRate || a.balance - b.balance
        : a.balance - b.balance || b.annualRate - a.annualRate,
    );

    const payments = new Map<string, number>();
    let remainingBudget = originalMonthlyBudget;

    for (const debt of active) {
      const minimum = Math.min(debt.balance, debt.minimum);
      payments.set(debt.id, minimum);
      remainingBudget -= minimum;
    }

    for (const debt of ordered) {
      if (remainingBudget <= 0) break;
      const already = payments.get(debt.id) ?? 0;
      const room = Math.max(0, debt.balance - already);
      const bonus = Math.min(room, remainingBudget);
      payments.set(debt.id, already + bonus);
      remainingBudget -= bonus;
    }

    const priorTotal = state.reduce((sum, debt) => sum + debt.balance, 0);
    state = state.map((debt) => ({
      ...debt,
      balance: Math.max(0, debt.balance - (payments.get(debt.id) ?? 0)),
    }));
    const nextTotal = state.reduce((sum, debt) => sum + debt.balance, 0);

    if (nextTotal >= priorTotal - 0.01) return null;
    if (state.every((debt) => debt.balance <= 0.01)) return month;
  }

  return null;
}

function seededNormal(seed: number): () => number {
  let state = seed >>> 0;
  const uniform = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return Math.max(1e-9, state / 4294967296);
  };
  return () => {
    const u1 = uniform();
    const u2 = uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

function goalProbability(
  initial: number,
  monthly: number,
  target: number,
  months: number,
  expectedReturn: number,
  volatility: number,
): number | null {
  if (target <= 0 || months <= 0) return null;
  const normal = seededNormal(20260925);
  const paths = 320;
  let hits = 0;
  for (let path = 0; path < paths; path += 1) {
    let balance = initial;
    for (let month = 0; month < months; month += 1) {
      const shock = normal();
      const monthlyMean = expectedReturn / 100 / 12;
      const monthlyVol = Math.max(0, volatility) / 100 / Math.sqrt(12);
      const monthlyReturn = monthlyMean + monthlyVol * shock;
      balance = Math.max(0, balance * (1 + monthlyReturn) + monthly);
    }
    if (balance >= target) hits += 1;
  }
  return (hits / paths) * 100;
}

function deltaText(
  current: number | null,
  previous: number | null,
  currency: string,
  language: AnatoleLanguage,
): string {
  if (current == null || previous == null) return pick(language, "N/D", "N/A");
  const delta = current - previous;
  if (Math.abs(delta) < 1) return pick(language, "Stable", "Stable");
  return `${delta > 0 ? "+" : ""}${money(delta, currency, language)}`;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AdvisorV8Layer({
  profile,
  goalLabel,
  language,
  portfolioCount,
}: {
  profile: AdvisorProfile;
  goalLabel: string;
  language: AnatoleLanguage;
  portfolioCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("today");
  const [workspace, setWorkspace] = useState<Workspace>(readWorkspace);
  const [previousVisit] = useState<VisitSnapshot | null>(() =>
    normalizeV8(readWorkspace().v8).lastVisit,
  );
  const [shock, setShock] = useState<ShockKey>("income");

  useEffect(() => {
    const sync = () => setWorkspace(readWorkspace());
    window.addEventListener(SYNC_EVENT, sync);
    return () => window.removeEventListener(SYNC_EVENT, sync);
  }, []);

  const v8 = normalizeV8(workspace.v8);
  const os = workspace.financialOs ?? {};
  const household = os.household ?? {};
  const debts = Array.isArray(os.debts) ? os.debts : [];
  const goals = Array.isArray(os.goals) ? os.goals : [];
  const events = Array.isArray(os.events) ? os.events : [];
  const mortgage = os.mortgage ?? {};
  const tax = os.tax ?? {};
  const currency = profile.currency || "CAD";

  const userIncome = nullable(household.userIncome);
  const partnerIncome = nullable(household.partnerIncome);
  const totalIncome =
    userIncome == null && partnerIncome == null ? null : finite(userIncome) + finite(partnerIncome);
  const expenses =
    finite(household.essentialExpenses) +
    finite(household.discretionaryExpenses) +
    finite(household.housingCosts) +
    finite(household.insuranceCosts) +
    finite(household.otherFixedCosts);
  const debtPayments = debts.reduce((sum, debt) => sum + Math.max(0, finite(debt.monthlyPayment)), 0);
  const goalContributions = goals.reduce((sum, goal) => sum + Math.max(0, finite(goal.monthly)), 0);
  const primaryContribution = Math.max(0, finite(profile.monthly_contribution));
  const monthlyMargin =
    totalIncome == null
      ? null
      : totalIncome - expenses - debtPayments - goalContributions - primaryContribution;

  const totalDebt = debts.reduce((sum, debt) => sum + Math.max(0, finite(debt.balance)), 0);
  const assetInputs = [
    household.cash,
    household.investments,
    household.property,
    household.vehicles,
    household.otherAssets,
  ];
  const totalAssets = assetInputs.reduce<number>((sum, value) => sum + finite(value), 0);
  const knownAssetFields = assetInputs.filter(
    (value) => value != null && Number.isFinite(value),
  ).length;
  const hasAssets = knownAssetFields > 0;
  const netWorth = hasAssets || totalDebt > 0 ? totalAssets - totalDebt : null;
  const netWorthIsPartial = netWorth != null && knownAssetFields < assetInputs.length;
  const monthlyEssential = Math.max(0, finite(household.essentialExpenses) + finite(household.housingCosts));
  const runway = household.cash != null && monthlyEssential > 0 ? finite(household.cash) / monthlyEssential : null;

  const target = nullable(profile.target_amount);
  const currentSavings = nullable(profile.current_savings);
  const horizonMonths = Math.max(1, Math.round(finite(profile.horizon_years) * 12));
  const probability = useMemo(
    () =>
      goalProbability(
        finite(currentSavings),
        primaryContribution,
        finite(target),
        horizonMonths,
        v8.expectedReturn,
        v8.volatility,
      ),
    [currentSavings, horizonMonths, primaryContribution, target, v8.expectedReturn, v8.volatility],
  );

  const completenessValues = [
    profile.goal_type,
    profile.target_amount,
    profile.horizon_years,
    profile.current_savings,
    profile.monthly_contribution,
    household.userIncome,
    household.essentialExpenses,
    household.cash,
    household.investments,
    profile.income_stability,
    profile.liquidity_need,
    profile.loss_comfort,
  ];
  const completeness = Math.round(
    (completenessValues.filter((value) => value !== null && value !== undefined).length /
      completenessValues.length) *
      100,
  );

  const currentSnapshot: VisitSnapshot = {
    capturedAt: "current",
    netWorth,
    monthlyMargin,
    target,
    currentSavings,
    totalDebt,
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const latestWorkspace = readWorkspace();
      const latestV8 = normalizeV8(latestWorkspace.v8);
      persistV8({
        ...latestV8,
        lastVisit: {
          capturedAt: new Date().toISOString(),
          netWorth,
          monthlyMargin,
          target,
          currentSavings,
          totalDebt,
        },
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [currentSavings, monthlyMargin, netWorth, target, totalDebt]);

  const stressTests = [
    {
      key: "income" as const,
      label: pick(language, "Revenu -20%", "Income -20%"),
      margin: totalIncome == null ? null : totalIncome * 0.8 - expenses - debtPayments - goalContributions - primaryContribution,
      worth: netWorth,
    },
    {
      key: "expenses" as const,
      label: pick(language, "Dépenses +15%", "Expenses +15%"),
      margin: totalIncome == null ? null : totalIncome - expenses * 1.15 - debtPayments - goalContributions - primaryContribution,
      worth: netWorth,
    },
    {
      key: "markets" as const,
      label: pick(language, "Placements -25%", "Investments -25%"),
      margin: monthlyMargin,
      worth:
        netWorth == null
          ? null
          : netWorth - finite(household.investments) * 0.25,
    },
    {
      key: "rates" as const,
      label: pick(language, "Taux +2 pts", "Rates +2 pts"),
      margin:
        totalIncome == null
          ? null
          : totalIncome -
            expenses -
            debtPayments -
            goalContributions -
            primaryContribution -
            Math.max(0, finite(mortgage.purchasePrice) - finite(mortgage.downPayment)) * 0.02 / 12,
      worth: netWorth,
    },
  ];
  const activeStress = stressTests.find((item) => item.key === shock) ?? stressTests[0];

  const cashRadar = [1, 2, 3].map((months) => {
    const eventImpact = events.reduce((sum, event) => {
      const startMonth = Math.max(0, Math.round(finite(event.monthOffset)));
      if (startMonth > months) return sum;
      const activeMonths = Math.max(1, months - startMonth + 1);
      return (
        sum -
        Math.max(0, finite(event.oneTimeCost)) -
        Math.max(0, finite(event.recurringMonthlyCost)) * activeMonths +
        finite(event.monthlyIncomeDelta) * activeMonths
      );
    }, 0);
    return {
      months,
      value:
        monthlyMargin == null || household.cash == null
          ? null
          : finite(household.cash) + monthlyMargin * months + eventImpact,
    };
  });

  const debtAvalanche = debtFreeMonths(debts, "avalanche", 200);
  const debtSnowball = debtFreeMonths(debts, "snowball", 200);
  const mortgagePrincipal = Math.max(0, finite(mortgage.purchasePrice) - finite(mortgage.downPayment));
  const amortizationYears = Math.max(1, finite(mortgage.amortizationYears) || 25);
  const mortgageRate = Math.max(0, finite(mortgage.annualRate));
  const mortgageMonthly = mortgagePayment(
    mortgagePrincipal,
    mortgageRate,
    amortizationYears,
  );
  const renewalMonths = Math.max(0, Math.round(finite(mortgage.renewalAfterYears) * 12));
  const renewalBalance = mortgageBalanceAfterMonths(
    mortgagePrincipal,
    mortgageRate,
    amortizationYears,
    renewalMonths,
  );
  const remainingAmortizationYears = Math.max(
    1,
    amortizationYears - renewalMonths / 12,
  );
  const mortgageRenewalMonthly = mortgagePayment(
    renewalBalance,
    Math.max(0, finite(mortgage.renewalRate)),
    remainingAmortizationYears,
  );
  const monthlyOwnershipCarrying =
    mortgageMonthly +
    Math.max(0, finite(mortgage.annualPropertyTax)) / 12 +
    Math.max(0, finite(mortgage.monthlyCondo)) +
    Math.max(0, finite(mortgage.monthlyInsurance)) +
    Math.max(0, finite(mortgage.annualMaintenance)) / 12;
  const currentHousingCost = nullable(household.housingCosts);

  const planVariants = [
    {
      label: "A",
      title: pick(language, "Plan actuel", "Current plan"),
      value: futureValue(finite(currentSavings), primaryContribution, horizonMonths, v8.expectedReturn),
    },
    {
      label: "B",
      title: pick(language, "+12 mois", "+12 months"),
      value: futureValue(finite(currentSavings), primaryContribution, horizonMonths + 12, v8.expectedReturn),
    },
    {
      label: "C",
      title: pick(language, "+20% contribution", "+20% contribution"),
      value: futureValue(finite(currentSavings), primaryContribution * 1.2, horizonMonths, v8.expectedReturn),
    },
    {
      label: "D",
      title: pick(language, "Cible -10%", "Target -10%"),
      value: futureValue(finite(currentSavings), primaryContribution, horizonMonths, v8.expectedReturn),
      adjustedTarget: target == null ? null : target * 0.9,
    },
  ];

  const taxRows = [
    ["CELI / TFSA", tax.tfsa],
    ["REER / RRSP", tax.rrsp],
    ["CELIAPP / FHSA", tax.fhsa],
    ["REEE / RESP", tax.resp],
  ] as const;


  const totalTaxRoom = taxRows.reduce(
    (sum, [, bucket]) => sum + Math.max(0, finite(bucket?.room)),
    0,
  );
  const totalTaxPlanned = taxRows.reduce(
    (sum, [, bucket]) => sum + Math.max(0, finite(bucket?.planned)),
    0,
  );
  const taxRoomRemaining =
    totalTaxRoom > 0 ? Math.max(0, totalTaxRoom - totalTaxPlanned) : null;
  const taxRoomUtilization =
    totalTaxRoom > 0 ? Math.min(100, (totalTaxPlanned / totalTaxRoom) * 100) : null;
  const taxRoomOverage =
    totalTaxRoom > 0 ? Math.max(0, totalTaxPlanned - totalTaxRoom) : null;

  const incomeForFlow = Math.max(0, finite(totalIncome));
  const dollarFlow = [
    [pick(language, "Essentiel", "Essentials"), finite(household.essentialExpenses)],
    [pick(language, "Logement", "Housing"), finite(household.housingCosts)],
    [pick(language, "Dette", "Debt"), debtPayments],
    [pick(language, "Objectifs", "Goals"), goalContributions + primaryContribution],
    [pick(language, "Discrétionnaire", "Discretionary"), finite(household.discretionaryExpenses)],
  ] as const;

  const updateV8 = (patch: Partial<V8State>) => {
    const next = { ...v8, ...patch };
    const merged = persistV8(next);
    setWorkspace(merged);
  };

  const captureVisit = () => {
    const entry: JournalEntry = {
      id: `snapshot-${Date.now()}`,
      label: pick(language, "Snapshot financier", "Financial snapshot"),
      capturedAt: new Date().toISOString(),
      netWorth,
      monthlyMargin,
    };
    updateV8({
      lastVisit: { ...currentSnapshot, capturedAt: entry.capturedAt },
      journal: [...v8.journal, entry].slice(-30),
    });
  };

  const exportDossier = () => {
    downloadJson("anatole-conseil-dossier.json", {
      generated_by: "Anatole Conseil V8",
      profile,
      financial_os: os,
      planning: {
        net_worth: netWorth,
        net_worth_is_partial: netWorthIsPartial,
        known_asset_fields: knownAssetFields,
        monthly_margin: monthlyMargin,
        cash_runway_months: runway,
        plan_completeness_percent: completeness,
        simulated_goal_probability_percent: probability,
        simulation_assumptions: {
          expected_return_percent: v8.expectedReturn,
          volatility_percent: v8.volatility,
        },
        stress_tests: stressTests.map((item) => ({
          key: item.key,
          label: item.label,
          monthly_margin_after_shock: item.margin,
          net_worth_after_shock: item.worth,
        })),
        debt_payoff_months: {
          avalanche_plus_200: debtAvalanche,
          snowball_plus_200: debtSnowball,
        },
        housing: {
          principal: mortgagePrincipal,
          monthly_owner_carrying_cost: mortgagePrincipal > 0 ? monthlyOwnershipCarrying : null,
          renewal_balance: mortgagePrincipal > 0 && renewalMonths > 0 ? renewalBalance : null,
          renewal_payment: mortgage.renewalRate != null && mortgagePrincipal > 0 ? mortgageRenewalMonthly : null,
        },
        tax_room: {
          province_or_territory: v8.province,
          entered_total_room: totalTaxRoom || null,
          planned_contributions: totalTaxPlanned || null,
          remaining_entered_room: taxRoomRemaining,
        },
      },
      notes: pick(
        language,
        "Simulation descriptive. Vérifier les hypothèses et données avec les sources officielles ou un professionnel qualifié.",
        "Descriptive simulation. Verify assumptions and data with official sources or a qualified professional.",
      ),
    });
  };

  const modulesByTab: Record<TabKey, string[]> = {
    today: ["01", "02", "09", "18"],
    goals: ["06", "07", "14", "16"],
    scenarios: ["03", "04", "05", "15"],
    decisions: ["08", "10", "12", "19"],
    products: ["11", "13", "17", "20"],
  };

  return (
    <section className={styles.shell} data-testid="advisor-v8-layer" data-feature-count="20">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>ANATOLE CONSEIL · V8 FINANCIAL COMMAND DECK</span>
          <h2>{pick(language, "Ta vie financière, réunie dans un seul cockpit.", "Your financial life, in one command deck.")}</h2>
          <p>
            {pick(
              language,
              "20 modules reliés : patrimoine, cash-flow, objectifs, stress tests, dettes, logement, fiscalité, produits et dossier conseiller.",
              "20 connected modules: net worth, cash flow, goals, stress tests, debt, housing, tax, products and advisor dossier.",
            )}
          </p>
        </div>
        <div className={styles.heroPulse}>
          <span>{pick(language, "PLAN DOCUMENTÉ", "PLAN DOCUMENTED")}</span>
          <strong>{completeness}%</strong>
          <small>{pick(language, `${modulesByTab[tab].length} modules actifs dans cette vue`, `${modulesByTab[tab].length} active modules in this view`)}</small>
        </div>
      </header>

      <nav className={styles.tabs} aria-label={pick(language, "Espaces Conseil V8", "Advice V8 spaces")}>
        {TABS.map((item) => (
          <button
            type="button"
            key={item.key}
            className={tab === item.key ? styles.tabActive : undefined}
            aria-pressed={tab === item.key}
            data-testid={`advisor-v8-tab-${item.key}`}
            onClick={() => setTab(item.key)}
          >
            <span>{item.index}</span>
            <strong>{pick(language, item.fr, item.en)}</strong>
          </button>
        ))}
      </nav>

      {tab === "today" ? (
        <div className={styles.zone} data-testid="advisor-v8-today">
          <article className={`${styles.card} ${styles.cardHero}`} data-module="01">
            <div className={styles.cardEyebrow}>01 · FINANCIAL OS</div>
            <h3>{pick(language, "Ton tableau de bord permanent", "Your permanent financial dashboard")}</h3>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, netWorthIsPartial ? "Valeur nette partielle" : "Valeur nette", netWorthIsPartial ? "Partial net worth" : "Net worth")}</span><strong>{money(netWorth, currency, language)}</strong></div>
              <div><span>{pick(language, "Marge mensuelle", "Monthly margin")}</span><strong>{money(monthlyMargin, currency, language)}</strong></div>
              <div><span>{pick(language, "Runway liquidités", "Cash runway")}</span><strong>{runway == null ? "N/D" : `${runway.toFixed(1)} ${pick(language, "mois", "months")}`}</strong></div>
              <div><span>{pick(language, "Dettes détaillées", "Detailed debt")}</span><strong>{money(totalDebt, currency, language)}</strong></div>
            </div>
          </article>

          <article className={styles.card} data-module="02">
            <div className={styles.cardEyebrow}>02 · {pick(language, "DEPUIS TA DERNIÈRE VISITE", "SINCE YOUR LAST VISIT")}</div>
            <h3>{pick(language, "Ce qui a changé", "What changed")}</h3>
            <div className={styles.changeGrid}>
              <div><span>{pick(language, "Patrimoine", "Net worth")}</span><strong>{deltaText(netWorth, previousVisit?.netWorth ?? null, currency, language)}</strong></div>
              <div><span>{pick(language, "Marge", "Margin")}</span><strong>{deltaText(monthlyMargin, previousVisit?.monthlyMargin ?? null, currency, language)}</strong></div>
              <div><span>{pick(language, "Dette", "Debt")}</span><strong>{previousVisit ? deltaText(totalDebt, previousVisit.totalDebt, currency, language) : "N/D"}</strong></div>
            </div>
            <button type="button" className={styles.action} onClick={captureVisit}>{pick(language, "Mémoriser ce snapshot", "Save this snapshot")}</button>
          </article>

          <article className={styles.card} data-module="09">
            <div className={styles.cardEyebrow}>09 · CASH-FLOW RADAR</div>
            <h3>{pick(language, "30 / 60 / 90 jours", "30 / 60 / 90 days")}</h3>
            <div className={styles.radar}>
              {cashRadar.map((item) => (
                <div key={item.months}>
                  <span>{item.months * 30} j</span>
                  <strong>{money(item.value, currency, language)}</strong>
                  <i className={item.value != null && item.value < 0 ? styles.badDot : styles.goodDot} />
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card} data-module="18">
            <div className={styles.cardEyebrow}>18 · PLAN QUALITY</div>
            <h3>{pick(language, "Qualité du plan, pas jugement de la personne", "Plan quality, not a judgment of the person")}</h3>
            <div className={styles.qualityMeter}><span style={{ width: `${completeness}%` }} /></div>
            <strong className={styles.bigNumber}>{completeness}%</strong>
            <p>{pick(language, "Mesure uniquement la complétude des données structurantes utilisées dans Conseil.", "Measures only the completeness of the core data used by Advice.")}</p>
          </article>
        </div>
      ) : null}

      {tab === "goals" ? (
        <div className={styles.zone} data-testid="advisor-v8-goals">
          <article className={styles.card} data-module="06">
            <div className={styles.cardEyebrow}>06 · GOAL DEPENDENCY MAP</div>
            <h3>{pick(language, "Quels objectifs se disputent la même marge ?", "Which goals compete for the same margin?")}</h3>
            <div className={styles.goalMap}>
              {(goals.length ? goals : [{ label: goalLabel, target: target ?? 0, current: currentSavings ?? 0, monthly: primaryContribution, horizonMonths }]).map((goal, index) => (
                <div key={goal.id ?? `${goal.label}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{goal.label || pick(language, "Objectif", "Goal")}</strong>
                  <small>{money(goal.monthly ?? 0, currency, language)} / {pick(language, "mois", "month")} · {Math.round(finite(goal.horizonMonths) / 12)} {pick(language, "ans", "years")}</small>
                </div>
              ))}
            </div>
            <p>
              {monthlyMargin == null
                ? pick(
                    language,
                    "Ajoute le revenu et les dépenses pour mesurer la pression réelle de chaque objectif sur la marge mensuelle.",
                    "Add income and expenses to measure how each goal actually pressures monthly capacity.",
                  )
                : goalContributions + primaryContribution > Math.max(0, monthlyMargin)
                  ? pick(
                      language,
                      `Les objectifs mobilisent ${money(goalContributions + primaryContribution, currency, language)} par mois, davantage que la marge restante de ${money(monthlyMargin, currency, language)} : ils se concurrencent dans ce scénario.`,
                      `Goals use ${money(goalContributions + primaryContribution, currency, language)} per month, more than the remaining ${money(monthlyMargin, currency, language)} margin: they compete in this scenario.`,
                    )
                  : pick(
                      language,
                      `Les contributions restent dans la capacité mensuelle modélisée; marge après plan : ${money(monthlyMargin, currency, language)}.`,
                      `Contributions remain within the modelled monthly capacity; margin after plan: ${money(monthlyMargin, currency, language)}.`,
                    )}
            </p>
          </article>

          <article className={styles.card} data-module="07">
            <div className={styles.cardEyebrow}>07 · MONTHLY PLAN</div>
            <h3>{pick(language, "Plan mensuel concret", "Concrete monthly plan")}</h3>
            <div className={styles.planRows}>
              <div><span>{pick(language, "Revenu", "Income")}</span><strong>{money(totalIncome, currency, language)}</strong></div>
              <div><span>{pick(language, "Dépenses", "Expenses")}</span><strong>{money(expenses, currency, language)}</strong></div>
              <div><span>{pick(language, "Dettes", "Debt")}</span><strong>{money(debtPayments, currency, language)}</strong></div>
              <div><span>{pick(language, "Objectifs", "Goals")}</span><strong>{money(goalContributions + primaryContribution, currency, language)}</strong></div>
              <div className={styles.planTotal}><span>{pick(language, "Reste", "Remaining")}</span><strong>{money(monthlyMargin, currency, language)}</strong></div>
            </div>
          </article>

          <article className={styles.card} data-module="14">
            <div className={styles.cardEyebrow}>14 · GOAL STACK</div>
            <h3>{pick(language, "Objectifs imbriqués par horizon", "Goals stacked by horizon")}</h3>
            <div className={styles.stack}>
              {(goals.length ? [...goals].sort((a, b) => finite(a.horizonMonths) - finite(b.horizonMonths)) : [{ label: goalLabel, horizonMonths }]).map((goal, index) => (
                <div key={goal.id ?? `${goal.label}-${index}`} style={{ width: `${Math.max(34, 100 - index * 12)}%` }}>
                  <span>{index + 1}</span><strong>{goal.label || goalLabel}</strong><small>{Math.round(finite(goal.horizonMonths) / 12)} {pick(language, "ans", "years")}</small>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card} data-module="16">
            <div className={styles.cardEyebrow}>16 · FINANCIAL JOURNAL</div>
            <h3>{pick(language, "Ton historique de décisions", "Your decision history")}</h3>
            <div className={styles.journal}>
              {v8.journal.slice(-5).reverse().map((entry) => (
                <div key={entry.id}><strong>{entry.label}</strong><span>{entry.capturedAt.slice(0, 10)}</span><small>{money(entry.netWorth, currency, language)} · {money(entry.monthlyMargin, currency, language)}</small></div>
              ))}
              {!v8.journal.length ? <p>{pick(language, "Aucun snapshot enregistré pour l’instant.", "No snapshots saved yet.")}</p> : null}
            </div>
            <button type="button" className={styles.action} onClick={captureVisit}>{pick(language, "Ajouter au journal", "Add to journal")}</button>
          </article>
        </div>
      ) : null}

      {tab === "scenarios" ? (
        <div className={styles.zone} data-testid="advisor-v8-scenarios">
          <article className={styles.card} data-module="03">
            <div className={styles.cardEyebrow}>03 · FINANCIAL TWIN</div>
            <h3>{pick(language, "Ton jumeau financier en mouvement", "Your financial twin in motion")}</h3>
            <div className={styles.twinStrip}>
              <div><span>{pick(language, "Aujourd’hui", "Today")}</span><strong>{money(currentSavings, currency, language)}</strong></div>
              <b>→</b>
              <div><span>{pick(language, "Horizon", "Horizon")}</span><strong>{money(futureValue(finite(currentSavings), primaryContribution, horizonMonths, v8.expectedReturn), currency, language)}</strong></div>
              <b>→</b>
              <div><span>{pick(language, "Cible", "Target")}</span><strong>{money(target, currency, language)}</strong></div>
            </div>
          </article>

          <article className={styles.card} data-module="04">
            <div className={styles.cardEyebrow}>04 · PROBABILITY LAB</div>
            <h3>{pick(language, "Teste la probabilité sous tes hypothèses", "Test probability under your assumptions")}</h3>
            <div
              className={styles.probabilityRing}
              style={{
                background: `radial-gradient(circle at center, var(--surface-raised) 57%, transparent 58%), conic-gradient(var(--teal) ${Math.max(0, Math.min(100, probability ?? 0))}%, var(--border) 0)`,
              }}
            >
              <strong>{pct(probability)}</strong>
              <span>{pick(language, "des trajectoires simulées atteignent la cible", "of simulated paths reach the target")}</span>
            </div>
            <div className={styles.inputs2}>
              <label><span>{pick(language, "Rendement moyen hypothétique", "Assumed average return")}</span><input type="number" step="0.5" value={v8.expectedReturn} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV8({ expectedReturn: Number(event.target.value) || 0 })} /></label>
              <label><span>{pick(language, "Volatilité hypothétique", "Assumed volatility")}</span><input type="number" step="0.5" min="0" value={v8.volatility} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV8({ volatility: Math.max(0, Number(event.target.value) || 0) })} /></label>
            </div>
            <p>{pick(language, "Simulation déterministe de 320 trajectoires avec hypothèses modifiables; ce n’est pas une prévision garantie.", "Deterministic 320-path simulation with editable assumptions; this is not a guaranteed forecast.")}</p>
          </article>

          <article className={styles.card} data-module="05">
            <div className={styles.cardEyebrow}>05 · STRESS LAB</div>
            <h3>{pick(language, "Que se passe-t-il si le plan prend un choc ?", "What happens if the plan takes a hit?")}</h3>
            <div className={styles.chips}>{stressTests.map((item) => <button type="button" key={item.key} className={shock === item.key ? styles.chipActive : undefined} onClick={() => setShock(item.key)}>{item.label}</button>)}</div>
            <div className={styles.stressResult}><span>{pick(language, "Marge après choc", "Margin after shock")}</span><strong>{money(activeStress.margin, currency, language)}</strong><span>{pick(language, "Valeur nette simulée", "Simulated net worth")}</span><strong>{money(activeStress.worth, currency, language)}</strong></div>
          </article>

          <article className={styles.card} data-module="15">
            <div className={styles.cardEyebrow}>15 · PLAN B / C / D</div>
            <h3>{pick(language, "Quatre structures à explorer", "Four structures to explore")}</h3>
            <div className={styles.variantGrid}>{planVariants.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.title}</strong><b>{money(item.value, currency, language)}</b><small>{item.adjustedTarget != null ? `${pick(language, "Cible", "Target")} ${money(item.adjustedTarget, currency, language)}` : pick(language, "Valeur projetée", "Projected value")}</small></div>)}</div>
          </article>
        </div>
      ) : null}

      {tab === "decisions" ? (
        <div className={styles.zone} data-testid="advisor-v8-decisions">
          <article className={styles.card} data-module="08">
            <div className={styles.cardEyebrow}>08 · DEBT CENTER</div>
            <h3>{pick(language, "Comparer les stratégies de remboursement", "Compare payoff structures")}</h3>
            <div className={styles.compare2}><div><span>Avalanche +200</span><strong>{debtAvalanche == null ? "N/D" : `${debtAvalanche} ${pick(language, "mois", "months")}`}</strong></div><div><span>Snowball +200</span><strong>{debtSnowball == null ? "N/D" : `${debtSnowball} ${pick(language, "mois", "months")}`}</strong></div></div>
            <p>{pick(language, "Comparaison descriptive basée sur les soldes, taux et paiements saisis dans Debt Center.", "Descriptive comparison based on balances, rates and payments entered in Debt Center.")}</p>
          </article>

          <article className={styles.card} data-module="10">
            <div className={styles.cardEyebrow}>10 · HOUSING LAB</div>
            <h3>{pick(language, "Le logement relié au reste du plan", "Housing connected to the rest of the plan")}</h3>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Capital hypothécaire", "Mortgage principal")}</span><strong>{money(mortgagePrincipal || null, currency, language)}</strong></div>
              <div><span>{pick(language, "Coût mensuel propriétaire", "Monthly owner carrying cost")}</span><strong>{money(mortgagePrincipal > 0 ? monthlyOwnershipCarrying : null, currency, language)}</strong></div>
              <div><span>{pick(language, "Solde au renouvellement", "Balance at renewal")}</span><strong>{money(mortgagePrincipal > 0 && renewalMonths > 0 ? renewalBalance : null, currency, language)}</strong></div>
              <div><span>{pick(language, "Paiement au renouvellement", "Renewal payment")}</span><strong>{money(mortgage.renewalRate != null && mortgagePrincipal > 0 ? mortgageRenewalMonthly : null, currency, language)}</strong></div>
              <div><span>{pick(language, "Coût logement actuel", "Current housing cost")}</span><strong>{money(currentHousingCost, currency, language)}</strong></div>
              <div><span>{pick(language, "Écart mensuel", "Monthly difference")}</span><strong>{money(currentHousingCost != null && mortgagePrincipal > 0 ? monthlyOwnershipCarrying - currentHousingCost : null, currency, language)}</strong></div>
            </div>
            <p>{pick(language, "Le paiement hypothécaire utilise la convention canadienne de taux nominal composé semestriellement. Taxes, condo, assurance et entretien saisis sont ajoutés au coût mensuel.", "The mortgage payment uses the Canadian nominal-rate convention compounded semi-annually. Entered property tax, condo fees, insurance and maintenance are added to monthly carrying cost.")}</p>
          </article>

          <article className={styles.card} data-module="12">
            <div className={styles.cardEyebrow}>12 · CANADA TAX LENS</div>
            <h3>{pick(language, "Enveloppes fiscales + contexte provincial", "Tax accounts + provincial context")}</h3>
            <label className={styles.selectRow}>
              <span>{pick(language, "Province / territoire", "Province / territory")}</span>
              <select
                value={v8.province}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  updateV8({ province: event.target.value })
                }
              >
                <option value="">{pick(language, "Choisir…", "Select…")}</option>
                {PROVINCES.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>
            <div className={styles.taxRows}>{taxRows.map(([label, bucket]) => <div key={label}><strong>{label}</strong><span>{pick(language, "Espace saisi", "Entered room")} {money(bucket?.room ?? null, currency, language)}</span><span>{pick(language, "Planifié", "Planned")} {money(bucket?.planned ?? null, currency, language)}</span></div>)}</div>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Utilisation planifiée", "Planned utilization")}</span><strong>{taxRoomUtilization == null ? "N/D" : pct(taxRoomUtilization)}</strong></div>
              <div><span>{pick(language, "Espace restant saisi", "Entered room remaining")}</span><strong>{money(taxRoomRemaining, currency, language)}</strong></div>
              <div><span>{pick(language, "Dépassement saisi", "Entered overage")}</span><strong>{money(taxRoomOverage, currency, language)}</strong></div>
            </div>
            <p>{pick(language, "Anatole relie les plafonds et contributions saisis sans inventer un remboursement d’impôt. Les économies fiscales détaillées exigent les barèmes officiels à jour de la province sélectionnée.", "Anatole links entered room and planned contributions without inventing a tax refund. Detailed tax savings require current official brackets for the selected province.")}</p>
          </article>

          <article className={styles.card} data-module="19">
            <div className={styles.cardEyebrow}>19 · LIFE EVENTS ENGINE</div>
            <h3>{pick(language, "Les événements qui vont bouger ton plan", "Events that will move your plan")}</h3>
            <div className={styles.eventList}>{events.slice(0, 6).map((event, index) => <div key={event.id ?? index}><span>M+{Math.round(finite(event.monthOffset))}</span><strong>{event.label || pick(language, "Événement", "Event")}</strong><small>{money(finite(event.oneTimeCost), currency, language)} · {money(finite(event.recurringMonthlyCost), currency, language)}/m</small></div>)}{!events.length ? <p>{pick(language, "Ajoute des événements dans Life Events pour les injecter dans les scénarios.", "Add events in Life Events to inject them into scenarios.")}</p> : null}</div>
          </article>
        </div>
      ) : null}

      {tab === "products" ? (
        <div className={styles.zone} data-testid="advisor-v8-products">
          <article className={`${styles.card} ${styles.cardHero}`} data-module="11">
            <div className={styles.cardEyebrow}>11 · FINANCIAL SHOP</div>
            <h3>{pick(language, "Du profil aux produits disponibles", "From profile to available products")}</h3>
            <p>{pick(language, "Cartes, comptes, hypothèques, prêts étudiants, prêts personnels, assurance auto, assurance-vie et fiscalité : le questionnaire Magasiner transforme les réponses en propositions sourcées lorsque des offres vérifiables sont disponibles.", "Cards, accounts, mortgages, student loans, personal loans, auto insurance, life insurance and tax: Shop turns answers into sourced proposals when verifiable offers are available.")}</p>
            <div className={styles.chips}>
              <span>{pick(language, "Cartes", "Cards")}</span>
              <span>{pick(language, "Comptes", "Accounts")}</span>
              <span>{pick(language, "Hypothèques", "Mortgages")}</span>
              <span>{pick(language, "Prêts", "Loans")}</span>
              <span>{pick(language, "Assurances", "Insurance")}</span>
              <span>{pick(language, "Impôts", "Tax")}</span>
            </div>
            <Link href="/assistant/magasiner" className={styles.primaryAction}>{pick(language, "Ouvrir Magasiner", "Open Shop")}</Link>
          </article>

          <article className={styles.card} data-module="13">
            <div className={styles.cardEyebrow}>13 · WHERE EVERY DOLLAR GOES</div>
            <h3>{pick(language, "Où va ton revenu mensuel ?", "Where does monthly income go?")}</h3>
            <div className={styles.flowBars}>{dollarFlow.map(([label, value]) => { const share = incomeForFlow > 0 ? Math.min(100, (value / incomeForFlow) * 100) : 0; return <div key={label}><span>{label}</span><div><i style={{ width: `${share}%` }} /></div><strong>{money(value, currency, language)}</strong></div>; })}</div>
          </article>

          <article className={styles.card} data-module="17">
            <div className={styles.cardEyebrow}>17 · WHY?</div>
            <h3>{pick(language, "Chaque conclusion doit pouvoir s’expliquer", "Every conclusion should be explainable")}</h3>
            <details><summary>{pick(language, "Pourquoi la marge mensuelle ?", "Why monthly margin?")}</summary><p>{pick(language, "Revenus saisis − dépenses − paiements de dettes − contributions aux objectifs.", "Entered income − expenses − debt payments − goal contributions.")}</p></details>
            <details><summary>{pick(language, "Pourquoi la probabilité ?", "Why the probability?")}</summary><p>{pick(language, "320 trajectoires déterministes générées à partir du rendement et de la volatilité hypothétiques affichés.", "320 deterministic paths generated from the displayed assumed return and volatility.")}</p></details>
            <details><summary>{pick(language, "Pourquoi la qualité du plan ?", "Why plan quality?")}</summary><p>{pick(language, "C’est un taux de complétude des champs structurants, pas une note de santé financière.", "It is a completeness rate for core inputs, not a financial-health score.")}</p></details>
          </article>

          <article className={styles.card} data-module="20">
            <div className={styles.cardEyebrow}>20 · HUMAN ADVISOR MODE</div>
            <h3>{pick(language, "Un dossier transportable vers un professionnel", "A portable dossier for a professional")}</h3>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Positions reliées", "Linked positions")}</span><strong>{portfolioCount}</strong></div>
              <div><span>{pick(language, "Objectifs", "Goals")}</span><strong>{Math.max(1, goals.length)}</strong></div>
              <div><span>{pick(language, "Dettes", "Debts")}</span><strong>{debts.length}</strong></div>
              <div><span>{pick(language, "Événements", "Events")}</span><strong>{events.length}</strong></div>
            </div>
            <button type="button" className={styles.primaryAction} onClick={exportDossier}>{pick(language, "Exporter le dossier JSON", "Export JSON dossier")}</button>
          </article>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <span>{pick(language, "Anatole calcule et met les scénarios en contexte; les hypothèses restent visibles et modifiables.", "Anatole calculates and puts scenarios in context; assumptions remain visible and editable.")}</span>
        <b>20/20 · V8</b>
      </footer>
    </section>
  );
}
