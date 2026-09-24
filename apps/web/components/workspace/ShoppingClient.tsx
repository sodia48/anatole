"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeDollarSign,
  Banknote,
  Calculator,
  Car,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  FileText,
  GraduationCap,
  House,
  Landmark,
  LifeBuoy,
  Plus,
  ReceiptText,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useMemo,
  useState,
} from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";
import {
  DEFAULT_SHOPPING_PROFILE,
  SHOPPING_CATEGORIES,
  SHOPPING_SOURCES,
  STARTER_OFFERS,
  emptyOfferFor,
  evaluateShoppingOffers,
  offersForCategory,
  sourcesForCategory,
  type ShoppingCategoryId,
  type ShoppingOffer,
  type ShoppingOfferMetrics,
  type ShoppingPriority,
  type ShoppingProfile,
} from "@/lib/shopping";

import styles from "./Shopping.module.css";

const ICONS = {
  credit_card: CreditCard,
  banking: Landmark,
  mortgage: House,
  student_loan: GraduationCap,
  personal_loan: Banknote,
  auto_insurance: Car,
  life_insurance: ShieldCheck,
  tax: ReceiptText,
} satisfies Record<ShoppingCategoryId, typeof CreditCard>;

const PRIORITIES: Array<{
  id: ShoppingPriority;
  fr: string;
  en: string;
}> = [
  { id: "lowest_cost", fr: "Coût total", en: "Total cost" },
  { id: "lowest_rate", fr: "Taux", en: "Rate" },
  { id: "rewards", fr: "Récompenses", en: "Rewards" },
  { id: "flexibility", fr: "Flexibilité", en: "Flexibility" },
  { id: "coverage", fr: "Protection", en: "Coverage" },
  { id: "simplicity", fr: "Simplicité", en: "Simplicity" },
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

function money(
  value: number | null | undefined,
  language: "fr" | "en",
  maximumFractionDigits = 0,
): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits,
  }).format(value);
}

function percent(
  value: number | null | undefined,
  language: "fr" | "en",
): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${value.toLocaleString(localeFor(language), {
    maximumFractionDigits: 2,
  })} %`;
}

function numberValue(
  value: number | null | undefined,
): string {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function NumericInput({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  step = "0.01",
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  suffix?: string;
  min?: number;
  step?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <div className={styles.numericField}>
        <input
          min={min}
          step={step}
          type="number"
          value={numberValue(value)}
          onChange={(event) => onChange(parseNumber(event.target.value))}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function offerMetricSummary(
  offer: ShoppingOffer,
  language: "fr" | "en",
): string[] {
  const m = offer.metrics;
  if (offer.category === "credit_card") {
    return [
      `${pick(language, "Frais", "Fee")}: ${money(m.annualFee, language)}`,
      `${pick(language, "Taux achats", "Purchase rate")}: ${percent(m.purchaseRatePercent, language)}`,
      `${pick(language, "Récompenses", "Rewards")}: ${percent(m.rewardRatePercent, language)}`,
    ];
  }
  if (offer.category === "banking") {
    return [
      `${pick(language, "Frais/mois", "Monthly fee")}: ${money(m.monthlyFee, language, 2)}`,
      `${pick(language, "Transactions", "Transactions")}: ${m.includedTransactions != null && m.includedTransactions >= 9999 ? pick(language, "Illimitées", "Unlimited") : m.includedTransactions ?? "N/D"}`,
      `${pick(language, "Intérêt", "Interest")}: ${percent(m.savingsRatePercent, language)}`,
    ];
  }
  if (
    offer.category === "mortgage" ||
    offer.category === "student_loan" ||
    offer.category === "personal_loan"
  ) {
    return [
      `${pick(language, "Taux", "Rate")}: ${percent(m.interestRatePercent, language)}`,
      `${pick(language, "Terme", "Term")}: ${m.termMonths ? `${m.termMonths} ${pick(language, "mois", "months")}` : "N/D"}`,
      `${pick(language, "Frais", "Fees")}: ${money(m.upfrontFees, language)}`,
    ];
  }
  if (
    offer.category === "auto_insurance" ||
    offer.category === "life_insurance"
  ) {
    return [
      `${pick(language, "Prime", "Premium")}: ${money(m.annualPremium, language)}/${pick(language, "an", "yr")}`,
      `${pick(language, "Franchise", "Deductible")}: ${money(m.deductible, language)}`,
      `${pick(language, "Protection", "Coverage")}: ${money(m.coverageAmount, language)}`,
    ];
  }
  return [
    `${pick(language, "Prix saisi", "Entered price")}: ${money(m.taxPrice, language)}`,
    m.online ? pick(language, "En ligne", "Online") : "",
    m.mobile ? pick(language, "Mobile", "Mobile") : "",
  ].filter(Boolean);
}

export function ShoppingClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [category, setCategory] =
    useState<ShoppingCategoryId>("credit_card");
  const [profile, setProfile] =
    useState<ShoppingProfile>(DEFAULT_SHOPPING_PROFILE);
  const [offers, setOffers] =
    useState<ShoppingOffer[]>(STARTER_OFFERS);
  const [currentOfferId, setCurrentOfferId] =
    useState<string | null>(null);
  const [draft, setDraft] =
    useState<ShoppingOffer>(() => emptyOfferFor("credit_card"));
  const [showBuilder, setShowBuilder] = useState(false);

  const categoryMeta = useMemo(
    () => SHOPPING_CATEGORIES.find((item) => item.id === category)!,
    [category],
  );
  const categoryOffers = useMemo(
    () => offersForCategory(category, offers),
    [category, offers],
  );
  const sources = useMemo(
    () => sourcesForCategory(category),
    [category],
  );
  const evaluations = useMemo(
    () =>
      evaluateShoppingOffers(
        categoryOffers,
        profile,
        currentOfferId,
      ),
    [categoryOffers, currentOfferId, profile],
  );

  const currentEvaluation = evaluations.find(
    (item) => item.offer.id === currentOfferId,
  );
  const best = evaluations.find(
    (item) => item.offer.id !== currentOfferId,
  );

  function changeCategory(next: ShoppingCategoryId) {
    setCategory(next);
    setCurrentOfferId(null);
    setDraft(emptyOfferFor(next));
    setShowBuilder(false);
  }

  function updateProfile<K extends keyof ShoppingProfile>(
    key: K,
    value: ShoppingProfile[K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateDraftMetric<K extends keyof ShoppingOfferMetrics>(
    key: K,
    value: ShoppingOfferMetrics[K],
  ) {
    setDraft((current) => ({
      ...current,
      metrics: { ...current.metrics, [key]: value },
    }));
  }

  function resetDraft() {
    setDraft(emptyOfferFor(category));
  }

  function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.provider.trim() || !draft.name.trim()) return;

    const id = `custom-${category}-${Date.now()}`;
    setOffers((current) => [
      ...current,
      {
        ...draft,
        id,
        category,
        provider: draft.provider.trim(),
        name: draft.name.trim(),
        sourceUrl: draft.sourceUrl.trim(),
        notes: draft.notes.filter(Boolean),
      },
    ]);
    resetDraft();
    setShowBuilder(false);
  }

  function removeOffer(id: string) {
    setOffers((current) => current.filter((offer) => offer.id !== id));
    if (currentOfferId === id) setCurrentOfferId(null);
  }

  function restoreStarters() {
    setOffers((current) => {
      const custom = current.filter((item) => !item.starter);
      return [...STARTER_OFFERS, ...custom];
    });
  }

  function renderProfileFields() {
    if (category === "credit_card") {
      return (
        <>
          <NumericInput
            label={pick(language, "Dépenses mensuelles", "Monthly spend")}
            suffix="CAD"
            value={profile.monthlyCardSpend}
            onChange={(value) =>
              updateProfile("monthlyCardSpend", value ?? 0)
            }
          />
          <NumericInput
            label={pick(language, "Solde moyen reporté", "Average carried balance")}
            suffix="CAD"
            value={profile.carriedCardBalance}
            onChange={(value) =>
              updateProfile("carriedCardBalance", value ?? 0)
            }
          />
        </>
      );
    }

    if (category === "banking") {
      return (
        <>
          <NumericInput
            label={pick(language, "Solde moyen", "Average balance")}
            suffix="CAD"
            value={profile.averageBankBalance}
            onChange={(value) =>
              updateProfile("averageBankBalance", value ?? 0)
            }
          />
          <NumericInput
            label={pick(language, "Transactions / mois", "Transactions / month")}
            step="1"
            value={profile.monthlyTransactions}
            onChange={(value) =>
              updateProfile("monthlyTransactions", value ?? 0)
            }
          />
        </>
      );
    }

    if (
      category === "mortgage" ||
      category === "student_loan" ||
      category === "personal_loan"
    ) {
      return (
        <>
          <NumericInput
            label={pick(language, "Montant à financer", "Amount to finance")}
            suffix="CAD"
            value={profile.loanAmount}
            onChange={(value) =>
              updateProfile("loanAmount", value ?? 0)
            }
          />
          {category === "mortgage" ? (
            <NumericInput
              label={pick(language, "Amortissement", "Amortization")}
              suffix={pick(language, "ans", "years")}
              step="1"
              value={profile.amortizationYears}
              onChange={(value) =>
                updateProfile("amortizationYears", value ?? 25)
              }
            />
          ) : null}
        </>
      );
    }

    if (
      category === "auto_insurance" ||
      category === "life_insurance"
    ) {
      return (
        <NumericInput
          label={pick(language, "Protection cible", "Target coverage")}
          suffix="CAD"
          value={profile.desiredCoverage}
          onChange={(value) =>
            updateProfile("desiredCoverage", value ?? 0)
          }
        />
      );
    }

    return (
      <div className={styles.taxChecks}>
        <label>
          <input
            checked={profile.taxQuebecReturn}
            type="checkbox"
            onChange={(event) =>
              updateProfile("taxQuebecReturn", event.target.checked)
            }
          />
          <span>{pick(language, "Déclaration Québec TP-1", "Québec TP-1 return")}</span>
        </label>
        <label>
          <input
            checked={profile.taxSelfEmployed}
            type="checkbox"
            onChange={(event) =>
              updateProfile("taxSelfEmployed", event.target.checked)
            }
          />
          <span>{pick(language, "Travail autonome", "Self-employed")}</span>
        </label>
        <label>
          <input
            checked={profile.taxForeignAssets}
            type="checkbox"
            onChange={(event) =>
              updateProfile("taxForeignAssets", event.target.checked)
            }
          />
          <span>{pick(language, "Actifs étrangers / T1135", "Foreign assets / T1135")}</span>
        </label>
      </div>
    );
  }

  function renderDraftMetrics() {
    if (category === "credit_card") {
      return (
        <>
          <NumericInput
            label={pick(language, "Frais annuels", "Annual fee")}
            suffix="CAD"
            value={draft.metrics.annualFee}
            onChange={(value) => updateDraftMetric("annualFee", value)}
          />
          <NumericInput
            label={pick(language, "Taux achats", "Purchase rate")}
            suffix="%"
            value={draft.metrics.purchaseRatePercent}
            onChange={(value) =>
              updateDraftMetric("purchaseRatePercent", value)
            }
          />
          <NumericInput
            label={pick(language, "Valeur récompenses", "Reward rate")}
            suffix="%"
            value={draft.metrics.rewardRatePercent}
            onChange={(value) =>
              updateDraftMetric("rewardRatePercent", value)
            }
          />
          <NumericInput
            label={pick(language, "Prime de bienvenue", "Welcome value")}
            suffix="CAD"
            value={draft.metrics.welcomeValue}
            onChange={(value) => updateDraftMetric("welcomeValue", value)}
          />
        </>
      );
    }

    if (category === "banking") {
      return (
        <>
          <NumericInput
            label={pick(language, "Frais mensuels", "Monthly fee")}
            suffix="CAD"
            value={draft.metrics.monthlyFee}
            onChange={(value) => updateDraftMetric("monthlyFee", value)}
          />
          <NumericInput
            label={pick(language, "Transactions incluses", "Included transactions")}
            step="1"
            value={draft.metrics.includedTransactions}
            onChange={(value) =>
              updateDraftMetric("includedTransactions", value)
            }
          />
          <NumericInput
            label={pick(language, "Frais par transaction excédentaire", "Overage transaction fee")}
            suffix="CAD"
            value={draft.metrics.transactionFee}
            onChange={(value) =>
              updateDraftMetric("transactionFee", value)
            }
          />
          <NumericInput
            label={pick(language, "Taux d’intérêt", "Interest rate")}
            suffix="%"
            value={draft.metrics.savingsRatePercent}
            onChange={(value) =>
              updateDraftMetric("savingsRatePercent", value)
            }
          />
        </>
      );
    }

    if (
      category === "mortgage" ||
      category === "student_loan" ||
      category === "personal_loan"
    ) {
      return (
        <>
          <NumericInput
            label={pick(language, "Taux", "Rate")}
            suffix="%"
            value={draft.metrics.interestRatePercent}
            onChange={(value) =>
              updateDraftMetric("interestRatePercent", value)
            }
          />
          <NumericInput
            label={pick(language, "Terme", "Term")}
            suffix={pick(language, "mois", "months")}
            step="1"
            value={draft.metrics.termMonths}
            onChange={(value) =>
              updateDraftMetric("termMonths", value)
            }
          />
          <NumericInput
            label={pick(language, "Frais initiaux", "Upfront fees")}
            suffix="CAD"
            value={draft.metrics.upfrontFees}
            onChange={(value) =>
              updateDraftMetric("upfrontFees", value)
            }
          />
          {category === "mortgage" ? (
            <label className={styles.field}>
              <span>{pick(language, "Type de taux", "Rate type")}</span>
              <select
                value={draft.metrics.rateType ?? "fixed"}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  updateDraftMetric(
                    "rateType",
                    event.target.value as "fixed" | "variable" | "other",
                  )
                }
              >
                <option value="fixed">{pick(language, "Fixe", "Fixed")}</option>
                <option value="variable">{pick(language, "Variable", "Variable")}</option>
                <option value="other">{pick(language, "Autre", "Other")}</option>
              </select>
            </label>
          ) : null}
        </>
      );
    }

    if (
      category === "auto_insurance" ||
      category === "life_insurance"
    ) {
      return (
        <>
          <NumericInput
            label={pick(language, "Prime annuelle", "Annual premium")}
            suffix="CAD"
            value={draft.metrics.annualPremium}
            onChange={(value) =>
              updateDraftMetric("annualPremium", value)
            }
          />
          <NumericInput
            label={pick(language, "Franchise", "Deductible")}
            suffix="CAD"
            value={draft.metrics.deductible}
            onChange={(value) =>
              updateDraftMetric("deductible", value)
            }
          />
          <NumericInput
            label={pick(language, "Protection", "Coverage")}
            suffix="CAD"
            value={draft.metrics.coverageAmount}
            onChange={(value) =>
              updateDraftMetric("coverageAmount", value)
            }
          />
        </>
      );
    }

    return (
      <>
        <NumericInput
          label={pick(language, "Prix", "Price")}
          suffix="CAD"
          value={draft.metrics.taxPrice}
          onChange={(value) => updateDraftMetric("taxPrice", value)}
        />
        <div className={styles.taxChecks}>
          <label>
            <input
              checked={draft.metrics.supportsQuebec ?? false}
              type="checkbox"
              onChange={(event) =>
                updateDraftMetric("supportsQuebec", event.target.checked)
              }
            />
            <span>Québec TP-1</span>
          </label>
          <label>
            <input
              checked={draft.metrics.supportsSelfEmployed ?? false}
              type="checkbox"
              onChange={(event) =>
                updateDraftMetric(
                  "supportsSelfEmployed",
                  event.target.checked,
                )
              }
            />
            <span>{pick(language, "Travail autonome", "Self-employed")}</span>
          </label>
          <label>
            <input
              checked={draft.metrics.supportsForeignAssets ?? false}
              type="checkbox"
              onChange={(event) =>
                updateDraftMetric(
                  "supportsForeignAssets",
                  event.target.checked,
                )
              }
            />
            <span>T1135</span>
          </label>
        </div>
      </>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link href="/assistant" className={styles.back}>
            <ArrowLeft size={15} />
            {pick(language, "Anatole Conseil", "Anatole Advice")}
          </Link>
          <span className={styles.eyebrow}>
            ANATOLE {pick(language, "MAGASINER", "SHOP")}
          </span>
          <h1>
            {pick(
              language,
              "Les chiffres avant le marketing.",
              "Numbers before marketing.",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Choisis ton besoin, ajoute les offres que tu trouves et laisse Anatole normaliser les frais, taux, paiements et protections. Le classement reflète tes critères — jamais un placement publicitaire.",
              "Choose what you need, add the offers you find and let Anatole normalize fees, rates, payments and coverage. Ranking follows your criteria — never ad placement.",
            )}
          </p>
          <div className={styles.heroBadges}>
            <span><ShieldCheck size={14} /> {pick(language, "Aucun classement sponsorisé", "No sponsored ranking")}</span>
            <span><Calculator size={14} /> {pick(language, "Calculs locaux et transparents", "Local, transparent calculations")}</span>
            <span><Scale size={14} /> {pick(language, "Sources officielles en premier", "Official sources first")}</span>
          </div>
        </div>
        <div className={styles.heroLens}>
          <Sparkles size={22} />
          <span>{pick(language, "ANATOLE MATCH", "ANATOLE MATCH")}</span>
          <strong>{best ? `${best.matchScore}%` : "—"}</strong>
          <small>
            {best
              ? pick(language, "meilleure correspondance comparée", "highest compared match")
              : pick(language, "ajoute une offre pour commencer", "add an offer to start")}
          </small>
        </div>
      </header>

      <section className={styles.categoryPanel}>
        <div className={styles.sectionTitle}>
          <div>
            <span>01</span>
            <h2>{pick(language, "Qu’est-ce que tu magasines ?", "What are you shopping for?")}</h2>
          </div>
          <small>{pick(language, "8 univers · une méthode", "8 categories · one method")}</small>
        </div>
        <div className={styles.categoryGrid}>
          {SHOPPING_CATEGORIES.map((item) => {
            const Icon = ICONS[item.id];
            const active = item.id === category;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                className={`${styles.categoryCard} ${active ? styles.categoryActive : ""}`}
                onClick={() => changeCategory(item.id)}
              >
                <span className={styles.categoryIcon}><Icon size={23} /></span>
                <strong>{pick(language, item.labelFr, item.labelEn)}</strong>
                <small>{pick(language, item.descriptionFr, item.descriptionEn)}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.trustBar}>
        <div>
          <CheckCircle2 size={17} />
          <span>
            <strong>{pick(language, "Règle de confiance", "Trust rule")}</strong>
            {pick(
              language,
              " Les liens partenaires éventuels devront être signalés et ne pourront jamais modifier le score de correspondance.",
              " Any future affiliate links must be disclosed and can never alter the match score.",
            )}
          </span>
        </div>
        <span className={styles.localOnly}>
          {pick(language, "Les offres ajoutées restent dans cette session.", "Offers added stay in this session.")}
        </span>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.profilePanel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>02</span>
              <h2>{pick(language, "Ton filtre", "Your filter")}</h2>
            </div>
          </div>

          <label className={styles.field}>
            <span>{pick(language, "Province / territoire", "Province / territory")}</span>
            <select
              value={profile.province}
              onChange={(event) =>
                updateProfile("province", event.target.value)
              }
            >
              {PROVINCES.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{pick(language, "Priorité principale", "Main priority")}</span>
            <select
              value={profile.priority}
              onChange={(event) =>
                updateProfile(
                  "priority",
                  event.target.value as ShoppingPriority,
                )
              }
            >
              {PRIORITIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {pick(language, item.fr, item.en)}
                </option>
              ))}
            </select>
          </label>

          {renderProfileFields()}

          <div className={styles.profileNote}>
            <CircleDollarSign size={17} />
            <p>
              {pick(
                language,
                "Anatole compare uniquement les champs saisis. Une valeur N/D n’est jamais inventée.",
                "Anatole compares only entered fields. Missing values are never invented.",
              )}
            </p>
          </div>
        </aside>

        <section className={styles.mainColumn}>
          <div className={styles.sourcePanel}>
            <div className={styles.sectionTitle}>
              <div>
                <span>03</span>
                <h2>{pick(language, "Commence par les sources solides", "Start with strong sources")}</h2>
              </div>
              <small>{pick(language, "Source-first", "Source-first")}</small>
            </div>
            <div className={styles.sourceGrid}>
              {sources.map((source) => (
                <a
                  key={source.id}
                  href={language === "fr" ? source.urlFr : source.urlEn}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceCard}
                >
                  <span className={styles.sourceBadge}>
                    {source.official
                      ? pick(language, "OFFICIEL", "OFFICIAL")
                      : pick(language, "SOURCE", "SOURCE")}
                  </span>
                  <strong>{pick(language, source.nameFr, source.nameEn)}</strong>
                  <p>{pick(language, source.descriptionFr, source.descriptionEn)}</p>
                  <span className={styles.sourceAction}>
                    {pick(language, "Ouvrir la source", "Open source")} <ExternalLink size={13} />
                  </span>
                </a>
              ))}
            </div>
          </div>

          <div className={styles.comparePanel}>
            <div className={styles.compareHeader}>
              <div className={styles.sectionTitle}>
                <div>
                  <span>04</span>
                  <h2>{pick(language, "Offres comparées", "Compared offers")}</h2>
                </div>
              </div>
              <div className={styles.compareActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={restoreStarters}
                >
                  <RotateCcw size={14} />
                  {pick(language, "Réinitialiser", "Reset")}
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => setShowBuilder((current) => !current)}
                >
                  <Plus size={15} />
                  {pick(language, "Ajouter une offre", "Add offer")}
                </button>
              </div>
            </div>

            {showBuilder ? (
              <form className={styles.offerBuilder} onSubmit={submitOffer}>
                <header>
                  <div>
                    <span className={styles.eyebrow}>
                      {pick(language, "CAPTURE D’OFFRE", "OFFER CAPTURE")}
                    </span>
                    <h3>{pick(language, "Normalise ce que tu viens de trouver", "Normalize what you just found")}</h3>
                  </div>
                  <BadgeDollarSign size={23} />
                </header>

                <div className={styles.builderGrid}>
                  <label className={styles.field}>
                    <span>{pick(language, "Fournisseur", "Provider")}</span>
                    <input
                      required
                      value={draft.provider}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          provider: event.target.value,
                        }))
                      }
                      placeholder={pick(language, "Ex. Banque X", "E.g. Bank X")}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{pick(language, "Produit / offre", "Product / offer")}</span>
                    <input
                      required
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder={pick(language, "Ex. Visa Infinite", "E.g. Visa Infinite")}
                    />
                  </label>
                  <label className={`${styles.field} ${styles.fullWidth}`}>
                    <span>{pick(language, "Lien source", "Source link")}</span>
                    <input
                      type="url"
                      value={draft.sourceUrl}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          sourceUrl: event.target.value,
                        }))
                      }
                      placeholder="https://"
                    />
                  </label>
                  {renderDraftMetrics()}
                </div>

                <div className={styles.builderFooter}>
                  <p>
                    {pick(
                      language,
                      "Astuce : copie les chiffres directement de la page du fournisseur ou de l’outil officiel. Anatole ne remplit jamais les cases manquantes à ta place.",
                      "Tip: copy figures directly from the provider page or official tool. Anatole never fills missing fields for you.",
                    )}
                  </p>
                  <div>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        resetDraft();
                        setShowBuilder(false);
                      }}
                    >
                      {pick(language, "Annuler", "Cancel")}
                    </button>
                    <button type="submit" className={styles.primaryButton}>
                      <Plus size={14} />
                      {pick(language, "Ajouter au comparateur", "Add to comparator")}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            {evaluations.length ? (
              <div className={styles.results}>
                {evaluations.map((evaluation, index) => {
                  const offer = evaluation.offer;
                  const isCurrent = currentOfferId === offer.id;
                  const isBest =
                    !isCurrent &&
                    best?.offer.id === offer.id;
                  return (
                    <article
                      key={offer.id}
                      className={`${styles.resultCard} ${isBest ? styles.resultBest : ""} ${isCurrent ? styles.resultCurrent : ""}`}
                    >
                      <div className={styles.resultTop}>
                        <div className={styles.rank}>
                          {isCurrent
                            ? pick(language, "ACTUEL", "CURRENT")
                            : `#${index + 1}`}
                        </div>
                        <div className={styles.resultIdentity}>
                          <span>{offer.provider}</span>
                          <h3>{offer.name}</h3>
                          <div className={styles.tags}>
                            {offer.sourceLabel ? <span>{offer.sourceLabel}</span> : null}
                            {offer.verifiedAt ? (
                              <span>
                                {pick(language, "Vérifié", "Verified")} {offer.verifiedAt}
                              </span>
                            ) : (
                              <span>{pick(language, "Ajout manuel", "Manual entry")}</span>
                            )}
                          </div>
                        </div>
                        <div className={styles.match}>
                          <strong>{evaluation.matchScore}%</strong>
                          <span>{pick(language, "correspondance", "match")}</span>
                        </div>
                      </div>

                      <div className={styles.metricStrip}>
                        <div>
                          <span>
                            {pick(
                              language,
                              evaluation.metricLabelFr,
                              evaluation.metricLabelEn,
                            )}
                          </span>
                          <strong>{money(evaluation.estimatedCost, language)}</strong>
                        </div>
                        {evaluation.monthlyPayment != null ? (
                          <div>
                            <span>{pick(language, "Paiement mensuel", "Monthly payment")}</span>
                            <strong>{money(evaluation.monthlyPayment, language)}</strong>
                          </div>
                        ) : null}
                        {evaluation.savingsVsCurrent != null ? (
                          <div>
                            <span>{pick(language, "Écart vs actuel", "Difference vs current")}</span>
                            <strong className={evaluation.savingsVsCurrent >= 0 ? styles.positive : styles.negative}>
                              {money(evaluation.savingsVsCurrent, language)}
                            </strong>
                          </div>
                        ) : null}
                      </div>

                      <div className={styles.offerFacts}>
                        {offerMetricSummary(offer, language).map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>

                      {evaluation.reasons.length ? (
                        <div className={styles.reasons}>
                          {evaluation.reasons.slice(0, 3).map((reason) => (
                            <span key={reason}><CheckCircle2 size={13} />{reason}</span>
                          ))}
                        </div>
                      ) : null}
                      {evaluation.cautions.length ? (
                        <div className={styles.cautions}>
                          {evaluation.cautions.slice(0, 2).map((caution) => (
                            <span key={caution}><LifeBuoy size={13} />{caution}</span>
                          ))}
                        </div>
                      ) : null}

                      <footer>
                        <div className={styles.offerLinks}>
                          {offer.sourceUrl ? (
                            <a
                              href={offer.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {pick(language, "Vérifier l’offre", "Verify offer")} <ExternalLink size={13} />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              setCurrentOfferId(isCurrent ? null : offer.id)
                            }
                          >
                            {isCurrent
                              ? pick(language, "Retirer comme produit actuel", "Unmark current product")
                              : pick(language, "Comparer à mon produit actuel", "Compare to my current product")}
                          </button>
                        </div>
                        {!offer.starter ? (
                          <button
                            type="button"
                            className={styles.deleteButton}
                            aria-label={pick(language, "Supprimer l’offre", "Delete offer")}
                            onClick={() => removeOffer(offer.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <WalletCards size={34} />
                <h3>{pick(language, "Construis ton marché", "Build your market")}</h3>
                <p>
                  {pick(
                    language,
                    "Ouvre une source officielle, trouve deux ou trois offres, puis ajoute leurs chiffres ici. Anatole les mettra immédiatement sur la même base.",
                    "Open an official source, find two or three offers, then add their figures here. Anatole will immediately put them on the same basis.",
                  )}
                </p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => setShowBuilder(true)}
                >
                  <Plus size={15} />
                  {pick(language, "Ajouter ma première offre", "Add my first offer")}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className={styles.methodology}>
        <div>
          <TrendingDown size={19} />
          <div>
            <strong>{pick(language, "Ce que le score signifie", "What the score means")}</strong>
            <p>
              {pick(
                language,
                "Le score est une mesure de correspondance parmi les offres que tu compares. Il combine le coût calculable et ta priorité déclarée. Ce n’est ni une cote de qualité absolue, ni une recommandation financière.",
                "The score measures fit among the offers you compare. It combines calculable cost and your stated priority. It is neither an absolute quality rating nor financial advice.",
              )}
            </p>
          </div>
        </div>
        <div>
          <FileText size={19} />
          <div>
            <strong>{pick(language, "Toujours vérifier avant d’appliquer", "Always verify before applying")}</strong>
            <p>
              {pick(
                language,
                "Les taux, frais, promotions, critères d’admissibilité et protections changent. La page source du fournisseur demeure la référence contractuelle.",
                "Rates, fees, promotions, eligibility and coverage change. The provider’s source page remains the contractual reference.",
              )}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
