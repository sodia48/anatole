import type { CalendarSnapshot, EarningsItem, EarningsSnapshot, EconomicEvent } from "@/src/lib/api/types";

export type CalendarLanguage = "fr" | "en";
export type CalendarRange = "today" | "7d" | "30d";
export type CalendarKindFilter = "all" | "economic" | "earnings";
export type CalendarImportanceFilter = "all" | "high" | "medium" | "low";
export type CalendarRegionFilter = "all" | "CA" | "QC" | "ON" | "BC" | "AB" | "prairies" | "atlantic";
export type CalendarScopeFilter = "all" | "personal";

export type CalendarFiltersState = {
  range: CalendarRange;
  kind: CalendarKindFilter;
  importance: CalendarImportanceFilter;
  region: CalendarRegionFilter;
  category: string;
  sector: string;
  scope: CalendarScopeFilter;
  ticker: string;
};

type SharedCalendarItem = { id: string; startsAt: string; title: string; source: string; url: string | null; category: string; regions: string[] };
export type EconomicCalendarItem = SharedCalendarItem & { kind: "economic"; event: EconomicEvent; importance: "high" | "medium" | "low" | "unknown"; timeIsEstimated: false; ticker: null; sector: null };
export type EarningsCalendarItem = SharedCalendarItem & { kind: "earnings"; event: EarningsItem; importance: "unknown"; timeIsEstimated: boolean; ticker: string; sector: string | null };
export type CalendarIntelligenceItem = EconomicCalendarItem | EarningsCalendarItem;
export type CalendarSection = { key: string; title: string; data: CalendarIntelligenceItem[] };

const TORONTO = "America/Toronto";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function torontoParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function torontoDateKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = torontoParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateOrdinal(value: string | Date): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = torontoParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

export function normalizeImportance(value: string): EconomicCalendarItem["importance"] {
  const text = normalized(value);
  if (text.includes("high") || text.includes("elevee") || text.includes("tres elevee")) return "high";
  if (text.includes("medium") || text.includes("moyenne")) return "medium";
  if (text.includes("low") || text.includes("faible")) return "low";
  return "unknown";
}

function regionsForEconomic(event: EconomicEvent): string[] {
  if (event.regions.length) return event.regions.map((region) => region.toUpperCase());
  return event.country.toLowerCase().includes("canada") ? ["CA"] : [event.country.toUpperCase()];
}

export function mergeCalendarEvents(calendar?: CalendarSnapshot | null, earnings?: EarningsSnapshot | null): CalendarIntelligenceItem[] {
  const economic: EconomicCalendarItem[] = (calendar?.events ?? []).map((event) => ({
    id: `economic:${event.id}`, kind: "economic", startsAt: event.starts_at, title: event.title, source: event.source, url: event.url,
    category: event.category, regions: regionsForEconomic(event), event, importance: normalizeImportance(event.importance), timeIsEstimated: false, ticker: null, sector: null,
  }));
  const results: EarningsCalendarItem[] = (earnings?.events ?? []).map((event) => ({
    id: `earnings:${event.ticker}:${event.starts_at}`, kind: "earnings", startsAt: event.starts_at, title: `${event.ticker} · ${event.company}`,
    source: event.source, url: event.url, category: "Earnings", regions: ["CA"], event, importance: "unknown", timeIsEstimated: event.time_is_estimated, ticker: event.ticker, sector: event.sector,
  }));
  return [...economic, ...results].filter((item) => Number.isFinite(new Date(item.startsAt).getTime())).sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime() || left.id.localeCompare(right.id));
}

function matchesRegion(regions: readonly string[], filter: CalendarRegionFilter): boolean {
  if (filter === "all") return true;
  const values = new Set(regions.map((region) => region.toUpperCase()));
  if (filter === "prairies") return ["AB", "SK", "MB"].some((region) => values.has(region));
  if (filter === "atlantic") return ["NB", "NS", "PE", "NL"].some((region) => values.has(region));
  return values.has(filter);
}

export function filterCalendarItems(items: readonly CalendarIntelligenceItem[], filters: CalendarFiltersState, now: Date, personalSymbols: readonly string[]): CalendarIntelligenceItem[] {
  const start = dateOrdinal(now);
  const lastDay = filters.range === "today" ? 0 : filters.range === "7d" ? 6 : 29;
  const personal = new Set(personalSymbols.map((symbol) => symbol.replace(/\.TO$/i, "").toUpperCase()));
  return items.filter((item) => {
    const day = dateOrdinal(item.startsAt);
    if (day == null || start == null || day < start || day > start + lastDay) return false;
    if (filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (filters.importance !== "all" && item.importance !== filters.importance) return false;
    if (!matchesRegion(item.regions, filters.region)) return false;
    if (filters.category !== "all" && normalized(item.category) !== normalized(filters.category)) return false;
    if (filters.sector !== "all" && (item.kind !== "earnings" || normalized(item.sector ?? "") !== normalized(filters.sector))) return false;
    if (filters.scope === "personal" && (item.kind !== "earnings" || !personal.has(item.ticker.replace(/\.TO$/i, "").toUpperCase()))) return false;
    if (filters.ticker && (item.kind !== "earnings" || item.ticker.replace(/\.TO$/i, "").toUpperCase() !== filters.ticker.replace(/\.TO$/i, "").toUpperCase())) return false;
    return true;
  });
}

export function groupCalendarByTorontoDate(items: readonly CalendarIntelligenceItem[], now: Date, language: CalendarLanguage): CalendarSection[] {
  const today = torontoDateKey(now);
  const groups = new Map<string, CalendarIntelligenceItem[]>();
  for (const item of items) {
    const key = torontoDateKey(item.startsAt);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, data]) => {
    const title = key === today ? (language === "fr" ? "AUJOURD’HUI" : "TODAY") : new Date(`${key}T12:00:00Z`).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "short", day: "numeric", month: "short", timeZone: TORONTO }).toUpperCase();
    return { key, title, data };
  });
}

export function nextMajorEvent(items: readonly CalendarIntelligenceItem[], now: Date): EconomicCalendarItem | null {
  return items.find((item): item is EconomicCalendarItem => item.kind === "economic" && item.importance === "high" && new Date(item.startsAt).getTime() >= now.getTime()) ?? null;
}

export function calendarRangeLabel(range: CalendarRange, language: CalendarLanguage): string {
  if (range === "today") return language === "fr" ? "Aujourd’hui" : "Today";
  if (range === "7d") return language === "fr" ? "7 prochains jours" : "Next 7 days";
  return language === "fr" ? "30 prochains jours" : "Next 30 days";
}

export function formatEstimate(value: number | null, currency: string | null, language: CalendarLanguage): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

export function countdownLabel(startsAt: string, now: Date, language: CalendarLanguage): string {
  const milliseconds = new Date(startsAt).getTime() - now.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "N/D";
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return language === "fr" ? `dans ${days} j ${hours} h` : `in ${days}d ${hours}h`;
  return language === "fr" ? `dans ${hours} h ${minutes} min` : `in ${hours}h ${minutes}m`;
}
