"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  Calculator,
  CalendarClock,
  Database,
  FileCheck2,
  Gauge,
  Home,
  Landmark,
  Plus,
  ReceiptText,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";

import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type { AdvisorProfile } from "@/lib/types";

import styles from "./AdvisorV4Layer.module.css";

const STATE_KEY = "anatole:advisor-workspace:v4";

type LegacyTwin = {
  monthlyIncome: number | null;
  discretionaryExpenses: number | null;
  monthlyDebtPayments: number | null;
  totalDebt: number | null;
  otherAssets: number | null;
};

type LegacyLifeEvent = {
  id: string;
  label: string;
  amount: number;
  monthOffset: number;
  recurringMonthly: number;
};

type LegacyCalendarItem = {
  id: string;
  label: string;
  date: string;
  amount: number;
};

type LegacySnapshot = {
  date: string;
  savings: number;
  target: number;
  monthly: number;
};

type LegacySavedGoal = {
  id: string;
  name: string;
  profile: AdvisorProfile;
};

type DebtItem = {
  id: string;
  label: string;
  balance: number;
  annualRate: number;
  monthlyPayment: number;
};

type PlanningGoal = {
  id: string;
  label: string;
  target: number;
  current: number;
  monthly: number;
  horizonMonths: number;
};

type TaxBucket = {
  room: number | null;
  planned: number | null;
};

type TaxState = {
  tfsa: TaxBucket;
  rrsp: TaxBucket;
  fhsa: TaxBucket;
  resp: TaxBucket;
};

type MortgageState = {
  purchasePrice: number | null;
  downPayment: number | null;
  annualRate: number | null;
  amortizationYears: number | null;
  annualPropertyTax: number | null;
  monthlyCondo: number | null;
  monthlyInsurance: number | null;
  annualMaintenance: number | null;
  renewalAfterYears: number | null;
  renewalRate: number | null;
};

type HouseholdState = {
  userIncome: number | null;
  partnerIncome: number | null;
  dependants: number;
  cash: number | null;
  investments: number | null;
  property: number | null;
  vehicles: number | null;
  otherAssets: number | null;
  essentialExpenses: number | null;
  discretionaryExpenses: number | null;
  housingCosts: number | null;
  insuranceCosts: number | null;
  otherFixedCosts: number | null;
};

type FinancialEvent = {
  id: string;
  label: string;
  monthOffset: number;
  oneTimeCost: number;
  recurringMonthlyCost: number;
  monthlyIncomeDelta: number;
};

type DecisionScenario = {
  label: string;
  startMonth: number;
  oneTimeCost: number;
  monthlyCost: number;
  monthlyIncomeDelta: number;
};

type FinancialOsState = {
  household: HouseholdState;
  debts: DebtItem[];
  goals: PlanningGoal[];
  tax: TaxState;
  mortgage: MortgageState;
  events: FinancialEvent[];
  decision: DecisionScenario;
  forecastMonths: 12 | 24 | 36;
};

type WorkspaceState = {
  twin: LegacyTwin;
  events: LegacyLifeEvent[];
  calendar: LegacyCalendarItem[];
  history: LegacySnapshot[];
  goals: LegacySavedGoal[];
  financialOs: FinancialOsState;
};

type WorkbenchTab =
  | "twin"
  | "cashflow"
  | "decisions"
  | "goals"
  | "tax"
  | "debt"
  | "mortgage"
  | "events"
  | "brief"
  | "quality";

const EMPTY_TWIN: LegacyTwin = {
  monthlyIncome: null,
  discretionaryExpenses: null,
  monthlyDebtPayments: null,
  totalDebt: null,
  otherAssets: null,
};

const EMPTY_HOUSEHOLD: HouseholdState = {
  userIncome: null,
  partnerIncome: null,
  dependants: 0,
  cash: null,
  investments: null,
  property: null,
  vehicles: null,
  otherAssets: null,
  essentialExpenses: null,
  discretionaryExpenses: null,
  housingCosts: null,
  insuranceCosts: null,
  otherFixedCosts: null,
};

const EMPTY_TAX_BUCKET: TaxBucket = {
  room: null,
  planned: null,
};

const EMPTY_TAX: TaxState = {
  tfsa: { ...EMPTY_TAX_BUCKET },
  rrsp: { ...EMPTY_TAX_BUCKET },
  fhsa: { ...EMPTY_TAX_BUCKET },
  resp: { ...EMPTY_TAX_BUCKET },
};

const EMPTY_MORTGAGE: MortgageState = {
  purchasePrice: null,
  downPayment: null,
  annualRate: null,
  amortizationYears: 25,
  annualPropertyTax: null,
  monthlyCondo: null,
  monthlyInsurance: null,
  annualMaintenance: null,
  renewalAfterYears: 5,
  renewalRate: null,
};

const EMPTY_DECISION: DecisionScenario = {
  label: "",
  startMonth: 12,
  oneTimeCost: 0,
  monthlyCost: 0,
  monthlyIncomeDelta: 0,
};

const EMPTY_FINANCIAL_OS: FinancialOsState = {
  household: EMPTY_HOUSEHOLD,
  debts: [],
  goals: [],
  tax: EMPTY_TAX,
  mortgage: EMPTY_MORTGAGE,
  events: [],
  decision: EMPTY_DECISION,
  forecastMonths: 24,
};

function rawWorkspace(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeFinancialOs(value: unknown): FinancialOsState {
  const parsed =
    value && typeof value === "object"
      ? (value as Partial<FinancialOsState>)
      : {};
  const household = (
    parsed.household && typeof parsed.household === "object"
      ? parsed.household
      : {}
  ) as Partial<HouseholdState>;
  const tax = (
    parsed.tax && typeof parsed.tax === "object" ? parsed.tax : {}
  ) as Partial<TaxState>;
  const mortgage = (
    parsed.mortgage && typeof parsed.mortgage === "object"
      ? parsed.mortgage
      : {}
  ) as Partial<MortgageState>;
  const decision = (
    parsed.decision && typeof parsed.decision === "object"
      ? parsed.decision
      : {}
  ) as Partial<DecisionScenario>;

  return {
    household: { ...EMPTY_HOUSEHOLD, ...household },
    debts: Array.isArray(parsed.debts) ? parsed.debts.slice(-20) : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals.slice(-12) : [],
    tax: {
      tfsa: { ...EMPTY_TAX_BUCKET, ...(tax.tfsa ?? {}) },
      rrsp: { ...EMPTY_TAX_BUCKET, ...(tax.rrsp ?? {}) },
      fhsa: { ...EMPTY_TAX_BUCKET, ...(tax.fhsa ?? {}) },
      resp: { ...EMPTY_TAX_BUCKET, ...(tax.resp ?? {}) },
    },
    mortgage: { ...EMPTY_MORTGAGE, ...mortgage },
    events: Array.isArray(parsed.events) ? parsed.events.slice(-24) : [],
    decision: { ...EMPTY_DECISION, ...decision },
    forecastMonths:
      parsed.forecastMonths === 12 || parsed.forecastMonths === 36
        ? parsed.forecastMonths
        : 24,
  };
}

function readState(): WorkspaceState {
  const raw = rawWorkspace();
  const twin =
    raw.twin && typeof raw.twin === "object"
      ? (raw.twin as Partial<LegacyTwin>)
      : {};
  return {
    twin: { ...EMPTY_TWIN, ...twin },
    events: Array.isArray(raw.events)
      ? (raw.events as LegacyLifeEvent[]).slice(-12)
      : [],
    calendar: Array.isArray(raw.calendar)
      ? (raw.calendar as LegacyCalendarItem[]).slice(-36)
      : [],
    history: Array.isArray(raw.history)
      ? (raw.history as LegacySnapshot[]).slice(-36)
      : [],
    goals: Array.isArray(raw.goals)
      ? (raw.goals as LegacySavedGoal[]).slice(-8)
      : [],
    financialOs: normalizeFinancialOs(raw.financialOs),
  };
}

function persistState(state: WorkspaceState): void {
  if (typeof window === "undefined") return;
  const existing = rawWorkspace();
  window.localStorage.setItem(
    STATE_KEY,
    JSON.stringify({
      ...existing,
      ...state,
    }),
  );
  window.dispatchEvent(new CustomEvent("anatole-workspace-sync-applied"));
}

function finite(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function nonNegative(value: number | null | undefined): number {
  return Math.max(0, finite(value));
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

function numberValue(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function percent(value: number): string {
  return `${value.toFixed(1)} %`;
}

function futureMonthLabel(
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


function monthsUntilDate(value: string): number | null {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const months =
    (parsed.getFullYear() - now.getFullYear()) * 12 +
    (parsed.getMonth() - now.getMonth());
  return Math.max(0, months);
}

function debtPayoffMonths(debt: DebtItem): number | null {
  const balance = Math.max(0, debt.balance);
  const payment = Math.max(0, debt.monthlyPayment);
  if (balance <= 0) return 0;
  if (payment <= 0) return null;
  const rate = Math.max(0, debt.annualRate) / 100 / 12;
  if (rate <= 0) return Math.ceil(balance / payment);
  const interest = balance * rate;
  if (payment <= interest) return null;
  return Math.ceil(
    -Math.log(1 - (rate * balance) / payment) / Math.log(1 + rate),
  );
}

function mortgageMonthlyRate(annualRate: number): number {
  if (annualRate <= 0) return 0;
  return (1 + annualRate / 200) ** (1 / 6) - 1;
}

function mortgagePayment(
  principal: number,
  annualRate: number,
  amortizationYears: number,
): number {
  if (principal <= 0 || amortizationYears <= 0) return 0;
  const periods = Math.max(1, Math.round(amortizationYears * 12));
  const rate = mortgageMonthlyRate(annualRate);
  if (rate <= 0) return principal / periods;
  return principal * rate / (1 - (1 + rate) ** -periods);
}

function mortgageBalanceAfter(
  principal: number,
  annualRate: number,
  amortizationYears: number,
  elapsedMonths: number,
): number {
  if (principal <= 0) return 0;
  const payment = mortgagePayment(principal, annualRate, amortizationYears);
  const rate = mortgageMonthlyRate(annualRate);
  if (rate <= 0) {
    return Math.max(0, principal - payment * elapsedMonths);
  }
  const factor = (1 + rate) ** elapsedMonths;
  return Math.max(
    0,
    principal * factor - payment * ((factor - 1) / rate),
  );
}

function pathFor(
  values: number[],
  width: number,
  height: number,
  minValue: number,
  maxValue: number,
): string {
  if (!values.length) return "";
  const range = Math.max(1, maxValue - minValue);
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? 0
          : (index / (values.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function ForecastChart({
  values,
  currency,
  language,
}: {
  values: number[];
  currency: string;
  language: AnatoleLanguage;
}) {
  const width = 760;
  const height = 210;
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const zeroY =
    height -
    ((0 - minValue) / Math.max(1, maxValue - minValue)) * height;

  return (
    <div className={styles.forecastChart} data-testid="advisor-v5-cashflow-chart">
      <div className={styles.forecastScale}>
        <span>{money(maxValue, currency, language)}</span>
        <span>{money((maxValue + minValue) / 2, currency, language)}</span>
        <span>{money(minValue, currency, language)}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={pick(
          language,
          "Prévision du solde de liquidités",
          "Cash balance forecast",
        )}
      >
        <line
          x1="0"
          y1={zeroY}
          x2={width}
          y2={zeroY}
          className={styles.forecastZero}
        />
        <path
          d={pathFor(values, width, height, minValue, maxValue)}
          className={styles.forecastPath}
        />
      </svg>
    </div>
  );
}

function shoppingCategory(profile: AdvisorProfile): string {
  if (profile.goal_type === "home") return "mortgage";
  if (profile.goal_type === "education") return "student_loan";
  if (profile.goal_type === "reserve") return "banking";
  if (profile.goal_type === "flexible") return "personal_loan";
  return "banking";
}

export function AdvisorV4Layer({
  profile,
  goalLabel,
  language,
  portfolioCount,
  dashboardMode,
  onApplyProfile,
}: {
  profile: AdvisorProfile;
  goalLabel: string;
  language: AnatoleLanguage;
  portfolioCount: number;
  dashboardMode: boolean;
  onApplyProfile: (profile: AdvisorProfile) => void;
}) {
  const [state, setState] = useState<WorkspaceState>(readState);
  const [tab, setTab] = useState<WorkbenchTab>("twin");
  const [decisionText, setDecisionText] = useState("");
  const [showBalance, setShowBalance] = useState(false);

  const os = state.financialOs;
  const household = os.household;
  const currency = profile.currency;
  const essential =
    household.essentialExpenses ??
    profile.essential_monthly_expenses ??
    null;
  const userIncome = household.userIncome ?? state.twin.monthlyIncome;
  const discretionary =
    household.discretionaryExpenses ??
    state.twin.discretionaryExpenses;
  const debtPayments =
    os.debts.reduce((sum, debt) => sum + nonNegative(debt.monthlyPayment), 0) ||
    nonNegative(state.twin.monthlyDebtPayments);
  const debtsTotal =
    os.debts.reduce((sum, debt) => sum + nonNegative(debt.balance), 0) ||
    nonNegative(state.twin.totalDebt);
  const incomeTotal =
    nonNegative(userIncome) + nonNegative(household.partnerIncome);
  const fixedOutflows =
    nonNegative(essential) +
    nonNegative(discretionary) +
    nonNegative(household.housingCosts) +
    nonNegative(household.insuranceCosts) +
    nonNegative(household.otherFixedCosts) +
    debtPayments;
  const goalOutflows =
    nonNegative(profile.monthly_contribution) +
    os.goals.reduce((sum, goal) => sum + nonNegative(goal.monthly), 0);
  const baseMonthlyMargin =
    userIncome == null && household.partnerIncome == null
      ? null
      : incomeTotal - fixedOutflows - goalOutflows;

  const legacyOtherAssets =
    household.otherAssets == null ? state.twin.otherAssets : null;
  const totalAssets =
    nonNegative(household.cash) +
    nonNegative(household.investments) +
    nonNegative(household.property) +
    nonNegative(household.vehicles) +
    nonNegative(household.otherAssets) +
    nonNegative(legacyOtherAssets);
  const netWorth =
    [
      household.cash,
      household.investments,
      household.property,
      household.vehicles,
      household.otherAssets,
      legacyOtherAssets,
      state.twin.totalDebt,
    ].every((value) => value == null) && os.debts.length === 0
      ? null
      : totalAssets - debtsTotal;

  const monthlyInterest = os.debts.reduce(
    (sum, debt) =>
      sum + nonNegative(debt.balance) * (nonNegative(debt.annualRate) / 100 / 12),
    0,
  );
  const weightedDebtRate =
    debtsTotal > 0
      ? os.debts.reduce(
          (sum, debt) =>
            sum +
            nonNegative(debt.balance) * nonNegative(debt.annualRate),
          0,
        ) / debtsTotal
      : 0;

  const mortgage = os.mortgage;
  const mortgagePrincipal = Math.max(
    0,
    nonNegative(mortgage.purchasePrice) -
      nonNegative(mortgage.downPayment),
  );
  const mortgageRate = nonNegative(mortgage.annualRate);
  const monthlyMortgage = mortgagePayment(
    mortgagePrincipal,
    mortgageRate,
    mortgage.amortizationYears ?? 25,
  );
  const housingMonthly =
    monthlyMortgage +
    nonNegative(mortgage.annualPropertyTax) / 12 +
    nonNegative(mortgage.monthlyCondo) +
    nonNegative(mortgage.monthlyInsurance) +
    nonNegative(mortgage.annualMaintenance) / 12;
  const renewalMonth = Math.max(
    0,
    Math.round((mortgage.renewalAfterYears ?? 5) * 12),
  );
  const balanceAtRenewal = mortgageBalanceAfter(
    mortgagePrincipal,
    mortgageRate,
    mortgage.amortizationYears ?? 25,
    renewalMonth,
  );
  const remainingAmortization = Math.max(
    1,
    (mortgage.amortizationYears ?? 25) -
      (mortgage.renewalAfterYears ?? 5),
  );
  const renewalPayment =
    mortgage.renewalRate == null
      ? null
      : mortgagePayment(
          balanceAtRenewal,
          nonNegative(mortgage.renewalRate),
          remainingAmortization,
        );

  const forecast = useMemo(() => {
    const months = os.forecastMonths;
    const startCash = household.cash ?? profile.liquid_reserve ?? 0;

    return Array.from({ length: months + 1 }, (_, index) => {
      if (index === 0) return startCash;

      const recurringCashFlow = Array.from(
        { length: index },
        (_, monthOffset) => monthOffset + 1,
      ).reduce((total, monthIndex) => {
        const eventMonthly = os.events.reduce(
          (sum, event) =>
            monthIndex >= event.monthOffset
              ? sum +
                finite(event.monthlyIncomeDelta) -
                nonNegative(event.recurringMonthlyCost)
              : sum,
          0,
        );
        const legacyMonthly = state.events.reduce(
          (sum, event) =>
            monthIndex >= event.monthOffset
              ? sum - nonNegative(event.recurringMonthly)
              : sum,
          0,
        );
        const decisionMonthly =
          monthIndex >= os.decision.startMonth
            ? finite(os.decision.monthlyIncomeDelta) -
              nonNegative(os.decision.monthlyCost)
            : 0;

        return (
          total +
          (baseMonthlyMargin ?? 0) +
          eventMonthly +
          legacyMonthly +
          decisionMonthly
        );
      }, 0);

      const eventOneTime = os.events.reduce(
        (sum, event) =>
          event.monthOffset > 0 && event.monthOffset <= index
            ? sum + nonNegative(event.oneTimeCost)
            : sum,
        0,
      );
      const legacyOneTime = state.events.reduce(
        (sum, event) =>
          event.monthOffset > 0 && event.monthOffset <= index
            ? sum + nonNegative(event.amount)
            : sum,
        0,
      );
      const calendarOneTime = state.calendar.reduce((sum, item) => {
        const offset = monthsUntilDate(item.date);
        return offset != null && offset > 0 && offset <= index
          ? sum + nonNegative(item.amount)
          : sum;
      }, 0);
      const decisionOneTime =
        os.decision.startMonth > 0 && os.decision.startMonth <= index
          ? nonNegative(os.decision.oneTimeCost)
          : 0;

      return (
        startCash +
        recurringCashFlow -
        eventOneTime -
        legacyOneTime -
        calendarOneTime -
        decisionOneTime
      );
    });
  }, [
    baseMonthlyMargin,
    household.cash,
    os.decision,
    os.events,
    os.forecastMonths,
    profile.liquid_reserve,
    state.calendar,
    state.events,
  ]);

  const forecastMinimum = Math.min(...forecast);
  const decisionTwelveMonthImpact =
    -nonNegative(os.decision.oneTimeCost) +
    Math.max(0, 13 - Math.max(1, os.decision.startMonth)) *
      (finite(os.decision.monthlyIncomeDelta) -
        nonNegative(os.decision.monthlyCost));

  const currentGoal: PlanningGoal = {
    id: "profile-current-goal",
    label: profile.goal_name?.trim() || goalLabel,
    target: nonNegative(profile.target_amount),
    current: nonNegative(profile.current_savings),
    monthly: nonNegative(profile.monthly_contribution),
    horizonMonths: Math.max(
      1,
      Math.round(nonNegative(profile.horizon_years) * 12),
    ),
  };
  const allGoals = [currentGoal, ...os.goals];
  const totalGoalTarget = allGoals.reduce(
    (sum, goal) => sum + nonNegative(goal.target),
    0,
  );
  const totalGoalCurrent = allGoals.reduce(
    (sum, goal) => sum + nonNegative(goal.current),
    0,
  );

  const taxRows = [
    ["tfsa", pick(language, "CELI", "TFSA")],
    ["rrsp", pick(language, "REER", "RRSP")],
    ["fhsa", pick(language, "CELIAPP", "FHSA")],
    ["resp", pick(language, "REEE", "RESP")],
  ] as const;

  const updateState = (next: WorkspaceState) => {
    setState(next);
    persistState(next);
  };

  const updateFinancialOs = (
    updater: (current: FinancialOsState) => FinancialOsState,
  ) => {
    const next = {
      ...state,
      financialOs: updater(state.financialOs),
    };
    updateState(next);
  };

  const updateHousehold = (
    key: keyof HouseholdState,
    raw: string,
  ) => {
    const numeric =
      key === "dependants"
        ? Math.max(0, Math.round(Number(raw) || 0))
        : numberValue(raw);
    updateFinancialOs((current) => ({
      ...current,
      household: {
        ...current.household,
        [key]: numeric,
      },
    }));
  };

  const updateTax = (
    bucket: keyof TaxState,
    key: keyof TaxBucket,
    raw: string,
  ) => {
    updateFinancialOs((current) => ({
      ...current,
      tax: {
        ...current.tax,
        [bucket]: {
          ...current.tax[bucket],
          [key]: numberValue(raw),
        },
      },
    }));
  };

  const updateMortgage = (
    key: keyof MortgageState,
    raw: string,
  ) => {
    const value =
      key === "amortizationYears" || key === "renewalAfterYears"
        ? Math.max(1, Number(raw) || 1)
        : numberValue(raw);
    updateFinancialOs((current) => ({
      ...current,
      mortgage: {
        ...current.mortgage,
        [key]: value,
      },
    }));
  };

  const addDebt = () => {
    updateFinancialOs((current) => ({
      ...current,
      debts: [
        ...current.debts,
        {
          id: `debt-${Date.now()}`,
          label: pick(language, "Nouvelle dette", "New debt"),
          balance: 0,
          annualRate: 0,
          monthlyPayment: 0,
        },
      ].slice(-20),
    }));
  };

  const updateDebt = (
    id: string,
    patch: Partial<DebtItem>,
  ) => {
    updateFinancialOs((current) => ({
      ...current,
      debts: current.debts.map((debt) =>
        debt.id === id ? { ...debt, ...patch } : debt,
      ),
    }));
  };

  const addGoal = () => {
    updateFinancialOs((current) => ({
      ...current,
      goals: [
        ...current.goals,
        {
          id: `goal-${Date.now()}`,
          label: pick(language, "Nouvel objectif", "New goal"),
          target: 0,
          current: 0,
          monthly: 0,
          horizonMonths: 60,
        },
      ].slice(-12),
    }));
  };

  const updateGoal = (
    id: string,
    patch: Partial<PlanningGoal>,
  ) => {
    updateFinancialOs((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === id ? { ...goal, ...patch } : goal,
      ),
    }));
  };

  const addEvent = () => {
    updateFinancialOs((current) => ({
      ...current,
      events: [
        ...current.events,
        {
          id: `event-${Date.now()}`,
          label: pick(language, "Nouvel événement", "New event"),
          monthOffset: 12,
          oneTimeCost: 0,
          recurringMonthlyCost: 0,
          monthlyIncomeDelta: 0,
        },
      ].slice(-24),
    }));
  };

  const updateEvent = (
    id: string,
    patch: Partial<FinancialEvent>,
  ) => {
    updateFinancialOs((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === id ? { ...event, ...patch } : event,
      ),
    }));
  };

  const decisionPreview =
    decisionText.trim().length > 0
      ? {
          label: decisionText.trim(),
          effect: decisionTwelveMonthImpact,
        }
      : null;

  const priorSnapshot =
    state.history.length >= 2 ? state.history[state.history.length - 2] : null;
  const latestSnapshot =
    state.history.length >= 1 ? state.history[state.history.length - 1] : null;
  const savingsDelta =
    priorSnapshot && latestSnapshot
      ? latestSnapshot.savings - priorSnapshot.savings
      : null;

  const upcomingCalendar = state.calendar
    .map((item) => ({ item, offset: monthsUntilDate(item.date) }))
    .filter(
      (entry): entry is { item: LegacyCalendarItem; offset: number } =>
        entry.offset != null,
    )
    .sort((a, b) => a.offset - b.offset)[0] ?? null;

  const briefItems = [
    savingsDelta != null && savingsDelta !== 0
      ? pick(
          language,
          `Capital de l’objectif : ${savingsDelta >= 0 ? "+" : ""}${money(savingsDelta, currency, language)} depuis le snapshot précédent.`,
          `Goal capital: ${savingsDelta >= 0 ? "+" : ""}${money(savingsDelta, currency, language)} since the prior snapshot.`,
        )
      : null,
    upcomingCalendar
      ? pick(
          language,
          `Échéance enregistrée : ${upcomingCalendar.item.label} dans environ ${upcomingCalendar.offset} mois (${money(upcomingCalendar.item.amount, currency, language)}).`,
          `Saved milestone: ${upcomingCalendar.item.label} in about ${upcomingCalendar.offset} months (${money(upcomingCalendar.item.amount, currency, language)}).`,
        )
      : null,
    baseMonthlyMargin != null
      ? pick(
          language,
          `Marge mensuelle modélisée : ${money(baseMonthlyMargin, currency, language)}.`,
          `Modelled monthly margin: ${money(baseMonthlyMargin, currency, language)}.`,
        )
      : pick(
          language,
          "Le revenu mensuel est encore N/D; le cash-flow ne peut pas être complet.",
          "Monthly income is still N/A; cash flow cannot yet be complete.",
        ),
    forecastMinimum < 0
      ? pick(
          language,
          `Le scénario courant fait passer les liquidités sous zéro dans l’horizon choisi.`,
          `The current scenario takes cash below zero within the selected horizon.`,
        )
      : pick(
          language,
          `Le solde de liquidités simulé reste au-dessus de zéro sur ${os.forecastMonths} mois.`,
          `The simulated cash balance stays above zero over ${os.forecastMonths} months.`,
        ),
    debtsTotal > 0
      ? pick(
          language,
          `Dettes saisies : ${money(debtsTotal, currency, language)} à un taux pondéré de ${percent(weightedDebtRate)}.`,
          `Entered debt: ${money(debtsTotal, currency, language)} at a weighted rate of ${percent(weightedDebtRate)}.`,
        )
      : pick(language, "Aucune dette détaillée saisie.", "No detailed debt entered."),
    mortgagePrincipal > 0
      ? pick(
          language,
          `Scénario hypothécaire : paiement estimé ${money(monthlyMortgage, currency, language)} / mois.`,
          `Mortgage scenario: estimated payment ${money(monthlyMortgage, currency, language)} / month.`,
        )
      : pick(
          language,
          "Aucun scénario hypothécaire complet pour l’instant.",
          "No complete mortgage scenario yet.",
        ),
  ].filter((item): item is string => item !== null);

  const qualityRows = [
    {
      label: pick(language, "Objectif principal", "Primary goal"),
      value: profile.goal_name || goalLabel,
      source: pick(language, "Profil Conseil", "Advice profile"),
      status: profile.goal_type ? pick(language, "Fourni", "Provided") : "N/D",
      formula: pick(language, "Valeur saisie", "Entered value"),
    },
    {
      label: pick(language, "Revenu mensuel", "Monthly income"),
      value: money(userIncome, currency, language),
      source: pick(language, "Jumeau financier", "Financial twin"),
      status: userIncome == null ? "N/D" : pick(language, "Fourni", "Provided"),
      formula: pick(language, "Valeur saisie", "Entered value"),
    },
    {
      label: pick(language, "Valeur nette", "Net worth"),
      value: money(netWorth, currency, language),
      source: "Anatole",
      status: netWorth == null ? "N/D" : pick(language, "Calculé", "Calculated"),
      formula: pick(language, "Actifs saisis − dettes saisies", "Entered assets − entered debts"),
    },
    {
      label: pick(language, "Marge mensuelle", "Monthly margin"),
      value: money(baseMonthlyMargin, currency, language),
      source: "Anatole",
      status:
        baseMonthlyMargin == null ? "N/D" : pick(language, "Calculé", "Calculated"),
      formula: pick(
        language,
        "Revenus − dépenses − paiements de dette − contributions",
        "Income − expenses − debt payments − contributions",
      ),
    },
    {
      label: pick(language, "Paiement hypothécaire", "Mortgage payment"),
      value:
        mortgagePrincipal > 0
          ? money(monthlyMortgage, currency, language)
          : "N/D",
      source: "Anatole",
      status:
        mortgagePrincipal > 0
          ? pick(language, "Calculé", "Calculated")
          : "N/D",
      formula: pick(
        language,
        "Capital, taux saisi et amortissement",
        "Principal, entered rate and amortization",
      ),
    },
    {
      label: pick(language, "Prévision de liquidités", "Cash forecast"),
      value: money(forecast[forecast.length - 1], currency, language),
      source: "Anatole",
      status: pick(language, "Calculé", "Calculated"),
      formula: pick(
        language,
        "Solde initial + marge + événements + scénario",
        "Opening balance + margin + events + scenario",
      ),
    },
  ];

  const tabs: Array<{
    id: WorkbenchTab;
    label: string;
    icon: typeof Activity;
  }> = [
    { id: "twin", label: pick(language, "Jumeau", "Twin"), icon: Users },
    { id: "cashflow", label: "Cash-flow", icon: Activity },
    { id: "decisions", label: pick(language, "Décisions", "Decisions"), icon: Sparkles },
    { id: "goals", label: pick(language, "Objectifs", "Goals"), icon: Target },
    { id: "tax", label: pick(language, "Fiscalité", "Tax"), icon: ReceiptText },
    { id: "debt", label: pick(language, "Dettes", "Debt"), icon: Scale },
    { id: "mortgage", label: pick(language, "Hypothèque", "Mortgage"), icon: Home },
    { id: "events", label: pick(language, "Événements", "Events"), icon: CalendarClock },
    { id: "brief", label: "Brief", icon: Bell },
    { id: "quality", label: pick(language, "Données", "Data"), icon: Database },
  ];

  return (
    <section
      className={styles.layer}
      data-testid="advisor-v4-layer"
      data-version="5"
    >
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <Sparkles size={13} />
            ANATOLE CONSEIL · V5
            <small>{pick(language, "moteur V4 migré", "V4 engine migrated")}</small>
          </span>
          <h2>
            {pick(
              language,
              "Ton système financier personnel, dans un seul cockpit.",
              "Your personal financial system, in one cockpit.",
            )}
          </h2>
          <p>
            {pick(
              language,
              "Patrimoine, cash-flow, objectifs, fiscalité, dettes, hypothèque, événements et provenance des données sont reliés sans inventer les valeurs manquantes.",
              "Net worth, cash flow, goals, tax accounts, debt, mortgage, life events and data provenance are connected without inventing missing values.",
            )}
          </p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" onClick={() => setShowBalance((value) => !value)}>
            <Landmark size={13} />
            {pick(language, "Bilan Anatole", "Anatole Balance")}
          </button>
          <Link
            href={`/assistant/magasiner?category=${shoppingCategory(profile)}`}
          >
            <WalletCards size={13} />
            {pick(language, "Magasiner", "Shop")}
          </Link>
        </div>
      </header>

      <div className={styles.summaryGrid}>
        <article>
          <span>{pick(language, "Valeur nette", "Net worth")}</span>
          <strong>{money(netWorth, currency, language)}</strong>
          <small>{pick(language, "Actifs et dettes saisis", "Entered assets and debt")}</small>
        </article>
        <article>
          <span>{pick(language, "Marge mensuelle", "Monthly margin")}</span>
          <strong>{money(baseMonthlyMargin, currency, language)}</strong>
          <small>{pick(language, "Après dépenses, dettes et objectifs", "After expenses, debt and goals")}</small>
        </article>
        <article>
          <span>{pick(language, "Objectifs", "Goals")}</span>
          <strong>{money(totalGoalCurrent, currency, language)}</strong>
          <small>/ {money(totalGoalTarget, currency, language)}</small>
        </article>
        <article>
          <span>{pick(language, "Liquidités projetées", "Projected cash")}</span>
          <strong>{money(forecast[forecast.length - 1], currency, language)}</strong>
          <small>{os.forecastMonths} {pick(language, "mois", "months")}</small>
        </article>
      </div>

      {showBalance ? (
        <section className={styles.quickBalance} data-testid="advisor-v4-balance">
          <div>
            <span>{pick(language, "BILAN RAPIDE", "QUICK BALANCE")}</span>
            <strong>{money(netWorth, currency, language)}</strong>
          </div>
          <label>
            <span>{pick(language, "Revenu mensuel net", "Net monthly income")}</span>
            <input
              type="number"
              min="0"
              value={household.userIncome ?? ""}
              onChange={(event) =>
                updateHousehold("userIncome", event.target.value)
              }
            />
          </label>
          <label>
            <span>{pick(language, "Liquidités", "Cash")}</span>
            <input
              type="number"
              min="0"
              value={household.cash ?? ""}
              onChange={(event) =>
                updateHousehold("cash", event.target.value)
              }
            />
          </label>
          <label>
            <span>{pick(language, "Dette totale", "Total debt")}</span>
            <input
              type="number"
              min="0"
              value={debtsTotal || ""}
              readOnly
              aria-label={pick(language, "Dette totale calculée", "Calculated total debt")}
            />
          </label>
          <div className={styles.quickBalanceFooter}>
            <span>{pick(language, "Flux mensuel libre", "Monthly free cash flow")}</span>
            <strong>{money(baseMonthlyMargin, currency, language)}</strong>
          </div>
        </section>
      ) : null}

      <section className={styles.decisionComposer}>
        <div>
          <span className={styles.eyebrow}>
            {pick(language, "POSE UNE DÉCISION", "ASK A DECISION")}
          </span>
          <h3>{pick(language, "Et si… ?", "What if…?")}</h3>
          <p>
            {pick(
              language,
              "Le texte reste une note de scénario. Les impacts numériques viennent seulement des champs structurés du Decision Lab.",
              "The text remains a scenario note. Numeric impacts come only from structured Decision Lab fields.",
            )}
          </p>
        </div>
        <textarea
          data-testid="advisor-decision-input"
          value={decisionText}
          onChange={(event) => setDecisionText(event.target.value)}
          placeholder={pick(
            language,
            "Ex. Et si j’achetais une maison à 550 000 $ dans 3 ans ?",
            "Example: What if I bought a $550,000 home in 3 years?",
          )}
        />
        {decisionPreview ? (
          <div
            className={styles.decisionPreview}
            data-testid="advisor-decision-preview"
          >
            <strong>
              {/maison|propri|home|mortgage|hypoth/i.test(decisionPreview.label)
                ? pick(language, "Projet immobilier", "Home purchase")
                : pick(language, "Scénario personnalisé", "Custom scenario")}
            </strong>
            <span>{decisionPreview.label}</span>
          </div>
        ) : null}
      </section>

      <nav
        className={styles.tabs}
        aria-label={pick(language, "Modules Conseil", "Advice modules")}
        data-testid="advisor-v5-tabs"
      >
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            type="button"
            key={id}
            className={tab === id ? styles.tabActive : styles.tab}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            data-testid={`advisor-v5-tab-${id}`}
          >
            <Icon size={13} />
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {tab === "twin" ? (
        <section className={styles.panel} data-testid="advisor-v5-twin">
          <div className={styles.panelHeading}>
            <div>
              <span>01 · FINANCIAL TWIN</span>
              <h3>{pick(language, "Jumeau financier du ménage", "Household financial twin")}</h3>
              <p>{pick(language, "Aucune donnée bancaire n’est inventée : tu renseignes les valeurs ou elles restent N/D.", "No banking data is invented: you enter values or they stay N/A.")}</p>
            </div>
            <Users size={24} />
          </div>
          <div className={styles.formGrid}>
            {([
              ["userIncome", pick(language, "Revenu net / mois", "Net income / month")],
              ["partnerIncome", pick(language, "Revenu partenaire / mois", "Partner income / month")],
              ["dependants", pick(language, "Personnes à charge", "Dependants")],
              ["cash", pick(language, "Liquidités", "Cash")],
              ["investments", pick(language, "Placements", "Investments")],
              ["property", pick(language, "Immobilier", "Property")],
              ["vehicles", pick(language, "Véhicules", "Vehicles")],
              ["otherAssets", pick(language, "Autres actifs", "Other assets")],
              ["essentialExpenses", pick(language, "Dépenses essentielles / mois", "Essential expenses / month")],
              ["discretionaryExpenses", pick(language, "Dépenses discrétionnaires / mois", "Discretionary expenses / month")],
              ["housingCosts", pick(language, "Logement hors hypothèque / mois", "Housing excluding mortgage / month")],
              ["insuranceCosts", pick(language, "Assurances / mois", "Insurance / month")],
              ["otherFixedCosts", pick(language, "Autres charges fixes / mois", "Other fixed costs / month")],
            ] as Array<[keyof HouseholdState, string]>).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min={key === "dependants" ? 0 : undefined}
                  value={household[key] ?? ""}
                  onChange={(event) => updateHousehold(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className={styles.metricStrip}>
            <article><span>{pick(language, "Actifs saisis", "Entered assets")}</span><strong>{money(totalAssets, currency, language)}</strong></article>
            <article><span>{pick(language, "Dettes", "Debt")}</span><strong>{money(debtsTotal, currency, language)}</strong></article>
            <article><span>{pick(language, "Valeur nette", "Net worth")}</span><strong>{money(netWorth, currency, language)}</strong></article>
            <article><span>{pick(language, "Revenus / mois", "Income / month")}</span><strong>{money(incomeTotal || null, currency, language)}</strong></article>
          </div>
        </section>
      ) : null}

      {tab === "cashflow" ? (
        <section className={styles.panel} data-testid="advisor-v5-cashflow">
          <div className={styles.panelHeading}>
            <div>
              <span>02 · CASH-FLOW 12–36 MOIS</span>
              <h3>{pick(language, "Voir la marge avant qu’elle ne disparaisse", "See margin before it disappears")}</h3>
              <p>{pick(language, "La projection additionne les valeurs saisies, les événements et le scénario actif. Ce n’est pas une prévision de marché.", "The projection combines entered values, events and the active scenario. It is not a market forecast.")}</p>
            </div>
            <div className={styles.segmented}>
              {[12, 24, 36].map((months) => (
                <button
                  type="button"
                  key={months}
                  className={os.forecastMonths === months ? styles.segmentedActive : ""}
                  onClick={() =>
                    updateFinancialOs((current) => ({
                      ...current,
                      forecastMonths: months as 12 | 24 | 36,
                    }))
                  }
                >
                  {months}m
                </button>
              ))}
            </div>
          </div>
          <ForecastChart
            values={forecast}
            currency={currency}
            language={language}
          />
          <div className={styles.metricStrip}>
            <article><span>{pick(language, "Départ", "Opening")}</span><strong>{money(forecast[0], currency, language)}</strong></article>
            <article><span>{pick(language, "Minimum", "Minimum")}</span><strong>{money(forecastMinimum, currency, language)}</strong></article>
            <article><span>{pick(language, "Fin de période", "Period end")}</span><strong>{money(forecast[forecast.length - 1], currency, language)}</strong></article>
            <article><span>{pick(language, "Marge mensuelle base", "Base monthly margin")}</span><strong>{money(baseMonthlyMargin, currency, language)}</strong></article>
          </div>
        </section>
      ) : null}

      {tab === "decisions" ? (
        <section className={styles.panel} data-testid="advisor-v5-decisions">
          <div className={styles.panelHeading}>
            <div>
              <span>03 · DECISION LAB</span>
              <h3>{pick(language, "Tester une décision sans la confondre avec une recommandation", "Test a decision without treating it as a recommendation")}</h3>
            </div>
            <Calculator size={24} />
          </div>
          <div className={styles.formGrid}>
            <label>
              <span>{pick(language, "Nom du scénario", "Scenario name")}</span>
              <input
                value={os.decision.label}
                onChange={(event) =>
                  updateFinancialOs((current) => ({
                    ...current,
                    decision: { ...current.decision, label: event.target.value },
                  }))
                }
              />
            </label>
            <label>
              <span>{pick(language, "Commence dans (mois)", "Starts in (months)")}</span>
              <input
                type="number"
                min="1"
                value={os.decision.startMonth}
                onChange={(event) =>
                  updateFinancialOs((current) => ({
                    ...current,
                    decision: {
                      ...current.decision,
                      startMonth: Math.max(1, Number(event.target.value) || 1),
                    },
                  }))
                }
              />
            </label>
            <label>
              <span>{pick(language, "Coût unique", "One-time cost")}</span>
              <input
                type="number"
                min="0"
                value={os.decision.oneTimeCost}
                onChange={(event) =>
                  updateFinancialOs((current) => ({
                    ...current,
                    decision: {
                      ...current.decision,
                      oneTimeCost: nonNegative(Number(event.target.value)),
                    },
                  }))
                }
              />
            </label>
            <label>
              <span>{pick(language, "Coût mensuel additionnel", "Additional monthly cost")}</span>
              <input
                type="number"
                min="0"
                value={os.decision.monthlyCost}
                onChange={(event) =>
                  updateFinancialOs((current) => ({
                    ...current,
                    decision: {
                      ...current.decision,
                      monthlyCost: nonNegative(Number(event.target.value)),
                    },
                  }))
                }
              />
            </label>
            <label>
              <span>{pick(language, "Variation de revenu / mois", "Income change / month")}</span>
              <input
                type="number"
                value={os.decision.monthlyIncomeDelta}
                onChange={(event) =>
                  updateFinancialOs((current) => ({
                    ...current,
                    decision: {
                      ...current.decision,
                      monthlyIncomeDelta: finite(Number(event.target.value)),
                    },
                  }))
                }
              />
            </label>
          </div>
          <div className={styles.compareGrid}>
            <article>
              <span>{pick(language, "Base", "Base")}</span>
              <strong>{money(baseMonthlyMargin, currency, language)} / {pick(language, "mois", "month")}</strong>
              <small>{pick(language, "Sans la décision structurée", "Without the structured decision")}</small>
            </article>
            <article>
              <span>{pick(language, "Scénario", "Scenario")}</span>
              <strong>
                {money(
                  baseMonthlyMargin == null
                    ? null
                    : baseMonthlyMargin +
                        os.decision.monthlyIncomeDelta -
                        os.decision.monthlyCost,
                  currency,
                  language,
                )}{" "}
                / {pick(language, "mois", "month")}
              </strong>
              <small>{pick(language, "Après le mois de départ", "After the start month")}</small>
            </article>
            <article>
              <span>{pick(language, "Impact 12 mois", "12-month impact")}</span>
              <strong>{money(decisionTwelveMonthImpact, currency, language)}</strong>
              <small>{pick(language, "Calcul mécanique du scénario", "Mechanical scenario calculation")}</small>
            </article>
          </div>
        </section>
      ) : null}

      {tab === "goals" ? (
        <section className={styles.panel} data-testid="advisor-v5-goals">
          <div className={styles.panelHeading}>
            <div>
              <span>04 · OBJECTIFS MULTIPLES</span>
              <h3>{pick(language, "Voir les objectifs ensemble, pas en silos", "See goals together, not in silos")}</h3>
            </div>
            <button type="button" className={styles.addButton} onClick={addGoal}>
              <Plus size={12} />
              {pick(language, "Ajouter", "Add")}
            </button>
          </div>
          <div className={styles.goalTable}>
            <article className={styles.goalCurrent}>
              <div><strong>{currentGoal.label}</strong><small>{pick(language, "Objectif principal", "Primary goal")}</small></div>
              <span>{money(currentGoal.current, currency, language)} / {money(currentGoal.target, currency, language)}</span>
              <span>{money(currentGoal.monthly, currency, language)} / {pick(language, "mois", "month")}</span>
              <span>{futureMonthLabel(currentGoal.horizonMonths, language)}</span>
            </article>
            {os.goals.map((goal) => (
              <article key={goal.id}>
                <input
                  value={goal.label}
                  onChange={(event) =>
                    updateGoal(goal.id, { label: event.target.value })
                  }
                />
                <div className={styles.inlineNumbers}>
                  <input
                    aria-label={pick(language, "Capital actuel", "Current capital")}
                    type="number"
                    min="0"
                    value={goal.current}
                    onChange={(event) =>
                      updateGoal(goal.id, {
                        current: nonNegative(Number(event.target.value)),
                      })
                    }
                  />
                  <span>/</span>
                  <input
                    aria-label={pick(language, "Montant cible", "Target amount")}
                    type="number"
                    min="0"
                    value={goal.target}
                    onChange={(event) =>
                      updateGoal(goal.id, {
                        target: nonNegative(Number(event.target.value)),
                      })
                    }
                  />
                </div>
                <input
                  aria-label={pick(language, "Contribution mensuelle", "Monthly contribution")}
                  type="number"
                  min="0"
                  value={goal.monthly}
                  onChange={(event) =>
                    updateGoal(goal.id, {
                      monthly: nonNegative(Number(event.target.value)),
                    })
                  }
                />
                <div className={styles.goalActions}>
                  <input
                    aria-label={pick(language, "Horizon en mois", "Horizon in months")}
                    type="number"
                    min="1"
                    value={goal.horizonMonths}
                    onChange={(event) =>
                      updateGoal(goal.id, {
                        horizonMonths: Math.max(
                          1,
                          Math.round(Number(event.target.value) || 1),
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={pick(language, "Supprimer l’objectif", "Delete goal")}
                    onClick={() =>
                      updateFinancialOs((current) => ({
                        ...current,
                        goals: current.goals.filter((item) => item.id !== goal.id),
                      }))
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.metricStrip}>
            <article><span>{pick(language, "Capital suivi", "Tracked capital")}</span><strong>{money(totalGoalCurrent, currency, language)}</strong></article>
            <article><span>{pick(language, "Cibles cumulées", "Combined targets")}</span><strong>{money(totalGoalTarget, currency, language)}</strong></article>
            <article><span>{pick(language, "Contributions / mois", "Contributions / month")}</span><strong>{money(goalOutflows, currency, language)}</strong></article>
          </div>
        </section>
      ) : null}

      {tab === "tax" ? (
        <section className={styles.panel} data-testid="advisor-v5-tax">
          <div className={styles.panelHeading}>
            <div>
              <span>05 · HUB FISCAL CANADIEN</span>
              <h3>{pick(language, "Suivre les espaces que tu connais déjà", "Track contribution room you already know")}</h3>
              <p>{pick(language, "Anatole n’invente pas les droits de cotisation. Entre les montants de tes avis ou dossiers officiels.", "Anatole does not invent contribution room. Enter amounts from your official records.")}</p>
            </div>
            <FileCheck2 size={24} />
          </div>
          <div className={styles.taxGrid}>
            {taxRows.map(([key, label]) => {
              const bucket = os.tax[key];
              const remaining =
                bucket.room == null
                  ? null
                  : Math.max(0, bucket.room - nonNegative(bucket.planned));
              return (
                <article key={key}>
                  <strong>{label}</strong>
                  <label>
                    <span>{pick(language, "Espace disponible", "Available room")}</span>
                    <input
                      type="number"
                      min="0"
                      value={bucket.room ?? ""}
                      onChange={(event) =>
                        updateTax(key, "room", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>{pick(language, "Cotisation planifiée", "Planned contribution")}</span>
                    <input
                      type="number"
                      min="0"
                      value={bucket.planned ?? ""}
                      onChange={(event) =>
                        updateTax(key, "planned", event.target.value)
                      }
                    />
                  </label>
                  <div>
                    <span>{pick(language, "Reste saisi", "Entered remainder")}</span>
                    <b>{money(remaining, currency, language)}</b>
                  </div>
                </article>
              );
            })}
          </div>
          <div className={styles.disclaimer}>
            <ShieldCheck size={14} />
            <span>{pick(language, "Les plafonds légaux et l’admissibilité ne sont pas déduits automatiquement ici. Vérifie les données officielles avant une décision fiscale.", "Legal limits and eligibility are not inferred automatically here. Verify official information before a tax decision.")}</span>
          </div>
        </section>
      ) : null}

      {tab === "debt" ? (
        <section className={styles.panel} data-testid="advisor-v5-debt">
          <div className={styles.panelHeading}>
            <div>
              <span>06 · DEBT CENTER</span>
              <h3>{pick(language, "Mesurer le coût des dettes saisies", "Measure the cost of entered debt")}</h3>
            </div>
            <button type="button" className={styles.addButton} onClick={addDebt}>
              <Plus size={12} />
              {pick(language, "Ajouter une dette", "Add debt")}
            </button>
          </div>
          <div className={styles.debtRows}>
            {os.debts.map((debt) => {
              const payoff = debtPayoffMonths(debt);
              const payoffPlus200 = debtPayoffMonths({
                ...debt,
                monthlyPayment: debt.monthlyPayment + 200,
              });
              return (
                <article key={debt.id}>
                  <input
                    value={debt.label}
                    onChange={(event) =>
                      updateDebt(debt.id, { label: event.target.value })
                    }
                  />
                  <label>
                    <span>{pick(language, "Solde", "Balance")}</span>
                    <input
                      type="number"
                      min="0"
                      value={debt.balance}
                      onChange={(event) =>
                        updateDebt(debt.id, {
                          balance: nonNegative(Number(event.target.value)),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>{pick(language, "Taux %", "Rate %")}</span>
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      value={debt.annualRate}
                      onChange={(event) =>
                        updateDebt(debt.id, {
                          annualRate: nonNegative(Number(event.target.value)),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>{pick(language, "Paiement / mois", "Payment / month")}</span>
                    <input
                      type="number"
                      min="0"
                      value={debt.monthlyPayment}
                      onChange={(event) =>
                        updateDebt(debt.id, {
                          monthlyPayment: nonNegative(Number(event.target.value)),
                        })
                      }
                    />
                  </label>
                  <div className={styles.debtOutcome}>
                    <span>{pick(language, "Intérêt mensuel estimé", "Estimated monthly interest")}</span>
                    <b>{money(debt.balance * debt.annualRate / 100 / 12, currency, language)}</b>
                    <small>
                      {payoff == null
                        ? pick(language, "Échéance N/D au paiement saisi", "Payoff N/A at entered payment")
                        : pick(language, `${payoff} mois estimés`, `${payoff} estimated months`)}
                      {payoff != null && payoffPlus200 != null && payoffPlus200 < payoff
                        ? pick(language, ` · scénario +200 $ : ${payoffPlus200} mois`, ` · +$200 scenario: ${payoffPlus200} months`)
                        : ""}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={pick(language, "Supprimer la dette", "Delete debt")}
                    onClick={() =>
                      updateFinancialOs((current) => ({
                        ...current,
                        debts: current.debts.filter((item) => item.id !== debt.id),
                      }))
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </article>
              );
            })}
            {!os.debts.length ? (
              <div className={styles.emptyState}>{pick(language, "Ajoute une carte, marge, prêt étudiant, auto ou autre dette pour commencer.", "Add a card, line of credit, student loan, auto loan or other debt to begin.")}</div>
            ) : null}
          </div>
          <div className={styles.metricStrip}>
            <article><span>{pick(language, "Solde total", "Total balance")}</span><strong>{money(debtsTotal, currency, language)}</strong></article>
            <article><span>{pick(language, "Taux pondéré", "Weighted rate")}</span><strong>{percent(weightedDebtRate)}</strong></article>
            <article><span>{pick(language, "Intérêt / mois", "Interest / month")}</span><strong>{money(monthlyInterest, currency, language)}</strong></article>
            <article><span>{pick(language, "Paiements / mois", "Payments / month")}</span><strong>{money(debtPayments, currency, language)}</strong></article>
          </div>
        </section>
      ) : null}

      {tab === "mortgage" ? (
        <section className={styles.panel} data-testid="advisor-v5-mortgage">
          <div className={styles.panelHeading}>
            <div>
              <span>07 · MORTGAGE LAB</span>
              <h3>{pick(language, "Achat, coût mensuel et renouvellement", "Purchase, monthly carrying cost and renewal")}</h3>
              <p>{pick(language, "Calcul indicatif à partir des hypothèses saisies; ce n’est ni une approbation ni un taux offert.", "Illustrative calculation from entered assumptions; it is neither an approval nor an offered rate.")}</p>
            </div>
            <Home size={24} />
          </div>
          <div className={styles.formGrid}>
            {([
              ["purchasePrice", pick(language, "Prix d’achat", "Purchase price")],
              ["downPayment", pick(language, "Mise de fonds", "Down payment")],
              ["annualRate", pick(language, "Taux annuel %", "Annual rate %")],
              ["amortizationYears", pick(language, "Amortissement (ans)", "Amortization (years)")],
              ["annualPropertyTax", pick(language, "Taxes foncières / an", "Property tax / year")],
              ["monthlyCondo", pick(language, "Frais de condo / mois", "Condo fees / month")],
              ["monthlyInsurance", pick(language, "Assurance / mois", "Insurance / month")],
              ["annualMaintenance", pick(language, "Entretien / an", "Maintenance / year")],
              ["renewalAfterYears", pick(language, "Renouvellement dans (ans)", "Renewal in (years)")],
              ["renewalRate", pick(language, "Taux au renouvellement %", "Renewal rate %")],
            ] as Array<[keyof MortgageState, string]>).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  step={
                    key === "annualRate" || key === "renewalRate"
                      ? ".01"
                      : "1"
                  }
                  value={mortgage[key] ?? ""}
                  onChange={(event) =>
                    updateMortgage(key, event.target.value)
                  }
                />
              </label>
            ))}
          </div>
          <div className={styles.metricStrip}>
            <article><span>{pick(language, "Capital hypothécaire", "Mortgage principal")}</span><strong>{money(mortgagePrincipal, currency, language)}</strong></article>
            <article><span>{pick(language, "Paiement estimé", "Estimated payment")}</span><strong>{money(mortgagePrincipal > 0 ? monthlyMortgage : null, currency, language)}</strong></article>
            <article><span>{pick(language, "Coût logement / mois", "Housing cost / month")}</span><strong>{money(mortgagePrincipal > 0 ? housingMonthly : null, currency, language)}</strong></article>
            <article><span>{pick(language, "Solde au renouvellement", "Balance at renewal")}</span><strong>{money(mortgagePrincipal > 0 ? balanceAtRenewal : null, currency, language)}</strong></article>
            <article><span>{pick(language, "Paiement après renouvellement", "Payment after renewal")}</span><strong>{money(renewalPayment, currency, language)}</strong></article>
            <article><span>{pick(language, "Scénario +2 points", "Scenario +2 points")}</span><strong>{money(mortgagePrincipal > 0 ? mortgagePayment(balanceAtRenewal, mortgageRate + 2, remainingAmortization) : null, currency, language)}</strong></article>
          </div>
          <Link
            className={styles.shoppingLink}
            href="/assistant/magasiner?category=mortgage"
          >
            <WalletCards size={14} />
            {pick(language, "Comparer les offres hypothécaires avec Magasiner", "Compare mortgage offers with Shopping")}
            <ArrowRight size={13} />
          </Link>
        </section>
      ) : null}

      {tab === "events" ? (
        <section className={styles.panel} data-testid="advisor-v5-events">
          <div className={styles.panelHeading}>
            <div>
              <span>08 · LIFE EVENTS ENGINE</span>
              <h3>{pick(language, "Mettre les événements dans le temps", "Put life events on the timeline")}</h3>
            </div>
            <button type="button" className={styles.addButton} onClick={addEvent}>
              <Plus size={12} />
              {pick(language, "Ajouter", "Add")}
            </button>
          </div>
          <div className={styles.eventRows}>
            {os.events.map((event) => (
              <article key={event.id}>
                <input
                  value={event.label}
                  onChange={(change) =>
                    updateEvent(event.id, { label: change.target.value })
                  }
                />
                <label>
                  <span>{pick(language, "Dans (mois)", "In (months)")}</span>
                  <input
                    type="number"
                    min="0"
                    value={event.monthOffset}
                    onChange={(change) =>
                      updateEvent(event.id, {
                        monthOffset: Math.max(
                          0,
                          Math.round(Number(change.target.value) || 0),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  <span>{pick(language, "Coût unique", "One-time cost")}</span>
                  <input
                    type="number"
                    min="0"
                    value={event.oneTimeCost}
                    onChange={(change) =>
                      updateEvent(event.id, {
                        oneTimeCost: nonNegative(Number(change.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  <span>{pick(language, "Coût / mois", "Cost / month")}</span>
                  <input
                    type="number"
                    min="0"
                    value={event.recurringMonthlyCost}
                    onChange={(change) =>
                      updateEvent(event.id, {
                        recurringMonthlyCost: nonNegative(Number(change.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  <span>{pick(language, "Δ revenu / mois", "Δ income / month")}</span>
                  <input
                    type="number"
                    value={event.monthlyIncomeDelta}
                    onChange={(change) =>
                      updateEvent(event.id, {
                        monthlyIncomeDelta: finite(Number(change.target.value)),
                      })
                    }
                  />
                </label>
                <div className={styles.eventDate}>
                  <CalendarClock size={13} />
                  <span>{futureMonthLabel(event.monthOffset, language)}</span>
                </div>
                <button
                  type="button"
                  aria-label={pick(language, "Supprimer l’événement", "Delete event")}
                  onClick={() =>
                    updateFinancialOs((current) => ({
                      ...current,
                      events: current.events.filter((item) => item.id !== event.id),
                    }))
                  }
                >
                  <Trash2 size={12} />
                </button>
              </article>
            ))}
            {!os.events.length ? (
              <div className={styles.emptyState}>{pick(language, "Ajoute une propriété, un enfant, des études, une voiture, une interruption de revenu ou tout autre événement.", "Add a home purchase, child, education, vehicle, income interruption or any other event.")}</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "brief" ? (
        <section className={styles.panel} data-testid="advisor-v5-brief">
          <div className={styles.panelHeading}>
            <div>
              <span>09 · FINANCIAL BRIEF</span>
              <h3>{pick(language, "Ce qui a du poids dans ton modèle aujourd’hui", "What carries weight in your model today")}</h3>
              <p>{pick(language, "Le brief décrit les données et scénarios enregistrés. Il ne choisit pas une action à ta place.", "The brief describes saved data and scenarios. It does not choose an action for you.")}</p>
            </div>
            <Bell size={24} />
          </div>
          <div className={styles.briefGrid}>
            {briefItems.map((item, index) => (
              <article key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
              </article>
            ))}
          </div>
          <div className={styles.briefFooter}>
            <Gauge size={15} />
            <span>{pick(language, `${portfolioCount} position(s) de portefeuille sont reliées au compte; les valeurs du portefeuille ne sont pas automatiquement ajoutées au patrimoine pour éviter le double comptage.`, `${portfolioCount} portfolio position(s) are linked to the account; portfolio values are not automatically added to net worth to avoid double counting.`)}</span>
          </div>
        </section>
      ) : null}

      {tab === "quality" ? (
        <section className={styles.panel} data-testid="advisor-v5-quality">
          <div className={styles.panelHeading}>
            <div>
              <span>10 · EXPLAINABILITY + DATA QUALITY</span>
              <h3>{pick(language, "D’où vient chaque chiffre ?", "Where does each number come from?")}</h3>
            </div>
            <Database size={24} />
          </div>
          <div className={styles.qualityTable}>
            <div className={styles.qualityHead}>
              <span>{pick(language, "Mesure", "Metric")}</span>
              <span>{pick(language, "Valeur", "Value")}</span>
              <span>{pick(language, "Source", "Source")}</span>
              <span>{pick(language, "Statut", "Status")}</span>
              <span>{pick(language, "Méthode", "Method")}</span>
            </div>
            {qualityRows.map((row) => (
              <article key={row.label}>
                <strong>{row.label}</strong>
                <b>{row.value}</b>
                <span>{row.source}</span>
                <span className={row.status === "N/D" ? styles.nd : styles.known}>
                  {row.status}
                </span>
                <small>{row.formula}</small>
              </article>
            ))}
          </div>
          <div className={styles.disclaimer}>
            <ShieldCheck size={14} />
            <span>{pick(language, "Une valeur N/D reste N/D. Les calculs affichés sont des simulations descriptives basées sur les hypothèses saisies.", "An N/A value stays N/A. Displayed calculations are descriptive simulations based on entered assumptions.")}</span>
          </div>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <div>
          <ShieldCheck size={14} />
          <span>{pick(language, "Synchronisé via le workspace Anatole lorsqu’un compte est connecté.", "Synced through the Anatole workspace when an account is signed in.")}</span>
        </div>
        {dashboardMode && state.goals.length ? (
          <button
            type="button"
            onClick={() => onApplyProfile(state.goals[state.goals.length - 1].profile)}
          >
            <Target size={13} />
            {pick(language, "Réactiver le dernier objectif V4", "Reactivate latest V4 goal")}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
