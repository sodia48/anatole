export type AnatoleLanguage = "fr" | "en";

export type ProvinceCode =
  | "QC" | "ON" | "BC" | "AB" | "SK"
  | "MB" | "NB" | "NS" | "PE" | "NL";

export type ProvincialMacroSource = {
  key: string;
  label: string;
  region: ProvinceCode;
  kind: "statistics" | "economic_accounts" | "dashboard" | "finance" | "statcan";
  url: string;
  status: "available" | "partial" | "unavailable";
  count: number;
  detail: string | null;
};

export type ProvincialMacroRelease = {
  id: string;
  region: ProvinceCode;
  province: string;
  title: string;
  summary: string;
  category: string;
  importance: "Élevée" | "Moyenne" | "Faible";
  importance_score: number;
  source: string;
  source_kind: string;
  source_url: string;
  published_at: string | null;
  period: string | null;
  official: boolean;
  specificity: "province-direct" | "province-normalized" | "fiscal-direct";
};

export type ProvincialMacroEvent = {
  id: string;
  region: ProvinceCode;
  province: string;
  title: string;
  description: string;
  category: string;
  importance: "Élevée" | "Moyenne" | "Faible";
  importance_score: number;
  starts_at: string;
  time_is_estimated: boolean;
  source: string;
  source_kind: string;
  source_url: string;
  official: boolean;
  specificity: "province-direct" | "province-normalized" | "fiscal-direct";
};

export type ProvincialMacroSnapshot = {
  region: ProvinceCode;
  province: string;
  language: AnatoleLanguage;
  mode: "province-first";
  latest_releases: ProvincialMacroRelease[];
  upcoming_events: ProvincialMacroEvent[];
  sources: ProvincialMacroSource[];
  generated_at: string;
  refresh_after_seconds: number;
  message: string | null;
};

const REGION_ALIASES: Record<string, ProvinceCode> = {
  qc: "QC",
  "québec": "QC",
  quebec: "QC",
  on: "ON",
  ontario: "ON",
  bc: "BC",
  "colombie-britannique": "BC",
  "colombie britannique": "BC",
  "british columbia": "BC",
  ab: "AB",
  alberta: "AB",
  sk: "SK",
  saskatchewan: "SK",
  mb: "MB",
  manitoba: "MB",
  nb: "NB",
  "nouveau-brunswick": "NB",
  "nouveau brunswick": "NB",
  "new brunswick": "NB",
  ns: "NS",
  "nouvelle-écosse": "NS",
  "nouvelle-ecosse": "NS",
  "nouvelle ecosse": "NS",
  "nova scotia": "NS",
  pe: "PE",
  pei: "PE",
  "île-du-prince-édouard": "PE",
  "ile-du-prince-edouard": "PE",
  "prince edward island": "PE",
  nl: "NL",
  "terre-neuve-et-labrador": "NL",
  "terre neuve et labrador": "NL",
  "newfoundland and labrador": "NL",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function provinceCode(region: string): ProvinceCode | null {
  const raw = region.trim();
  const upper = raw.toUpperCase() as ProvinceCode;
  if (["QC", "ON", "BC", "AB", "SK", "MB", "NB", "NS", "PE", "NL"].includes(upper)) {
    return upper;
  }
  return REGION_ALIASES[normalize(raw)] ?? null;
}

export function isProvinceRegion(region: string): boolean {
  return provinceCode(region) !== null;
}

function apiBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://anatole-api.onrender.com";

  return configured.replace(/\/+$/, "");
}

export async function getProvincialCalendarSnapshot(
  region: string,
  language: AnatoleLanguage = "fr",
  signal?: AbortSignal,
): Promise<ProvincialMacroSnapshot> {
  const code = provinceCode(region);
  if (!code) {
    throw new Error(`Province Anatole non reconnue: ${region}`);
  }

  const query = new URLSearchParams({
    region: code,
    lang: language,
  });

  const paths = [
    `/api/v1/discovery/provincial-calendar?${query.toString()}`,
    `/api/v1/discovery/provincial-macro?${query.toString()}`,
  ];

  let lastStatus = 0;
  for (const path of paths) {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (response.ok) {
      return response.json() as Promise<ProvincialMacroSnapshot>;
    }
    lastStatus = response.status;
    if (response.status !== 404 && response.status !== 405) break;
  }

  throw new Error(`Provincial calendar HTTP ${lastStatus || "error"}`);
}


export async function getProvincialMacroSnapshot(
  region: string,
  language: AnatoleLanguage = "fr",
  signal?: AbortSignal,
): Promise<ProvincialMacroSnapshot> {
  const code = provinceCode(region);
  if (!code) {
    throw new Error(`Province Anatole non reconnue: ${region}`);
  }

  const query = new URLSearchParams({
    region: code,
    lang: language,
  });

  const response = await fetch(
    `${apiBaseUrl()}/api/v1/discovery/provincial-macro?${query.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Provincial macro HTTP ${response.status}`);
  }

  return response.json() as Promise<ProvincialMacroSnapshot>;
}

export function provincialSourceOptions(
  snapshot: ProvincialMacroSnapshot | null,
  language: AnatoleLanguage,
): string[] {
  const all = language === "fr" ? "Toutes" : "All";
  if (!snapshot) return [all];

  const unique = new Set<string>();
  for (const source of snapshot.sources) {
    if (source.status !== "unavailable") unique.add(source.label);
  }
  for (const item of snapshot.latest_releases) unique.add(item.source);
  for (const item of snapshot.upcoming_events) unique.add(item.source);

  return [all, ...Array.from(unique)];
}
