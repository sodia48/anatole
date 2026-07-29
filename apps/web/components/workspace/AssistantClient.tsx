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

function formatMoney(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "Non calculé";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function scoreLabel(score: number): string {
  if (score >= 75) return "Base solide";
  if (score >= 50) return "Plan en construction";
  return "Bases à renforcer";
}

function capacityLabel(value: AdvisorPlan["capacity_profile"] | undefined): string {
  if (value === "Dynamique") return "Bonne marge face aux variations";
  if (value === "Équilibrée") return "Marge moyenne face aux variations";
  if (value === "Prudente") return "Marge limitée face aux variations";
  return "À déterminer";
}

function priorityClass(level: "low" | "medium" | "high"): string {
  if (level === "high") return styles.priorityHigh;
  if (level === "medium") return styles.priorityMedium;
  return styles.priorityLow;
}

export function AssistantClient() {
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
    setPortfolio(loadPortfolio());
    setProfile(loadProfile());
    setHydrated(true);
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
    () => GOALS.find((item) => item.value === profile.goal_type)?.label ?? "Objectif non défini",
    [profile.goal_type],
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
    } catch (reason) {
      setPlanError(
        reason instanceof Error
          ? reason.message
          : "Le plan est temporairement indisponible.",
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

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: clean,
      createdAt: Date.now(),
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
          createdAt: Date.now(),
        },
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Anatole Conseil est temporairement indisponible.",
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
          <span className="eyebrow">ANATOLE CONSEIL · PARCOURS GUIDÉ</span>
          <h1>Construis ton plan en 4 étapes</h1>
          <p>
            Tu définis ton objectif, ta marge financière et ton confort face au risque.
            Anatole organise les informations et teste des scénarios, sans te dire quoi acheter ou vendre.
          </p>
        </div>
        <div className={styles.guideHeroStatus}>
          <strong>{step}/4</strong>
          <span>{STEPS[step - 1].label}</span>
          <small>{profileProgress} % du profil rempli</small>
        </div>
      </section>

      <section className={styles.simpleBoundary}>
        <ShieldCheck size={19} />
        <div>
          <strong>Tu gardes le contrôle</strong>
          <span>
            Anatole explique, calcule et met les risques en évidence. Il ne choisit aucun placement à ta place.
          </span>
        </div>
        <div className={styles.saveStatus}>
          <LockKeyhole size={14} /> Enregistré sur cet appareil
        </div>
      </section>

      <nav className={`panel ${styles.guideStepper}`} aria-label="Étapes du plan">
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
                <strong>{item.label}</strong>
                <small>{item.description}</small>
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
                  <span className="eyebrow">ÉTAPE 1 SUR 4</span>
                  <h2>Qu’est-ce que tu veux accomplir ?</h2>
                  <p>Cette étape donne une direction au plan. Tu pourras modifier les réponses plus tard.</p>
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
                    <strong>{goal.label}</strong>
                    <span>{goal.detail}</span>
                  </button>
                ))}
              </div>

              <div className={styles.simpleFormGrid}>
                <label className={styles.field}>
                  <span>Nom du projet</span>
                  <input
                    value={profile.goal_name ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateProfile("goal_name", event.target.value || null)}
                    placeholder="Ex. Mise de fonds"
                  />
                  <small className={styles.fieldHint}>Un nom simple pour reconnaître ton objectif.</small>
                </label>
                <label className={styles.field}>
                  <span>Combien veux-tu atteindre ?</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.target_amount ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("target_amount", event.target.value)}
                    placeholder="Ex. 100000"
                  />
                  <small className={styles.fieldHint}>Le montant final visé, même s’il est approximatif.</small>
                </label>
                <label className={styles.field}>
                  <span>Dans combien d’années ?</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={profile.horizon_years ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("horizon_years", event.target.value)}
                    placeholder="Ex. 8"
                  />
                  <small className={styles.fieldHint}>Quand tu penses avoir besoin de cet argent.</small>
                </label>
                <label className={styles.field}>
                  <span>Devise</span>
                  <select
                    value={profile.currency}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => updateProfile("currency", event.target.value as "CAD" | "USD")}
                  >
                    <option value="CAD">Dollar canadien (CAD)</option>
                    <option value="USD">Dollar américain (USD)</option>
                  </select>
                  <small className={styles.fieldHint}>La devise utilisée dans les calculs.</small>
                </label>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <header className={styles.guideHeader}>
                <div>
                  <span className="eyebrow">ÉTAPE 2 SUR 4</span>
                  <h2>Quelle est ta marge financière aujourd’hui ?</h2>
                  <p>Ces données servent à séparer l’argent disponible à court terme du capital prévu pour ton objectif.</p>
                </div>
                <WalletCards size={28} />
              </header>

              <div className={styles.simpleFormGrid}>
                <label className={styles.field}>
                  <span>Capital déjà disponible</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.current_savings ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("current_savings", event.target.value)}
                    placeholder="Ex. 25000"
                  />
                  <small className={styles.fieldHint}>L’argent déjà consacré à ton objectif.</small>
                </label>
                <label className={styles.field}>
                  <span>Montant ajouté chaque mois</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.monthly_contribution ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("monthly_contribution", event.target.value)}
                    placeholder="Ex. 500"
                  />
                  <small className={styles.fieldHint}>Le montant que tu penses pouvoir maintenir.</small>
                </label>
                <label className={styles.field}>
                  <span>Dépenses essentielles par mois</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.essential_monthly_expenses ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("essential_monthly_expenses", event.target.value)}
                    placeholder="Ex. 2400"
                  />
                  <small className={styles.fieldHint}>Logement, nourriture, transport et obligations essentielles.</small>
                </label>
                <label className={styles.field}>
                  <span>Argent disponible en réserve</span>
                  <input
                    type="number"
                    min="0"
                    value={profile.liquid_reserve ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("liquid_reserve", event.target.value)}
                    placeholder="Ex. 12000"
                  />
                  <small className={styles.fieldHint}>Une somme accessible rapidement, hors placements à long terme.</small>
                </label>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>As-tu une dette à taux élevé ?</strong>
                  <span>Par exemple une carte de crédit ou un prêt coûteux.</span>
                </div>
                <div className={styles.segmentedChoices}>
                  <button
                    type="button"
                    className={profile.high_interest_debt === false ? styles.segmentedActive : ""}
                    onClick={() => updateProfile("high_interest_debt", false)}
                  >
                    Non
                  </button>
                  <button
                    type="button"
                    className={profile.high_interest_debt === true ? styles.segmentedActive : ""}
                    onClick={() => updateProfile("high_interest_debt", true)}
                  >
                    Oui
                  </button>
                  <button
                    type="button"
                    className={profile.high_interest_debt === null ? styles.segmentedActive : ""}
                    onClick={() => updateProfile("high_interest_debt", null)}
                  >
                    Je ne sais pas
                  </button>
                </div>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>Tes revenus sont-ils réguliers ?</strong>
                  <span>Cette réponse aide à mesurer ta capacité à traverser une période difficile.</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {INCOME_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.income_stability === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("income_stability", choice.value)}
                    >
                      <strong>{choice.label}</strong>
                      <span>{choice.detail}</span>
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
                  <span className="eyebrow">ÉTAPE 3 SUR 4</span>
                  <h2>Comment réagirais-tu face au risque ?</h2>
                  <p>Il n’y a pas de bonne réponse. Le but est d’éviter un plan que tu ne pourrais pas suivre.</p>
                </div>
                <CircleHelp size={28} />
              </header>

              <div className={styles.questionBlock}>
                <div>
                  <strong>Auras-tu besoin de cet argent prochainement ?</strong>
                  <span>Un besoin rapide réduit la marge disponible face aux variations.</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {LIQUIDITY_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.liquidity_need === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("liquidity_need", choice.value)}
                    >
                      <strong>{choice.label}</strong>
                      <span>{choice.detail}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>Comment vivrais-tu une baisse temporaire de 20 % ?</strong>
                  <span>Cette question mesure ton confort déclaré, pas ta capacité financière réelle.</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {LOSS_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.loss_comfort === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("loss_comfort", choice.value)}
                    >
                      <strong>{choice.label}</strong>
                      <span>{choice.detail}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.questionBlock}>
                <div>
                  <strong>Quel niveau d’explication te convient ?</strong>
                  <span>Anatole adapte le vocabulaire, pas le résultat des calculs.</span>
                </div>
                <div className={styles.choiceGridCompact}>
                  {EXPERIENCE_CHOICES.map((choice) => (
                    <button
                      type="button"
                      key={choice.value}
                      className={`${styles.choiceCard} ${profile.experience === choice.value ? styles.choiceCardActive : ""}`}
                      onClick={() => updateProfile("experience", choice.value)}
                    >
                      <strong>{choice.label}</strong>
                      <span>{choice.detail}</span>
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
                  <span className="eyebrow">ÉTAPE 4 SUR 4</span>
                  <h2>Voici ce que ton plan montre</h2>
                  <p>Commence par les prochaines étapes. Les scénarios et le détail du risque viennent ensuite.</p>
                </div>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={planLoading}
                  onClick={() => void refreshPlan(4)}
                >
                  <RefreshCw size={15} /> {planLoading ? "Calcul…" : "Recalculer"}
                </button>
              </header>

              {planError ? <div className={styles.errorNotice}>{planError}</div> : null}

              {planLoading ? (
                <div className={styles.simpleLoading}>
                  <Sparkles size={22} />
                  <strong>Anatole construit ton plan…</strong>
                  <span>Objectif, liquidité, risque et portefeuille sont en cours d’analyse.</span>
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
                      <span className="eyebrow">SCORE DE PRÉPARATION</span>
                      <h3>{scoreLabel(plan.readiness_score)}</h3>
                      <p>{plan.summary}</p>
                    </div>
                  </section>

                  <div className={styles.resultMetrics}>
                    <article>
                      <span>Objectif</span>
                      <strong>{goalLabel}</strong>
                      <small>{profile.horizon_years ? `${profile.horizon_years} an${profile.horizon_years > 1 ? "s" : ""}` : "Horizon à préciser"}</small>
                    </article>
                    <article>
                      <span>Marge face au risque</span>
                      <strong>{capacityLabel(plan.capacity_profile)}</strong>
                      <small>Basée sur ton horizon, ta liquidité et tes réponses</small>
                    </article>
                    <article>
                      <span>Réserve de sécurité</span>
                      <strong>{plan.reserve_months !== null ? `${plan.reserve_months.toFixed(1)} mois` : "À calculer"}</strong>
                      <small>Nombre de mois de dépenses couverts</small>
                    </article>
                    <article>
                      <span>Portefeuille</span>
                      <strong>{plan.portfolio_score !== null ? `${Math.round(plan.portfolio_score)}/100` : "Non connecté"}</strong>
                      <small>{plan.portfolio_risk_level ?? `${portfolio.length} position${portfolio.length > 1 ? "s" : ""} locale${portfolio.length > 1 ? "s" : ""}`}</small>
                    </article>
                  </div>

                  <section className={styles.resultCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <span className="eyebrow">COMMENCE ICI</span>
                        <h3>Tes 3 prochaines étapes</h3>
                        <p>Des actions de planification, jamais des instructions de placement.</p>
                      </div>
                    </div>
                    <div className={styles.nextSteps}>
                      {plan.priorities.slice(0, 3).map((priority, index) => (
                        <article className={`${styles.nextStep} ${priorityClass(priority.level)}`} key={priority.key}>
                          <span>{index + 1}</span>
                          <div>
                            <strong>{priority.title}</strong>
                            <p>{priority.detail}</p>
                            <small>{priority.action}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className={styles.resultCard} id="scenarios">
                    <div className={styles.cardHeader}>
                      <div>
                        <span className="eyebrow">SCÉNARIOS</span>
                        <h3>Où ton objectif pourrait se situer</h3>
                        <p>Trois hypothèses pour comprendre l’effet du temps et des contributions. Ce ne sont pas des prévisions.</p>
                      </div>
                    </div>
                    <div className={styles.scenarioSimpleGrid}>
                      {plan.projections.map((scenario) => (
                        <article className={styles.scenarioSimple} key={scenario.key}>
                          <span>{scenario.label}</span>
                          <strong>{formatMoney(scenario.projected_value, plan.currency)}</strong>
                          <small>Hypothèse de calcul : {scenario.annual_return_percent.toFixed(0)} % par an</small>
                          <div className={styles.progress}>
                            <i style={{ width: `${Math.min(100, scenario.progress_percent ?? 0)}%` }} />
                          </div>
                          <p>
                            {scenario.gap_to_target === null
                              ? "Ajoute un montant cible pour mesurer l’écart."
                              : scenario.gap_to_target >= 0
                                ? `Objectif dépassé de ${formatMoney(scenario.gap_to_target, plan.currency)}`
                                : `Il manquerait ${formatMoney(Math.abs(scenario.gap_to_target), plan.currency)}`}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <details className={styles.resultDetails}>
                    <summary>Voir le détail du risque et les simulations de baisse</summary>
                    <div className={styles.resultDetailGrid}>
                      <section>
                        <h3>Ce qui influence ta marge</h3>
                        <div className={styles.advisorDimensionList}>
                          {plan.risk_dimensions.map((dimension) => (
                            <article className={styles.advisorDimension} key={dimension.key}>
                              <div><span>{dimension.label}</span><strong>{dimension.value}</strong></div>
                              <p>{dimension.detail}</p>
                            </article>
                          ))}
                        </div>
                      </section>
                      <section>
                        <h3>Si la valeur baissait temporairement</h3>
                        <div className={styles.advisorStressGrid}>
                          {plan.stress_tests.map((test) => (
                            <article className={styles.advisorStress} key={test.label}>
                              <span>{test.label}</span>
                              <strong className={styles.negative}>-{formatMoney(test.estimated_loss, plan.currency)}</strong>
                              <small>Valeur restante : {formatMoney(test.estimated_value, plan.currency)}</small>
                            </article>
                          ))}
                          {!plan.stress_tests.length ? (
                            <div className={styles.notice}>Ajoute un capital actuel ou des positions au Portefeuille pour activer cette simulation.</div>
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
                      <strong>Besoin d’une explication ?</strong>
                      <small>Pose une question sur ton plan, ton risque ou tes scénarios.</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>

                  {showChat ? (
                    <section className={styles.simpleChat}>
                      <div className={`${styles.chatScroll} ${styles.chatList}`} ref={scrollRef}>
                        {!messages.length ? (
                          <div className={styles.emptyState}>
                            <Bot size={30} />
                            <strong>Que veux-tu comprendre ?</strong>
                            <span>Anatole répond avec des explications simples et sans recommandation de placement.</span>
                            <div className={styles.chipRow} style={{ justifyContent: "center" }}>
                              {STARTERS.map((prompt) => (
                                <button className={styles.promptChip} type="button" key={prompt} onClick={() => void send(prompt)}>{prompt}</button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {messages.map((message) => (
                          <article className={`${styles.chatMessage} ${message.role === "user" ? styles.chatMessageUser : styles.chatMessageAssistant} ${message.response?.guardrail_triggered ? styles.guardrailMessage : ""}`} key={message.id}>
                            {message.role === "assistant" && message.response ? (
                              <div className={styles.cardHeader} style={{ marginBottom: 10 }}>
                                <div><span className="eyebrow">ANATOLE CONSEIL</span><h3>{message.response.title}</h3></div>
                                <span className={styles.statusPill}>Confiance {message.response.confidence}</span>
                              </div>
                            ) : null}
                            <p>{message.text}</p>
                            {message.response?.facts.length ? (
                              <div className={styles.factGrid}>
                                {message.response.facts.map((fact) => (
                                  <div className={styles.fact} key={`${message.id}-${fact.label}`}>
                                    <span>{fact.label}</span>
                                    <strong className={toneClass(fact.tone)}>{fact.value}</strong>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {message.response?.links.length ? (
                              <div className={styles.assistantLinks}>
                                {message.response.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
                              </div>
                            ) : null}
                            {message.response ? <div className={styles.assistantDisclaimer}>{message.response.disclaimer}</div> : null}
                          </article>
                        ))}

                        {loading ? (
                          <article className={`${styles.chatMessage} ${styles.chatMessageAssistant}`}>
                            <div className={styles.inlineBetween}><span>Anatole prépare une explication simple…</span><Sparkles size={16} /></div>
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
                            placeholder="Ex. Explique-moi pourquoi ma réserve est importante…"
                          />
                          <button className={styles.primaryButton} type="submit" disabled={loading || !input.trim()}><Send size={16} /> Envoyer</button>
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
                  <strong>Ton plan n’a pas encore été calculé</strong>
                  <span>Clique sur « Calculer mon plan » pour obtenir une lecture claire de tes réponses.</span>
                  <button className={styles.primaryButton} type="button" onClick={() => void refreshPlan(4)}>Calculer mon plan</button>
                </div>
              ) : null}
            </>
          ) : null}

          <footer className={styles.stepFooter}>
            <button className={styles.secondaryButton} type="button" onClick={previous} disabled={step === 1}>
              <ArrowLeft size={15} /> Précédent
            </button>
            {step < 4 ? (
              <button className={styles.primaryButton} type="button" onClick={next}>
                {step === 3 ? "Voir mon plan" : "Continuer"} <ArrowRight size={15} />
              </button>
            ) : (
              <button className={styles.secondaryButton} type="button" onClick={() => setStep(1)}>
                Modifier mes réponses
              </button>
            )}
          </footer>
        </section>

        <aside className={styles.guideAside}>
          <section className={`panel ${styles.helpCard}`}>
            <span className="eyebrow">CE QUE TU FAIS ICI</span>
            <h3>{STEPS[step - 1].label}</h3>
            {step === 1 ? <p>Tu précises le but, le montant et le délai. Anatole pourra ensuite mesurer l’écart entre aujourd’hui et ton objectif.</p> : null}
            {step === 2 ? <p>Tu indiques les ressources et les contraintes réelles. Cela évite de construire un plan qui utiliserait de l’argent nécessaire à court terme.</p> : null}
            {step === 3 ? <p>Tu décris ta réaction probable face aux variations. Le plan doit être financièrement possible et émotionnellement supportable.</p> : null}
            {step === 4 ? <p>Tu lis d’abord les prochaines étapes, puis les scénarios. Les détails techniques restent disponibles sans encombrer l’écran.</p> : null}
          </section>

          <section className={`panel ${styles.helpCard}`}>
            <span className="eyebrow">RÉSUMÉ ACTUEL</span>
            <div className={styles.contextRow}><span>Objectif</span><strong>{goalLabel}</strong></div>
            <div className={styles.contextRow}><span>Montant visé</span><strong>{formatMoney(profile.target_amount, profile.currency)}</strong></div>
            <div className={styles.contextRow}><span>Horizon</span><strong>{profile.horizon_years ? `${profile.horizon_years} an${profile.horizon_years > 1 ? "s" : ""}` : "Non défini"}</strong></div>
            <div className={styles.contextRow}><span>Profil rempli</span><strong>{profileProgress} %</strong></div>
          </section>

          <section className={`panel ${styles.helpCard}`}>
            <span className="eyebrow">AUTRES OUTILS</span>
            <div className={styles.assistantLinks}>
              <Link href="/portefeuille"><BriefcaseBusiness size={13} /> Portefeuille</Link>
              <Link href="/qualite"><Database size={13} /> Qualité des données</Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
