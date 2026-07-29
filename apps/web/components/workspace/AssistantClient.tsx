"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  BriefcaseBusiness,
  Database,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
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

const STARTERS = [
  "Construis mon plan à partir de mon objectif",
  "Teste une baisse de 20 % sur mon portefeuille",
  "Où se concentre mon risque ?",
  "Suis-je sur la bonne voie selon mes scénarios ?",
];

const GOALS: Array<{ value: AdvisorGoalType; label: string }> = [
  { value: "retirement", label: "Retraite" },
  { value: "home", label: "Projet immobilier" },
  { value: "education", label: "Études" },
  { value: "reserve", label: "Réserve de sécurité" },
  { value: "wealth", label: "Capital à long terme" },
  { value: "flexible", label: "Objectif flexible" },
];

const LEVELS: Array<{ value: AdvisorLevel; label: string }> = [
  { value: "low", label: "Faible" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Élevée" },
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
  if (value === null || !Number.isFinite(value)) return "N/D";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function planTone(score: number): string {
  if (score >= 70) return styles.positive;
  if (score < 45) return styles.negative;
  return styles.info;
}

export function AssistantClient() {
  const searchParams = useSearchParams();
  const contextSymbol = searchParams.get("symbol")?.toUpperCase() ?? undefined;
  const [portfolio, setPortfolio] = useState<PortfolioPositionInput[]>([]);
  const [profile, setProfile] = useState<AdvisorProfile>(EMPTY_PROFILE);
  const [plan, setPlan] = useState<AdvisorPlan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(contextSymbol ? `Analyse ${contextSymbol}` : "");
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshPlan = useCallback(
    async (
      nextProfile: AdvisorProfile = profile,
      nextPortfolio: PortfolioPositionInput[] = portfolio,
    ) => {
      setPlanLoading(true);
      setPlanError(null);
      const controller = new AbortController();
      try {
        const snapshot = await getAdvisorPlan(nextProfile, nextPortfolio, controller.signal);
        setPlan(snapshot);
      } catch (reason) {
        setPlanError(
          reason instanceof Error
            ? reason.message
            : "Le diagnostic est temporairement indisponible.",
        );
      } finally {
        setPlanLoading(false);
      }
    },
    [portfolio, profile],
  );

  useEffect(() => {
    const nextPortfolio = loadPortfolio();
    const nextProfile = loadProfile();
    setPortfolio(nextPortfolio);
    setProfile(nextProfile);
    setHydrated(true);
    void refreshPlan(nextProfile, nextPortfolio);
    // Le chargement initial ne doit s’exécuter qu’une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const updateProfile = <K extends keyof AdvisorProfile>(
    key: K,
    value: AdvisorProfile[K],
  ) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const updateNumber = (key: NumericProfileKey, value: string) => {
    const parsed = value === "" ? null : Number(value);
    updateProfile(key, parsed !== null && Number.isFinite(parsed) ? parsed : null);
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
    const controller = new AbortController();
    try {
      const response = await askAnatole(
        clean,
        {
          contextSymbol,
          portfolioPositions: portfolio,
          advisorProfile: profile,
        },
        controller.signal,
      );
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
          : "Le copilote est temporairement indisponible.",
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

  const profileSummary = useMemo(() => {
    const goal = GOALS.find((item) => item.value === profile.goal_type)?.label;
    return goal ?? "Objectif à définir";
  }, [profile.goal_type]);

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">COPILOTE FINANCIER · V0.7.1</span>
          <h1>Anatole Conseil</h1>
          <p>
            Un robot-conseiller de planification qui structure les objectifs, mesure les
            contraintes, teste des scénarios et surveille le risque. Il ne choisit aucun
            placement et ne formule jamais d’instruction d’achat, de vente ou de maintien.
          </p>
        </div>
        <div className={styles.heroMetric}>
          <strong className={plan ? planTone(plan.readiness_score) : ""}>
            {plan ? Math.round(plan.readiness_score) : "—"}
          </strong>
          <span>score de préparation</span>
          <small>
            {profileSummary} · {portfolio.length} position
            {portfolio.length > 1 ? "s" : ""} locale
            {portfolio.length > 1 ? "s" : ""}
          </small>
        </div>
      </section>

      <section className={styles.advisorBoundary}>
        <ShieldCheck size={20} />
        <div>
          <strong>Conseil de processus, jamais conseil de placement</strong>
          <span>
            Anatole travaille sur le cadre de décision, les scénarios, la liquidité,
            la concentration et les risques. Le profil est sauvegardé uniquement dans ton navigateur et transmis temporairement à l’API pour le calcul.
          </span>
        </div>
      </section>

      <section className={styles.kpiGrid}>
        <article className={`panel ${styles.kpiCard}`}>
          <span>Profil complété</span>
          <strong>{plan ? `${plan.profile_completeness} %` : "—"}</strong>
          <small>Qualité des informations déclarées</small>
        </article>
        <article className={`panel ${styles.kpiCard}`}>
          <span>Capacité de risque</span>
          <strong>{plan?.capacity_profile ?? "À évaluer"}</strong>
          <small>Horizon, liquidité et stabilité</small>
        </article>
        <article className={`panel ${styles.kpiCard}`}>
          <span>Réserve liquide</span>
          <strong>{plan?.reserve_months !== null && plan?.reserve_months !== undefined ? `${plan.reserve_months.toFixed(1)} mois` : "N/D"}</strong>
          <small>Couverture des dépenses essentielles</small>
        </article>
        <article className={`panel ${styles.kpiCard}`}>
          <span>Score portefeuille</span>
          <strong>{plan?.portfolio_score !== null && plan?.portfolio_score !== undefined ? `${Math.round(plan.portfolio_score)}/100` : "N/D"}</strong>
          <small>{plan?.portfolio_risk_level ?? "Ajoute des positions"}</small>
        </article>
        <article className={`panel ${styles.kpiCard}`}>
          <span>Priorités actives</span>
          <strong>{plan?.priorities.length ?? 0}</strong>
          <small>Ordonnées par contrainte</small>
        </article>
      </section>

      <div className={styles.advisorWorkspace}>
        <section className={`panel ${styles.advisorProfilePanel}`} id="profil">
          <div className={styles.sectionHeading}>
            <div>
              <span className="eyebrow">PROFIL LOCAL</span>
              <h2>Cadre de décision</h2>
              <p>Renseigne uniquement les éléments utiles. Aucun compte n’est requis et le serveur ne conserve pas ce profil.</p>
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={planLoading}
              onClick={() => void refreshPlan()}
            >
              <RefreshCw size={15} /> {planLoading ? "Calcul…" : "Actualiser"}
            </button>
          </div>

          {planError ? <div className={styles.errorNotice}>{planError}</div> : null}

          <div className={styles.advisorFormGrid}>
            <label className={styles.field}>
              <span>Objectif principal</span>
              <select
                value={profile.goal_type ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  updateProfile(
                    "goal_type",
                    event.target.value ? (event.target.value as AdvisorGoalType) : null,
                  )
                }
              >
                <option value="">À définir</option>
                {GOALS.map((goal) => (
                  <option key={goal.value} value={goal.value}>{goal.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Nom du projet</span>
              <input
                value={profile.goal_name ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateProfile("goal_name", event.target.value || null)}
                placeholder="Ex. Mise de fonds"
              />
            </label>
            <label className={styles.field}>
              <span>Horizon (années)</span>
              <input
                type="number"
                min="1"
                max="50"
                value={profile.horizon_years ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("horizon_years", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Devise</span>
              <select
                value={profile.currency}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateProfile("currency", event.target.value as "CAD" | "USD")}
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Objectif financier</span>
              <input
                type="number"
                min="0"
                value={profile.target_amount ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("target_amount", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Capital actuel</span>
              <input
                type="number"
                min="0"
                value={profile.current_savings ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("current_savings", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Contribution mensuelle</span>
              <input
                type="number"
                min="0"
                value={profile.monthly_contribution ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("monthly_contribution", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Dépenses essentielles / mois</span>
              <input
                type="number"
                min="0"
                value={profile.essential_monthly_expenses ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("essential_monthly_expenses", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Réserve liquide</span>
              <input
                type="number"
                min="0"
                value={profile.liquid_reserve ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateNumber("liquid_reserve", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Stabilité des entrées</span>
              <select
                value={profile.income_stability ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateProfile("income_stability", event.target.value ? event.target.value as AdvisorLevel : null)}
              >
                <option value="">À définir</option>
                {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Besoin de liquidité</span>
              <select
                value={profile.liquidity_need ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateProfile("liquidity_need", event.target.value ? event.target.value as AdvisorLevel : null)}
              >
                <option value="">À définir</option>
                {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Confort face aux baisses</span>
              <select
                value={profile.loss_comfort ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateProfile("loss_comfort", event.target.value ? event.target.value as AdvisorLevel : null)}
              >
                <option value="">À définir</option>
                {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Expérience</span>
              <select
                value={profile.experience ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateProfile("experience", event.target.value ? event.target.value as AdvisorProfile["experience"] : null)}
              >
                <option value="">À définir</option>
                <option value="beginner">Débutante</option>
                <option value="intermediate">Intermédiaire</option>
                <option value="advanced">Avancée</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Dette à coût élevé</span>
              <select
                value={profile.high_interest_debt === null ? "" : profile.high_interest_debt ? "yes" : "no"}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  updateProfile(
                    "high_interest_debt",
                    event.target.value === "" ? null : event.target.value === "yes",
                  )
                }
              >
                <option value="">À définir</option>
                <option value="no">Non</option>
                <option value="yes">Oui</option>
              </select>
            </label>
          </div>
        </section>

        <section className={`panel ${styles.advisorPlanPanel}`}>
          <div className={styles.sectionHeading}>
            <div>
              <span className="eyebrow">PLAN DE DÉCISION</span>
              <h2>{plan?.title ?? "Diagnostic en préparation"}</h2>
              <p>{plan?.summary ?? "Complète le profil pour obtenir un plan structuré."}</p>
            </div>
            <Target size={26} />
          </div>

          <div className={styles.advisorPriorityList}>
            {plan?.priorities.map((priority, index) => (
              <article
                className={`${styles.advisorPriority} ${priority.level === "high" ? styles.priorityHigh : priority.level === "medium" ? styles.priorityMedium : styles.priorityLow}`}
                key={priority.key}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{priority.title}</strong>
                  <p>{priority.detail}</p>
                  <small>{priority.action}</small>
                </div>
              </article>
            ))}
            {!plan?.priorities.length ? (
              <div className={styles.emptyState}>
                <Sparkles size={28} />
                <strong>Aucune priorité calculée</strong>
                <span>Actualise le diagnostic après avoir complété le profil.</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className={`panel ${styles.advisorScenarioPanel}`} id="scenarios">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">SCÉNARIOS ILLUSTRATIFS</span>
            <h2>Trajectoire de l’objectif</h2>
            <p>Les taux servent uniquement à tester la sensibilité du plan. Ils ne sont ni des prévisions ni des rendements promis.</p>
          </div>
        </div>
        <div className={styles.advisorScenarioGrid}>
          {plan?.projections.map((scenario) => (
            <article className={styles.advisorScenario} key={scenario.key}>
              <span>{scenario.label}</span>
              <strong>{formatMoney(scenario.projected_value, plan.currency)}</strong>
              <small>Hypothèse annuelle : {scenario.annual_return_percent.toFixed(0)} %</small>
              <div className={styles.progress}>
                <i style={{ width: `${Math.min(100, scenario.progress_percent ?? 0)}%` }} />
              </div>
              <p>
                {scenario.gap_to_target === null
                  ? "Ajoute un objectif financier pour mesurer l’écart."
                  : `${scenario.gap_to_target >= 0 ? "Marge" : "Écart"} : ${formatMoney(Math.abs(scenario.gap_to_target), plan.currency)}`}
              </p>
            </article>
          ))}
          {!plan?.projections.length ? (
            <div className={styles.notice}>Ajoute un horizon pour générer les scénarios.</div>
          ) : null}
        </div>
      </section>

      <div className={styles.gridEqual}>
        <section className={`panel ${styles.panel}`}>
          <div className={styles.sectionHeading}>
            <div><span className="eyebrow">CAPACITÉ DE RISQUE</span><h2>Contraintes structurantes</h2></div>
          </div>
          <div className={styles.advisorDimensionList}>
            {plan?.risk_dimensions.map((dimension) => (
              <article className={styles.advisorDimension} key={dimension.key}>
                <div><span>{dimension.label}</span><strong>{dimension.value}</strong></div>
                <p>{dimension.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`panel ${styles.panel}`}>
          <div className={styles.sectionHeading}>
            <div><span className="eyebrow">STRESS TEST</span><h2>Impact mécanique d’une baisse</h2></div>
          </div>
          <div className={styles.advisorStressGrid}>
            {plan?.stress_tests.map((test) => (
              <article className={styles.advisorStress} key={test.label}>
                <span>{test.label}</span>
                <strong className={styles.negative}>-{formatMoney(test.estimated_loss, plan.currency)}</strong>
                <small>Valeur restante : {formatMoney(test.estimated_value, plan.currency)}</small>
              </article>
            ))}
            {!plan?.stress_tests.length ? (
              <div className={styles.notice}>Ajoute un capital actuel ou des positions au Portefeuille pour activer les stress tests.</div>
            ) : null}
          </div>
        </section>
      </div>

      <div className={styles.assistantLayout}>
        <section className={`panel ${styles.chatPanel}`}>
          <header className={styles.chatHeader}>
            <div className={styles.cardHeader}>
              <div>
                <span className="eyebrow">DIALOGUE GUIDÉ</span>
                <h3>Copilote de décision</h3>
                <p>Questions de planification, scénarios, concentration, risques et suivi.</p>
              </div>
              <span className={`${styles.statusPill} ${styles.statusHealthy}`}>Sans recommandation</span>
            </div>
          </header>

          <div className={`${styles.chatScroll} ${styles.chatList}`} ref={scrollRef}>
            {!messages.length ? (
              <div className={styles.emptyState}>
                <Bot size={32} />
                <strong>Quel problème veux-tu structurer ?</strong>
                <span>Le copilote répond avec un cadre, des scénarios et des garde-fous.</span>
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
                {message.response?.sources.length ? (
                  <div className={styles.notice} style={{ marginTop: 12 }}>
                    <strong>Sources :</strong> {message.response.sources.map((source) => `${source.label} — ${source.detail}`).join(" · ")}
                  </div>
                ) : null}
                {message.response ? <div className={styles.assistantDisclaimer}>{message.response.disclaimer}</div> : null}
                <time>{new Date(message.createdAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</time>
              </article>
            ))}

            {loading ? (
              <article className={`${styles.chatMessage} ${styles.chatMessageAssistant}`}>
                <div className={styles.inlineBetween}><span>Construction du cadre de décision…</span><Sparkles size={16} /></div>
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
                placeholder="Ex. Teste mon plan, explique ma concentration, simule une baisse de 20 %…"
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

        <aside className={styles.compactList}>
          <section className={`panel ${styles.contextCard}`}>
            <div className={styles.cardHeader}><div><span className="eyebrow">CONTEXTE</span><h3>Données utilisées</h3></div></div>
            <div className={styles.contextRow}><span>Objectif</span><strong>{profileSummary}</strong></div>
            <div className={styles.contextRow}><span>Portefeuille</span><strong>{portfolio.length} position{portfolio.length > 1 ? "s" : ""}</strong></div>
            <div className={styles.contextRow}><span>Symbole actif</span><strong>{contextSymbol ?? "Aucun"}</strong></div>
            <div className={styles.contextRow}><span>Stockage</span><strong>Local au navigateur</strong></div>
          </section>

          <section className={`panel ${styles.contextCard}`}>
            <div className={styles.cardHeader}><div><span className="eyebrow">GARDE-FOUS</span><h3>Ce qu’il ne fait pas</h3></div></div>
            {plan?.boundaries.map((boundary) => (
              <div className={styles.advisorBoundaryItem} key={boundary}><ShieldCheck size={13} /><span>{boundary}</span></div>
            ))}
          </section>

          <section className={`panel ${styles.contextCard}`}>
            <div className={styles.cardHeader}><div><span className="eyebrow">OUTILS</span><h3>Approfondir</h3></div></div>
            <div className={styles.contextRow}><span><Database size={13} /> Données</span><strong>Qualité et fraîcheur</strong></div>
            <div className={styles.contextRow}><span><BriefcaseBusiness size={13} /> Risque</span><strong>Portefeuille</strong></div>
            <div className={styles.assistantLinks}>
              <Link href="/portefeuille">Portefeuille</Link>
              <Link href="/alertes">Alertes</Link>
              <Link href="/comparateur">Comparateur</Link>
              <Link href="/qualite">Qualité</Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
