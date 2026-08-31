import type { InsiderSnapshot, InsiderTrade, InsiderTransactionType, IpoInstrumentType, IpoItem } from "@/src/lib/api/types";
import type { Language } from "@/src/lib/i18n";

export type IpoCountryFilter = "all" | "Canada" | "États-Unis";
export type IpoTypeFilter = "all" | IpoInstrumentType;
export type InsiderMarket = "canada" | "us";
export type InsiderTypeFilter = "all" | InsiderTransactionType;

export function filterIpoItems(items: IpoItem[], search: string, country: IpoCountryFilter, instrument: IpoTypeFilter): IpoItem[] {
  const needle = search.trim().toLocaleLowerCase("fr");
  return items.filter((item) => country === "all" || item.country === country)
    .filter((item) => instrument === "all" || item.instrument_type === instrument)
    .filter((item) => !needle || [item.company, item.symbol, item.exchange, item.status, item.event_type].some((value) => value.toLocaleLowerCase("fr").includes(needle)));
}

export function filterInsiderTrades(trades: InsiderTrade[], type: InsiderTypeFilter): InsiderTrade[] {
  return trades.filter((trade) => type === "all" || trade.transaction_type === type);
}

export function dedupeInsiderTradesForRender(trades: InsiderTrade[]): InsiderTrade[] {
  const seenIds = new Set<string>();
  return trades.filter((trade) => {
    if (seenIds.has(trade.id)) return false;
    seenIds.add(trade.id);
    return true;
  });
}

export function insiderPreviewScanLimit(market: InsiderMarket, ticker: string): number {
  if (ticker.trim()) return 1;
  return market === "canada" ? 8 : 10;
}

export function insiderCoverageUnavailable(snapshot: InsiderSnapshot, loading: boolean): boolean {
  if (loading || snapshot.trades.length > 0 || snapshot.summary.transactions > 0) return false;
  const automated = snapshot.sources.filter((source) => !source.source.toUpperCase().startsWith("SEDI"));
  return automated.length === 0 || automated.every((source) => source.status === "unavailable");
}

export function formatIpoPrice(item: IpoItem, language: Language): string {
  const currency = item.offer_currency || (item.country === "Canada" ? "CAD" : "USD");
  const format = (value: number) => new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", {
    style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
  if (item.offer_price_status === "range" && item.offer_price_low !== null && item.offer_price_high !== null) return `${format(item.offer_price_low)} – ${format(item.offer_price_high)}`;
  if (item.offer_price !== null && (item.offer_price_status === "final" || item.offer_price_status === "reference")) return `${item.offer_price_status === "reference" ? "≈ " : ""}${format(item.offer_price)}`;
  return language === "fr" ? "Non publié" : "Not published";
}

export function ipoPriceCaption(item: IpoItem, language: Language): string {
  if (item.offer_price_status === "range") return language === "fr" ? "Fourchette indicative" : "Indicative range";
  if (item.offer_price_status === "reference") return language === "fr" ? "Prix de référence" : "Reference price";
  if (item.offer_price_status === "final") return language === "fr" ? "Prix IPO final" : "Final IPO price";
  return language === "fr" ? "Prix IPO" : "IPO price";
}
