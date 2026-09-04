export type SearchCommand = { kind: "screener" | "calendar" | "news" | "sector" | "etf"; route: string; params: Record<string, string>; label: string };

const NEWS_CATEGORIES: Record<string, string> = {
  inflation: "inflation", ipc: "inflation", cpi: "inflation",
  employment: "labour", emploi: "labour", labour: "labour", labor: "labour", travail: "labour",
  energy: "energy", energie: "energy", housing: "housing", logement: "housing",
};

function normalizedWords(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function parseSearchCommand(raw: string): SearchCommand | null {
  const query = raw.trim(); const normalized = query.toLowerCase().replace(",", ".");
  const threshold = normalized.match(/^(rsi|score|momentum)\s*(<|>)\s*(-?\d+(?:\.\d+)?)$/);
  if (threshold) return { kind: "screener", route: "/screener", params: { metric: threshold[1]!, operator: threshold[2] === ">" ? "above" : "below", value: threshold[3]! }, label: query };
  const volume = normalized.match(/^volume\s*>\s*(\d+(?:\.\d+)?)x$/);
  if (volume) return { kind: "screener", route: "/screener", params: { metric: "relative_volume", operator: "above", value: volume[1]! }, label: query };
  if (/^(résultats demain|earnings tomorrow)$/.test(normalized)) return { kind: "calendar", route: "/(tabs)/markets", params: { hub: "calendar", kind: "earnings", dayOffset: "1" }, label: query };
  const regionMacro = normalizedWords(query).match(/^(qc|on|bc|ab|sk|mb|nb|ns|pe|nl)\s+(.+)$/);
  if (regionMacro) {
    const category = NEWS_CATEGORIES[regionMacro[2]!];
    if (category) return { kind: "news", route: "/(tabs)/markets", params: { hub: "news", region: regionMacro[1]!.toUpperCase(), category }, label: query };
  }
  if (/^(etf|fnb)\s+(banques|banks)$/.test(normalized)) return { kind: "etf", route: "/etf", params: { query: normalized.includes("banks") ? "banks" : "banques" }, label: query };
  if (/^[a-zàâçéèêëîïôûùüÿñæœ &-]+$/i.test(query) && query.length > 2) return { kind: "sector", route: "/screener", params: { universe: "composite", sector: query }, label: query };
  return null;
}

export function navigateSearchCommand(command: SearchCommand, navigate: (href: { pathname: string; params: Record<string, string> }) => void): void {
  navigate({ pathname: command.route, params: command.params });
}
