export const WATCHLIST_STORAGE_KEY = "anatole.watchlist.v1";
export const WATCHLIST_EVENT = "anatole-watchlist-change";
export const DEFAULT_WATCHLIST = ["RY", "TD", "SHOP", "ENB", "CNQ", "BNS"];

export function normalizeWatchlistSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/\.TO$/, "");
}

export function readWatchlist(): string[] {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return DEFAULT_WATCHLIST;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_WATCHLIST;
    const cleaned = parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeWatchlistSymbol)
      .filter((item) => /^[A-Z0-9.-]{1,15}$/.test(item));
    return [...new Set(cleaned)].slice(0, 30);
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function writeWatchlist(tickers: string[]): string[] {
  const cleaned = [...new Set(tickers.map(normalizeWatchlistSymbol))]
    .filter((item) => /^[A-Z0-9.-]{1,15}$/.test(item))
    .slice(0, 30);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(cleaned));
    window.dispatchEvent(new Event(WATCHLIST_EVENT));
  }
  return cleaned;
}

export function toggleWatchlistTicker(ticker: string): string[] {
  const symbol = normalizeWatchlistSymbol(ticker);
  const current = readWatchlist();
  return writeWatchlist(current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]);
}
