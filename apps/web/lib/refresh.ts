export const REFRESH_INTERVALS = {
  focusQuote: 5_000,
  cockpitTsx60: 15_000,
  watchlist: 20_000,
  composite: 45_000,
  screener: 45_000,
  terminal: 45_000,
  etf: 45_000,
  news: 15 * 60_000,
  ipo: 30 * 60_000,
  insiders: 15 * 60_000,
  apiHealth: 60_000,
} as const;
