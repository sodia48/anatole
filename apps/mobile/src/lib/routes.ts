export const anatoleRoutes = {
  focus: (ticker: string) => ({ pathname: "/focus/[ticker]", params: { ticker } }) as const,
  compare: (symbols?: string[]) => ({ pathname: "/compare", params: symbols?.length ? { symbols: symbols.join(",") } : undefined }) as never,
  sector: (sector: string) => ({ pathname: "/screener", params: { sector, universe: "composite" } }) as never,
  terminal: "/terminal" as const, news: { pathname: "/(tabs)/markets", params: { hub: "news" } } as never,
  calendar: { pathname: "/(tabs)/markets", params: { hub: "calendar" } } as never,
  etf: "/etf" as const, network: (ticker: string) => ({ pathname: "/network/[ticker]", params: { ticker } }) as never,
  discover: "/discover" as never, assistant: "/assistant" as never, search: "/search" as never,
};
