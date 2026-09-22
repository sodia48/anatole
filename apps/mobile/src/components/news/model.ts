import type { FeedStatus, NewsItem, ProvincialMacroRelease, ProvinceCode, StockNewsItem, SyncedWorkspaceData } from "@/src/lib/api/types";

export type NewsLanguage = "fr" | "en";
export type NewsPrimaryFilter = "all" | "canada" | "provinces" | "boc" | "statcan" | "my-regions" | "personal";
export type NewsRegionFilter =
  | "all"
  | "CA"
  | "QC"
  | "ON"
  | "BC"
  | "AB"
  | "SK"
  | "MB"
  | "NB"
  | "NS"
  | "PE"
  | "NL"
  | "prairies"
  | "atlantic";
export type NewsCategoryFilter = "all" | "monetary" | "inflation" | "labour" | "growth" | "trade" | "energy" | "public-finance" | "investment" | "housing" | "other";

export type PersonalNewsItem = StockNewsItem & { personal_ticker: string };
export type NewsFiltersState = {
  primary: NewsPrimaryFilter;
  region: NewsRegionFilter;
  category: NewsCategoryFilter;
  search: string;
};

const OFFICIAL_SOURCES = [
  "bank of canada", "banque du canada", "statistics canada", "statistique canada", "statcan",
  "government of canada", "gouvernement du canada", "gouvernement du québec", "government of ontario",
  "government of alberta", "government of british columbia", "bc finance",
];

const CATEGORY_TERMS: Record<Exclude<NewsCategoryFilter, "all" | "other">, string[]> = {
  monetary: ["monétaire", "monetary", "interest rate", "taux directeur", "banque centrale"],
  inflation: ["inflation", "ipc", "consumer price"],
  labour: ["travail", "emploi", "labour", "employment", "payroll"],
  growth: ["croissance", "growth", "gdp", "pib", "comptes économiques", "economic accounts"],
  trade: ["commerce", "trade", "export", "import", "wholesale", "retail"],
  energy: ["énergie", "energy", "oil", "gas", "pétrole"],
  "public-finance": ["finances publiques", "public finance", "budget", "fiscal"],
  investment: ["investissement", "investment", "capital spending"],
  housing: ["logement", "housing", "home", "building permit", "permis de bâtir"],
};

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeNewsRegion(value: string): string {
  const region = value.trim().toUpperCase();
  if (region === "CANADA") return "CA";
  return region;
}

export function isStatCanNewsSource(source: string): boolean {
  const value = normalized(source);
  return value.includes("statistique canada") || value.includes("statistics canada") || value.includes("statcan");
}

function canonicalNewsKey(item: NewsItem): string {
  const canonicalUrl = item.url.split("?", 1)[0]?.replace(/\/+$/, "").toLowerCase() ?? "";
  return canonicalUrl || `${normalized(item.source)}|${normalized(item.title)}`;
}

function provincialReleaseToNewsItem(release: ProvincialMacroRelease): NewsItem | null {
  if (!release.published_at) return null;
  const timestamp = Date.parse(release.published_at);
  if (!Number.isFinite(timestamp)) return null;
  return {
    id: `provincial:${release.id}`,
    title: release.title,
    summary: release.summary,
    url: release.source_url,
    source: release.source,
    category: release.category,
    published_at: release.published_at,
    sentiment: "Neutre",
    sentiment_score: 0,
    regions: [release.region],
    image_url: null,
  };
}

export function provinceFirstNewsItems(
  releases: readonly ProvincialMacroRelease[],
  fallbackItems: readonly NewsItem[],
  region: ProvinceCode,
  statcanFallbackLimit = 6,
): NewsItem[] {
  const releaseItems = releases
    .map(provincialReleaseToNewsItem)
    .filter((item): item is NewsItem => item !== null);

  const regionalFallback = fallbackItems.filter((item) =>
    item.regions.map(normalizeNewsRegion).includes(region),
  );

  const indexes = new Map<string, number>();
  const deduplicated: NewsItem[] = [];
  for (const item of [...releaseItems, ...regionalFallback]) {
    const key = canonicalNewsKey(item);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, deduplicated.length);
      deduplicated.push(item);
      continue;
    }
    const existing = deduplicated[existingIndex];
    if (existing && !existing.image_url && item.image_url) {
      deduplicated[existingIndex] = { ...existing, image_url: item.image_url };
    }
  }

  const newestFirst = (left: NewsItem, right: NewsItem) =>
    Date.parse(right.published_at) - Date.parse(left.published_at);
  const direct = deduplicated.filter((item) => !isStatCanNewsSource(item.source)).sort(newestFirst);
  const statcan = deduplicated.filter((item) => isStatCanNewsSource(item.source)).sort(newestFirst);
  const statcanLimit = direct.length > 0
    ? Math.min(direct.length, statcanFallbackLimit)
    : statcanFallbackLimit;

  return [...direct, ...statcan.slice(0, statcanLimit)];
}

export function classifyNewsCategory(item: Pick<NewsItem, "category" | "title" | "summary">): Exclude<NewsCategoryFilter, "all"> {
  const haystack = normalized(`${item.category} ${item.title} ${item.summary}`);
  for (const [category, terms] of Object.entries(CATEGORY_TERMS) as [Exclude<NewsCategoryFilter, "all" | "other">, string[]][]) {
    if (terms.some((term) => haystack.includes(normalized(term)))) return category;
  }
  return "other";
}

export function isOfficialNewsSource(source: string): boolean {
  const value = normalized(source);
  return OFFICIAL_SOURCES.some((candidate) => value.includes(normalized(candidate)));
}

function categoryPriority(item: NewsItem): number {
  return ({ monetary: 24, inflation: 22, labour: 20, growth: 19, trade: 16, energy: 15, "public-finance": 14, investment: 10, housing: 10, other: 4 } as const)[classifyNewsCategory(item)];
}

export function rankNewsItems(items: readonly NewsItem[], now = new Date()): NewsItem[] {
  const score = (item: NewsItem) => {
    const published = new Date(item.published_at).getTime();
    const ageHours = Number.isFinite(published) ? Math.max(0, (now.getTime() - published) / 3_600_000) : 168;
    const freshness = Math.max(0, 36 - Math.min(ageHours, 72) / 2);
    const official = isOfficialNewsSource(item.source) ? 18 : 0;
    const regions = item.regions.map(normalizeNewsRegion);
    const reach = regions.includes("CA") ? 8 : regions.length > 0 ? 5 : 0;
    const lexicalAmplitude = Math.min(8, Math.abs(item.sentiment_score) / 12.5);
    return freshness + official + categoryPriority(item) + reach + lexicalAmplitude;
  };
  return [...items].sort((left, right) => score(right) - score(left)
    || new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
    || left.id.localeCompare(right.id));
}

function regionMatches(regions: readonly string[], filter: NewsRegionFilter): boolean {
  if (filter === "all") return true;
  const values = new Set(regions.map(normalizeNewsRegion));
  if (filter === "prairies") return ["AB", "SK", "MB"].some((region) => values.has(region));
  if (filter === "atlantic") return ["NB", "NS", "PE", "NL"].some((region) => values.has(region));
  return values.has(filter);
}

export function filterNewsItems(
  items: readonly NewsItem[],
  filters: NewsFiltersState,
  myRegions: readonly string[] = [],
): NewsItem[] {
  const query = normalized(filters.search);
  const preferred = new Set(myRegions.map(normalizeNewsRegion));
  return items.filter((item) => {
    const regions = item.regions.map(normalizeNewsRegion);
    const source = normalized(item.source);
    if (filters.primary === "canada" && !regions.includes("CA")) return false;
    if (filters.primary === "provinces" && !regions.some((region) => region !== "CA")) return false;
    if (filters.primary === "boc" && !source.includes("bank of canada") && !source.includes("banque du canada")) return false;
    if (filters.primary === "statcan" && !source.includes("statistics canada") && !source.includes("statistique canada") && !source.includes("statcan")) return false;
    if (filters.primary === "my-regions" && (!preferred.size || !regions.some((region) => preferred.has(region)))) return false;
    if (!regionMatches(regions, filters.region)) return false;
    if (filters.category !== "all" && classifyNewsCategory(item) !== filters.category) return false;
    if (query && !normalized(`${item.title} ${item.summary} ${item.source} ${item.category}`).includes(query)) return false;
    return true;
  });
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalized(left).split(" ").filter(Boolean));
  const b = new Set(normalized(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const common = [...a].filter((token) => b.has(token)).length;
  return common / Math.max(a.size, b.size);
}

export function dedupeNewsItems(items: readonly NewsItem[]): NewsItem[] {
  const kept: NewsItem[] = [];
  for (const item of [...items].sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())) {
    const duplicateIndex = kept.findIndex((candidate) => {
      if (normalized(candidate.source) !== normalized(item.source)) return false;
      const distance = Math.abs(new Date(candidate.published_at).getTime() - new Date(item.published_at).getTime());
      return distance <= 6 * 3_600_000 && tokenSimilarity(candidate.title, item.title) >= 0.85;
    });
    if (duplicateIndex < 0) kept.push(item);
    else if (!kept[duplicateIndex]?.image_url && item.image_url) kept[duplicateIndex] = { ...kept[duplicateIndex]!, image_url: item.image_url };
  }
  return kept;
}

export function selectPersonalNewsSymbols(workspace: SyncedWorkspaceData, limit = 5): string[] {
  const symbols = [
    ...workspace.portfolio.map((item) => item.symbol),
    ...workspace.watchlist,
  ];
  const seen = new Set<string>();
  return symbols.map((value) => value.replace(/\.TO$/i, "").trim().toUpperCase()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  }).slice(0, Math.min(5, Math.max(0, limit)));
}

export function dedupePersonalNews(items: readonly PersonalNewsItem[]): PersonalNewsItem[] {
  const indexes = new Map<string, number>();
  const kept: PersonalNewsItem[] = [];
  for (const item of [...items].sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())) {
    const key = item.url || `${normalized(item.publisher)}:${normalized(item.title)}`;
    const duplicateIndex = indexes.get(key);
    if (duplicateIndex === undefined) {
      indexes.set(key, kept.length);
      kept.push(item);
    } else if (!kept[duplicateIndex]?.image_url && item.image_url) {
      kept[duplicateIndex] = { ...kept[duplicateIndex]!, image_url: item.image_url };
    }
  }
  return kept;
}

export function lexicalToneLabel(sentiment: string, language: NewsLanguage): string {
  const value = normalized(sentiment);
  const tone = value.includes("posit") ? (language === "fr" ? "Positive" : "Positive")
    : value.includes("negat") ? (language === "fr" ? "Négative" : "Negative")
      : (language === "fr" ? "Neutre" : "Neutral");
  return `${language === "fr" ? "Tonalité lexicale" : "Lexical tone"} · ${tone}`;
}

export function sourceHealthLabel(status: FeedStatus, language: NewsLanguage): string {
  const value = normalized(status.status);
  if (["ok", "available", "success", "live"].includes(value)) return language === "fr" ? "Disponible" : "Available";
  if (["stale", "partial", "fallback", "cached"].some((token) => value.includes(token))) return language === "fr" ? "Dernières données disponibles" : "Latest available data";
  return language === "fr" ? "Indisponible" : "Unavailable";
}
