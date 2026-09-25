"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { pick } from "@/lib/i18n";
import {
  issuerCountFor,
  productCountFor,
  type ShoppingProductMatch,
} from "@/lib/shoppingProductCatalog";
import type { ShoppingCategoryId } from "@/lib/shopping";

import styles from "./ShoppingProductRecommendations.module.css";

const FILTERS: Record<
  ShoppingCategoryId,
  Array<{ id: string; fr: string; en: string; tag?: string }>
> = {
  credit_card: [
    { id: "all", fr: "Les plus adaptées", en: "Best fits" },
    { id: "no_fee", fr: "Sans frais", en: "No fee", tag: "no_fee" },
    { id: "low_rate", fr: "Faible taux", en: "Low rate", tag: "low_rate" },
    { id: "cashback", fr: "Remises", en: "Cash back", tag: "cashback" },
    { id: "travel", fr: "Voyage", en: "Travel", tag: "travel" },
    { id: "points", fr: "Points", en: "Points", tag: "points" },
  ],
  banking: [
    { id: "all", fr: "Les plus adaptés", en: "Best fits" },
    { id: "no_fee", fr: "Sans frais", en: "No fee", tag: "no_fee" },
    { id: "unlimited", fr: "Illimité", en: "Unlimited", tag: "unlimited" },
    { id: "branch", fr: "Succursales", en: "Branches", tag: "branch" },
    { id: "digital", fr: "Numérique", en: "Digital", tag: "digital" },
  ],
  mortgage: [
    { id: "all", fr: "Les plus adaptés", en: "Best fits" },
    { id: "fixed", fr: "Fixe", en: "Fixed", tag: "fixed" },
    { id: "variable", fr: "Variable", en: "Variable", tag: "variable" },
    { id: "open", fr: "Ouvert / flexible", en: "Open / flexible", tag: "open" },
    { id: "refinance", fr: "Refinancement", en: "Refinance", tag: "refinance" },
  ],
  student_loan: [
    { id: "all", fr: "Les plus adaptés", en: "Best fits" },
    { id: "undergrad", fr: "1er cycle", en: "Undergrad", tag: "undergrad" },
    { id: "graduate", fr: "Cycles sup.", en: "Graduate", tag: "graduate" },
    { id: "professional", fr: "Professions", en: "Professional", tag: "professional" },
  ],
  personal_loan: [
    { id: "all", fr: "Les plus adaptés", en: "Best fits" },
    { id: "fixed", fr: "Paiement fixe", en: "Fixed payment", tag: "fixed" },
    { id: "consolidation", fr: "Consolidation", en: "Consolidation", tag: "consolidation" },
  ],
  auto_insurance: [
    { id: "all", fr: "Les plus adaptés", en: "Best fits" },
    { id: "online", fr: "Soumission en ligne", en: "Online quote", tag: "online_quote" },
    { id: "bundle", fr: "Regroupement", en: "Bundle", tag: "bundle" },
    { id: "usage", fr: "Usage / kilométrage", en: "Usage / mileage", tag: "usage" },
  ],
  life_insurance: [
    { id: "all", fr: "Les plus adaptés", en: "Best fits" },
    { id: "term", fr: "Temporaire", en: "Term", tag: "term" },
    { id: "permanent", fr: "Permanente", en: "Permanent", tag: "permanent" },
    { id: "online", fr: "Soumission en ligne", en: "Online quote", tag: "online_quote" },
  ],
  tax: [
    { id: "all", fr: "Les plus adaptés", en: "Best fits" },
    { id: "free", fr: "Gratuit", en: "Free", tag: "free" },
    { id: "online", fr: "Web", en: "Online", tag: "online" },
    { id: "mobile", fr: "Mobile", en: "Mobile", tag: "mobile" },
    { id: "download", fr: "Téléchargement", en: "Download", tag: "download" },
  ],
};

const MODE_COPY = {
  published: { fr: "Données publiées", en: "Published data" },
  partial: { fr: "Données partielles", en: "Partial data" },
  live_rate: { fr: "Taux à vérifier en direct", en: "Verify live rate" },
  quote: { fr: "Tarification personnalisée", en: "Personalized pricing" },
  registry: { fr: "Registre officiel", en: "Official registry" },
} as const;

function ProductVisual({ item }: { item: ShoppingProductMatch }) {
  return (
    <div className={styles.visual} data-brand={item.product.issuerKey} aria-hidden="true">
      <div className={styles.visualTop}>
        <strong>{item.product.issuer}</strong>
        <span>{item.product.kindEn}</span>
      </div>
      <div className={styles.visualMark}>
        {item.product.category === "credit_card" ? (
          <span className={styles.chip} />
        ) : (
          <Sparkles size={23} />
        )}
      </div>
      <div className={styles.visualBottom}>
        <span>{item.product.name}</span>
        <b>ANATOLE {item.matchScore}%</b>
      </div>
    </div>
  );
}

export function ShoppingProductRecommendations({
  category,
  language,
  matches,
}: {
  category: ShoppingCategoryId;
  language: "fr" | "en";
  matches: ShoppingProductMatch[];
}) {
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const filters = FILTERS[category];
  const active = filters.find((item) => item.id === filter);
  const activeTag = active?.tag;
  const filtered = activeTag
    ? matches.filter((item) => item.product.tags.includes(activeTag))
    : matches;
  const visible = showAll ? filtered : filtered.slice(0, 9);
  const compared = compareIds
    .map((id) => matches.find((item) => item.product.name === id))
    .filter((item): item is ShoppingProductMatch => Boolean(item));

  function toggleCompare(id: string) {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 3) return [current[1], current[2], id];
      return [...current, id];
    });
  }

  return (
    <section className={styles.shell} data-testid={`shopping-product-grid-${category}`}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>
            <Sparkles size={14} />
            ANATOLE PRODUCT MATCH
          </span>
          <h2>
            {pick(
              language,
              "Des produits réels à comparer maintenant",
              "Real products to compare now",
            )}
          </h2>
          <p>
            {pick(
              language,
              `${productCountFor(category)} produits/parcours suivis · ${issuerCountFor(category)} institutions · ordre basé sur tes réponses`,
              `${productCountFor(category)} tracked products/paths · ${issuerCountFor(category)} institutions · ordered from your answers`,
            )}
          </p>
        </div>
        <div className={styles.trust}>
          <ShieldCheck size={16} />
          <span>
            {pick(
              language,
              "Source officielle sur chaque fiche · N/D plutôt qu’une donnée inventée",
              "Official source on every card · N/A rather than invented data",
            )}
          </span>
        </div>
      </header>

      <div className={styles.filters}>
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            className={filter === item.id ? styles.activeFilter : ""}
            onClick={() => {
              setFilter(item.id);
              setShowAll(false);
            }}
          >
            {pick(language, item.fr, item.en)}
          </button>
        ))}
      </div>

      {compared.length >= 2 ? (
        <section className={styles.compare}>
          <div className={styles.compareTitle}>
            <Scale size={17} />
            <strong>{pick(language, "Comparaison rapide", "Quick comparison")}</strong>
          </div>
          <div
            className={styles.compareGrid}
            style={{
              gridTemplateColumns: `130px repeat(${compared.length}, minmax(180px, 1fr))`,
            }}
          >
            <span>{pick(language, "Produit", "Product")}</span>
            {compared.map((item) => (
              <strong key={`name-${item.product.name}`}>{item.product.name}</strong>
            ))}
            <span>Match</span>
            {compared.map((item) => (
              <b key={`score-${item.product.name}`}>{item.matchScore}%</b>
            ))}
            <span>{pick(language, "Données clés", "Key facts")}</span>
            {compared.map((item) => (
              <small key={`facts-${item.product.name}`}>
                {(language === "fr" ? item.product.metricsFr : item.product.metricsEn).join(" · ")}
              </small>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.grid}>
        {visible.map((item, index) => {
          const reasons = language === "fr" ? item.reasonsFr : item.reasonsEn;
          const cautions = language === "fr" ? item.cautionsFr : item.cautionsEn;
          const metrics = language === "fr" ? item.product.metricsFr : item.product.metricsEn;
          const mode = MODE_COPY[item.product.dataMode];
          const selected = compareIds.includes(item.product.name);
          return (
            <article
              key={`${item.product.issuer}-${item.product.name}`}
              className={`${styles.card} ${index === 0 && filter === "all" ? styles.topCard : ""}`}
            >
              <div className={styles.rank}>
                <span>
                  {index === 0 && filter === "all"
                    ? pick(language, "TOP MATCH", "TOP MATCH")
                    : `#${index + 1}`}
                </span>
                <strong>{item.matchScore}%</strong>
              </div>

              <ProductVisual item={item} />

              <div className={styles.identity}>
                <span>{item.product.issuer}</span>
                <h3>{item.product.name}</h3>
                <small>{pick(language, item.product.kindFr, item.product.kindEn)}</small>
              </div>

              <p className={styles.summary}>
                {pick(language, item.product.summaryFr, item.product.summaryEn)}
              </p>

              <div className={styles.metrics}>
                {metrics.slice(0, 3).map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>

              <div className={styles.mode}>
                <span>{pick(language, mode.fr, mode.en)}</span>
                <small>
                  {pick(language, "Vérifié", "Verified")} {item.product.verifiedAt}
                </small>
              </div>

              <div className={styles.reasons}>
                <strong>
                  {pick(language, "Pourquoi Anatole le remonte", "Why Anatole surfaced it")}
                </strong>
                {reasons.slice(0, 2).map((reason) => (
                  <span key={reason}>
                    <Check size={12} />
                    {reason}
                  </span>
                ))}
              </div>

              {cautions.length ? (
                <div className={styles.caution}>
                  <span>{cautions[0]}</span>
                </div>
              ) : null}

              <footer>
                <label>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleCompare(item.product.name)}
                  />
                  {pick(language, "Comparer", "Compare")}
                </label>
                <a href={item.product.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {pick(
                    language,
                    item.product.dataMode === "quote"
                      ? "Obtenir / vérifier la soumission"
                      : item.product.dataMode === "live_rate"
                        ? "Voir le taux officiel"
                        : "Voir l’offre officielle",
                    item.product.dataMode === "quote"
                      ? "Get / verify quote"
                      : item.product.dataMode === "live_rate"
                        ? "View official rate"
                        : "View official offer",
                  )}
                  <ExternalLink size={12} />
                </a>
              </footer>

              <div className={styles.provenance}>
                <span>{item.product.sourceLabel}</span>
                <span>{item.product.dataMode}</span>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length > 9 ? (
        <button
          type="button"
          className={styles.showMore}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showAll
            ? pick(language, "Réduire", "Show less")
            : pick(
                language,
                `Voir ${filtered.length - 9} autres options`,
                `See ${filtered.length - 9} more options`,
              )}
        </button>
      ) : null}

      <div className={styles.disclaimer}>
        <ShieldCheck size={15} />
        <p>
          {pick(
            language,
            "Le pourcentage mesure la correspondance avec tes réponses parmi les produits présents dans le catalogue Anatole. Il ne constitue pas une note de qualité absolue. Pour les hypothèques, prêts et assurances, les taux ou primes personnalisés ne sont jamais inventés : Anatole te dirige vers la source pour obtenir le prix réel.",
            "The percentage measures fit with your answers among products in Anatole’s catalog; it is not an absolute quality score. For mortgages, loans and insurance, personalized rates or premiums are never invented: Anatole directs you to the source for the real price.",
          )}
        </p>
      </div>
    </section>
  );
}
