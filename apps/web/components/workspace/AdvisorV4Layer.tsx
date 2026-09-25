"use client";

import Link from "next/link";
import {
  ArrowRight, Bell, CalendarClock, CircleDollarSign, GitBranch,
  Landmark, Plus, Save, ShieldCheck, Sparkles, Target, Trash2, WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type { AdvisorProfile } from "@/lib/types";
import styles from "./AdvisorV4Layer.module.css";

const STATE_KEY = "anatole:advisor-workspace:v4";

type Twin = {
  monthlyIncome: number | null;
  discretionaryExpenses: number | null;
  monthlyDebtPayments: number | null;
  totalDebt: number | null;
  otherAssets: number | null;
};

type LifeEvent = {
  id: string;
  label: string;
  amount: number;
  monthOffset: number;
  recurringMonthly: number;
};

type CalendarItem = {
  id: string;
  label: string;
  date: string;
  amount: number;
};

type Snapshot = {
  date: string;
  savings: number;
  target: number;
  monthly: number;
};

type SavedGoal = {
  id: string;
  name: string;
  profile: AdvisorProfile;
};

type V4State = {
  twin: Twin;
  events: LifeEvent[];
  calendar: CalendarItem[];
  history: Snapshot[];
  goals: SavedGoal[];
};

const EMPTY_TWIN: Twin = {
  monthlyIncome: null,
  discretionaryExpenses: null,
  monthlyDebtPayments: null,
  totalDebt: null,
  otherAssets: null,
};

const EMPTY_STATE: V4State = {
  twin: EMPTY_TWIN,
  events: [],
  calendar: [],
  history: [],
  goals: [],
};

function readState(): V4State {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<V4State>;
    return {
      twin: { ...EMPTY_TWIN, ...(parsed.twin ?? {}) },
      events: Array.isArray(parsed.events) ? parsed.events.slice(-12) : [],
      calendar: Array.isArray(parsed.calendar) ? parsed.calendar.slice(-36) : [],
      history: Array.isArray(parsed.history) ? parsed.history.slice(-36) : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals.slice(-6) : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function persist(state: V4State): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("anatole-workspace-sync-applied"));
}

function safe(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function money(
  value: number | null | undefined,
  currency: string,
  language: AnatoleLanguage,
): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function monthLabel(monthOffset: number, language: AnatoleLanguage): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset);
  return new Intl.DateTimeFormat(localeFor(language), {
    month: "short",
    year: "numeric",
  }).format(date);
}

function shoppingCategory(profile: AdvisorProfile): string {
  if (profile.goal_type === "home") return "mortgage";
  if (profile.goal_type === "education") return "student_loan";
  if (profile.goal_type === "reserve") return "banking";
  if (profile.goal_type === "flexible") return "personal_loan";
  return "banking";
}

function parseDecision(
  query: string,
  language: AnatoleLanguage,
): Omit<LifeEvent, "id"> {
  const normalized = query.toLowerCase();
  const amountMatch = normalized.match(/(\d[\d\s,.]*)\s*\$?/);
  const amount = amountMatch
    ? Number(amountMatch[1].replace(/\s/g, "").replace(",", "."))
    : 0;
  const yearsMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:an|ans|year|years)/);
  const monthOffset = Math.round(
    (yearsMatch ? Number(yearsMatch[1].replace(",", ".")) : 3) * 12,
  );

  if (/maison|propri|home|mortgage|hypoth/.test(normalized)) {
    return { label: pick(language, "Projet immobilier", "Home purchase"), amount, monthOffset, recurringMonthly: 0 };
  }
  if (/enfant|bébé|baby|child/.test(normalized)) {
    return { label: pick(language, "Arrivée d’un enfant", "New child"), amount, monthOffset, recurringMonthly: amount ? Math.round(amount / 12) : 1000 };
  }
  if (/voiture|auto|car/.test(normalized)) {
    return { label: pick(language, "Achat automobile", "Vehicle purchase"), amount, monthOffset, recurringMonthly: 0 };
  }
  if (/étude|universit|education|school/.test(normalized)) {
    return { label: pick(language, "Retour aux études", "Education"), amount, monthOffset, recurringMonthly: 0 };
  }
  if (/perte.*revenu|chômage|income loss|job loss/.test(normalized)) {
    return { label: pick(language, "Interruption de revenu", "Income interruption"), amount, monthOffset, recurringMonthly: amount };
  }
  return { label: pick(language, "Décision personnalisée", "Custom decision"), amount, monthOffset, recurringMonthly: 0 };
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
  const [state, setState] = useState<V4State>(readState);
  const [decision, setDecision] = useState("");
  const [preview, setPreview] = useState<Omit<LifeEvent, "id"> | null>(null);
  const [showBalance, setShowBalance] = useState(false);

  const currency = profile.currency;
  const current = safe(profile.current_savings);
  const target = safe(profile.target_amount);
  const monthly = safe(profile.monthly_contribution);
  const essential = safe(profile.essential_monthly_expenses);
  const reserve = safe(profile.liquid_reserve);
  const assets = current + safe(state.twin.otherAssets);
  const debt = safe(state.twin.totalDebt);
  const netWorth =
    state.twin.otherAssets == null && state.twin.totalDebt == null
      ? null
      : assets - debt;
  const freeFlow =
    state.twin.monthlyIncome == null
      ? null
      : state.twin.monthlyIncome -
        essential -
        safe(state.twin.discretionaryExpenses) -
        safe(state.twin.monthlyDebtPayments) -
        monthly;

  useEffect(() => {
    if (!profile.goal_type || profile.current_savings == null) return;
    const today = new Date().toISOString().slice(0, 10);
    const nextSnapshot = { date: today, savings: current, target, monthly };
    const last = state.history[state.history.length - 1];
    if (
      last?.date === today &&
      last.savings === current &&
      last.target === target &&
      last.monthly === monthly
    ) {
      return;
    }
    const next = {
      ...state,
      history: [
        ...state.history.filter((item) => item.date !== today),
        nextSnapshot,
      ].slice(-36),
    };
    setState(next);
    persist(next);
  }, [current, monthly, profile.current_savings, profile.goal_type, state, target]);

  const update = (next: V4State) => {
    setState(next);
    persist(next);
  };

  const updateTwin = (key: keyof Twin, raw: string) => {
    const value =
      raw === "" || !Number.isFinite(Number(raw))
        ? null
        : Math.max(0, Number(raw));
    update({ ...state, twin: { ...state.twin, [key]: value } });
  };

  const addDecision = () => {
    if (!preview) return;
    update({
      ...state,
      events: [...state.events, { ...preview, id: `event-${Date.now()}` }].slice(-12),
    });
    setDecision("");
    setPreview(null);
  };

  const addCalendarItem = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    update({
      ...state,
      calendar: [
        ...state.calendar,
        {
          id: `calendar-${Date.now()}`,
          label: pick(language, "Nouvelle échéance", "New milestone"),
          date: date.toISOString().slice(0, 10),
          amount: 0,
        },
      ].slice(-36),
    });
  };

  const saveGoal = () => {
    if (!profile.goal_type) return;
    update({
      ...state,
      goals: [
        ...state.goals,
        {
          id: `goal-${Date.now()}`,
          name: profile.goal_name?.trim() || goalLabel,
          profile: { ...profile },
        },
      ].slice(-6),
    });
  };

  const previous = state.history[state.history.length - 2];
  const latest = state.history[state.history.length - 1];
  const delta = previous && latest ? latest.savings - previous.savings : null;
  const reserveMonths = essential > 0 ? reserve / essential : null;

  const signals = [
    delta != null && delta !== 0
      ? pick(
          language,
          `Capital déclaré : ${delta >= 0 ? "+" : ""}${money(delta, currency, language)} depuis le snapshot précédent.`,
          `Declared capital: ${delta >= 0 ? "+" : ""}${money(delta, currency, language)} since the prior snapshot.`,
        )
      : null,
    reserveMonths != null && reserveMonths < 3
      ? pick(
          language,
          `Réserve déclarée : ${reserveMonths.toFixed(1)} mois de dépenses essentielles.`,
          `Declared reserve: ${reserveMonths.toFixed(1)} months of essential expenses.`,
        )
      : null,
    state.events.length
      ? pick(
          language,
          `${state.events.length} événement(s) de vie intégré(s) au modèle.`,
          `${state.events.length} life event(s) integrated into the model.`,
        )
      : null,
  ].filter((item): item is string => item !== null);

  return (
    <section className={styles.layer} data-testid="advisor-v4-layer">
      <header className={styles.topbar}>
        <div>
          <span className={styles.eyebrow}><Sparkles size={13} />ANATOLE CONSEIL · V4</span>
          <h2>{pick(language, "Le système financier personnel d’Anatole", "Anatole personal financial system")}</h2>
          <p>
            {pick(
              language,
              "Le plan, le bilan, le cash-flow, les objectifs et les événements de vie partagent maintenant le même contexte.",
              "Plan, balance sheet, cash flow, goals and life events now share the same context.",
            )}
          </p>
        </div>
        <button type="button" onClick={() => setShowBalance((value) => !value)}>
          <Landmark size={13} />
          {pick(language, "Bilan Anatole", "Anatole Balance")}
        </button>
      </header>

      {signals.length ? (
        <div className={styles.brief}>
          <Bell size={14} />
          <strong>{pick(language, "Depuis ta dernière visite", "Since your last visit")}</strong>
          {signals.slice(0, 3).map((signal) => <span key={signal}>{signal}</span>)}
        </div>
      ) : null}

      <section className={styles.decision}>
        <div>
          <span className={styles.eyebrow}>{pick(language, "POSE UNE DÉCISION À ANATOLE", "ASK ANATOLE A DECISION")}</span>
          <h3>{pick(language, "Et si… ?", "What if…?")}</h3>
          <p>
            {pick(
              language,
              "Ex. « Et si j’achetais une maison à 550 000 $ dans 3 ans ? » Anatole extrait seulement ce que tu as réellement écrit.",
              "Example: “What if I bought a $550,000 home in 3 years?” Anatole extracts only what you actually wrote.",
            )}
          </p>
        </div>
        <div className={styles.composer}>
          <textarea
            data-testid="advisor-decision-input"
            value={decision}
            onChange={(event) => {
              const value = event.target.value;
              setDecision(value);
              setPreview(value.trim() ? parseDecision(value, language) : null);
            }}
            placeholder={pick(language, "Décris une décision financière…", "Describe a financial decision…")}
          />
          <button type="button" disabled={!preview} onClick={addDecision}>
            {pick(language, "Ajouter au modèle", "Add to model")}
            <ArrowRight size={12} />
          </button>
        </div>
        {preview ? (
          <div className={styles.preview} data-testid="advisor-decision-preview">
            <strong>{preview.label}</strong>
            <span>{preview.amount ? money(preview.amount, currency, language) : "N/D"}</span>
            <span>{monthLabel(preview.monthOffset, language)}</span>
          </div>
        ) : null}
      </section>

      <div className={styles.kpis}>
        <article><span>{pick(language, "Valeur nette partielle", "Partial net worth")}</span><strong>{money(netWorth, currency, language)}</strong></article>
        <article><span>{pick(language, "Flux mensuel libre", "Monthly free cash flow")}</span><strong>{money(freeFlow, currency, language)}</strong></article>
        <article><span>{pick(language, "Réserve", "Reserve")}</span><strong>{reserveMonths == null ? "N/D" : `${reserveMonths.toFixed(1)} ${pick(language, "mois", "months")}`}</strong></article>
        <article><span>{pick(language, "Objectifs enregistrés", "Saved goals")}</span><strong>{state.goals.length}</strong></article>
      </div>

      <section className={styles.graph}>
        <div className={styles.heading}>
          <div><span>FINANCIAL GRAPH</span><strong>{pick(language, "Ce qui alimente et contraint le plan", "What feeds and constrains the plan")}</strong></div>
        </div>
        <div className={styles.nodes}>
          <article><CircleDollarSign size={15} /><span>{pick(language, "Revenu", "Income")}</span><b>{money(state.twin.monthlyIncome, currency, language)}</b></article>
          <i>→</i>
          <article className={styles.center}><Target size={16} /><span>{profile.goal_name || goalLabel}</span><b>{money(current, currency, language)} / {money(target, currency, language)}</b></article>
          <i>←</i>
          <article><WalletCards size={15} /><span>{pick(language, "Portefeuille", "Portfolio")}</span><b>{portfolioCount}</b></article>
          <article><ShieldCheck size={15} /><span>{pick(language, "Réserve", "Reserve")}</span><b>{money(reserve, currency, language)}</b></article>
          <i>→</i>
          <article><GitBranch size={15} /><span>{pick(language, "Événements", "Events")}</span><b>{state.events.length}</b></article>
          <i>→</i>
          <article><CalendarClock size={15} /><span>{pick(language, "Échéances", "Milestones")}</span><b>{state.calendar.length}</b></article>
        </div>
      </section>

      {showBalance ? (
        <section className={styles.balance} data-testid="advisor-v4-balance">
          <div className={styles.heading}>
            <div><span>{pick(language, "BILAN + CASH-FLOW", "BALANCE + CASH FLOW")}</span><strong>{pick(language, "Uniquement les valeurs que tu renseignes", "Only values you provide")}</strong></div>
          </div>
          <div className={styles.inputs}>
            <label><span>{pick(language, "Revenu mensuel net", "Net monthly income")}</span><input type="number" min="0" value={state.twin.monthlyIncome ?? ""} onChange={(event) => updateTwin("monthlyIncome", event.target.value)} /></label>
            <label><span>{pick(language, "Dépenses discrétionnaires", "Discretionary expenses")}</span><input type="number" min="0" value={state.twin.discretionaryExpenses ?? ""} onChange={(event) => updateTwin("discretionaryExpenses", event.target.value)} /></label>
            <label><span>{pick(language, "Paiements de dettes", "Debt payments")}</span><input type="number" min="0" value={state.twin.monthlyDebtPayments ?? ""} onChange={(event) => updateTwin("monthlyDebtPayments", event.target.value)} /></label>
            <label><span>{pick(language, "Dette totale", "Total debt")}</span><input type="number" min="0" value={state.twin.totalDebt ?? ""} onChange={(event) => updateTwin("totalDebt", event.target.value)} /></label>
            <label><span>{pick(language, "Autres actifs", "Other assets")}</span><input type="number" min="0" value={state.twin.otherAssets ?? ""} onChange={(event) => updateTwin("otherAssets", event.target.value)} /></label>
          </div>
        </section>
      ) : null}

      <section className={styles.calendar}>
        <div className={styles.heading}>
          <div><span>{pick(language, "CALENDRIER FINANCIER", "FINANCIAL CALENDAR")}</span><strong>{pick(language, "Événements, renouvellements et gros mouvements", "Events, renewals and major cash movements")}</strong></div>
          <button type="button" onClick={addCalendarItem}><Plus size={12} />{pick(language, "Ajouter", "Add")}</button>
        </div>
        {state.calendar.length ? (
          <div className={styles.calendarRows}>
            {state.calendar.slice().sort((a, b) => a.date.localeCompare(b.date)).map((item) => (
              <article key={item.id}>
                <input
                  value={item.label}
                  onChange={(event) =>
                    update({
                      ...state,
                      calendar: state.calendar.map((entry) =>
                        entry.id === item.id ? { ...entry, label: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <input
                  type="date"
                  value={item.date}
                  onChange={(event) =>
                    update({
                      ...state,
                      calendar: state.calendar.map((entry) =>
                        entry.id === item.id ? { ...entry, date: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <input
                  type="number"
                  value={item.amount}
                  onChange={(event) =>
                    update({
                      ...state,
                      calendar: state.calendar.map((entry) =>
                        entry.id === item.id ? { ...entry, amount: Number(event.target.value) || 0 } : entry,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  aria-label={pick(language, "Supprimer", "Delete")}
                  onClick={() =>
                    update({
                      ...state,
                      calendar: state.calendar.filter((entry) => entry.id !== item.id),
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>{pick(language, "Aucune échéance ajoutée pour l’instant.", "No milestone added yet.")}</p>
        )}
      </section>

      {dashboardMode ? (
        <section className={styles.goals}>
          <div className={styles.heading}>
            <div><span>{pick(language, "OBJECTIFS PERSISTANTS", "PERSISTENT GOALS")}</span><strong>{pick(language, "Passe d’un projet à l’autre", "Switch between projects")}</strong></div>
            <button type="button" onClick={saveGoal}><Save size={12} />{pick(language, "Enregistrer l’actuel", "Save current")}</button>
          </div>
          <div className={styles.goalRows}>
            {state.goals.map((goal) => (
              <article key={goal.id}>
                <strong>{goal.name}</strong>
                <span>{money(goal.profile.current_savings, goal.profile.currency, language)} / {money(goal.profile.target_amount, goal.profile.currency, language)}</span>
                <button type="button" onClick={() => onApplyProfile(goal.profile)}>{pick(language, "Activer", "Activate")}</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.footer}>
        <Link href={`/assistant/magasiner?category=${shoppingCategory(profile)}`}>
          <WalletCards size={14} />
          {pick(language, "Magasiner avec le contexte du plan", "Shop with plan context")}
          <ArrowRight size={12} />
        </Link>
        <span>
          <ShieldCheck size={13} />
          {pick(
            language,
            "Connecté : l’état V4 est inclus dans le workspace synchronisé. Anonyme : il reste sur cet appareil.",
            "Signed in: V4 state is included in the synced workspace. Anonymous: it stays on this device.",
          )}
        </span>
      </div>
    </section>
  );
}
