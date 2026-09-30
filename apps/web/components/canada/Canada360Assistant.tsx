"use client";

import {
  Bot,
  ExternalLink,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./Canada360Assistant.module.css";

type Metric = {
  key: string;
  label: string;
  value: number | null;
  change: number | null;
  change_kind: "points" | "percent" | "absolute";
  unit: string;
  source_name: string;
  source_url: string | null;
  reference_period: string | null;
  observed_at: string | null;
  freshness: "live" | "fresh" | "stale" | "unavailable";
  official: boolean;
  derived: boolean;
  delayed: boolean;
};

type Province = {
  code: string;
  name: string;
  metrics: Metric[];
  source_name: string | null;
  source_url: string | null;
};

type Snapshot = {
  macro: Metric[];
  rates: Metric[];
  markets: Metric[];
  provinces: Province[];
  generated_at: string;
};

type Mode = "ask" | "compare" | "find";

type AssistantLink = {
  label: string;
  href: string;
  level: "federal" | "provincial" | "statistics";
};

type AssistantReply = {
  id: string;
  role: "assistant" | "user";
  text: string;
  links?: AssistantLink[];
  sourceLine?: string;
};

type ProvinceDirectory = {
  code: string;
  names: string[];
  labelFr: string;
  labelEn: string;
  portal: string;
};

const PROVINCES: ProvinceDirectory[] = [
  {
    code: "QC",
    names: ["quebec", "qc"],
    labelFr: "Québec",
    labelEn: "Quebec",
    portal: "https://www.quebec.ca/en",
  },
  {
    code: "ON",
    names: ["ontario", "on"],
    labelFr: "Ontario",
    labelEn: "Ontario",
    portal: "https://www.ontario.ca/",
  },
  {
    code: "BC",
    names: ["british columbia", "colombie britannique", "bc", "cb"],
    labelFr: "Colombie-Britannique",
    labelEn: "British Columbia",
    portal: "https://www2.gov.bc.ca/gov/content/home",
  },
  {
    code: "AB",
    names: ["alberta", "ab"],
    labelFr: "Alberta",
    labelEn: "Alberta",
    portal: "https://www.alberta.ca/",
  },
  {
    code: "SK",
    names: ["saskatchewan", "sk"],
    labelFr: "Saskatchewan",
    labelEn: "Saskatchewan",
    portal: "https://www.saskatchewan.ca/",
  },
  {
    code: "MB",
    names: ["manitoba", "mb"],
    labelFr: "Manitoba",
    labelEn: "Manitoba",
    portal: "https://www.gov.mb.ca/",
  },
  {
    code: "NB",
    names: ["new brunswick", "nouveau brunswick", "nb"],
    labelFr: "Nouveau-Brunswick",
    labelEn: "New Brunswick",
    portal: "https://www2.gnb.ca/content/gnb/en.html",
  },
  {
    code: "NS",
    names: ["nova scotia", "nouvelle ecosse", "ns"],
    labelFr: "Nouvelle-Écosse",
    labelEn: "Nova Scotia",
    portal: "https://novascotia.ca/",
  },
  {
    code: "PE",
    names: [
      "prince edward island",
      "ile du prince edouard",
      "pei",
      "pe",
    ],
    labelFr: "Île-du-Prince-Édouard",
    labelEn: "Prince Edward Island",
    portal: "https://www.princeedwardisland.ca/en",
  },
  {
    code: "NL",
    names: [
      "newfoundland",
      "labrador",
      "terre neuve",
      "nl",
    ],
    labelFr: "Terre-Neuve-et-Labrador",
    labelEn: "Newfoundland and Labrador",
    portal: "https://www.gov.nl.ca/",
  },
];

const FEDERAL = {
  services: {
    labelFr: "Services du gouvernement du Canada",
    labelEn: "Government of Canada services",
    href: "https://www.canada.ca/en/services.html",
  },
  benefits: {
    labelFr: "Chercheur de prestations",
    labelEn: "Benefits Finder",
    href: "https://www.canada.ca/en/services/benefits/finder.html",
  },
  taxes: {
    labelFr: "Impôt sur le revenu — ARC",
    labelEn: "Income tax — CRA",
    href: "https://www.canada.ca/en/services/taxes/income-tax.html",
  },
  immigration: {
    labelFr: "Immigration et citoyenneté — IRCC",
    labelEn: "Immigration and citizenship — IRCC",
    href: "https://www.canada.ca/en/services/immigration-citizenship.html",
  },
  health: {
    labelFr: "Santé — Canada.ca",
    labelEn: "Health — Canada.ca",
    href: "https://www.canada.ca/en/services/health.html",
  },
  jobs: {
    labelFr: "Guichet-Emplois",
    labelEn: "Job Bank",
    href: "https://www.jobbank.gc.ca/home",
  },
  business: {
    labelFr: "Innovation Canada — aides aux entreprises",
    labelEn: "Innovation Canada — business support",
    href: "https://innovation.canada.ca/",
  },
  education: {
    labelFr: "Éducation et aide aux étudiants",
    labelEn: "Education and student aid",
    href: "https://www.canada.ca/en/services/education.html",
  },
  statistics: {
    labelFr: "Statistique Canada",
    labelEn: "Statistics Canada",
    href: "https://www.statcan.gc.ca/en/start",
  },
} as const;

const METRIC_ALIASES: Record<string, string[]> = {
  real_gdp: ["pib", "gdp", "produit interieur", "gross domestic"],
  unemployment_rate: ["chomage", "unemployment"],
  inflation_yoy: ["inflation", "ipc", "cpi"],
  employment: ["emploi", "employment", "emplois"],
  retail_sales: ["ventes au detail", "retail sales", "retail"],
  housing_starts: [
    "mises en chantier",
    "housing starts",
    "construction residentielle",
  ],
  population: ["population", "habitants"],
  canada_2y: ["taux 2 ans", "2 year", "2-year"],
  canada_10y: ["taux 10 ans", "10 year", "10-year"],
  curve_10y_2y: ["courbe", "yield curve", "10y 2y"],
  usd_cad: ["usd cad", "dollar canadien", "cad usd", "taux de change"],
  tsx_composite: ["tsx", "tsx composite", "marche canadien"],
};

const SERVICE_TOPICS = [
  {
    key: "benefits",
    words: [
      "prestation",
      "prestations",
      "benefit",
      "benefits",
      "aide financiere",
      "allocation",
      "credit",
      "subvention",
      "grant",
    ],
    federal: FEDERAL.benefits,
  },
  {
    key: "taxes",
    words: ["impot", "taxe", "tax", "cra", "arc", "declaration"],
    federal: FEDERAL.taxes,
  },
  {
    key: "immigration",
    words: [
      "immigration",
      "visa",
      "permis de travail",
      "work permit",
      "permis d'etudes",
      "study permit",
      "residence permanente",
      "permanent residence",
      "citoyennete",
      "citizenship",
      "ircc",
    ],
    federal: FEDERAL.immigration,
  },
  {
    key: "health",
    words: [
      "sante",
      "health",
      "assurance maladie",
      "health card",
      "medicare",
      "ramq",
    ],
    federal: FEDERAL.health,
  },
  {
    key: "jobs",
    words: [
      "emploi",
      "job",
      "travail",
      "carriere",
      "career",
      "chomage",
      "unemployment insurance",
    ],
    federal: FEDERAL.jobs,
  },
  {
    key: "business",
    words: [
      "entreprise",
      "business",
      "pme",
      "startup",
      "demarrer",
      "start a business",
      "financement entreprise",
    ],
    federal: FEDERAL.business,
  },
  {
    key: "education",
    words: [
      "education",
      "etudes",
      "student",
      "etudiant",
      "universite",
      "university",
      "pret etudiant",
      "student loan",
    ],
    federal: FEDERAL.education,
  },
] as const;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMetric(
  metric: Metric,
  language: AnatoleLanguage,
): string {
  if (metric.value == null || !Number.isFinite(metric.value)) {
    return pick(language, "N/D", "N/A");
  }

  const locale = language === "fr" ? "fr-CA" : "en-CA";

  if (metric.unit === "percent") {
    return `${metric.value.toLocaleString(locale, {
      maximumFractionDigits: 2,
    })} %`;
  }

  if (metric.unit === "persons" || metric.unit === "units") {
    return metric.value.toLocaleString(locale, {
      maximumFractionDigits: 0,
    });
  }

  if (metric.unit === "currency") {
    return `${metric.value.toLocaleString(locale, {
      maximumFractionDigits: 0,
    })} CAD`;
  }

  if (metric.unit === "cad_per_usd") {
    return `${metric.value.toLocaleString(locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 4,
    })} CAD`;
  }

  return metric.value.toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
}

function detectMetric(query: string): string | null {
  const clean = normalize(query);

  for (const [key, aliases] of Object.entries(METRIC_ALIASES)) {
    if (aliases.some((alias) => clean.includes(normalize(alias)))) {
      return key;
    }
  }

  return null;
}

function provincesInQuery(query: string): ProvinceDirectory[] {
  const clean = ` ${normalize(query)} `;

  return PROVINCES.filter((province) =>
    province.names.some((name) => {
      const normalizedName = normalize(name);
      return clean.includes(` ${normalizedName} `);
    }),
  );
}

function provinceDirectory(
  code: string | null,
): ProvinceDirectory | null {
  return PROVINCES.find((province) => province.code === code) ?? null;
}

function uniqueLinks(links: AssistantLink[]): AssistantLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function metricReply(
  query: string,
  metricKey: string,
  language: AnatoleLanguage,
  snapshot: Snapshot,
  contextProvince: string,
): Omit<AssistantReply, "id" | "role"> | null {
  const named = provincesInQuery(query);
  const compare = /\b(compare|comparer|comparaison|versus|vs)\b/i.test(
    normalize(query),
  );

  const targetCodes = named.length
    ? named.map((province) => province.code)
    : contextProvince !== "CA"
      ? [contextProvince]
      : [];

  if (compare || targetCodes.length > 1) {
    const requested = targetCodes.length
      ? snapshot.provinces.filter((province) =>
          targetCodes.includes(province.code),
        )
      : snapshot.provinces;

    const rows = requested.flatMap((province) => {
      const metric = province.metrics.find(
        (item) => item.key === metricKey,
      );
      return metric?.value != null
        ? [{ province, metric }]
        : [];
    });

    if (!rows.length) return null;

    const links = uniqueLinks(
      rows.flatMap(({ province, metric }) => [
        ...(metric.source_url
          ? [{
              label: metric.source_name,
              href: metric.source_url,
              level: "statistics" as const,
            }]
          : []),
        ...(province.source_url
          ? [{
              label:
                province.source_name ??
                pick(
                  language,
                  `Source ${province.name}`,
                  `${province.name} source`,
                ),
              href: province.source_url,
              level: "statistics" as const,
            }]
          : []),
      ]),
    );

    const text = rows
      .map(
        ({ province, metric }) =>
          `${province.name}: ${formatMetric(metric, language)}${
            metric.reference_period
              ? ` (${metric.reference_period})`
              : ""
          }`,
      )
      .join(" · ");

    return {
      text: pick(
        language,
        `Comparaison officielle disponible pour ${rows[0].metric.label}: ${text}.`,
        `Official comparison available for ${rows[0].metric.label}: ${text}.`,
      ),
      links,
      sourceLine: pick(
        language,
        "Valeurs tirées du snapshot Canada 360 chargé et de ses sources officielles.",
        "Values come from the loaded Canada 360 snapshot and its official sources.",
      ),
    };
  }

  if (targetCodes.length === 1) {
    const province = snapshot.provinces.find(
      (item) => item.code === targetCodes[0],
    );
    const metric = province?.metrics.find(
      (item) => item.key === metricKey,
    );

    if (!province || !metric || metric.value == null) {
      return null;
    }

    const links: AssistantLink[] = [];

    if (metric.source_url) {
      links.push({
        label: metric.source_name,
        href: metric.source_url,
        level: "statistics",
      });
    } else if (province.source_url) {
      links.push({
        label: province.source_name ?? province.name,
        href: province.source_url,
        level: "statistics",
      });
    }

    return {
      text: pick(
        language,
        `${province.name} — ${metric.label}: ${formatMetric(
          metric,
          language,
        )}${metric.reference_period ? ` pour ${metric.reference_period}` : ""}.`,
        `${province.name} — ${metric.label}: ${formatMetric(
          metric,
          language,
        )}${metric.reference_period ? ` for ${metric.reference_period}` : ""}.`,
      ),
      links,
      sourceLine: pick(
        language,
        `${metric.source_name} · ${metric.official ? "source officielle" : "source publiée"} · fraîcheur ${metric.freshness}.`,
        `${metric.source_name} · ${metric.official ? "official source" : "published source"} · freshness ${metric.freshness}.`,
      ),
    };
  }

  const national = [
    ...snapshot.macro,
    ...snapshot.rates,
    ...snapshot.markets,
  ].find((metric) => metric.key === metricKey);

  if (!national || national.value == null) {
    return null;
  }

  return {
    text: pick(
      language,
      `Canada — ${national.label}: ${formatMetric(
        national,
        language,
      )}${national.reference_period ? ` pour ${national.reference_period}` : ""}.`,
      `Canada — ${national.label}: ${formatMetric(
        national,
        language,
      )}${national.reference_period ? ` for ${national.reference_period}` : ""}.`,
    ),
    links: national.source_url
      ? [{
          label: national.source_name,
          href: national.source_url,
          level: "statistics",
        }]
      : [{
          label: pick(language, FEDERAL.statistics.labelFr, FEDERAL.statistics.labelEn),
          href: FEDERAL.statistics.href,
          level: "statistics",
        }],
    sourceLine: pick(
      language,
      `${national.source_name} · ${national.official ? "source officielle" : "source publiée"} · fraîcheur ${national.freshness}.`,
      `${national.source_name} · ${national.official ? "official source" : "published source"} · freshness ${national.freshness}.`,
    ),
  };
}

function serviceReply(
  query: string,
  language: AnatoleLanguage,
  contextProvince: string,
): Omit<AssistantReply, "id" | "role"> {
  const clean = normalize(query);
  const named = provincesInQuery(query);
  const province =
    named[0] ??
    provinceDirectory(contextProvince === "CA" ? null : contextProvince);

  const topic =
    SERVICE_TOPICS.find((item) =>
      item.words.some((word) => clean.includes(normalize(word))),
    ) ?? null;

  const links: AssistantLink[] = [];

  if (topic) {
    links.push({
      label: pick(
        language,
        topic.federal.labelFr,
        topic.federal.labelEn,
      ),
      href: topic.federal.href,
      level: "federal",
    });
  } else {
    links.push({
      label: pick(
        language,
        FEDERAL.services.labelFr,
        FEDERAL.services.labelEn,
      ),
      href: FEDERAL.services.href,
      level: "federal",
    });
  }

  if (province) {
    links.push({
      label: pick(
        language,
        `Gouvernement du ${province.labelFr}`,
        `${province.labelEn} government`,
      ),
      href: province.portal,
      level: "provincial",
    });
  }

  const area = topic
    ? pick(
        language,
        topic.federal.labelFr,
        topic.federal.labelEn,
      )
    : pick(
        language,
        "services gouvernementaux",
        "government services",
      );

  return {
    text: province
      ? pick(
          language,
          `Pour ${area} au ${province.labelFr}, voici les portes d’entrée officielles fédérale et provinciale. Canada 360 ne déduit pas automatiquement ton admissibilité: les critères finaux restent ceux de l’organisme public.`,
          `For ${area} in ${province.labelEn}, here are the official federal and provincial entry points. Canada 360 does not automatically determine eligibility: final criteria remain those of the public authority.`,
        )
      : pick(
          language,
          `Voici la ressource fédérale officielle la plus pertinente pour ${area}. Choisis une province si tu veux aussi la porte d’entrée provinciale.`,
          `Here is the most relevant official federal resource for ${area}. Choose a province to also get the provincial entry point.`,
        ),
    links: uniqueLinks(links),
    sourceLine: pick(
      language,
      "Liens officiels uniquement. Vérifie toujours les critères et dates directement sur le site de l’organisme.",
      "Official links only. Always verify criteria and dates directly on the public authority website.",
    ),
  };
}

function answerQuestion(
  query: string,
  language: AnatoleLanguage,
  snapshot: Snapshot,
  contextProvince: string,
): Omit<AssistantReply, "id" | "role"> {
  const metricKey = detectMetric(query);

  if (metricKey) {
    const statistical = metricReply(
      query,
      metricKey,
      language,
      snapshot,
      contextProvince,
    );
    if (statistical) return statistical;
  }

  if (
    /\b(statistique|statistics|donnee|data|source)\b/i.test(
      normalize(query),
    )
  ) {
    return {
      text: pick(
        language,
        "Je peux lire les statistiques déjà chargées dans Canada 360 et te conduire vers leur source officielle. Précise par exemple inflation, chômage, population, PIB réel, emploi, ventes au détail ou mises en chantier.",
        "I can read statistics already loaded in Canada 360 and take you to their official source. Specify inflation, unemployment, population, real GDP, employment, retail sales or housing starts.",
      ),
      links: [{
        label: pick(
          language,
          FEDERAL.statistics.labelFr,
          FEDERAL.statistics.labelEn,
        ),
        href: FEDERAL.statistics.href,
        level: "statistics",
      }],
      sourceLine: pick(
        language,
        "Statistique Canada est la source nationale de référence utilisée par Canada 360 pour plusieurs séries.",
        "Statistics Canada is the national reference source used by Canada 360 for several series.",
      ),
    };
  }

  return serviceReply(query, language, contextProvince);
}

export function Canada360Assistant({
  language,
  snapshot,
  selectedProvinceCode,
}: {
  language: AnatoleLanguage;
  snapshot: Snapshot;
  selectedProvinceCode: string | null;
}) {
  const [mode, setMode] = useState<Mode>("ask");
  const [contextProvince, setContextProvince] = useState(
    selectedProvinceCode ?? "CA",
  );
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantReply[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: pick(
        language,
        "Pose-moi une question sur une statistique Canada 360, un service public ou une ressource gouvernementale. Je privilégie les sources officielles et je signale quand je ne peux pas conclure à l’admissibilité.",
        "Ask me about a Canada 360 statistic, public service or government resource. I prioritize official sources and flag when I cannot determine eligibility.",
      ),
    },
  ]);

  useEffect(() => {
    if (selectedProvinceCode) {
      setContextProvince(selectedProvinceCode);
    }
  }, [selectedProvinceCode]);

  const suggestions = useMemo(() => {
    if (mode === "compare") {
      return language === "fr"
        ? [
            "Compare le chômage au Québec et en Ontario",
            "Compare l’inflation entre les provinces",
            "Compare la population de l’Alberta et du Québec",
          ]
        : [
            "Compare unemployment in Quebec and Ontario",
            "Compare inflation across provinces",
            "Compare Alberta and Quebec population",
          ];
    }

    if (mode === "find") {
      return language === "fr"
        ? [
            "Quelles prestations puis-je chercher au Québec ?",
            "Où trouver de l’aide pour démarrer une PME ?",
            "Où trouver les services d’immigration officiels ?",
          ]
        : [
            "Where can I find benefits in Quebec?",
            "Where can I find support to start a business?",
            "Where are the official immigration services?",
          ];
    }

    return language === "fr"
      ? [
          "Quel est le taux de chômage au Québec ?",
          "Quelle est l’inflation au Canada ?",
          "Où trouver les prestations gouvernementales ?",
        ]
      : [
          "What is Quebec's unemployment rate?",
          "What is Canada's inflation rate?",
          "Where can I find government benefits?",
        ];
  }, [language, mode]);

  const submitQuestion = (question: string) => {
    const clean = question.trim();
    if (!clean) return;

    const now = Date.now().toString();
    const reply = answerQuestion(
      clean,
      language,
      snapshot,
      contextProvince,
    );

    setMessages((current) => [
      ...current.slice(-6),
      {
        id: `user-${now}`,
        role: "user",
        text: clean,
      },
      {
        id: `assistant-${now}`,
        role: "assistant",
        ...reply,
      },
    ]);
    setInput("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitQuestion(input);
  };

  return (
    <section
      className={`panel ${styles.shell}`}
      data-testid="canada360-assistant"
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.icon}>
            <Bot size={18} />
          </span>
          <div>
            <span className="eyebrow">
              CANADA 360 ASSISTANT
            </span>
            <h2>
              {pick(
                language,
                "Demande. Compare. Trouve.",
                "Ask. Compare. Find.",
              )}
            </h2>
          </div>
        </div>

        <div className={styles.trust}>
          <Sparkles size={14} />
          <span>
            {pick(
              language,
              "Sources officielles prioritaires",
              "Official sources first",
            )}
          </span>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div
          className={styles.modes}
          aria-label={pick(
            language,
            "Mode de l’assistant",
            "Assistant mode",
          )}
        >
          {([
            ["ask", "Demander", "Ask"],
            ["compare", "Comparer", "Compare"],
            ["find", "Trouver", "Find"],
          ] as const).map(([key, fr, en]) => (
            <button
              type="button"
              key={key}
              className={
                mode === key ? styles.activeMode : undefined
              }
              onClick={() => setMode(key)}
              data-testid={`canada360-assistant-mode-${key}`}
            >
              {pick(language, fr, en)}
            </button>
          ))}
        </div>

        <label className={styles.context}>
          <span>
            {pick(language, "Contexte", "Context")}
          </span>
          <select
            value={contextProvince}
            onChange={(event) =>
              setContextProvince(event.target.value)
            }
            data-testid="canada360-assistant-jurisdiction"
          >
            <option value="CA">Canada</option>
            {PROVINCES.map((province) => (
              <option
                value={province.code}
                key={province.code}
              >
                {pick(
                  language,
                  province.labelFr,
                  province.labelEn,
                )}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={styles.chat}
        aria-live="polite"
        data-testid="canada360-assistant-chat"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={
              message.role === "user"
                ? styles.userMessage
                : styles.assistantMessage
            }
          >
            <span className={styles.role}>
              {message.role === "user"
                ? pick(language, "TOI", "YOU")
                : "CANADA 360"}
            </span>
            <p>{message.text}</p>

            {message.links?.length ? (
              <div className={styles.links}>
                {message.links.map((link) => (
                  <a
                    href={link.href}
                    key={link.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>
                      {link.level === "federal"
                        ? pick(language, "Fédéral", "Federal")
                        : link.level === "provincial"
                          ? pick(
                              language,
                              "Provincial",
                              "Provincial",
                            )
                          : pick(
                              language,
                              "Statistique",
                              "Statistics",
                            )}
                    </span>
                    <strong>{link.label}</strong>
                    <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            ) : null}

            {message.sourceLine ? (
              <small className={styles.sourceLine}>
                {message.sourceLine}
              </small>
            ) : null}
          </article>
        ))}
      </div>

      <div className={styles.suggestions}>
        {suggestions.map((suggestion) => (
          <button
            type="button"
            key={suggestion}
            onClick={() => submitQuestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className={styles.composer}
        onSubmit={onSubmit}
      >
        <Search size={16} />
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={pick(
            language,
            "Ex. Quel est le chômage au Québec ?",
            "E.g. What is unemployment in Quebec?",
          )}
          aria-label={pick(
            language,
            "Question à Canada 360",
            "Question for Canada 360",
          )}
          data-testid="canada360-assistant-input"
        />
        <button
          type="submit"
          aria-label={pick(
            language,
            "Envoyer",
            "Send",
          )}
        >
          <Send size={16} />
        </button>
      </form>

      <footer className={styles.footer}>
        {pick(
          language,
          "V1 lit le snapshot Canada 360 et dirige vers des ressources gouvernementales officielles. Il ne remplace pas une décision administrative et n’invente pas l’admissibilité.",
          "V1 reads the Canada 360 snapshot and routes users to official government resources. It does not replace an administrative decision or invent eligibility.",
        )}
      </footer>
    </section>
  );
}
