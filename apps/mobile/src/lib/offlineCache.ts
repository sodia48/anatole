import type { Query, QueryClient } from "@tanstack/react-query";

export const MOBILE_CACHE_BUSTER = "anatole-mobile-contract-v3";
export const MOBILE_CACHE_KEY = "anatole.mobile.query-cache.v3";
export const MOBILE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

export const PERSISTED_QUERY_SCOPES = new Set([
  "cockpit", "watchlist", "portfolio", "alerts", "notifications", "focus", "stock-news",
  "news", "earnings", "calendar", "terminal", "screener", "psychology", "comparison",
  "etf-directory", "etf-holdings", "etf-history", "ipo", "insiders",
]);

export const RECONNECT_STAGES = [
  { delay: 0, scopes: ["cockpit", "watchlist"] },
  { delay: 300, scopes: ["portfolio"] },
  { delay: 750, scopes: ["focus", "stock-news"] },
  { delay: 1_200, scopes: ["news", "calendar", "earnings"] },
  { delay: 1_750, scopes: ["terminal", "screener", "psychology"] },
  { delay: 2_350, scopes: ["etf-directory", "etf-holdings", "etf-history", "ipo", "insiders", "comparison"] },
] as const;

export function shouldDehydrateMobileQuery(query: Query): boolean {
  return query.state.status === "success"
    && PERSISTED_QUERY_SCOPES.has(String(query.queryKey[0]));
}

export function scheduleReconnectRefresh(queryClient: QueryClient): () => void {
  const timers = RECONNECT_STAGES.map(({ delay, scopes }) => setTimeout(() => {
    for (const scope of scopes) {
      void queryClient.invalidateQueries({ queryKey: [scope], refetchType: "active" });
    }
  }, delay));
  return () => timers.forEach(clearTimeout);
}
