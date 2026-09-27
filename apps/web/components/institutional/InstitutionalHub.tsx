"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Filter,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type MouseEvent,
  useEffect,
  useState,
} from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  INSTITUTIONAL_AREAS,
  INSTITUTIONAL_CAPABILITIES,
  type InstitutionalCapability,
  type InstitutionalCapabilityStage,
} from "@/lib/institutional-capabilities";
import { pick } from "@/lib/i18n";

import styles from "./InstitutionalHub.module.css";

const PERSONA_KEY = "anatole:persona:v1";

type StageFilter = "all" | InstitutionalCapabilityStage;

function stageLabel(
  stage: InstitutionalCapabilityStage,
  language: "fr" | "en",
): string {
  if (stage === "bridge") {
    return pick(
      language,
      "Pont Anatole disponible",
      "Anatole bridge available",
    );
  }

  if (stage === "foundation") {
    return pick(
      language,
      "Fondation V1",
      "V1 foundation",
    );
  }

  return pick(
    language,
    "Intégration requise",
    "Integration required",
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function InstitutionalHub() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("all");
  const [stage, setStage] = useState<StageFilter>("all");
  const [selected, setSelected] =
    useState<InstitutionalCapability | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PERSONA_KEY,
        "institutionnel",
      );
    } catch {
      // Le mode reste utilisable sans stockage.
    }
  }, []);

  const normalizedQuery = normalize(query);

  const filtered = INSTITUTIONAL_CAPABILITIES.filter(
    (capability) => {
      const matchesArea =
        area === "all" || capability.area === area;
      const matchesStage =
        stage === "all" || capability.stage === stage;
      const haystack = normalize(
        `${capability.id} ${capability.titleFr} ${capability.titleEn} ${capability.summaryFr} ${capability.summaryEn} ${capability.area}`,
      );
      const matchesQuery =
        !normalizedQuery ||
        haystack.includes(normalizedQuery);

      return matchesArea && matchesStage && matchesQuery;
    },
  );

  const bridgeCount = INSTITUTIONAL_CAPABILITIES.filter(
    (capability) => capability.stage === "bridge",
  ).length;

  const foundationCount =
    INSTITUTIONAL_CAPABILITIES.filter(
      (capability) => capability.stage === "foundation",
    ).length;

  const roadmapCount = INSTITUTIONAL_CAPABILITIES.filter(
    (capability) => capability.stage === "roadmap",
  ).length;

  return (
    <section
      className={styles.shell}
      data-testid="institutional-hub"
      data-capability-count="70"
    >
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>
            ANATOLE INSTITUTIONAL
          </span>
          <h1>
            {pick(
              language,
              "Intelligence before execution.",
              "Intelligence before execution.",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Un espace institutionnel qui relie portefeuille, risque, recherche, scénarios, clients et gouvernance. Les 70 capacités sont visibles dès maintenant; les statuts distinguent les ponts existants des modules encore à industrialiser.",
              "An institutional workspace connecting portfolio, risk, research, scenarios, clients and governance. All 70 capabilities are visible now; statuses distinguish existing Anatole bridges from modules that still require industrialization.",
            )}
          </p>

          <div className={styles.quickLinks}>
            <Link href="/portefeuille">
              {pick(language, "Portefeuille", "Portfolio")}
              <ArrowUpRight size={15} />
            </Link>
            <Link href="/terminal">
              Terminal Pro
              <ArrowUpRight size={15} />
            </Link>
            <Link href="/canada">
              Macro
              <ArrowUpRight size={15} />
            </Link>
            <Link href="/focus/RY">
              Research
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>

        <div className={styles.heroStats}>
          <div>
            <span>{pick(language, "CAPACITÉS", "CAPABILITIES")}</span>
            <strong>70</strong>
          </div>
          <div>
            <span>{pick(language, "DOMAINES", "DOMAINS")}</span>
            <strong>{INSTITUTIONAL_AREAS.length}</strong>
          </div>
          <div>
            <span>{pick(language, "PONTS EXISTANTS", "EXISTING BRIDGES")}</span>
            <strong>{bridgeCount}</strong>
          </div>
        </div>
      </header>

      <section className={styles.truthBar}>
        <ShieldCheck size={18} />
        <div>
          <strong>
            {pick(
              language,
              "Pas de faux produit institutionnel.",
              "No fake institutional product.",
            )}
          </strong>
          <span>
            {pick(
              language,
              "« Pont Anatole disponible » signifie qu'une surface existante peut servir de socle. « Fondation V1 » signifie que l'architecture est définie. « Intégration requise » indique qu'un connecteur, des données ou une infrastructure entreprise sont encore nécessaires.",
              "“Anatole bridge available” means an existing surface can serve as a foundation. “V1 foundation” means the architecture is defined. “Integration required” means a connector, data source or enterprise infrastructure is still needed.",
            )}
          </span>
        </div>
      </section>

      <section className={styles.statusStrip}>
        <div data-stage="bridge">
          <span>{pick(language, "Ponts", "Bridges")}</span>
          <strong>{bridgeCount}</strong>
        </div>
        <div data-stage="foundation">
          <span>{pick(language, "Fondations", "Foundations")}</span>
          <strong>{foundationCount}</strong>
        </div>
        <div data-stage="roadmap">
          <span>{pick(language, "Intégrations", "Integrations")}</span>
          <strong>{roadmapCount}</strong>
        </div>
      </section>

      <section className={styles.controls}>
        <label className={styles.search}>
          <Search size={17} />
          <input
            data-testid="institutional-search"
            type="search"
            value={query}
            placeholder={pick(
              language,
              "Rechercher une capacité, ex. thesis, risk, ETF...",
              "Search a capability, e.g. thesis, risk, ETF...",
            )}
            onChange={(
              event: ChangeEvent<HTMLInputElement>,
            ) => setQuery(event.target.value)}
          />
        </label>

        <label className={styles.select}>
          <Filter size={15} />
          <select
            value={area}
            aria-label={pick(language, "Filtrer par domaine", "Filter by domain")}
            onChange={(
              event: ChangeEvent<HTMLSelectElement>,
            ) => setArea(event.target.value)}
          >
            <option value="all">
              {pick(language, "Tous les domaines", "All domains")}
            </option>
            {INSTITUTIONAL_AREAS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.select}>
          <Sparkles size={15} />
          <select
            value={stage}
            aria-label={pick(language, "Filtrer par statut", "Filter by status")}
            onChange={(
              event: ChangeEvent<HTMLSelectElement>,
            ) =>
              setStage(event.target.value as StageFilter)
            }
          >
            <option value="all">
              {pick(language, "Tous les statuts", "All statuses")}
            </option>
            <option value="bridge">
              {pick(language, "Pont Anatole", "Anatole bridge")}
            </option>
            <option value="foundation">
              {pick(language, "Fondation V1", "V1 foundation")}
            </option>
            <option value="roadmap">
              {pick(language, "Intégration requise", "Integration required")}
            </option>
          </select>
        </label>
      </section>

      <div className={styles.resultMeta}>
        <span>
          {filtered.length} / 70
          {" "}
          {pick(language, "capacités visibles", "capabilities visible")}
        </span>
        <Link
          href="/"
          data-testid="institutional-switch-mode"
        >
          {pick(language, "Changer de mode", "Switch mode")}
        </Link>
      </div>

      <div
        className={styles.grid}
        data-testid="institutional-capability-grid"
      >
        {filtered.map((capability) => (
          <button
            type="button"
            key={capability.id}
            className={styles.card}
            data-stage={capability.stage}
            data-capability-id={capability.id}
            onClick={() => setSelected(capability)}
          >
            <div className={styles.cardTop}>
              <span className={styles.number}>
                {String(capability.id).padStart(2, "0")}
              </span>
              <span className={styles.stage}>
                {stageLabel(capability.stage, language)}
              </span>
            </div>

            <strong>
              {pick(
                language,
                capability.titleFr,
                capability.titleEn,
              )}
            </strong>

            <p>
              {pick(
                language,
                capability.summaryFr,
                capability.summaryEn,
              )}
            </p>

            <footer>
              <span>{capability.area}</span>
              <ArrowUpRight size={14} />
            </footer>
          </button>
        ))}
      </div>

      {selected ? (
        <div
          className={styles.detailBackdrop}
          role="presentation"
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <aside
            className={styles.detail}
            role="dialog"
            aria-modal="true"
            aria-labelledby="institutional-detail-title"
            data-testid="institutional-capability-detail"
          >
            <header>
              <div>
                <span>
                  #{String(selected.id).padStart(2, "0")} · {selected.area}
                </span>
                <h2 id="institutional-detail-title">
                  {pick(
                    language,
                    selected.titleFr,
                    selected.titleEn,
                  )}
                </h2>
              </div>
              <button
                type="button"
                aria-label={pick(language, "Fermer", "Close")}
                onClick={() => setSelected(null)}
              >
                <X size={19} />
              </button>
            </header>

            <p>
              {pick(
                language,
                selected.summaryFr,
                selected.summaryEn,
              )}
            </p>

            <div className={styles.detailStatus}>
              <Building2 size={17} />
              <div>
                <strong>
                  {stageLabel(selected.stage, language)}
                </strong>
                <span>
                  {selected.stage === "bridge"
                    ? pick(
                        language,
                        "Une surface Anatole existante est liée à ce chantier. Le workflow institutionnel complet reste à spécialiser.",
                        "An existing Anatole surface is linked to this workstream. The full institutional workflow still needs specialization.",
                      )
                    : selected.stage === "foundation"
                      ? pick(
                          language,
                          "La capacité fait partie du blueprint institutionnel V1. Les données, calculs ou workflows dédiés seront construits par étapes.",
                          "This capability is part of the Institutional V1 blueprint. Dedicated data, calculations or workflows will be built iteratively.",
                        )
                      : pick(
                          language,
                          "Cette capacité dépend d'une intégration externe, d'une infrastructure entreprise ou de données sous licence.",
                          "This capability depends on an external integration, enterprise infrastructure or licensed data.",
                        )}
                </span>
              </div>
            </div>

            <div className={styles.detailActions}>
              {selected.href ? (
                <Link href={selected.href}>
                  {pick(
                    language,
                    "Ouvrir la surface Anatole liée",
                    "Open related Anatole surface",
                  )}
                  <ArrowUpRight size={15} />
                </Link>
              ) : null}

              <Link href="/roadmap">
                {pick(
                  language,
                  "Voir la roadmap",
                  "View roadmap",
                )}
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
