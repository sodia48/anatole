"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  computeFinancialHealth,
  projectedFutureValue,
  requiredMonthlyContribution,
} from "@/lib/advisor-financial-health";
import type { AdvisorProfile } from "@/lib/types";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./AdvisorV9Layer.module.css";

const WORKSPACE_KEY = "anatole:advisor-workspace:v4";
const V9_LOCAL_KEY = "anatole:advisor-v9-local:v1";
const SYNC_EVENT = "anatole-workspace-sync-applied";

type TabKey =
  | "today"
  | "money"
  | "goals"
  | "decide"
  | "file";

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

type FinancialEvent = {
  id?: string;
  label?: string;
  monthOffset?: number;
  oneTimeCost?: number;
  recurringMonthlyCost?: number;
  monthlyIncomeDelta?: number;
};

type TaxBucket = {
  room?: number | null;
  planned?: number | null;
};

type TaxState = {
  tfsa?: TaxBucket;
  rrsp?: TaxBucket;
  fhsa?: TaxBucket;
  resp?: TaxBucket;
};

type FinancialOs = {
  household?: Household;
  debts?: Debt[];
  goals?: Goal[];
  events?: FinancialEvent[];
  tax?: TaxState;
  forecastMonths?: 12 | 24 | 36;
};

type V8State = {
  province?: string;
  expectedReturn?: number;
  volatility?: number;
  lastVisit?: {
    capturedAt?: string;
    netWorth?: number | null;
    monthlyMargin?: number | null;
    target?: number | null;
    currentSavings?: number | null;
    totalDebt?: number;
  } | null;
};

type BankTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  source: "csv";
};

type FamilyMember = {
  id: string;
  name: string;
  role: "partner" | "child" | "dependant" | "other";
};

type VaultDocument = {
  id: string;
  name: string;
  size: number;
  type: string;
  category: string;
  addedAt: string;
  extraction: "metadata-only";
};

type DecisionLog = {
  id: string;
  label: string;
  createdAt: string;
};

type V9State = {
  transactions: BankTransaction[];
  householdMode: "solo" | "couple" | "family";
  family: FamilyMember[];
  currentAge: number;
  retirementAge: number;
  retirementMonthlyNeed: number | null;
  publicPensionMonthly: number | null;
  withdrawalRatePercent: number;
  lifeCoverage: number | null;
  insuranceNeed: number | null;
  disabilityMonthlyCoverage: number | null;
  creditLimit: number | null;
  creditBalance: number | null;
  creditApr: number | null;
  enteredCreditScore: number | null;
  careerFutureMonthlyIncome: number | null;
  careerChangeMonth: number;
  selfEmployed: boolean;
  businessMonthlyExpenses: number | null;
  taxReservePercent: number;
  documents: VaultDocument[];
  completedActions: string[];
  benchmarkMonthlySavings: number | null;
  scenarioIncomeDelta: number;
  scenarioExpenseDelta: number;
  scenarioOneTimeCost: number;
  scenarioDurationMonths: number;
  hindsightMonths: number;
  hindsightMonthlyDelta: number;
  privacyAllowImports: boolean;
  shareExpiryDays: number;
  decisionHistory: DecisionLog[];
  fixedGoalDate: boolean;
  fixedGoalAmount: boolean;
  minimumReserve: number | null;
  agentGoal: string;
  emergencyMode: boolean;
  emergencyExpenseCutPercent: number;
};

type Workspace = {
  financialOs?: FinancialOs;
  v8?: V8State;
};

type RecurringItem = {
  label: string;
  averageAmount: number;
  observations: number;
};

type AnomalyItem = {
  id: string;
  label: string;
  amount: number;
  date: string;
};

type InboxItem = {
  id: string;
  tone: "info" | "warn" | "attention";
  title: string;
  detail: string;
};

type TimelineItem = {
  id: string;
  month: number;
  label: string;
  category: string;
};

type MonteCarloResult = {
  p10: number;
  median: number;
  p90: number;
  successRate: number | null;
};

const EMPTY_V9: V9State = {
  transactions: [],
  householdMode: "solo",
  family: [],
  currentAge: 30,
  retirementAge: 65,
  retirementMonthlyNeed: null,
  publicPensionMonthly: null,
  withdrawalRatePercent: 4,
  lifeCoverage: null,
  insuranceNeed: null,
  disabilityMonthlyCoverage: null,
  creditLimit: null,
  creditBalance: null,
  creditApr: null,
  enteredCreditScore: null,
  careerFutureMonthlyIncome: null,
  careerChangeMonth: 12,
  selfEmployed: false,
  businessMonthlyExpenses: null,
  taxReservePercent: 25,
  documents: [],
  completedActions: [],
  benchmarkMonthlySavings: null,
  scenarioIncomeDelta: 0,
  scenarioExpenseDelta: 0,
  scenarioOneTimeCost: 0,
  scenarioDurationMonths: 12,
  hindsightMonths: 12,
  hindsightMonthlyDelta: 200,
  privacyAllowImports: true,
  shareExpiryDays: 7,
  decisionHistory: [],
  fixedGoalDate: true,
  fixedGoalAmount: true,
  minimumReserve: null,
  agentGoal: "",
  emergencyMode: false,
  emergencyExpenseCutPercent: 20,
};

const TABS: Array<{
  key: TabKey;
  index: string;
  fr: string;
  en: string;
}> = [
  { key: "today", index: "01", fr: "Aujourd’hui", en: "Today" },
  { key: "money", index: "02", fr: "Mon argent", en: "My money" },
  { key: "goals", index: "03", fr: "Mes objectifs", en: "My goals" },
  { key: "decide", index: "04", fr: "Décider", en: "Decide" },
  { key: "file", index: "05", fr: "Mon dossier", en: "My file" },
];

function finite(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function nullable(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function money(
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

function pct(
  value: number | null | undefined,
  language: AnatoleLanguage,
): string {
  if (value == null || !Number.isFinite(value)) {
    return pick(language, "N/D", "N/A");
  }
  return `${value.toFixed(1)} %`;
}

function numberFromInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readWorkspace(): Workspace {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    return raw ? (JSON.parse(raw) as Workspace) : {};
  } catch {
    return {};
  }
}

function normalizeV9(value: unknown): V9State {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<V9State>)
      : {};
  const numberOr = (
    valueCandidate: number | null | undefined,
    fallback: number,
  ) =>
    valueCandidate != null && Number.isFinite(valueCandidate)
      ? valueCandidate
      : fallback;
  return {
    transactions: Array.isArray(raw.transactions)
      ? raw.transactions.slice(-500)
      : [],
    householdMode:
      raw.householdMode === "couple" ||
      raw.householdMode === "family"
        ? raw.householdMode
        : "solo",
    family: Array.isArray(raw.family) ? raw.family.slice(-12) : [],
    currentAge: numberOr(raw.currentAge, EMPTY_V9.currentAge),
    retirementAge: numberOr(
      raw.retirementAge,
      EMPTY_V9.retirementAge,
    ),
    retirementMonthlyNeed:
      raw.retirementMonthlyNeed != null &&
      Number.isFinite(raw.retirementMonthlyNeed)
        ? raw.retirementMonthlyNeed
        : null,
    publicPensionMonthly:
      raw.publicPensionMonthly != null &&
      Number.isFinite(raw.publicPensionMonthly)
        ? raw.publicPensionMonthly
        : null,
    withdrawalRatePercent: numberOr(
      raw.withdrawalRatePercent,
      EMPTY_V9.withdrawalRatePercent,
    ),
    lifeCoverage:
      raw.lifeCoverage != null && Number.isFinite(raw.lifeCoverage)
        ? raw.lifeCoverage
        : null,
    insuranceNeed:
      raw.insuranceNeed != null &&
      Number.isFinite(raw.insuranceNeed)
        ? raw.insuranceNeed
        : null,
    disabilityMonthlyCoverage:
      raw.disabilityMonthlyCoverage != null &&
      Number.isFinite(raw.disabilityMonthlyCoverage)
        ? raw.disabilityMonthlyCoverage
        : null,
    creditLimit:
      raw.creditLimit != null && Number.isFinite(raw.creditLimit)
        ? raw.creditLimit
        : null,
    creditBalance:
      raw.creditBalance != null &&
      Number.isFinite(raw.creditBalance)
        ? raw.creditBalance
        : null,
    creditApr:
      raw.creditApr != null && Number.isFinite(raw.creditApr)
        ? raw.creditApr
        : null,
    enteredCreditScore:
      raw.enteredCreditScore != null &&
      Number.isFinite(raw.enteredCreditScore)
        ? raw.enteredCreditScore
        : null,
    careerFutureMonthlyIncome:
      raw.careerFutureMonthlyIncome != null &&
      Number.isFinite(raw.careerFutureMonthlyIncome)
        ? raw.careerFutureMonthlyIncome
        : null,
    careerChangeMonth: numberOr(
      raw.careerChangeMonth,
      EMPTY_V9.careerChangeMonth,
    ),
    selfEmployed: raw.selfEmployed === true,
    businessMonthlyExpenses:
      raw.businessMonthlyExpenses != null &&
      Number.isFinite(raw.businessMonthlyExpenses)
        ? raw.businessMonthlyExpenses
        : null,
    taxReservePercent: numberOr(
      raw.taxReservePercent,
      EMPTY_V9.taxReservePercent,
    ),
    documents: Array.isArray(raw.documents)
      ? raw.documents.slice(-50)
      : [],
    completedActions: Array.isArray(raw.completedActions)
      ? raw.completedActions.slice(-100)
      : [],
    benchmarkMonthlySavings:
      raw.benchmarkMonthlySavings != null &&
      Number.isFinite(raw.benchmarkMonthlySavings)
        ? raw.benchmarkMonthlySavings
        : null,
    scenarioIncomeDelta: numberOr(
      raw.scenarioIncomeDelta,
      EMPTY_V9.scenarioIncomeDelta,
    ),
    scenarioExpenseDelta: numberOr(
      raw.scenarioExpenseDelta,
      EMPTY_V9.scenarioExpenseDelta,
    ),
    scenarioOneTimeCost: numberOr(
      raw.scenarioOneTimeCost,
      EMPTY_V9.scenarioOneTimeCost,
    ),
    scenarioDurationMonths: numberOr(
      raw.scenarioDurationMonths,
      EMPTY_V9.scenarioDurationMonths,
    ),
    hindsightMonths: numberOr(
      raw.hindsightMonths,
      EMPTY_V9.hindsightMonths,
    ),
    hindsightMonthlyDelta: numberOr(
      raw.hindsightMonthlyDelta,
      EMPTY_V9.hindsightMonthlyDelta,
    ),
    privacyAllowImports: raw.privacyAllowImports !== false,
    shareExpiryDays: numberOr(
      raw.shareExpiryDays,
      EMPTY_V9.shareExpiryDays,
    ),
    decisionHistory: Array.isArray(raw.decisionHistory)
      ? raw.decisionHistory.slice(-60)
      : [],
    fixedGoalDate: raw.fixedGoalDate !== false,
    fixedGoalAmount: raw.fixedGoalAmount !== false,
    minimumReserve:
      raw.minimumReserve != null &&
      Number.isFinite(raw.minimumReserve)
        ? raw.minimumReserve
        : null,
    agentGoal:
      typeof raw.agentGoal === "string" ? raw.agentGoal : "",
    emergencyMode: raw.emergencyMode === true,
    emergencyExpenseCutPercent: numberOr(
      raw.emergencyExpenseCutPercent,
      EMPTY_V9.emergencyExpenseCutPercent,
    ),
  };
}

function readV9(): V9State {
  if (typeof window === "undefined") return EMPTY_V9;
  try {
    const raw = window.localStorage.getItem(V9_LOCAL_KEY);
    return normalizeV9(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY_V9;
  }
}

function persistV9(next: V9State): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    V9_LOCAL_KEY,
    JSON.stringify(next),
  );
}

function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0-9#*_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function findHeader(
  headers: string[],
  candidates: RegExp[],
): number {
  return headers.findIndex((header) =>
    candidates.some((candidate) => candidate.test(header)),
  );
}

function parseBankCsv(text: string): BankTransaction[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((value) =>
    value.toLowerCase(),
  );
  const dateIndex = findHeader(headers, [
    /date/,
    /transaction.*date/,
    /posting.*date/,
  ]);
  const descriptionIndex = findHeader(headers, [
    /description/,
    /merchant/,
    /details?/,
    /memo/,
    /name/,
  ]);
  const amountIndex = findHeader(headers, [
    /^amount$/,
    /transaction.*amount/,
    /montant/,
  ]);
  const debitIndex = findHeader(headers, [/debit/, /withdrawal/]);
  const creditIndex = findHeader(headers, [/credit/, /deposit/]);

  if (dateIndex < 0 || descriptionIndex < 0) return [];

  return lines.slice(1).flatMap((line, index) => {
    const cells = splitCsvLine(line);
    const rawAmount =
      amountIndex >= 0
        ? cells[amountIndex]
        : debitIndex >= 0 || creditIndex >= 0
          ? String(
              finite(
                numberFromInput(cells[creditIndex] ?? "") ?? 0,
              ) -
                finite(
                  numberFromInput(cells[debitIndex] ?? "") ?? 0,
                ),
            )
          : "";
    const amount = Number(
      rawAmount
        .replace(/\$/g, "")
        .replace(/\s/g, "")
        .replace(/,/g, ""),
    );
    const date = cells[dateIndex]?.trim() ?? "";
    const description = cells[descriptionIndex]?.trim() ?? "";
    if (!date || !description || !Number.isFinite(amount)) {
      return [];
    }
    return [
      {
        id: `csv-${index}-${date}-${description}`.slice(0, 120),
        date,
        description,
        amount,
        source: "csv" as const,
      },
    ];
  });
}

function recurringTransactions(
  transactions: BankTransaction[],
): RecurringItem[] {
  const groups = new Map<string, BankTransaction[]>();
  for (const item of transactions) {
    const key = normalizeMerchant(item.description);
    if (!key || item.amount >= 0) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .flatMap(([label, items]) => {
      if (items.length < 2) return [];
      const values = items.map((item) => Math.abs(item.amount));
      const mean =
        values.reduce((sum, value) => sum + value, 0) /
        values.length;
      const maxDeviation =
        mean > 0
          ? Math.max(
              ...values.map(
                (value) => Math.abs(value - mean) / mean,
              ),
            )
          : 1;
      if (maxDeviation > 0.22) return [];

      const dates = items
        .map((item) => Date.parse(item.date))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
      const gaps =
        dates.length >= 2
          ? dates.slice(1).map(
              (value, index) =>
                (value - dates[index]) / 86_400_000,
            )
          : [];
      const averageGap =
        gaps.length > 0
          ? gaps.reduce((sum, value) => sum + value, 0) /
            gaps.length
          : null;
      const cadenceLooksRecurring =
        averageGap == null ||
        (averageGap >= 5 && averageGap <= 10) ||
        (averageGap >= 20 && averageGap <= 40);
      if (!cadenceLooksRecurring) return [];

      return [
        {
          label,
          averageAmount: mean,
          observations: items.length,
        },
      ];
    })
    .sort((a, b) => b.averageAmount - a.averageAmount)
    .slice(0, 8);
}

function transactionAnomalies(
  transactions: BankTransaction[],
): AnomalyItem[] {
  const expenses = transactions
    .filter((item) => item.amount < 0)
    .map((item) => ({
      item,
      absolute: Math.abs(item.amount),
    }));
  if (expenses.length < 3) return [];
  const sorted = expenses
    .map((entry) => entry.absolute)
    .sort((a, b) => a - b);
  const median =
    sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(100, median * 3);
  return expenses
    .filter((entry) => entry.absolute >= threshold)
    .sort((a, b) => b.absolute - a.absolute)
    .slice(0, 6)
    .map((entry) => ({
      id: entry.item.id,
      label: entry.item.description,
      amount: entry.absolute,
      date: entry.item.date,
    }));
}

function classifyDocument(name: string): string {
  const normalized = name.toLowerCase();
  if (/mortgage|hypoth|prêt|loan/.test(normalized)) {
    return "Mortgage / Loan";
  }
  if (/insurance|assurance|policy/.test(normalized)) {
    return "Insurance";
  }
  if (/tax|impôt|avis|noa/.test(normalized)) {
    return "Tax";
  }
  if (/bank|statement|relev/.test(normalized)) {
    return "Statement";
  }
  if (/will|testament|estate/.test(normalized)) {
    return "Estate";
  }
  return "Other";
}

function seededRandom(seed: number): () => number {
  let state = Math.max(1, Math.floor(seed)) % 2147483647;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function gaussian(random: () => number): number {
  const u1 = Math.max(1e-12, random());
  const u2 = Math.max(1e-12, random());
  return (
    Math.sqrt(-2 * Math.log(u1)) *
    Math.cos(2 * Math.PI * u2)
  );
}

function monteCarlo(
  initial: number,
  monthly: number,
  months: number,
  expectedReturnPercent: number,
  volatilityPercent: number,
  target: number | null,
): MonteCarloResult {
  const simulations = 400;
  const random = seededRandom(
    Math.round(
      initial +
        monthly * 7 +
        months * 13 +
        expectedReturnPercent * 101 +
        volatilityPercent * 31,
    ),
  );
  const monthlyMean = expectedReturnPercent / 100 / 12;
  const monthlyVol =
    Math.max(0, volatilityPercent) / 100 / Math.sqrt(12);
  const outcomes = Array.from({ length: simulations }, () => {
    return Array.from(
      { length: Math.max(1, months) },
      () => 0,
    ).reduce<number>(
      (balance) => {
        const shock =
          monthlyMean + monthlyVol * gaussian(random);
        return Math.max(
          0,
          balance * (1 + shock) + monthly,
        );
      },
      Math.max(0, initial),
    );
  }).sort((a, b) => a - b);
  const quantile = (q: number) =>
    outcomes[
      Math.min(
        outcomes.length - 1,
        Math.max(0, Math.floor((outcomes.length - 1) * q)),
      )
    ] ?? 0;
  const successRate =
    target != null && target > 0
      ? (outcomes.filter((value) => value >= target).length /
          outcomes.length) *
        100
      : null;
  return {
    p10: quantile(0.1),
    median: quantile(0.5),
    p90: quantile(0.9),
    successRate,
  };
}

function monthsToDebtFree(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
): number | null {
  if (balance <= 0) return 0;
  if (monthlyPayment <= 0) return null;
  const rate = Math.max(0, annualRate) / 100 / 12;
  if (rate <= 0) {
    return Math.ceil(balance / monthlyPayment);
  }
  if (monthlyPayment <= balance * rate) return null;
  return Math.ceil(
    -Math.log(1 - (rate * balance) / monthlyPayment) /
      Math.log(1 + rate),
  );
}

function downloadJson(
  filename: string,
  payload: unknown,
): void {
  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json;charset=utf-8" },
  );
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function futureLabel(
  monthOffset: number,
  language: AnatoleLanguage,
): string {
  const date = new Date();
  date.setMonth(date.getMonth() + Math.max(0, monthOffset));
  return new Intl.DateTimeFormat(localeFor(language), {
    month: "short",
    year: "numeric",
  }).format(date);
}

export function AdvisorV9Layer({
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
  const [workspace, setWorkspace] =
    useState<Workspace>(readWorkspace);
  const [v9, setV9] = useState<V9State>(readV9);
  const [csvStatus, setCsvStatus] = useState<string>("");
  const [newFamilyName, setNewFamilyName] =
    useState<string>("");
  const [newFamilyRole, setNewFamilyRole] =
    useState<FamilyMember["role"]>("partner");

  useEffect(() => {
    const sync = () => setWorkspace(readWorkspace());
    window.addEventListener(SYNC_EVENT, sync);
    return () => window.removeEventListener(SYNC_EVENT, sync);
  }, []);

  const v8 =
    workspace.v8 && typeof workspace.v8 === "object"
      ? workspace.v8
      : {};
  const os =
    workspace.financialOs &&
    typeof workspace.financialOs === "object"
      ? workspace.financialOs
      : {};
  const household = os.household ?? {};
  const debts = Array.isArray(os.debts) ? os.debts : [];
  const goals = Array.isArray(os.goals) ? os.goals : [];
  const events = Array.isArray(os.events) ? os.events : [];
  const currency = profile.currency || "CAD";

  const totalIncome =
    household.userIncome == null &&
    household.partnerIncome == null
      ? null
      : finite(household.userIncome) +
        finite(household.partnerIncome);
  const monthlyExpenses =
    household.essentialExpenses == null &&
    household.discretionaryExpenses == null &&
    household.housingCosts == null &&
    household.insuranceCosts == null &&
    household.otherFixedCosts == null
      ? null
      : finite(household.essentialExpenses) +
        finite(household.discretionaryExpenses) +
        finite(household.housingCosts) +
        finite(household.insuranceCosts) +
        finite(household.otherFixedCosts);
  const totalDebt = debts.reduce(
    (sum, debt) => sum + Math.max(0, finite(debt.balance)),
    0,
  );
  const monthlyDebtPayments = debts.reduce(
    (sum, debt) =>
      sum + Math.max(0, finite(debt.monthlyPayment)),
    0,
  );
  const goalContributions = goals.reduce(
    (sum, goal) => sum + Math.max(0, finite(goal.monthly)),
    0,
  );
  const monthlyContribution =
    Math.max(0, finite(profile.monthly_contribution)) +
    goalContributions;
  const target =
    profile.target_amount != null &&
    profile.target_amount > 0
      ? profile.target_amount
      : goals[0]?.target != null && finite(goals[0]?.target) > 0
        ? finite(goals[0]?.target)
        : null;
  const currentSavings =
    profile.current_savings != null
      ? profile.current_savings
      : goals[0]?.current != null
        ? finite(goals[0]?.current)
        : null;
  const horizonMonths =
    profile.horizon_years != null &&
    profile.horizon_years > 0
      ? Math.round(profile.horizon_years * 12)
      : goals[0]?.horizonMonths != null
        ? Math.max(1, Math.round(finite(goals[0]?.horizonMonths)))
        : null;
  const expectedReturn =
    v8.expectedReturn != null &&
    Number.isFinite(v8.expectedReturn)
      ? v8.expectedReturn
      : 4;
  const volatility =
    v8.volatility != null && Number.isFinite(v8.volatility)
      ? v8.volatility
      : 10;

  const health = computeFinancialHealth({
    currentSavings,
    target,
    horizonMonths,
    monthlyContribution,
    cash: nullable(household.cash),
    monthlyIncome: totalIncome,
    monthlyExpenses,
    debtBalance:
      debts.length > 0 ? totalDebt : null,
    monthlyDebtPayments:
      debts.length > 0 ? monthlyDebtPayments : null,
    investments: nullable(household.investments),
    property: nullable(household.property),
    vehicles: nullable(household.vehicles),
    otherAssets: nullable(household.otherAssets),
    expectedReturnPercent: expectedReturn,
    volatilityPercent: volatility,
  });

  const updateV9 = (patch: Partial<V9State>) => {
    const next = { ...v9, ...patch };
    persistV9(next);
    setV9(next);
  };

  const recurring = useMemo(
    () => recurringTransactions(v9.transactions),
    [v9.transactions],
  );
  const anomalies = useMemo(
    () => transactionAnomalies(v9.transactions),
    [v9.transactions],
  );

  const cashFlowFromTransactions = useMemo(() => {
    if (!v9.transactions.length) return null;
    return v9.transactions.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
  }, [v9.transactions]);

  const previousVisit =
    v8.lastVisit && typeof v8.lastVisit === "object"
      ? v8.lastVisit
      : null;
  const netWorthDelta =
    previousVisit?.netWorth != null &&
    health.netWorth != null
      ? health.netWorth - previousVisit.netWorth
      : null;
  const marginDelta =
    previousVisit?.monthlyMargin != null &&
    health.monthlyMargin != null
      ? health.monthlyMargin - previousVisit.monthlyMargin
      : null;
  const debtDelta =
    previousVisit?.totalDebt != null
      ? totalDebt - previousVisit.totalDebt
      : null;

  const monteCarloResult = monteCarlo(
    Math.max(0, finite(currentSavings)),
    Math.max(0, monthlyContribution),
    Math.max(1, finite(horizonMonths)),
    expectedReturn,
    volatility,
    target,
  );

  const retirementYears = Math.max(
    0,
    v9.retirementAge - v9.currentAge,
  );
  const retirementGapMonthly =
    v9.retirementMonthlyNeed == null
      ? null
      : Math.max(
          0,
          v9.retirementMonthlyNeed -
            finite(v9.publicPensionMonthly),
        );
  const retirementCapital =
    retirementGapMonthly == null ||
    v9.withdrawalRatePercent <= 0
      ? null
      : (retirementGapMonthly * 12) /
        (v9.withdrawalRatePercent / 100);
  const retirementProjected =
    retirementYears > 0
      ? projectedFutureValue(
          Math.max(0, finite(currentSavings)),
          Math.max(0, monthlyContribution),
          retirementYears * 12,
          expectedReturn,
        )
      : currentSavings;

  const insuranceGap =
    v9.insuranceNeed == null
      ? null
      : Math.max(
          0,
          v9.insuranceNeed - finite(v9.lifeCoverage),
        );
  const creditUtilization =
    v9.creditLimit != null && v9.creditLimit > 0
      ? (finite(v9.creditBalance) / v9.creditLimit) * 100
      : null;
  const creditMonthlyInterest =
    v9.creditBalance != null && v9.creditApr != null
      ? (Math.max(0, v9.creditBalance) *
          Math.max(0, v9.creditApr)) /
        100 /
        12
      : null;
  const careerDelta =
    totalIncome != null &&
    v9.careerFutureMonthlyIncome != null
      ? v9.careerFutureMonthlyIncome - totalIncome
      : null;
  const selfEmployedIncome = nullable(household.userIncome);
  const selfEmployedReserve =
    selfEmployedIncome == null
      ? null
      : Math.max(
          0,
          selfEmployedIncome -
            finite(v9.businessMonthlyExpenses),
        ) *
        (Math.max(0, v9.taxReservePercent) / 100);

  const scenarioMargin =
    health.monthlyMargin == null
      ? null
      : health.monthlyMargin +
        v9.scenarioIncomeDelta -
        v9.scenarioExpenseDelta;
  const scenarioTwelveMonthImpact =
    scenarioMargin == null
      ? null
      : scenarioMargin *
          Math.max(1, v9.scenarioDurationMonths) -
        Math.max(0, v9.scenarioOneTimeCost);

  const hindsightValue = projectedFutureValue(
    0,
    Math.max(0, v9.hindsightMonthlyDelta),
    Math.max(1, v9.hindsightMonths),
    expectedReturn,
  );

  const retirementTimelineMonth = retirementYears * 12;
  const timeline: TimelineItem[] = [
    ...goals.map((goal, index) => ({
      id: `goal-${goal.id ?? index}`,
      month: Math.max(0, finite(goal.horizonMonths)),
      label: goal.label || pick(language, "Objectif", "Goal"),
      category: "goal",
    })),
    ...events.map((event, index) => ({
      id: `event-${event.id ?? index}`,
      month: Math.max(0, finite(event.monthOffset)),
      label:
        event.label ||
        pick(language, "Événement de vie", "Life event"),
      category: "event",
    })),
    ...(retirementTimelineMonth > 0
      ? [
          {
            id: "retirement",
            month: retirementTimelineMonth,
            label: pick(language, "Retraite", "Retirement"),
            category: "retirement",
          },
        ]
      : []),
  ]
    .filter((item) => item.month <= 360)
    .sort((a, b) => a.month - b.month);

  const inbox: InboxItem[] = [
    ...(health.confidencePercent < 70
      ? [
          {
            id: "confidence",
            tone: "attention" as const,
            title: pick(
              language,
              "Données à compléter",
              "Data to complete",
            ),
            detail: pick(
              language,
              `Confiance du modèle : ${health.confidencePercent} %.`,
              `Model confidence: ${health.confidencePercent}%.`,
            ),
          },
        ]
      : []),
    ...anomalies.slice(0, 2).map((item) => ({
      id: `anomaly-${item.id}`,
      tone: "warn" as const,
      title: pick(
        language,
        "Transaction inhabituelle",
        "Unusual transaction",
      ),
      detail: `${item.label} · ${money(item.amount, currency, language)}`,
    })),
    ...(v9.documents.length === 0
      ? [
          {
            id: "vault-empty",
            tone: "info" as const,
            title: pick(
              language,
              "Coffre documentaire vide",
              "Document vault is empty",
            ),
            detail: pick(
              language,
              "Ajoute seulement les métadonnées des documents que tu veux suivre.",
              "Add metadata for documents you want to track.",
            ),
          },
        ]
      : []),
    ...(health.runwayMonths != null && health.runwayMonths < 3
      ? [
          {
            id: "runway",
            tone: "attention" as const,
            title: pick(
              language,
              "Runway de liquidités court",
              "Short cash runway",
            ),
            detail: pick(
              language,
              `${health.runwayMonths.toFixed(1)} mois selon les données saisies.`,
              `${health.runwayMonths.toFixed(1)} months based on entered data.`,
            ),
          },
        ]
      : []),
  ].slice(0, 8);

  const actions = inbox.map((item) => ({
    id: item.id,
    label: item.title,
    done: v9.completedActions.includes(item.id),
  }));

  const activeTransactions = v9.transactions.length;
  const estimatedSubscriptions = recurring.reduce(
    (sum, item) => sum + item.averageAmount,
    0,
  );
  const transactionExpenseTotal = v9.transactions
    .filter((item) => item.amount < 0)
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);

  const personalSavingsRate =
    totalIncome != null && totalIncome > 0
      ? (monthlyContribution / totalIncome) * 100
      : null;
  const benchmarkGap =
    v9.benchmarkMonthlySavings == null
      ? null
      : monthlyContribution - v9.benchmarkMonthlySavings;

  const primaryDebt = [...debts]
    .filter((debt) => finite(debt.balance) > 0)
    .sort(
      (a, b) =>
        finite(b.annualRate) - finite(a.annualRate),
    )[0];
  const primaryDebtPayoff =
    primaryDebt != null
      ? monthsToDebtFree(
          finite(primaryDebt.balance),
          finite(primaryDebt.annualRate),
          finite(primaryDebt.monthlyPayment),
        )
      : null;

  const requiredContribution =
    target != null &&
    currentSavings != null &&
    horizonMonths != null
      ? requiredMonthlyContribution(
          currentSavings,
          target,
          horizonMonths,
          expectedReturn,
        )
      : null;
  const solverMonthly =
    v9.fixedGoalDate && v9.fixedGoalAmount
      ? requiredContribution
      : null;
  const solverReserveGap =
    v9.minimumReserve == null
      ? null
      : Math.max(
          0,
          v9.minimumReserve - finite(household.cash),
        );

  const emergencyExpenses =
    monthlyExpenses == null
      ? null
      : monthlyExpenses *
        (1 -
          Math.max(
            0,
            Math.min(80, v9.emergencyExpenseCutPercent),
          ) /
            100);
  const emergencyRunway =
    v9.emergencyMode &&
    household.cash != null &&
    emergencyExpenses != null &&
    emergencyExpenses + monthlyDebtPayments > 0
      ? finite(household.cash) /
        (emergencyExpenses + monthlyDebtPayments)
      : health.runwayMonths;

  const graphNodes = [
    {
      id: "income",
      label: pick(language, "Revenus", "Income"),
      value: totalIncome,
    },
    {
      id: "cash",
      label: pick(language, "Liquidités", "Cash"),
      value: nullable(household.cash),
    },
    {
      id: "debt",
      label: pick(language, "Dettes", "Debt"),
      value: debts.length ? totalDebt : null,
    },
    {
      id: "goals",
      label: pick(language, "Objectifs", "Goals"),
      value: target,
    },
    {
      id: "invest",
      label: pick(language, "Placements", "Investments"),
      value: nullable(household.investments),
    },
  ];

  const intelligenceRows = [
    {
      label: pick(language, "Fait", "Fact"),
      value: health.netWorth == null
        ? pick(
            language,
            "Patrimoine encore incomplet",
            "Net worth still incomplete",
          )
        : pick(
            language,
            `Valeur nette modélisée : ${money(health.netWorth, currency, language)}.`,
            `Modelled net worth: ${money(health.netWorth, currency, language)}.`,
          ),
    },
    {
      label: pick(language, "Changement", "Change"),
      value:
        anomalies.length > 0
          ? pick(
              language,
              `${anomalies.length} transaction(s) inhabituelle(s) détectée(s) dans l’import.`,
              `${anomalies.length} unusual transaction(s) detected in the import.`,
            )
          : pick(
              language,
              "Aucune anomalie transactionnelle détectable avec les données disponibles.",
              "No detectable transaction anomaly with available data.",
            ),
    },
    {
      label: pick(language, "Impact", "Impact"),
      value:
        scenarioTwelveMonthImpact == null
          ? pick(
              language,
              "Le scénario a besoin d’une marge mensuelle connue.",
              "The scenario needs a known monthly margin.",
            )
          : pick(
              language,
              `Impact composé du scénario : ${money(scenarioTwelveMonthImpact, currency, language)}.`,
              `Scenario combined impact: ${money(scenarioTwelveMonthImpact, currency, language)}.`,
            ),
    },
    {
      label: pick(language, "Options", "Options"),
      value: pick(
        language,
        "Modifier horizon, contribution, dépenses, revenu ou contraintes puis comparer.",
        "Adjust horizon, contribution, expenses, income or constraints and compare.",
      ),
    },
    {
      label: pick(language, "Hypothèses", "Assumptions"),
      value: `${expectedReturn.toFixed(1)}% / ${volatility.toFixed(1)}%`,
    },
    {
      label: pick(language, "Source", "Source"),
      value: pick(
        language,
        "Profil Conseil + Financial OS + imports locaux validés par l’utilisateur.",
        "Advice profile + Financial OS + user-validated local imports.",
      ),
    },
  ];

  const agentBrief = [
    `${pick(language, "Objectif", "Goal")}: ${profile.goal_name || goalLabel}`,
    `${pick(language, "Confiance données", "Data confidence")}: ${health.confidencePercent}%`,
    `${pick(language, "Marge mensuelle", "Monthly margin")}: ${money(health.monthlyMargin, currency, language)}`,
    `${pick(language, "Runway", "Runway")}: ${
      emergencyRunway == null
        ? pick(language, "N/D", "N/A")
        : `${emergencyRunway.toFixed(1)} ${pick(language, "mois", "months")}`
    }`,
    `${pick(language, "Gap objectif", "Goal gap")}: ${
      target == null || health.projectedValue == null
        ? pick(language, "N/D", "N/A")
        : money(
            Math.max(0, target - health.projectedValue),
            currency,
            language,
          )
    }`,
  ];

  const addFamilyMember = () => {
    const name = newFamilyName.trim();
    if (!name) return;
    updateV9({
      family: [
        ...v9.family,
        {
          id: `family-${Date.now()}`,
          name,
          role: newFamilyRole,
        },
      ].slice(-12),
      householdMode:
        newFamilyRole === "partner"
          ? "couple"
          : "family",
    });
    setNewFamilyName("");
  };


  const saveDecisionSnapshot = () => {
    const createdAt = new Date().toISOString();
    updateV9({
      decisionHistory: [
        ...v9.decisionHistory,
        {
          id: `decision-${createdAt}-${v9.decisionHistory.length}`,
          label: pick(
            language,
            `Snapshot décision · marge ${money(health.monthlyMargin, currency, language)}`,
            `Decision snapshot · margin ${money(health.monthlyMargin, currency, language)}`,
          ),
          createdAt,
        },
      ].slice(-60),
    });
  };

  const onCsvImport = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!v9.privacyAllowImports) {
      setCsvStatus(
        pick(
          language,
          "Import désactivé dans Confidentialité.",
          "Imports are disabled in Privacy.",
        ),
      );
      event.target.value = "";
      return;
    }
    const text = await file.text();
    const parsed = parseBankCsv(text);
    if (!parsed.length) {
      setCsvStatus(
        pick(
          language,
          "Colonnes date / description / montant non reconnues.",
          "Date / description / amount columns were not recognized.",
        ),
      );
      event.target.value = "";
      return;
    }
    updateV9({
      transactions: parsed.slice(-500),
    });
    setCsvStatus(
      pick(
        language,
        `${parsed.length} transaction(s) importée(s) localement.`,
        `${parsed.length} transaction(s) imported locally.`,
      ),
    );
    event.target.value = "";
  };

  const onDocumentMetadata = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const entries = files.map((file, index) => ({
      id: `doc-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      category: classifyDocument(file.name),
      addedAt: new Date().toISOString(),
      extraction: "metadata-only" as const,
    }));
    updateV9({
      documents: [...v9.documents, ...entries].slice(-50),
    });
    event.target.value = "";
  };

  const exportAdvisorPackage = () => {
    downloadJson("anatole-conseil-v9-advisor-package.json", {
      generated_by: "Anatole Conseil V9",
      expires_in_days: v9.shareExpiryDays,
      generated_at: new Date().toISOString(),
      scope: {
        profile: true,
        financial_health: true,
        goals: true,
        debts: true,
        tax_room: true,
        bank_transaction_details: false,
        document_contents: false,
      },
      profile,
      financial_health: health,
      financial_os: os,
      assumptions: {
        expected_return_percent: expectedReturn,
        volatility_percent: volatility,
      },
      constraints: {
        fixed_goal_date: v9.fixedGoalDate,
        fixed_goal_amount: v9.fixedGoalAmount,
        minimum_reserve: v9.minimumReserve,
      },
      notes: pick(
        language,
        "Package descriptif. Les transactions détaillées et contenus de documents ne sont pas inclus.",
        "Descriptive package. Detailed transactions and document contents are excluded.",
      ),
    });
  };

  const modulesByTab: Record<TabKey, string[]> = {
    today: ["01", "03", "04", "05", "06", "17", "18", "19", "20", "21"],
    money: ["02", "07", "08", "24", "32"],
    goals: ["09", "10", "11", "12", "13", "26", "27", "28", "29", "30"],
    decide: ["14", "15", "16", "22", "23"],
    file: ["25", "31", "33", "34", "35"],
  };

  return (
    <section
      className={`${styles.shell} ${
        v9.emergencyMode ? styles.emergencyShell : ""
      }`}
      data-testid="advisor-v10-layer"
      data-feature-count="35"
    >
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>
            ANATOLE CONSEIL · V10 FINANCIAL OS
          </span>
          <h2>
            {pick(
              language,
              "Cinq espaces simples pour comprendre ton argent, avancer vers tes objectifs et prendre de meilleures décisions.",
              "Five simple spaces to understand your money, move toward your goals and make better decisions.",
            )}
          </h2>
          <p>
            {pick(
              language,
              "35 moteurs restent reliés sous cinq espaces. Une donnée saisie continue d’alimenter les autres calculs sans multiplier les écrans.",
              "35 engines remain connected under five spaces. One entered data point continues to feed other calculations without multiplying screens.",
            )}
          </p>
        </div>
        <div className={styles.heroMetrics}>
          <div>
            <span>{pick(language, "CONFIANCE", "CONFIDENCE")}</span>
            <strong>{health.confidencePercent}%</strong>
          </div>
          <div>
            <span>{pick(language, "ESPACES", "SPACES")}</span>
            <strong>5</strong>
          </div>
          <div>
            <span>{pick(language, "IMPORTS", "IMPORTS")}</span>
            <strong>{activeTransactions}</strong>
          </div>
        </div>
      </header>

      <div className={styles.pulseStrip}>
        <strong>
          {v9.emergencyMode
            ? pick(
                language,
                "MODE URGENCE ACTIF",
                "EMERGENCY MODE ACTIVE",
              )
            : "ANATOLE PULSE"}
        </strong>
        <span>
          {health.monthlyMargin == null
            ? pick(
                language,
                "Complète les revenus et dépenses pour activer la lecture complète.",
                "Complete income and expenses to unlock the full reading.",
              )
            : pick(
                language,
                `Marge ${money(health.monthlyMargin, currency, language)} · runway ${
                  emergencyRunway == null
                    ? "N/D"
                    : `${emergencyRunway.toFixed(1)} mois`
                } · ${inbox.length} signal(aux)`,
                `Margin ${money(health.monthlyMargin, currency, language)} · runway ${
                  emergencyRunway == null
                    ? "N/A"
                    : `${emergencyRunway.toFixed(1)} months`
                } · ${inbox.length} signal(s)`,
              )}
        </span>
      </div>

      <nav
        className={styles.tabs}
        aria-label={pick(
          language,
          "Espaces Conseil V10",
          "Advice V10 spaces",
        )}
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            className={tab === item.key ? styles.tabActive : undefined}
            data-testid={`advisor-v10-tab-${item.key}`}
            onClick={() => setTab(item.key)}
          >
            <span>{item.index}</span>
            <strong>{pick(language, item.fr, item.en)}</strong>
          </button>
        ))}
      </nav>

      {tab === "today" ? (
        <div className={styles.zone} data-testid="advisor-v9-pulse">
          <article className={`${styles.card} ${styles.cardHero}`} data-module="01">
            <div className={styles.cardEyebrow}>01 · BANK CONNECT CENTER</div>
            <h3>{pick(language, "Données bancaires en lecture seule", "Read-only banking data")}</h3>
            <p>
              {pick(
                language,
                "L’OAuth bancaire en direct exige un fournisseur Open Banking et le consentement de l’utilisateur. Anatole ne simule pas une connexion inexistante : l’import CSV local fonctionne maintenant, sans téléverser le fichier.",
                "Live bank OAuth requires an Open Banking provider and user consent. Anatole does not fake a connection: local CSV import works now without uploading the file.",
              )}
            </p>
            <div className={styles.importRow}>
              <label className={styles.fileButton}>
                {pick(language, "Importer un CSV bancaire", "Import bank CSV")}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="advisor-v9-bank-csv"
                  onChange={onCsvImport}
                />
              </label>
              <div>
                <strong>{activeTransactions}</strong>
                <span>{pick(language, "transactions locales", "local transactions")}</span>
              </div>
              <div>
                <strong>{money(cashFlowFromTransactions, currency, language)}</strong>
                <span>{pick(language, "flux net importé", "imported net flow")}</span>
              </div>
            </div>
            {csvStatus ? <small className={styles.status}>{csvStatus}</small> : null}
          </article>

          <article className={styles.card} data-module="03">
            <div className={styles.cardEyebrow}>03 · ANATOLE PULSE</div>
            <h3>{pick(language, "Ce qui mérite ton attention maintenant", "What deserves attention now")}</h3>
            <div className={styles.changeGrid}>
              <div>
                <span>{pick(language, "Patrimoine", "Net worth")}</span>
                <strong>{money(netWorthDelta, currency, language)}</strong>
              </div>
              <div>
                <span>{pick(language, "Marge mensuelle", "Monthly margin")}</span>
                <strong>{money(marginDelta, currency, language)}</strong>
              </div>
              <div>
                <span>{pick(language, "Dette", "Debt")}</span>
                <strong>{money(debtDelta, currency, language)}</strong>
              </div>
            </div>
            <div className={styles.signalList}>
              {inbox.slice(0, 3).map((item) => (
                <div key={item.id} data-tone={item.tone}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
              {!inbox.length ? (
                <div>
                  <strong>{pick(language, "Aucun signal prioritaire", "No priority signal")}</strong>
                  <span>{pick(language, "Les données disponibles ne déclenchent aucun signal.", "Available data triggers no signal.")}</span>
                </div>
              ) : null}
            </div>
          </article>

          <article className={styles.card} data-module="04">
            <div className={styles.cardEyebrow}>04 · RECURRING DETECTOR</div>
            <h3>{pick(language, "Abonnements et dépenses récurrentes", "Subscriptions and recurring expenses")}</h3>
            <div className={styles.list}>
              {recurring.map((item) => (
                <div key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{money(item.averageAmount, currency, language)} · {item.observations}×</span>
                </div>
              ))}
              {!recurring.length ? (
                <p>{pick(language, "Importe au moins quelques mois de transactions pour détecter les récurrences.", "Import a few months of transactions to detect recurring charges.")}</p>
              ) : null}
            </div>
            <footer>{pick(language, "Total récurrent détecté", "Detected recurring total")} · <b>{money(estimatedSubscriptions, currency, language)}</b></footer>
          </article>

          <article className={styles.card} data-module="05">
            <div className={styles.cardEyebrow}>05 · ANOMALY RADAR</div>
            <h3>{pick(language, "Transactions inhabituelles", "Unusual transactions")}</h3>
            <div className={styles.list}>
              {anomalies.map((item) => (
                <div key={item.id}>
                  <strong>{item.label}</strong>
                  <span>{money(item.amount, currency, language)} · {item.date}</span>
                </div>
              ))}
              {!anomalies.length ? (
                <p>{pick(language, "Aucune anomalie détectable avec l’échantillon actuel.", "No anomaly detectable in the current sample.")}</p>
              ) : null}
            </div>
          </article>

          <article className={styles.card} data-module="06">
            <div className={styles.cardEyebrow}>06 · UNIVERSAL FINANCIAL CALENDAR</div>
            <h3>{pick(language, "Tout sur une seule ligne du temps", "Everything on one financial timeline")}</h3>
            <div className={styles.timelineMini}>
              {timeline.slice(0, 7).map((item) => (
                <div key={item.id}>
                  <span>{futureLabel(item.month, language)}</span>
                  <strong>{item.label}</strong>
                  <small>{item.category}</small>
                </div>
              ))}
              {!timeline.length ? (
                <p>{pick(language, "Ajoute des objectifs ou événements pour construire la timeline.", "Add goals or events to build the timeline.")}</p>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}

      {tab === "money" ? (
        <div className={styles.zone} data-testid="advisor-v9-household">
          <article className={`${styles.card} ${styles.span2}`} data-module="02">
            <div className={styles.cardEyebrow}>02 · FINANCIAL GRAPH</div>
            <h3>{pick(language, "Le réseau derrière chaque dollar", "The network behind every dollar")}</h3>
            <div className={styles.graph}>
              {graphNodes.map((node, index) => (
                <div key={node.id} className={styles.graphNode}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{node.label}</strong>
                  <b>{money(node.value, currency, language)}</b>
                </div>
              ))}
            </div>
            <p>{pick(language, "Lecture structurée : revenus → liquidités → dettes / objectifs → placements. Aucun transfert réel n’est exécuté.", "Structured view: income → cash → debt / goals → investments. No real transfer is executed.")}</p>
          </article>

          <article className={styles.card} data-module="07">
            <div className={styles.cardEyebrow}>07 · COUPLE / FAMILY MODE</div>
            <h3>{pick(language, "Finances solo, couple ou famille", "Solo, couple or family finances")}</h3>
            <div className={styles.segmented}>
              {(["solo", "couple", "family"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={v9.householdMode === mode ? styles.activeButton : undefined}
                  onClick={() => updateV9({ householdMode: mode })}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Revenu ménage", "Household income")}</span><strong>{money(totalIncome, currency, language)}</strong></div>
              <div><span>{pick(language, "Personnes", "People")}</span><strong>{Math.max(1, v9.family.length + 1)}</strong></div>
            </div>
          </article>

          <article className={styles.card} data-module="08">
            <div className={styles.cardEyebrow}>08 · FAMILY FINANCIAL TREE</div>
            <h3>{pick(language, "Qui dépend de quoi", "Who depends on what")}</h3>
            <div className={styles.inlineForm}>
              <input
                value={newFamilyName}
                placeholder={pick(language, "Nom", "Name")}
                aria-label={pick(language, "Nom du membre", "Member name")}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setNewFamilyName(event.target.value)}
              />
              <select
                value={newFamilyRole}
                aria-label={pick(language, "Rôle du membre", "Member role")}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setNewFamilyRole(event.target.value as FamilyMember["role"])}
              >
                <option value="partner">{pick(language, "Partenaire", "Partner")}</option>
                <option value="child">{pick(language, "Enfant", "Child")}</option>
                <option value="dependant">{pick(language, "Personne à charge", "Dependant")}</option>
                <option value="other">{pick(language, "Autre", "Other")}</option>
              </select>
              <button type="button" onClick={addFamilyMember}>{pick(language, "Ajouter", "Add")}</button>
            </div>
            <div className={styles.chips}>
              {v9.family.map((member) => (
                <span key={member.id}>{member.name} · {member.role}</span>
              ))}
            </div>
          </article>

          <article className={styles.card} data-module="24">
            <div className={styles.cardEyebrow}>24 · CONSENT & PRIVACY CENTER</div>
            <h3>{pick(language, "Chaque source sous ton contrôle", "Every source under your control")}</h3>
            <div className={styles.privacyStatus}>
              <strong>{pick(language, "Stockage V9 sensible", "Sensitive V9 storage")}</strong>
              <span>{pick(language, "Local uniquement · hors advisor_workspace synchronisé", "Local only · excluded from synced advisor_workspace")}</span>
            </div>
            <div className={styles.privacyStatus}>
              <strong>{pick(language, "Documents", "Documents")}</strong>
              <span>{pick(language, "Métadonnées seulement · contenu non persisté", "Metadata only · file contents are not persisted")}</span>
            </div>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={v9.privacyAllowImports}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ privacyAllowImports: event.target.checked })}
              />
              <span>{pick(language, "Autoriser les imports locaux", "Allow local imports")}</span>
            </label>
          </article>

          <article className={styles.card} data-module="32">
            <div className={styles.cardEyebrow}>32 · DIGITAL VAULT</div>
            <h3>{pick(language, "Coffre documentaire — métadonnées seulement", "Document vault — metadata only")}</h3>
            <label className={styles.fileButton}>
              {pick(language, "Indexer des documents", "Index documents")}
              <input type="file" multiple onChange={onDocumentMetadata} />
            </label>
            <div className={styles.list}>
              {v9.documents.slice(-5).map((documentItem) => (
                <div key={documentItem.id}>
                  <strong>{documentItem.name}</strong>
                  <span>{documentItem.category} · {(documentItem.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
            <small>{pick(language, "Le contenu du fichier n’est pas stocké dans localStorage par ce module.", "File contents are not stored in localStorage by this module.")}</small>
          </article>
        </div>
      ) : null}

      {tab === "goals" ? (
        <div className={styles.zone} data-testid="advisor-v9-labs">
          <article className={`${styles.card} ${styles.span2}`} data-module="09">
            <div className={styles.cardEyebrow}>09 · RETIREMENT LAB</div>
            <h3>{pick(language, "Accumulation + décumulation transparente", "Transparent accumulation + decumulation")}</h3>
            <div className={styles.formGrid}>
              <label><span>{pick(language, "Âge actuel", "Current age")}</span><input type="number" min="18" max="90" value={v9.currentAge} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ currentAge: finite(Number(event.target.value)) })} /></label>
              <label><span>{pick(language, "Âge retraite", "Retirement age")}</span><input type="number" min="18" max="100" value={v9.retirementAge} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ retirementAge: finite(Number(event.target.value)) })} /></label>
              <label><span>{pick(language, "Revenu retraite souhaité / mois", "Desired retirement income / month")}</span><input type="number" min="0" value={v9.retirementMonthlyNeed ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ retirementMonthlyNeed: numberFromInput(event.target.value) })} /></label>
              <label><span>{pick(language, "CPP/RRQ/SV/OAS estimés / mois", "Estimated CPP/QPP/OAS / month")}</span><input type="number" min="0" value={v9.publicPensionMonthly ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ publicPensionMonthly: numberFromInput(event.target.value) })} /></label>
              <label><span>{pick(language, "Taux de retrait hypothétique", "Assumed withdrawal rate")}</span><input type="number" min="0.5" max="10" step="0.1" value={v9.withdrawalRatePercent} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ withdrawalRatePercent: finite(Number(event.target.value)) })} /></label>
            </div>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Capital illustratif", "Illustrative capital")}</span><strong>{money(retirementCapital, currency, language)}</strong></div>
              <div><span>{pick(language, "Projection à la retraite", "Projected at retirement")}</span><strong>{money(retirementProjected, currency, language)}</strong></div>
            </div>
            <small>{pick(language, "Les prestations publiques sont saisies par l’utilisateur; Anatole ne les invente pas.", "Public benefits are user-entered; Anatole does not invent them.")}</small>
          </article>

          <article className={styles.card} data-module="10">
            <div className={styles.cardEyebrow}>10 · INSURANCE GAP LAB</div>
            <h3>{pick(language, "Couverture déclarée vs besoin déclaré", "Entered coverage vs entered need")}</h3>
            <div className={styles.formGrid}>
              <label><span>{pick(language, "Couverture vie", "Life coverage")}</span><input type="number" min="0" value={v9.lifeCoverage ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ lifeCoverage: numberFromInput(event.target.value) })} /></label>
              <label><span>{pick(language, "Besoin à protéger", "Protection need")}</span><input type="number" min="0" value={v9.insuranceNeed ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ insuranceNeed: numberFromInput(event.target.value) })} /></label>
              <label><span>{pick(language, "Invalidité / mois", "Disability / month")}</span><input type="number" min="0" value={v9.disabilityMonthlyCoverage ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ disabilityMonthlyCoverage: numberFromInput(event.target.value) })} /></label>
            </div>
            <strong className={styles.bigNumber}>{money(insuranceGap, currency, language)}</strong>
            <small>{pick(language, "Écart descriptif basé uniquement sur les montants saisis.", "Descriptive gap based only on entered amounts.")}</small>
          </article>

          <article className={styles.card} data-module="11">
            <div className={styles.cardEyebrow}>11 · CREDIT CENTER</div>
            <h3>{pick(language, "Utilisation, coût et échéances", "Utilization, cost and timing")}</h3>
            <div className={styles.formGrid}>
              <label><span>{pick(language, "Limite totale", "Total limit")}</span><input type="number" min="0" value={v9.creditLimit ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ creditLimit: numberFromInput(event.target.value) })} /></label>
              <label><span>{pick(language, "Solde", "Balance")}</span><input type="number" min="0" value={v9.creditBalance ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ creditBalance: numberFromInput(event.target.value) })} /></label>
              <label><span>APR %</span><input type="number" min="0" step="0.01" value={v9.creditApr ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ creditApr: numberFromInput(event.target.value) })} /></label>
              <label><span>{pick(language, "Score saisi (optionnel)", "Entered score (optional)")}</span><input type="number" min="300" max="900" value={v9.enteredCreditScore ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ enteredCreditScore: numberFromInput(event.target.value) })} /></label>
            </div>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Utilisation", "Utilization")}</span><strong>{pct(creditUtilization, language)}</strong></div>
              <div><span>{pick(language, "Intérêt mensuel approx.", "Approx. monthly interest")}</span><strong>{money(creditMonthlyInterest, currency, language)}</strong></div>
            </div>
          </article>

          <article className={styles.card} data-module="12">
            <div className={styles.cardEyebrow}>12 · SALARY & CAREER LAB</div>
            <h3>{pick(language, "Promotion, changement d’emploi, bonus", "Promotion, job change, bonus")}</h3>
            <label className={styles.field}><span>{pick(language, "Revenu mensuel futur", "Future monthly income")}</span><input type="number" min="0" value={v9.careerFutureMonthlyIncome ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ careerFutureMonthlyIncome: numberFromInput(event.target.value) })} /></label>
            <label className={styles.field}><span>{pick(language, "À partir du mois", "Starting month")}</span><input type="number" min="0" max="120" value={v9.careerChangeMonth} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ careerChangeMonth: finite(Number(event.target.value)) })} /></label>
            <strong className={styles.bigNumber}>{careerDelta == null ? pick(language, "N/D", "N/A") : money(careerDelta, currency, language)}</strong>
            <small>{pick(language, "Variation mensuelle avant modélisation fiscale détaillée.", "Monthly change before detailed tax modelling.")}</small>
          </article>

          <article className={styles.card} data-module="13">
            <div className={styles.cardEyebrow}>13 · SELF-EMPLOYED MODE</div>
            <h3>{pick(language, "Revenus irréguliers et réserve fiscale", "Irregular income and tax reserve")}</h3>
            <label className={styles.switchRow}><input type="checkbox" checked={v9.selfEmployed} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ selfEmployed: event.target.checked })} /><span>{pick(language, "Travail autonome / entreprise", "Self-employed / business")}</span></label>
            <label className={styles.field}><span>{pick(language, "Dépenses entreprise / mois", "Business expenses / month")}</span><input type="number" min="0" value={v9.businessMonthlyExpenses ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ businessMonthlyExpenses: numberFromInput(event.target.value) })} /></label>
            <label className={styles.field}><span>{pick(language, "Réserve fiscale choisie %", "Chosen tax reserve %")}</span><input type="number" min="0" max="100" value={v9.taxReservePercent} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ taxReservePercent: finite(Number(event.target.value)) })} /></label>
            <strong className={styles.bigNumber}>{v9.selfEmployed ? money(selfEmployedReserve, currency, language) : pick(language, "Mode inactif", "Mode off")}</strong>
            <small>{pick(language, "Ce pourcentage est une hypothèse utilisateur, pas un taux fiscal calculé.", "This percentage is a user assumption, not a calculated tax rate.")}</small>
          </article>
        </div>
      ) : null}

      {tab === "today" ? (
        <div className={styles.zone} data-testid="advisor-v9-intelligence">
          <article className={styles.card} data-module="17">
            <div className={styles.cardEyebrow}>17 · GOAL SCORECARD</div>
            <h3>{pick(language, "Quatre dimensions descriptives", "Four descriptive dimensions")}</h3>
            <div className={styles.scoreGrid}>
              <div><span>{pick(language, "Données", "Data")}</span><strong>{health.completenessPercent}%</strong></div>
              <div><span>{pick(language, "Confiance", "Confidence")}</span><strong>{health.confidencePercent}%</strong></div>
              <div><span>{pick(language, "Progression", "Progress")}</span><strong>{pct(health.goalProgressPercent, language)}</strong></div>
              <div><span>{pick(language, "Runway", "Runway")}</span><strong>{health.runwayMonths == null ? "N/D" : `${health.runwayMonths.toFixed(1)}m`}</strong></div>
            </div>
          </article>

          <article className={styles.card} data-module="18">
            <div className={styles.cardEyebrow}>18 · PERSONAL BENCHMARKS</div>
            <h3>{pick(language, "Comparer à ta propre référence", "Compare against your own reference")}</h3>
            <label className={styles.field}><span>{pick(language, "Épargne mensuelle de référence", "Reference monthly savings")}</span><input type="number" min="0" value={v9.benchmarkMonthlySavings ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ benchmarkMonthlySavings: numberFromInput(event.target.value) })} /></label>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Taux d’épargne actuel", "Current savings rate")}</span><strong>{pct(personalSavingsRate, language)}</strong></div>
              <div><span>{pick(language, "Écart à ta référence", "Gap vs your reference")}</span><strong>{money(benchmarkGap, currency, language)}</strong></div>
            </div>
            <small>{pick(language, "Aucune comparaison démographique n’est inventée sans source publique explicite.", "No demographic benchmark is invented without an explicit public source.")}</small>
          </article>

          <article className={`${styles.card} ${styles.span2}`} data-module="19">
            <div className={styles.cardEyebrow}>19 · TRANSPARENT MONTE CARLO</div>
            <h3>{pick(language, "Une distribution, pas une seule courbe", "A distribution, not one line")}</h3>
            <div className={styles.monteGrid}>
              <div><span>P10</span><strong>{money(monteCarloResult.p10, currency, language)}</strong></div>
              <div><span>{pick(language, "Médiane", "Median")}</span><strong>{money(monteCarloResult.median, currency, language)}</strong></div>
              <div><span>P90</span><strong>{money(monteCarloResult.p90, currency, language)}</strong></div>
              <div><span>{pick(language, "Scénarios ≥ cible", "Scenarios ≥ target")}</span><strong>{pct(monteCarloResult.successRate, language)}</strong></div>
            </div>
            <p>{pick(language, `400 simulations déterministes · rendement ${expectedReturn.toFixed(1)} % · volatilité ${volatility.toFixed(1)} %.`, `400 deterministic simulations · return ${expectedReturn.toFixed(1)}% · volatility ${volatility.toFixed(1)}%.`)}</p>
          </article>

          <article className={styles.card} data-module="20">
            <div className={styles.cardEyebrow}>20 · SCENARIO COMPOSER</div>
            <h3>{pick(language, "Combiner plusieurs événements", "Combine several events")}</h3>
            <div className={styles.formGrid}>
              <label><span>Δ {pick(language, "revenu / mois", "income / month")}</span><input type="number" value={v9.scenarioIncomeDelta} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ scenarioIncomeDelta: finite(Number(event.target.value)) })} /></label>
              <label><span>Δ {pick(language, "dépenses / mois", "expenses / month")}</span><input type="number" value={v9.scenarioExpenseDelta} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ scenarioExpenseDelta: finite(Number(event.target.value)) })} /></label>
              <label><span>{pick(language, "Coût ponctuel", "One-time cost")}</span><input type="number" min="0" value={v9.scenarioOneTimeCost} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ scenarioOneTimeCost: finite(Number(event.target.value)) })} /></label>
              <label><span>{pick(language, "Durée mois", "Months")}</span><input type="number" min="1" max="120" value={v9.scenarioDurationMonths} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ scenarioDurationMonths: Math.max(1, finite(Number(event.target.value))) })} /></label>
            </div>
            <strong className={styles.bigNumber}>{money(scenarioTwelveMonthImpact, currency, language)}</strong>
          </article>

          <article className={styles.card} data-module="21">
            <div className={styles.cardEyebrow}>21 · WHAT WOULD HAVE HAPPENED?</div>
            <h3>{pick(language, "Regarder en arrière sans promettre l’avenir", "Look backward without promising the future")}</h3>
            <label className={styles.field}><span>{pick(language, "Mois passés", "Past months")}</span><input type="number" min="1" max="120" value={v9.hindsightMonths} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ hindsightMonths: Math.max(1, finite(Number(event.target.value))) })} /></label>
            <label className={styles.field}><span>{pick(language, "Contribution supplémentaire / mois", "Extra contribution / month")}</span><input type="number" min="0" value={v9.hindsightMonthlyDelta} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ hindsightMonthlyDelta: Math.max(0, finite(Number(event.target.value))) })} /></label>
            <strong className={styles.bigNumber}>{money(hindsightValue, currency, language)}</strong>
            <small>{pick(language, "Illustration calculée avec l’hypothèse de rendement courante; ce n’est pas un rendement historique réel.", "Illustration using the current return assumption; it is not actual historical performance.")}</small>
          </article>
        </div>
      ) : null}

      {tab === "decide" ? (
        <div className={styles.zone} data-testid="advisor-v9-decisions">
          <article className={styles.card} data-module="14">
            <div className={styles.cardEyebrow}>14 · DOCUMENT INTELLIGENCE</div>
            <h3>{pick(language, "Classifier avant d’extraire", "Classify before extraction")}</h3>
            <p>{pick(language, "Anatole classe localement les métadonnées par nom de fichier. L’extraction PDF/OCR complète n’est pas simulée : elle nécessite un moteur document explicite.", "Anatole classifies filename metadata locally. Full PDF/OCR extraction is not faked: it requires an explicit document engine.")}</p>
            <div className={styles.chips}>
              {v9.documents.slice(-6).map((documentItem) => (
                <span key={documentItem.id}>{documentItem.category}</span>
              ))}
            </div>
          </article>

          <article className={styles.card} data-module="15">
            <div className={styles.cardEyebrow}>15 · FINANCIAL INBOX</div>
            <h3>{pick(language, "Une boîte de réception financière", "A financial inbox")}</h3>
            <div className={styles.signalList}>
              {inbox.map((item) => (
                <div key={item.id} data-tone={item.tone}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card} data-module="16">
            <div className={styles.cardEyebrow}>16 · ACTION CENTER</div>
            <h3>{pick(language, "Transformer les signaux en checklist", "Turn signals into a checklist")}</h3>
            <div className={styles.actionList}>
              {actions.map((action) => (
                <label key={action.id}>
                  <input
                    type="checkbox"
                    checked={action.done}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const next = event.target.checked
                        ? [...new Set([...v9.completedActions, action.id])]
                        : v9.completedActions.filter((item) => item !== action.id);
                      updateV9({ completedActions: next });
                    }}
                  />
                  <span>{action.label}</span>
                </label>
              ))}
            </div>
          </article>

          <article className={styles.card} data-module="22">
            <div className={styles.cardEyebrow}>22 · ANATOLE EXPLAIN</div>
            <h3>{pick(language, "Pourquoi ce chiffre ?", "Why this number?")}</h3>
            <div className={styles.explainRows}>
              <div><strong>{pick(language, "Valeur nette", "Net worth")}</strong><span>{pick(language, "Actifs saisis − dettes détaillées.", "Entered assets − detailed debt.")}</span></div>
              <div><strong>{pick(language, "Marge", "Margin")}</strong><span>{pick(language, "Revenus − dépenses − dette − contributions.", "Income − expenses − debt − contributions.")}</span></div>
              <div><strong>{pick(language, "Projection", "Projection")}</strong><span>{pick(language, "Capital initial + contributions avec rendement hypothétique visible.", "Initial capital + contributions under the visible assumed return.")}</span></div>
            </div>
          </article>

          <article className={styles.card} data-module="23">
            <div className={styles.cardEyebrow}>23 · CONFIDENCE LAYER</div>
            <h3>{pick(language, "Confiance dans les données, pas dans la personne", "Confidence in the data, not the person")}</h3>
            <div className={styles.confidenceRing} style={{ "--confidence": `${health.confidencePercent}%` } as CSSProperties}>
              <strong>{health.confidencePercent}%</strong>
            </div>
            <p>{pick(language, `${health.knownFields}/${health.totalFields} champs clés sont connus.`, `${health.knownFields}/${health.totalFields} key fields are known.`)}</p>
          </article>
        </div>
      ) : null}

      {tab === "goals" ? (
        <div className={styles.zone} data-testid="advisor-v9-optimize">
          <article className={styles.card} data-module="26">
            <div className={styles.cardEyebrow}>26 · DECISION HISTORY</div>
            <h3>{pick(language, "Pourquoi le plan a changé", "Why the plan changed")}</h3>
            <button
              type="button"
              className={styles.action}
              onClick={saveDecisionSnapshot}
            >
              {pick(language, "Enregistrer cette version", "Save this version")}
            </button>
            <div className={styles.list}>
              {v9.decisionHistory.slice(-5).reverse().map((item) => (
                <div key={item.id}><strong>{item.label}</strong><span>{new Date(item.createdAt).toLocaleString(localeFor(language))}</span></div>
              ))}
            </div>
          </article>

          <article className={styles.card} data-module="27">
            <div className={styles.cardEyebrow}>27 · GOAL CONSTRAINTS</div>
            <h3>{pick(language, "Ce qui est négociable ou non", "What is negotiable or not")}</h3>
            <label className={styles.switchRow}><input type="checkbox" checked={v9.fixedGoalDate} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ fixedGoalDate: event.target.checked })} /><span>{pick(language, "Date fixe", "Fixed date")}</span></label>
            <label className={styles.switchRow}><input type="checkbox" checked={v9.fixedGoalAmount} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ fixedGoalAmount: event.target.checked })} /><span>{pick(language, "Montant fixe", "Fixed amount")}</span></label>
            <label className={styles.field}><span>{pick(language, "Réserve minimale", "Minimum reserve")}</span><input type="number" min="0" value={v9.minimumReserve ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ minimumReserve: numberFromInput(event.target.value) })} /></label>
          </article>

          <article className={`${styles.card} ${styles.span2}`} data-module="28">
            <div className={styles.cardEyebrow}>28 · CONSTRAINT SOLVER</div>
            <h3>{pick(language, "Calculer les combinaisons compatibles", "Calculate compatible combinations")}</h3>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Contribution requise", "Required contribution")}</span><strong>{money(solverMonthly, currency, language)}</strong></div>
              <div><span>{pick(language, "Contribution actuelle", "Current contribution")}</span><strong>{money(monthlyContribution, currency, language)}</strong></div>
              <div><span>{pick(language, "Gap de réserve", "Reserve gap")}</span><strong>{money(solverReserveGap, currency, language)}</strong></div>
              <div><span>{pick(language, "Date / montant", "Date / amount")}</span><strong>{`${v9.fixedGoalDate ? "🔒" : "↔"} / ${v9.fixedGoalAmount ? "🔒" : "↔"}`}</strong></div>
            </div>
            <p>{pick(language, "Le solver décrit les variables nécessaires; il ne sélectionne pas une décision à ta place.", "The solver describes required variables; it does not select a decision for you.")}</p>
          </article>

          <article className={styles.card} data-module="29">
            <div className={styles.cardEyebrow}>29 · ANATOLE MARKET BRIDGE</div>
            <h3>{pick(language, "Relier Conseil au reste d’Anatole", "Connect Advice to the rest of Anatole")}</h3>
            <div className={styles.metricGrid}>
              <div><span>{pick(language, "Positions reliées", "Linked positions")}</span><strong>{portfolioCount}</strong></div>
              <div><span>{pick(language, "Placements déclarés", "Entered investments")}</span><strong>{money(household.investments, currency, language)}</strong></div>
            </div>
            <Link href="/portefeuille" className={styles.actionLink}>{pick(language, "Ouvrir Portefeuille", "Open Portfolio")}</Link>
            <small>{pick(language, "Les valeurs de portefeuille ne sont pas ajoutées automatiquement au patrimoine pour éviter le double comptage.", "Portfolio values are not automatically added to net worth to avoid double counting.")}</small>
          </article>

          <article className={styles.card} data-module="30">
            <div className={styles.cardEyebrow}>30 · ANATOLE AGENT</div>
            <h3>{pick(language, "Préparer, structurer, demander confirmation", "Prepare, structure, ask for confirmation")}</h3>
            <textarea
              value={v9.agentGoal}
              placeholder={pick(language, "Ex. Prépare-moi un plan pour acheter dans 24 mois", "E.g. Prepare a plan to buy in 24 months")}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateV9({ agentGoal: event.target.value })}
            />
            <div className={styles.agentBrief}>
              {agentBrief.map((line) => <span key={line}>{line}</span>)}
            </div>
            <small>{pick(language, "Ce module prépare les données et questions; il n’exécute pas d’opération financière.", "This module prepares data and questions; it does not execute financial transactions.")}</small>
          </article>
        </div>
      ) : null}

      {tab === "file" ? (
        <div className={styles.zone} data-testid="advisor-v9-pro">
          <article className={styles.card} data-module="25">
            <div className={styles.cardEyebrow}>25 · ADVISOR COLLAB PACKAGE</div>
            <h3>{pick(language, "Partager un scénario, pas tout ton compte", "Share a scenario, not your whole account")}</h3>
            <label className={styles.field}><span>{pick(language, "Expiration descriptive (jours)", "Descriptive expiry (days)")}</span><input type="number" min="1" max="90" value={v9.shareExpiryDays} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ shareExpiryDays: Math.max(1, finite(Number(event.target.value))) })} /></label>
            <button type="button" className={styles.action} onClick={exportAdvisorPackage}>{pick(language, "Exporter le package conseiller", "Export advisor package")}</button>
            <small>{pick(language, "Export local JSON : aucune URL de partage serveur n’est inventée.", "Local JSON export: no server sharing URL is fabricated.")}</small>
          </article>

          <article className={`${styles.card} ${styles.span2}`} data-module="31">
            <div className={styles.cardEyebrow}>31 · 30-YEAR FINANCIAL TIMELINE</div>
            <h3>{pick(language, "Voir les événements sur trente ans", "See events across thirty years")}</h3>
            <div className={styles.timeline30}>
              <div className={styles.timelineTrack} />
              {timeline.map((item) => (
                <div
                  key={item.id}
                  className={styles.timelinePoint}
                  style={{ left: `${Math.min(100, (item.month / 360) * 100)}%` }}
                  title={`${item.label} · ${futureLabel(item.month, language)}`}
                >
                  <i />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.timelineLabels}><span>{pick(language, "Aujourd’hui", "Today")}</span><span>10y</span><span>20y</span><span>30y</span></div>
          </article>

          <article className={styles.card} data-module="33">
            <div className={styles.cardEyebrow}>33 · EMERGENCY MODE</div>
            <h3>{pick(language, "Recentrer le cockpit sur la liquidité", "Refocus the cockpit on liquidity")}</h3>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                data-testid="advisor-v9-emergency-toggle"
                checked={v9.emergencyMode}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ emergencyMode: event.target.checked })}
              />
              <span>{pick(language, "Activer le mode urgence", "Enable emergency mode")}</span>
            </label>
            <label className={styles.field}><span>{pick(language, "Réduction hypothétique dépenses %", "Assumed expense reduction %")}</span><input type="number" min="0" max="80" value={v9.emergencyExpenseCutPercent} onChange={(event: ChangeEvent<HTMLInputElement>) => updateV9({ emergencyExpenseCutPercent: finite(Number(event.target.value)) })} /></label>
            <strong className={styles.bigNumber}>{emergencyRunway == null ? "N/D" : `${emergencyRunway.toFixed(1)} ${pick(language, "mois", "months")}`}</strong>
          </article>

          <article className={styles.card} data-module="34">
            <div className={styles.cardEyebrow}>34 · FINANCIAL HEALTH API</div>
            <h3>{pick(language, "Un moteur central pour tous les modules", "One central engine for every module")}</h3>
            <pre className={styles.apiPreview}>{JSON.stringify({
              netWorth: health.netWorth,
              monthlyMargin: health.monthlyMargin,
              runwayMonths: health.runwayMonths,
              progress: health.goalProgressPercent,
              confidence: health.confidencePercent,
            }, null, 2)}</pre>
            <small>{pick(language, "Calculé par apps/web/lib/advisor-financial-health.ts.", "Computed by apps/web/lib/advisor-financial-health.ts.")}</small>
          </article>

          <article className={`${styles.card} ${styles.span2}`} data-module="35">
            <div className={styles.cardEyebrow}>35 · ANATOLE INTELLIGENCE LAYER</div>
            <h3>{pick(language, "Fait → changement → impact → options → hypothèses → source", "Fact → change → impact → options → assumptions → source")}</h3>
            <div className={styles.intelligenceGrid}>
              {intelligenceRows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <div>
          <strong>{pick(language, "35 moteurs · V10", "35 engines · V10")}</strong>
          <span>{pick(language, `${modulesByTab[tab].length} capacités regroupées ici`, `${modulesByTab[tab].length} capabilities grouped here`)}</span>
        </div>
        <div>
          <span>{pick(language, "Dépenses importées", "Imported expenses")}</span>
          <strong>{money(transactionExpenseTotal, currency, language)}</strong>
        </div>
        <div>
          <span>{pick(language, "Dette prioritaire", "Primary debt")}</span>
          <strong>{primaryDebtPayoff == null ? "N/D" : `${primaryDebtPayoff}m`}</strong>
        </div>
      </footer>
    </section>
  );
}
