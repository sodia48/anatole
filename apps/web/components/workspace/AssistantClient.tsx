"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  CircleHelp,
  Database,
  LockKeyhole,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { askAnatole, getAdvisorPlan } from "@/lib/api";
import type {
  AdvisorGoalType,
  AdvisorLevel,
  AdvisorPlan,
  AdvisorProfile,
  AssistantResponse,
  PortfolioPositionInput,
} from "@/lib/types";

import { WORKSPACE_SYNC_EVENT } from "@/lib/workspace-sync";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./Workspace.module.css";

const PORTFOLIO_KEY = "anatole:portfolio:v1";
const ADVISOR_PROFILE_KEY = "anatole:advisor-profile:v1";

const EMPTY_PROFILE: AdvisorProfile = {
  currency: "CAD",
  goal_type: null,
  goal_name: null,
  horizon_years: null,
  target_amount: null,
  current_savings: null,
  monthly_contribution: null,
  essential_monthly_expenses: null,
  liquid_reserve: null,
  high_interest_debt: null,
  income_stability: null,
  liquidity_need: null,
  loss_comfort: null,
  experience: null,
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: AssistantResponse;
  createdAt: number;
};

function messageTimestamp(): number {
  return Date.now();
}

type NumericProfileKey =
  | "horizon_years"
  | "target_amount"
  | "current_savings"
  | "monthly_contribution"
  | "essential_monthly_expenses"
  | "liquid_reserve";

type StepNumber = 1 | 2 | 3 | 4;

const STEPS: Array<{
  number: StepNumber;
  label: string;
  description: string;
}> = [
  { number: 1, label: "Ton objectif", description: "Ce que tu veux accomplir" },
  { number: 2, label: "Ta base", description: "Ta marge financière" },
  { number: 3, label: "Ton confort", description: "Ta relation au risque" },
  { number: 4, label: "Ton plan", description: "Ce que les données montrent" },
];

const STARTERS = [
  "Explique-moi mon plan simplement",
  "Que dois-je surveiller en priorité ?",
  "Montre-moi l’effet d’une baisse de 20 %",
  "Pourquoi mon score n’est-il pas plus élevé ?",
];

const GOALS: Array<{
  value: AdvisorGoalType;
  label: string;
  detail: string;
}> = [
  { value: "retirement", label: "Préparer ma retraite", detail: "Construire un capital sur plusieurs années" },
  { value: "home", label: "Acheter une propriété", detail: "Préparer une mise de fonds ou un achat" },
  { value: "education", label: "Financer des études", detail: "Prévoir des dépenses de formation" },
  { value: "reserve", label: "Créer une réserve", detail: "Renforcer ma sécurité financière" },
  { value: "wealth", label: "Faire croître mon capital", detail: "Suivre un objectif de long terme" },
  { value: "flexible", label: "Autre projet", detail: "Définir un objectif personnalisé" },
];

const INCOME_CHOICES: Array<{
  value: AdvisorLevel;
  label: string;
  detail: string;
}> = [
  { value: "low", label: "Irréguliers", detail: "Mes revenus changent beaucoup ou sont incertains" },
  { value: "medium", label: "Assez réguliers", detail: "Ils sont prévisibles avec quelques variations" },
  { value: "high", label: "Très réguliers", detail: "Je peux compter sur des revenus stables" },
];

const LIQUIDITY_CHOICES: Array<{
  value: AdvisorLevel;
  label: string;
  detail: string;
}> = [
  { value: "low", label: "Pas bientôt", detail: "Cet argent peut rester disponible à long terme" },
  { value: "medium", label: "Peut-être", detail: "Une partie pourrait servir dans quelques années" },
  { value: "high", label: "Oui, bientôt", detail: "Je pourrais devoir utiliser cet argent rapidement" },
];

const LOSS_CHOICES: Array<{
  value: AdvisorLevel;
  label: string;
  detail: string;
}> = [
  { value: "low", label: "Très inconfortable", detail: "Une baisse importante me pousserait à réagir vite" },
  { value: "medium", label: "Inconfortable mais calme", detail: "Je pourrais suivre un plan malgré la baisse" },
  { value: "high", label: "À l’aise avec les variations", detail: "Je peux accepter de fortes fluctuations temporaires" },
];

const EXPERIENCE_CHOICES: Array<{
  value: Exclude<AdvisorProfile["experience"], null>;
  label: string;
  detail: string;
}> = [
  { value: "beginner", label: "Je débute", detail: "Je veux des explications simples" },
  { value: "intermediate", label: "Je connais les bases", detail: "Je comprends les notions principales" },
  { value: "advanced", label: "Je suis expérimenté", detail: "Je suis à l’aise avec l’analyse du risque" },
];

function loadPortfolio(): PortfolioPositionInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PORTFOLIO_KEY);
    const parsed = raw ? (JSON.parse(raw) as PortfolioPositionInput[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadProfile(): AdvisorProfile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(ADVISOR_PROFILE_KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as Partial<AdvisorProfile>;
    return { ...EMPTY_PROFILE, ...parsed };
  } catch {
    return EMPTY_PROFILE;
  }
}

function toneClass(tone: string): string {
  if (tone === "positive") return styles.positive;
  if (tone === "negative") return styles.negative;
  if (tone === "info") return styles.info;
  return "";
}

function formatMoney(value: number | null, currency: string, language: AnatoleLanguage): string {
  if (value === null || !Number.isFinite(value)) return pick(language, "Non calculé", "Not calculated");
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function scoreLabel(score: number, language: AnatoleLanguage): string {
  if (score >= 75) return pick(language, "Base solide", "Solid foundation");
  if (score >= 50) return pick(language, "Plan en construction", "Plan in progress");
  return pick(language, "Bases à renforcer", "Foundation to strengthen");
}

function capacityLabel(value: AdvisorPlan["capacity_profile"] | undefined, language: AnatoleLanguage): string {
  if (value === "Dynamique") return pick(language, "Bonne marge face aux variations", "Strong capacity for fluctuations");
  if (value === "Équilibrée") return pick(language, "Marge moyenne face aux variations", "Moderate capacity for fluctuations");
  if (value === "Prudente") return pick(language, "Marge limitée face aux variations", "Limited capacity for fluctuations");
  return pick(language, "À déterminer", "To be determined");
}

const ASSISTANT_EN: Record<string, string> = {
  "Ton objectif": "Your goal", "Ce que tu veux accomplir": "What you want to achieve",
  "Ta base": "Your foundation", "Ta marge financière": "Your financial capacity",
  "Ton confort": "Your comfort", "Ta relation au risque": "Your relationship with risk",
  "Ton plan": "Your plan", "Ce que les données montrent": "What the data shows",
  "Préparer ma retraite": "Prepare for retirement", "Construire un capital sur plusieurs années": "Build capital over several years",
  "Acheter une propriété": "Buy a home", "Préparer une mise de fonds ou un achat": "Prepare a down payment or purchase",
  "Financer des études": "Fund education", "Prévoir des dépenses de formation": "Plan for education expenses",
  "Créer une réserve": "Build a reserve", "Renforcer ma sécurité financière": "Strengthen financial security",
  "Faire croître mon capital": "Grow my capital", "Suivre un objectif de long terme": "Track a long-term goal",
  "Autre projet": "Another project", "Définir un objectif personnalisé": "Define a custom goal",
  "Irréguliers": "Irregular", "Mes revenus changent beaucoup ou sont incertains": "My income changes substantially or is uncertain",
  "Assez réguliers": "Fairly regular", "Ils sont prévisibles avec quelques variations": "It is predictable with some variation",
  "Très réguliers": "Very regular", "Je peux compter sur des revenus stables": "I can rely on stable income",
  "Pas bientôt": "Not soon", "Cet argent peut rester disponible à long terme": "This money can remain available for the long term",
  "Peut-être": "Possibly", "Une partie pourrait servir dans quelques années": "Part of it may be needed in a few years",
  "Oui, bientôt": "Yes, soon", "Je pourrais devoir utiliser cet argent rapidement": "I may need to use this money soon",
  "Très inconfortable": "Very uncomfortable", "Une baisse importante me pousserait à réagir vite": "A large decline would make me react quickly",
  "Inconfortable mais calme": "Uncomfortable but calm", "Je pourrais suivre un plan malgré la baisse": "I could follow a plan despite the decline",
  "À l’aise avec les variations": "Comfortable with fluctuations", "Je peux accepter de fortes fluctuations temporaires": "I can accept large temporary fluctuations",
  "Je débute": "I am a beginner", "Je veux des explications simples": "I want simple explanations",
  "Je connais les bases": "I know the basics", "Je comprends les notions principales": "I understand the main concepts",
  "Je suis expérimenté": "I am experienced", "Je suis à l’aise avec l’analyse du risque": "I am comfortable with risk analysis",
};

function advisorText(value: string, language: AnatoleLanguage): string {
  return pick(language, value, ASSISTANT_EN[value] ?? value);
}

function priorityCopy(priority: AdvisorPlan["priorities"][number], language: AnatoleLanguage) {
  if (language === "fr") return priority;
  const copies: Record<string, { title: string; detail: string; action: string }> = {
    profile: { title: "Complete the decision framework", detail: "Missing goals, horizon, or constraints limit the assessment.", action: "Complete the remaining profile fields." },
    debt_status: { title: "Clarify debt constraints", detail: "The profile does not yet indicate whether high-cost debt exists.", action: "Complete this field to avoid overstating available risk capacity." },
    debt: { title: "Isolate expensive-debt constraints", detail: "High-interest debt can reduce the capacity to absorb a market decline.", action: "Review its cost and schedule before increasing risk exposure." },
    reserve: { title: "Strengthen liquidity capacity", detail: "The declared reserve or essential expenses require review.", action: "Separate short-term capital from long-term capital." },
    contribution: { title: "Define a contribution schedule", detail: "The plan has no recurring contribution declared.", action: "Test several monthly amounts in the scenarios without selecting a product." },
    concentration: { title: "Review concentration", detail: "A small number of positions represent a large share of the portfolio.", action: "Evaluate adverse scenarios before any hypothetical change." },
    portfolio_risk: { title: "Document the risk budget", detail: "Observed portfolio risk should be compared with horizon and liquidity.", action: "Compare observed risk with stated capacity and comfort." },
    review: { title: "Maintain a review discipline", detail: "No priority constraint is detected in the declared information.", action: "Schedule periodic reviews of goals, concentration, and gaps." },
  };
  return { ...priority, ...(copies[priority.key] ?? { title: "Review this planning priority", detail: "This item affects the current plan.", action: "Review the underlying inputs before making a decision." }) };
}

function dimensionCopy(dimension: AdvisorPlan["risk_dimensions"][number], language: AnatoleLanguage) {
  if (language === "fr") return dimension;
  const copies: Record<string, { label: string; detail: string }> = {
    horizon: { label: "Horizon", detail: "The time horizon affects the capacity to recover from fluctuations." },
    income_stability: { label: "Income stability", detail: "Stable liquidity increases the capacity to navigate an adverse period." },
    liquidity: { label: "Liquidity need", detail: "Short-term funds should remain separate from capital exposed to markets." },
    loss_comfort: { label: "Comfort with declines", detail: "This reflects stated comfort and does not replace actual financial capacity." },
  };
  const value = ({ "À compléter": "To complete", Faible: "Low", Moyenne: "Medium", Moyen: "Medium", Élevée: "High", Élevé: "High" } as Record<string, string>)[dimension.value] ?? dimension.value.replace("ans", "years").replace("an", "year");
  return { ...dimension, value, ...(copies[dimension.key] ?? {}) };
}

function riskLevelLabel(value: string | null | undefined, language: AnatoleLanguage): string | null {
  if (!value) return null;
  if (language === "fr") return value;
  return ({ Faible: "Low", Modéré: "Moderate", Élevé: "High", "Très élevé": "Very high" } as Record<string, string>)[value] ?? value;
}

function priorityClass(level: "low" | "medium" | "high"): string {
  if (level === "high") return styles.priorityHigh;
  if (level === "medium") return styles.priorityMedium;
  return styles.priorityLow;
}

export function AssistantClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const searchParams = useSearchParams();
  const contextSymbol = searchParams.get("symbol")?.toUpperCase() ?? undefined;
  const [portfolio, setPortfolio] = useState<PortfolioPositionInput[]>([]);
  const [profile, setProfile] = useState<AdvisorProfile>(EMPTY_PROFILE);
  const [plan, setPlan] = useState<AdvisorPlan | null>(null);
  const [step, setStep] = useState<StepNumber>(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPortfolio(loadPortfolio());
      setProfile(loadProfile());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const applySyncedPlan = () => {
      setPortfolio(loadPortfolio());
      setProfile(loadProfile());
    };
    window.addEventListener(WORKSPACE_SYNC_EVENT, applySyncedPlan);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, applySyncedPlan);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(ADVISOR_PROFILE_KEY, JSON.stringify(profile));
  }, [hydrated, profile]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const profileProgress = useMemo(() => {
    const fields = [
      profile.goal_type,
      profile.horizon_years,
      profile.target_amount,
      profile.current_savings,
      profile.monthly_contribution,
      profile.essential_monthly_expenses,
      profile.liquid_reserve,
      profile.high_interest_debt,
      profile.income_stability,
      profile.liquidity_need,
      profile.loss_comfort,
    ];
    const completed = fields.filter((value) => value !== null).length;
    return Math.round((completed / fields.length) * 100);
  }, [profile]);

  const goalLabel = useMemo(
    () => advisorText(GOALS.find((item) => item.value === profile.goal_type)?.label ?? "Objectif non défini", language),
    [language, profile.goal_type],
  );

  const updateProfile = <K extends keyof AdvisorProfile>(
    key: K,
    value: AdvisorProfile[K],
  ) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setPlan(null);
  };

  const updateNumber = (key: NumericProfileKey, value: string) => {
    const parsed = value === "" ? null : Number(value);
    updateProfile(key, parsed !== null && Number.isFinite(parsed) ? parsed : null);
  };

  const refreshPlan = async (nextStep: StepNumber = 4) => {
    setStep(nextStep);
    setPlanLoading(true);
    setPlanError(null);
    try {
      const snapshot = await getAdvisorPlan(profile, portfolio);
      setPlan(snapshot);
    } catch {
      setPlanError(
        pick(language, "Le plan est temporairement indisponible.", "The plan is temporarily unavailable."),
      );
    } finally {
      setPlanLoading(false);
    }
  };

  const next = () => {
    if (step === 3) {
      void refreshPlan(4);
      return;
    }
    setStep((current) => Math.min(4, current + 1) as StepNumber);
  };

  const previous = () => {
    setStep((current) => Math.max(1, current - 1) as StepNumber);
  };

  const send = async (messageText = input) => {
    const clean = messageText.trim();
    if (!clean || loading) return;

    const createdAt = messageTimestamp();
    const userMessage: Message = {
      id: `user-${createdAt}`,
      role: "user",
      text: clean,
      createdAt,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await askAnatole(clean, {
        contextSymbol,
        portfolioPositions: portfolio,
        advisorProfile: profile,
      });
      if (response.plan) setPlan(response.plan);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: response.answer.replaceAll("**", ""),
          response,
          createdAt: messageTimestamp(),
        },
      ]);
    } catch {
      setError(
        pick(language, "Anatole Conseil est temporairement indisponible.", "Anatole Advice is temporarily unavailable."),
      );
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const lastResponse = useMemo(
    () => [...messages].reverse().find((item) => item.response)?.response,
    [messages],
  );

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.guideHero}`}>
        <div>
          <span className="eyebrow">ANATOLE {pick(language, "CONSEIL · PARCOURS GUIDÉ", "ADVICE · GUIDED JOURNEY")}</span>
          <h1>{pick(language, "Construis ton plan en 4 étapes", "Build your plan in 4 steps")}</h1>
          <p>
            {pick(language, "Tu définis ton objectif, ta marge financière et ton confort face au risque. Anatole organise les informations et teste des scénarios, sans te dire quoi acheter ou vendre.", "Define your goal, financial capacity, and comfort with risk. Anatole organizes the information and tests scenarios without telling you what to buy or sell.")}
          </p>
        </div>
        <div className={styles.guideHeroStatus}>
          <strong>{step}/4</strong>
          <span>{advisorText(STEPS[step - 1].label, language)}</span>
          <small>{profileProgress}% {pick(language, "du profil rempli", "of profile completed")}</small>
        </div>
      </section>

      <section className={styles.simpleBoundary}>
        <ShieldCheck size={19} />
        <div>
          <strong>{pick(language, "Tu gardes le contrôle", "You remain in control")}</strong>
          <span>
            {pick(language, "Anatole explique, calcule et met les risques en évidence. Il ne choisit aucun placement à ta place.", "Anatole explains, calculates, and highlights risks. It does not choose investments for you.")}
          </span>
        </div>
        <div className={styles.saveStatus}>
          <LockKeyhole size={14} /> {pick(language, "Enregistré sur cet appareil", "Saved on this device")}
        </div>
      </section>

      <nav className={`panel ${styles.guideStepper}`} aria-label={pick(language, "Étapes du plan", "Plan steps")}>
        {STEPS.map((item) => {
          const active = item.number === step;
          const completed = item.number < step;
          return (
            <button
              type="button"
              key={item.number}
              className={`${styles.guideStep} ${active ? styles.guideStepActive : ""} ${completed ? styles.guideStepDone : ""}`}
              aria-current={active ? "step" : undefined}
              onClick={() => setStep(item.number)}
            >
              <span>{completed ? <Check size={14} /> : item.number}</span>
              <div>
                <strong>{advisorText(item.label, language)}</strong>
                <small>{advisorText(item.description, language)}</small>
              </div>
            </button>
          );
        })}
      </nav>

      <div className={styles.guideShell}>
        <section className={`panel ${styles.guidePanel}`} id="profil">
          {step === 1 ? (
            <>
              <header className={styles.guideHeader}>
                <div>
                  <span className="eyebrow">{pick(language, "ÉTAPE 1 SUR 4", "STEP 1 OF 4")}</span>
                  <h2>{pick(language, "Qu’est-ce que tu veux accomplir ?", "What do you want to achieve?")}</h2>
                  <p>{pick(language, "Cette étape donne une direction au plan. Tu pourras modifier les réponses plus tard.", "This step gives the plan a direction. You can change your answers later.")}</p>
                </div>
                <Target size={28} />
              </header>

              <div className={styles.choiceGrid}>
                {GOALS.map((goal) => (
                  <button
                    type="button"
                    key={goal.value}
                    aria-pressed={profile.goal_type === goal.value}
                    className={`${styles.choiceCard} ${profile.goal_type === goal.value ? styles.choiceCardActive : ""}`}
                    onClick={() => updateProfile("goal_type", goal.value)}
                  >
                    <strong>{advisorText(goal.label, language)}</strong>
                    <span>{advisorText(goal.detail, language)}</span>
                  </button>
                ))}
              </div>

              <div className={styles.simpleFormGrid}>
                <label className={styles.field}>
                  <span>{pick(language, "Nom du projet", "Project name")}</span>
                  <input
                    value={profile.goal_name ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateProfile("goal_name", event.target.value || null)}
                    placeholder={pick(language, "Ex. Mise de fonds", "E.g. Down payment")}
                  />
                  <small className={styles.fieldHint}>{pick(language, "Un nom simple pour reconnaître ton objectif.", "A simple name to identify your goal.")}</small>
                </label>
                <label className={styles.field}>
                  <span>{pick(language, "Combien veux-tu atteindre ?", "How much do you want to reach?")}</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.target_amount ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("target_amount", event.target.value)}
                    placeholder="Ex. 100000"
                  />
                  <small className={styles.fieldHint}>{pick(language, "Le montant final visé, même s’il est approximatif.", "The final target amount, even if approximate.")}</small>
                </label>
                <label className={styles.field}>
                  <span>{pick(language, "Dans combien d’années ?", "In how many years?")}</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={profile.horizon_years ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("horizon_years", event.target.value)}
                    placeholder="Ex. 8"
                  />
                  <small className={styles.fieldHint}>{pick(language, "Quand tu penses avoir besoin de cet argent.", "When you expect to need this money.")}</small>
                </label>
                <label className={styles.field}>
                  <span>{pick(language, "Devise", "Currency")}</span>
                  <select
                    value={profile.currency}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => updateProfile("currency", event.target.value as "CAD" | "USD")}
                  >
                    <option value="CAD">{pick(language, "Dollar canadien (CAD)", "Canadian dollar (CAD)")}</option>
                    <option value="USD">{pick(language, "Dollar américain (USD)", "U.S. dollar (USD)")}</option>
                  </select>
                  <small className={styles.fieldHint}>{pick(language, "La devise utilisée dans les calculs.", "The currency used in calculations.")}</small>
                </label>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <header className={styles.guideHeader}>
                <div>
                  <span className="eyebrow">{pick(language, "ÉTAPE 2 SUR 4", "STEP 2 OF 4")}</span>
                  <h2>{pick(language, "Quelle est ta marge financière aujourd’hui ?", "What is your financial capacity today?")}</h2>
                  <p>{pick(language, "Ces données servent à séparer l’argent disponible à court terme du capital prévu pour ton objectif.", "This data separates money available in the short term from capital intended for your goal.")}</p>
                </div>
                <WalletCards size={28} />
              </header>

              <div className={styles.simpleFormGrid}>
                <label className={styles.field}>
                  <span>{pick(language, "Capital déjà disponible", "Capital already available")}</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.current_savings ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("current_savings", event.target.value)}
                    placeholder="Ex. 25000"
                  />
                  <small className={styles.fieldHint}>{pick(language, "L’argent déjà consacré à ton objectif.", "Money already allocated to your goal.")}</small>
                </label>
                <label className={styles.field}>
                  <span>{pick(language, "Montant ajouté chaque mois", "Amount added each month")}</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.monthly_contribution ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("monthly_contribution", event.target.value)}
                    placeholder="Ex. 500"
                  />
                  <small className={styles.fieldHint}>{pick(language, "Le montant que tu penses pouvoir maintenir.", "The amount you believe you can sustain.")}</small>
                </label>
                <label className={styles.field}>
                  <span>{pick(language, "Dépenses essentielles par mois", "Essential monthly expenses")}</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.essential_monthly_expenses ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("essential_monthly_expenses", event.target.value)}
                    placeholder="Ex. 2400"
                  />
                  <small className={styles.fieldHint}>{pick(language, "Logement, nourriture, transport et obligations essentielles.", "Housing, food, transportation, and essential obligations.")}</small>
                </label>
                <label className={styles.field}>
                  <span>{pick(language, "Argent disponible en réserve", "Available reserve")}</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.liquid_reserve ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("liquid_reserve", event.target.value)}
                    placeholder="Ex. 12000"
                  />
                  <small className={styles.fieldHint}>{pick(language, "Une somme accessible rapidement, hors placements à long terme.", "An amount available quickly, excluding long-term investments.")}</small>
                </label>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>{pick(language, "As-tu une dette à taux élevé ?", "Do you have high-interest debt?")}</strong>
                  <span>{pick(language, "Par exemple une carte de crédit ou un prêt coûteux.", "For example, a credit card or expensive loan.")}</span>
                </div>
                <div className={styles.segmentedChoices}>
                  <button
                    type="button"
                    className={profile.high_interest_debt === false ? styles.segmentedActive : ""}
                    onClick={() => updateProfile("high_interest_debt", false)}
                  >
                    {pick(language, "Non", "No")}
                  </button>
                  <button
                    type="button"
                    className={profile.high_interest_debt === true ? styles.segmentedActive : ""}
                    onClick={() => updateProfile("high_interest_debt", true)}
                  >
                    {pick(language, "Oui", "Yes")}
                  </button>
                  <button
                    type="button"
                    className={profile.high_interest_debt === null ? styles.segmentedActive : ""}
                    onClick={() => updateProfile("high_interest_debt", null)}
                  >
                    {pick(language, "Je ne sais pas", "I don’t know")}
                  </button>
                </div>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>{pick(language, "Tes revenus sont-ils réguliers ?", "Is your income regular?")}</strong>
                  <span>{pick(language, "Cette réponse aide à mesurer ta capacité à traverser une période difficile.", "This answer helps assess your capacity to navigate a difficult period.")}</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {INCOME_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.income_stability === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("income_stability", choice.value)}
                    >
                      <strong>{advisorText(choice.label, language)}</strong>
                      <span>{advisorText(choice.detail, language)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <header className={styles.guideHeader}>
                <div>
                  <span className="eyebrow">{pick(language, "ÉTAPE 3 SUR 4", "STEP 3 OF 4")}</span>
                  <h2>{pick(language, "Comment réagirais-tu face au risque ?", "How would you react to risk?")}</h2>
                  <p>{pick(language, "Il n’y a pas de bonne réponse. Le but est d’éviter un plan que tu ne pourrais pas suivre.", "There is no right answer. The goal is to avoid a plan you could not follow.")}</p>
                </div>
                <CircleHelp size={28} />
              </header>

              <div className={styles.questionBlock}>
                <div>
                  <strong>{pick(language, "Auras-tu besoin de cet argent prochainement ?", "Will you need this money soon?")}</strong>
                  <span>{pick(language, "Un besoin rapide réduit la marge disponible face aux variations.", "A near-term need reduces the capacity to absorb fluctuations.")}</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {LIQUIDITY_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.liquidity_need === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("liquidity_need", choice.value)}
                    >
                      <strong>{advisorText(choice.label, language)}</strong>
                      <span>{advisorText(choice.detail, language)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>{pick(language, "Comment vivrais-tu une baisse temporaire de 20 % ?", "How would you experience a temporary 20% decline?")}</strong>
                  <span>{pick(language, "Cette question mesure ton confort déclaré, pas ta capacité financière réelle.", "This question measures stated comfort, not actual financial capacity.")}</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {LOSS_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.loss_comfort === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("loss_comfort", choice.value)}
                    >
                      <strong>{advisorText(choice.label, language)}</strong>
                      <span>{advisorText(choice.detail, language)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>{pick(language, "Quel niveau d’explication te convient ?", "What level of explanation suits you?")}</strong>
                  <span>{pick(language, "Anatole adapte le vocabulaire, pas le résultat des calculs.", "Anatole adapts the vocabulary, not the calculation results.")}</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {EXPERIENCE_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.experience === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("experience", choice.value)}
                    >
                      <strong>{advisorText(choice.label, language)}</strong>
                      <span>{advisorText(choice.detail, language)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <header className={styles.guideHeader}>
                <div>
                  <span className="eyebrow">{pick(language, "ÉTAPE 4 SUR 4", "STEP 4 OF 4")}</span>
                  <h2>{pick(language, "Voici ce que ton plan montre", "What your plan shows")}</h2>
                  <p>{pick(language, "Commence par les prochaines étapes. Les scénarios et le détail du risque viennent ensuite.", "Start with the next steps. Scenarios and risk details follow.")}</p>
                </div>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={planLoading}
                  onClick={() => void refreshPlan(4)}
                >
                  <RefreshCw size={15} /> {planLoading ? pick(language, "Calcul…", "Calculating…") : pick(language, "Recalculer", "Recalculate")}
                </button>
              </header>

              {planError ? <div className={styles.errorNotice}>{language === "fr" ? planError : "The plan is temporarily unavailable."}</div> : null}

              {planLoading ? (
                <div className={styles.simpleLoading}>
                  <Sparkles size={22} />
                  <strong>{pick(language, "Anatole construit ton plan…", "Anatole is building your plan…")}</strong>
                  <span>{pick(language, "Objectif, liquidité, risque et portefeuille sont en cours d’analyse.", "Goal, liquidity, risk, and portfolio are being analyzed.")}</span>
                </div>
              ) : null}

              {!planLoading && plan ? (
                <>
                  <section className={styles.resultIntro}>
                    <div className={styles.resultScore}>
                      <strong>{Math.round(plan.readiness_score)}</strong>
                      <span>/100</span>
                    </div>
                    <div>
                      <span className="eyebrow">{pick(language, "SCORE DE PRÉPARATION", "READINESS SCORE")}</span>
                      <h3>{scoreLabel(plan.readiness_score, language)}</h3>
                      <p>{language === "fr" ? plan.summary : `Your profile is ${plan.profile_completeness}% complete and the readiness score is ${plan.readiness_score.toFixed(0)}/100. The scenarios are illustrative, do not predict returns, and do not recommend any investment.`}</p>
                    </div>
                  </section>

                  <div className={styles.resultMetrics}>
                    <article>
                      <span>{pick(language, "Objectif", "Goal")}</span>
                      <strong>{goalLabel}</strong>
                      <small>{profile.horizon_years ? pick(language, `${profile.horizon_years} an${profile.horizon_years > 1 ? "s" : ""}`, `${profile.horizon_years} year${profile.horizon_years === 1 ? "" : "s"}`) : pick(language, "Horizon à préciser", "Horizon to define")}</small>
                    </article>
                    <article>
                      <span>{pick(language, "Marge face au risque", "Risk capacity")}</span>
                      <strong>{capacityLabel(plan.capacity_profile, language)}</strong>
                      <small>{pick(language, "Basée sur ton horizon, ta liquidité et tes réponses", "Based on your horizon, liquidity, and answers")}</small>
                    </article>
                    <article>
                      <span>{pick(language, "Réserve de sécurité", "Safety reserve")}</span>
                      <strong>{plan.reserve_months !== null ? `${plan.reserve_months.toFixed(1)} ${pick(language, "mois", "months")}` : pick(language, "À calculer", "To calculate")}</strong>
                      <small>{pick(language, "Nombre de mois de dépenses couverts", "Months of expenses covered")}</small>
                    </article>
                    <article>
                      <span>{pick(language, "Portefeuille", "Portfolio")}</span>
                      <strong>{plan.portfolio_score !== null ? `${Math.round(plan.portfolio_score)}/100` : pick(language, "Non connecté", "Not connected")}</strong>
                      <small>{riskLevelLabel(plan.portfolio_risk_level, language) ?? pick(language, `${portfolio.length} position${portfolio.length > 1 ? "s" : ""} locale${portfolio.length > 1 ? "s" : ""}`, `${portfolio.length} local position${portfolio.length === 1 ? "" : "s"}`)}</small>
                    </article>
                  </div>

                  <section className={styles.resultCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <span className="eyebrow">{pick(language, "COMMENCE ICI", "START HERE")}</span>
                        <h3>{pick(language, "Tes 3 prochaines étapes", "Your next 3 steps")}</h3>
                        <p>{pick(language, "Des actions de planification, jamais des instructions de placement.", "Planning actions, never investment instructions.")}</p>
                      </div>
                    </div>
                    <div className={styles.nextSteps}>
                      {plan.priorities.slice(0, 3).map((rawPriority, index) => {
                        const priority = priorityCopy(rawPriority, language);
                        return (
                        <article className={`${styles.nextStep} ${priorityClass(priority.level)}`} key={priority.key}>
                          <span>{index + 1}</span>
                          <div>
                            <strong>{priority.title}</strong>
                            <p>{priority.detail}</p>
                            <small>{priority.action}</small>
                          </div>
                        </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className={styles.resultCard} id="scenarios">
                    <div className={styles.cardHeader}>
                      <div>
                        <span className="eyebrow">{pick(language, "SCÉNARIOS", "SCENARIOS")}</span>
                        <h3>{pick(language, "Où ton objectif pourrait se situer", "Where your goal could stand")}</h3>
                        <p>{pick(language, "Trois hypothèses pour comprendre l’effet du temps et des contributions. Ce ne sont pas des prévisions.", "Three assumptions illustrate the effect of time and contributions. They are not forecasts.")}</p>
                      </div>
                    </div>
                    <div className={styles.scenarioSimpleGrid}>
                      {plan.projections.map((scenario) => (
                        <article className={styles.scenarioSimple} key={scenario.key}>
                          <span>{language === "fr" ? scenario.label : ({ "Sans croissance": "No growth", "Croissance modérée": "Moderate growth", "Croissance soutenue": "Sustained growth" } as Record<string, string>)[scenario.label] ?? scenario.label}</span>
                          <strong>{formatMoney(scenario.projected_value, plan.currency, language)}</strong>
                          <small>{pick(language, "Hypothèse de calcul", "Calculation assumption")}: {scenario.annual_return_percent.toFixed(0)}% {pick(language, "par an", "per year")}</small>
                          <div className={styles.progress}>
                            <i style={{ width: `${Math.min(100, scenario.progress_percent ?? 0)}%` }} />
                          </div>
                          <p>
                            {scenario.gap_to_target === null
                              ? pick(language, "Ajoute un montant cible pour mesurer l’écart.", "Add a target amount to measure the gap.")
                              : scenario.gap_to_target >= 0
                                ? pick(language, `Objectif dépassé de ${formatMoney(scenario.gap_to_target, plan.currency, language)}`, `Target exceeded by ${formatMoney(scenario.gap_to_target, plan.currency, language)}`)
                                : pick(language, `Il manquerait ${formatMoney(Math.abs(scenario.gap_to_target), plan.currency, language)}`, `Shortfall of ${formatMoney(Math.abs(scenario.gap_to_target), plan.currency, language)}`)}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <details className={styles.resultDetails}>
                    <summary>{pick(language, "Voir le détail du risque et les simulations de baisse", "View risk details and decline simulations")}</summary>
                    <div className={styles.resultDetailGrid}>
                      <section>
                        <h3>{pick(language, "Ce qui influence ta marge", "What affects your capacity")}</h3>
                        <div className={styles.advisorDimensionList}>
                          {plan.risk_dimensions.map((rawDimension) => {
                            const dimension = dimensionCopy(rawDimension, language);
                            return (
                            <article className={styles.advisorDimension} key={dimension.key}>
                              <div><span>{dimension.label}</span><strong>{dimension.value}</strong></div>
                              <p>{dimension.detail}</p>
                            </article>
                            );
                          })}
                        </div>
                      </section>
                      <section>
                        <h3>{pick(language, "Si la valeur baissait temporairement", "If the value declined temporarily")}</h3>
                        <div className={styles.advisorStressGrid}>
                          {plan.stress_tests.map((test) => (
                            <article className={styles.advisorStress} key={test.label}>
                              <span>{language === "fr" ? test.label : `Hypothetical decline of ${Math.abs(test.shock_percent).toFixed(0)}%`}</span>
                              <strong className={styles.negative}>-{formatMoney(test.estimated_loss, plan.currency, language)}</strong>
                              <small>{pick(language, "Valeur restante", "Remaining value")}: {formatMoney(test.estimated_value, plan.currency, language)}</small>
                            </article>
                          ))}
                          {!plan.stress_tests.length ? (
                            <div className={styles.notice}>{pick(language, "Ajoute un capital actuel ou des positions au Portefeuille pour activer cette simulation.", "Add current capital or Portfolio positions to enable this simulation.")}</div>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  </details>

                  <button
                    type="button"
                    className={styles.chatToggle}
                    onClick={() => setShowChat((current) => !current)}
                  >
                    <Bot size={18} />
                    <span>
                      <strong>{pick(language, "Besoin d’une explication ?", "Need an explanation?")}</strong>
                      <small>{pick(language, "Pose une question sur ton plan, ton risque ou tes scénarios.", "Ask a question about your plan, risk, or scenarios.")}</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>

                  {showChat ? (
                    <section className={styles.simpleChat}>
                      <div className={`${styles.chatScroll} ${styles.chatList}`} ref={scrollRef}>
                        {!messages.length ? (
                          <div className={styles.emptyState}>
                            <Bot size={30} />
                            <strong>{pick(language, "Que veux-tu comprendre ?", "What would you like to understand?")}</strong>
                            <span>{pick(language, "Anatole répond avec des explications simples et sans recommandation de placement.", "Anatole provides simple explanations without investment recommendations.")}</span>
                            <div className={styles.chipRow} style={{ justifyContent: "center" }}>
                              {STARTERS.map((prompt) => (
                                <button className={styles.promptChip} type="button" key={prompt} onClick={() => void send(prompt)}>{language === "fr" ? prompt : (["Explain my plan simply", "What should I monitor first?", "Show me the effect of a 20% decline", "Why is my score not higher?"][STARTERS.indexOf(prompt)] ?? prompt)}</button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {messages.map((message) => (
                          <article className={`${styles.chatMessage} ${message.role === "user" ? styles.chatMessageUser : styles.chatMessageAssistant} ${message.response?.guardrail_triggered ? styles.guardrailMessage : ""}`} key={message.id}>
                            {message.role === "assistant" && message.response ? (
                              <div className={styles.cardHeader} style={{ marginBottom: 10 }}>
                                <div><span className="eyebrow">ANATOLE {pick(language, "CONSEIL", "ADVICE")}</span><h3>{language === "fr" ? message.response.title : "Educational explanation"}</h3></div>
                                <span className={styles.statusPill}>{pick(language, "Confiance", "Confidence")} {message.response.confidence}</span>
                              </div>
                            ) : null}
                            <p>{message.role === "assistant" && language === "en" ? "This explanation uses the plan inputs and available data. It is educational and does not recommend buying, selling, or holding any security." : message.text}</p>
                            {message.response?.facts.length ? (
                              <div className={styles.factGrid}>
                                {message.response.facts.map((fact) => (
                                  <div className={styles.fact} key={`${message.id}-${fact.label}`}>
                                    <span>{language === "fr" ? fact.label : ({ "Score du plan": "Plan score", "Marge face au risque": "Risk capacity" } as Record<string, string>)[fact.label] ?? fact.label}</span>
                                    <strong className={toneClass(fact.tone)}>{riskLevelLabel(fact.value, language) ?? fact.value}</strong>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {message.response?.links.length ? (
                              <div className={styles.assistantLinks}>
                                {message.response.links.map((link) => <Link href={link.href} key={link.href}>{language === "fr" ? link.label : "Open related Anatole tool"}</Link>)}
                              </div>
                            ) : null}
                            {message.response ? <div className={styles.assistantDisclaimer}>{language === "fr" ? message.response.disclaimer : "Educational information only. This is not financial, tax, or legal advice."}</div> : null}
                          </article>
                        ))}

                        {loading ? (
                          <article className={`${styles.chatMessage} ${styles.chatMessageAssistant}`}>
                            <div className={styles.inlineBetween}><span>{pick(language, "Anatole prépare une explication simple…", "Anatole is preparing a simple explanation…")}</span><Sparkles size={16} /></div>
                          </article>
                        ) : null}
                      </div>

                      <form className={styles.composer} onSubmit={submit}>
                        {error ? <div className={styles.errorNotice} style={{ marginBottom: 10 }}>{error}</div> : null}
                        <div className={styles.composerBox}>
                          <textarea
                            className={styles.chatInput}
                            rows={2}
                            value={input}
                            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
                            placeholder={pick(language, "Ex. Explique-moi pourquoi ma réserve est importante…", "E.g. Explain why my reserve matters…")}
                          />
                          <button className={styles.primaryButton} type="submit" disabled={loading || !input.trim()}><Send size={16} /> {pick(language, "Envoyer", "Send")}</button>
                        </div>
                        {lastResponse?.suggestions.length ? (
                          <div className={styles.chipRow} style={{ marginTop: 10 }}>
                            {lastResponse.suggestions.map((suggestion) => (
                              <button className={styles.promptChip} type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>
                            ))}
                          </div>
                        ) : null}
                      </form>
                    </section>
                  ) : null}
                </>
              ) : null}

              {!planLoading && !plan && !planError ? (
                <div className={styles.simpleLoading}>
                  <Sparkles size={22} />
                  <strong>{pick(language, "Ton plan n’a pas encore été calculé", "Your plan has not been calculated yet")}</strong>
                  <span>{pick(language, "Clique sur « Calculer mon plan » pour obtenir une lecture claire de tes réponses.", "Select “Calculate my plan” for a clear reading of your answers.")}</span>
                  <button className={styles.primaryButton} type="button" onClick={() => void refreshPlan(4)}>{pick(language, "Calculer mon plan", "Calculate my plan")}</button>
                </div>
              ) : null}
            </>
          ) : null}

          <footer className={styles.stepFooter}>
            <button className={styles.secondaryButton} type="button" onClick={previous} disabled={step === 1}>
              <ArrowLeft size={15} /> {pick(language, "Précédent", "Previous")}
            </button>
            {step < 4 ? (
              <button className={styles.primaryButton} type="button" onClick={next}>
                {step === 3 ? pick(language, "Voir mon plan", "View my plan") : pick(language, "Continuer", "Continue")} <ArrowRight size={15} />
              </button>
            ) : (
              <button className={styles.secondaryButton} type="button" onClick={() => setStep(1)}>
                {pick(language, "Modifier mes réponses", "Edit my answers")}
              </button>
            )}
          </footer>
        </section>

        <aside className={styles.guideAside}>
          <section className={`panel ${styles.helpCard}`}>
            <span className="eyebrow">{pick(language, "CE QUE TU FAIS ICI", "WHAT YOU DO HERE")}</span>
            <h3>{advisorText(STEPS[step - 1].label, language)}</h3>
            {step === 1 ? <p>{pick(language, "Tu précises le but, le montant et le délai. Anatole pourra ensuite mesurer l’écart entre aujourd’hui et ton objectif.", "Define the purpose, amount, and timeframe. Anatole can then measure the gap between today and your goal.")}</p> : null}
            {step === 2 ? <p>{pick(language, "Tu indiques les ressources et les contraintes réelles. Cela évite de construire un plan qui utiliserait de l’argent nécessaire à court terme.", "Enter real resources and constraints. This avoids building a plan that uses money needed in the short term.")}</p> : null}
            {step === 3 ? <p>{pick(language, "Tu décris ta réaction probable face aux variations. Le plan doit être financièrement possible et émotionnellement supportable.", "Describe your likely reaction to fluctuations. The plan should be financially possible and emotionally sustainable.")}</p> : null}
            {step === 4 ? <p>{pick(language, "Tu lis d’abord les prochaines étapes, puis les scénarios. Les détails techniques restent disponibles sans encombrer l’écran.", "Review the next steps first, then the scenarios. Technical details remain available without cluttering the screen.")}</p> : null}
          </section>

          <section className={`panel ${styles.helpCard}`}>
            <span className="eyebrow">{pick(language, "RÉSUMÉ ACTUEL", "CURRENT SUMMARY")}</span>
            <div className={styles.contextRow}><span>{pick(language, "Objectif", "Goal")}</span><strong>{goalLabel}</strong></div>
            <div className={styles.contextRow}><span>{pick(language, "Montant visé", "Target amount")}</span><strong>{formatMoney(profile.target_amount, profile.currency, language)}</strong></div>
            <div className={styles.contextRow}><span>Horizon</span><strong>{profile.horizon_years ? pick(language, `${profile.horizon_years} an${profile.horizon_years > 1 ? "s" : ""}`, `${profile.horizon_years} year${profile.horizon_years === 1 ? "" : "s"}`) : pick(language, "Non défini", "Not defined")}</strong></div>
            <div className={styles.contextRow}><span>{pick(language, "Profil rempli", "Profile completed")}</span><strong>{profileProgress} %</strong></div>
          </section>

          <section className={`panel ${styles.helpCard}`}>
            <span className="eyebrow">{pick(language, "AUTRES OUTILS", "OTHER TOOLS")}</span>
            <div className={styles.assistantLinks}>
              <Link href="/portefeuille"><BriefcaseBusiness size={13} /> {pick(language, "Portefeuille", "Portfolio")}</Link>
              <Link href="/parametres?section=quality"><Database size={13} /> {pick(language, "Qualité des données", "Data quality")}</Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
