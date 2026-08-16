export type AnatoleLanguage = "fr" | "en";

type SourceDefinition = {
  fr: string;
  en: string;
  tier: 1 | 2;
};

const LOCAL_SOURCES: Record<string, SourceDefinition[]> = {
  QC: [
    {
      fr: "Statistique Québec",
      en: "Québec Statistics",
      tier: 1,
    },
    {
      fr: "Gouvernement du Québec — Économie et finances",
      en: "Government of Québec — Economy and finance",
      tier: 2,
    },
  ],
  ON: [
    {
      fr: "Ontario Economic Accounts — Ministère des Finances",
      en: "Ontario Economic Accounts — Ministry of Finance",
      tier: 1,
    },
    {
      fr: "Ministère des Finances de l’Ontario",
      en: "Ontario Ministry of Finance",
      tier: 2,
    },
  ],
  BC: [
    { fr: "BC Stats", en: "BC Stats", tier: 1 },
  ],
  AB: [
    {
      fr: "Alberta — Office of Statistics and Information",
      en: "Alberta Office of Statistics and Information",
      tier: 1,
    },
  ],
  SK: [
    {
      fr: "Saskatchewan Bureau of Statistics",
      en: "Saskatchewan Bureau of Statistics",
      tier: 1,
    },
  ],
  MB: [
    {
      fr: "Manitoba Bureau of Statistics",
      en: "Manitoba Bureau of Statistics",
      tier: 1,
    },
  ],
  NB: [
    {
      fr: "Finances Nouveau-Brunswick — Statistiques",
      en: "New Brunswick Finance — Statistics",
      tier: 1,
    },
  ],
  NS: [
    {
      fr: "Nouvelle-Écosse — Economics and Statistics",
      en: "Nova Scotia Economics and Statistics",
      tier: 1,
    },
  ],
  PE: [
    {
      fr: "PEI Statistics Bureau",
      en: "PEI Statistics Bureau",
      tier: 1,
    },
  ],
  NL: [
    {
      fr: "Newfoundland and Labrador Statistics Agency",
      en: "Newfoundland and Labrador Statistics Agency",
      tier: 1,
    },
  ],
};

const REGION_ALIASES: Record<string, string> = {
  "québec": "QC",
  "quebec": "QC",
  "qc": "QC",
  "ontario": "ON",
  "on": "ON",
  "colombie-britannique": "BC",
  "colombie britannique": "BC",
  "british columbia": "BC",
  "bc": "BC",
  "alberta": "AB",
  "ab": "AB",
  "saskatchewan": "SK",
  "sk": "SK",
  "manitoba": "MB",
  "mb": "MB",
  "nouveau-brunswick": "NB",
  "nouveau brunswick": "NB",
  "new brunswick": "NB",
  "nb": "NB",
  "nouvelle-écosse": "NS",
  "nouvelle ecosse": "NS",
  "nova scotia": "NS",
  "ns": "NS",
  "île-du-prince-édouard": "PE",
  "ile-du-prince-edouard": "PE",
  "prince edward island": "PE",
  "pei": "PE",
  "pe": "PE",
  "terre-neuve-et-labrador": "NL",
  "terre neuve et labrador": "NL",
  "newfoundland and labrador": "NL",
  "nl": "NL",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function regionCode(region: string): string {
  const upper = region.trim().toUpperCase();
  if (LOCAL_SOURCES[upper]) return upper;
  return REGION_ALIASES[normalize(region)] ?? upper;
}

export function economicSourceOptions(
  region: string,
  language: AnatoleLanguage,
): string[] {
  const code = regionCode(region);
  const allLabel = language === "fr" ? "Toutes" : "All";

  const local = [...(LOCAL_SOURCES[code] ?? [])]
    .sort((a, b) => a.tier - b.tier)
    .map((source) =>
      language === "fr" ? source.fr : source.en,
    );

  return [
    allLabel,
    ...local,
    language === "fr" ? "Statistique Canada" : "Statistics Canada",
    language === "fr" ? "Banque du Canada" : "Bank of Canada",
  ];
}

export function primaryEconomicSource(
  region: string,
  language: AnatoleLanguage,
): string | null {
  const code = regionCode(region);
  const source = [...(LOCAL_SOURCES[code] ?? [])]
    .sort((a, b) => a.tier - b.tier)[0];

  if (!source) return null;
  return language === "fr" ? source.fr : source.en;
}
