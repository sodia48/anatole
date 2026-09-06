import type { CalendarSnapshot, EarningsItem, EarningsSnapshot, EconomicEvent, ProvincialMacroSnapshot } from "@/src/lib/api/types";
import { calendarProvinceCodes, calendarRangeLabel, filterCalendarItems, formatEstimate, groupCalendarByTorontoDate, mergeCalendarEvents, nextMajorEvent, type CalendarFiltersState } from "./model";

function economic(overrides: Partial<EconomicEvent> = {}): EconomicEvent {
  return { id: "jobs", title: "Enquête sur la population active", country: "Canada", currency: "CAD", category: "Travail", importance: "high", starts_at: "2026-09-03T12:30:00Z", source: "Statistique Canada", url: "https://statcan.gc.ca/jobs", description: "Données officielles.", regions: ["CA"], ...overrides };
}

function earning(overrides: Partial<EarningsItem> = {}): EarningsItem {
  return { ticker: "RY", symbol: "RY", company: "Royal Bank", sector: "Financials", weight: 6, starts_at: "2026-09-04T12:00:00Z", window_start: "2026-09-04T12:00:00Z", window_end: "2026-09-04T13:00:00Z", time_is_estimated: true, eps_estimate: null, revenue_estimate: null, estimate_currency: "CAD", eps_analyst_count: null, revenue_analyst_count: null, source: "Public calendar", url: "https://example.com/ry", ...overrides };
}

function snapshots(economics: EconomicEvent[], earnings: EarningsItem[]) {
  const calendar: CalendarSnapshot = { events: economics, source_statuses: [], generated_at: "2026-09-03T10:00:00Z", refresh_after_seconds: 1800 };
  const results: EarningsSnapshot = { universe: "composite", universe_as_of: null, constituent_count: 1, companies_with_dates: earnings.length, events: earnings, source_statuses: [], generated_at: "2026-09-03T10:00:00Z", refresh_after_seconds: 10800 };
  return mergeCalendarEvents(calendar, results);
}

const base: CalendarFiltersState = { range: "30d", kind: "all", importance: "all", region: "all", category: "all", sector: "all", scope: "all", ticker: "" };
const now = new Date("2026-09-03T11:00:00Z");

describe("calendar intelligence model", () => {
  it("merges economic and earnings origins without inventing forecast/actual/previous values", () => {
    const items = snapshots([economic({ regions: ["QC", "ON"] })], [earning()]);
    expect(items.map((item) => item.kind)).toEqual(["economic", "earnings"]);
    expect(items[0]?.regions).toEqual(["QC", "ON"]);
    expect(items.every((item) => !("forecast" in item) && !("actual" in item) && !("previous" in item))).toBe(true);
  });

  it("supports today, 7-day and 30-day windows", () => {
    const items = snapshots([
      economic(),
      economic({ id: "week", starts_at: "2026-09-09T12:30:00Z" }),
      economic({ id: "month", starts_at: "2026-09-25T12:30:00Z" }),
    ], []);
    expect(filterCalendarItems(items, { ...base, range: "today" }, now, [])).toHaveLength(1);
    expect(filterCalendarItems(items, { ...base, range: "7d" }, now, [])).toHaveLength(2);
    expect(filterCalendarItems(items, { ...base, range: "30d" }, now, [])).toHaveLength(3);
  });

  it("labels the rolling 7-day and 30-day windows exactly", () => {
    expect(calendarRangeLabel("7d", "fr")).toBe("7 prochains jours");
    expect(calendarRangeLabel("7d", "en")).toBe("Next 7 days");
    expect(calendarRangeLabel("30d", "fr")).toBe("30 prochains jours");
    expect(calendarRangeLabel("30d", "en")).toBe("Next 30 days");
  });

  it("groups by Toronto date and selects only the next high-importance event", () => {
    const items = snapshots([economic(), economic({ id: "low", importance: "low", starts_at: "2026-09-03T13:00:00Z" })], []);
    const sections = groupCalendarByTorontoDate(items, now, "fr");
    expect(sections[0]?.title).toBe("AUJOURD’HUI");
    expect(nextMajorEvent(items, now)?.event.id).toBe("jobs");
  });

  it("filters province, category and importance locally", () => {
    const items = snapshots([economic({ id: "qc", regions: ["QC"], category: "Inflation", importance: "Élevée" }), economic({ id: "ab", regions: ["AB"], category: "Énergie", importance: "Faible" })], []);
    expect(filterCalendarItems(items, { ...base, region: "QC" }, now, []).map((item) => item.id)).toEqual(["economic:qc"]);
    expect(filterCalendarItems(items, { ...base, category: "Énergie" }, now, []).map((item) => item.id)).toEqual(["economic:ab"]);
    expect(filterCalendarItems(items, { ...base, importance: "high" }, now, []).map((item) => item.id)).toEqual(["economic:qc"]);
  });

  it("limits My events to watchlist and portfolio earnings", () => {
    const items = snapshots([], [earning(), earning({ ticker: "TD", symbol: "TD", company: "TD Bank" }), earning({ ticker: "SHOP", symbol: "SHOP", company: "Shopify" })]);
    const personal = filterCalendarItems(items, { ...base, scope: "personal" }, now, ["RY", "SHOP"]);
    expect(personal.map((item) => item.kind === "earnings" ? item.ticker : null)).toEqual(["RY", "SHOP"]);
  });

  it("preserves null EPS and revenue as N/D and keeps estimated time explicit", () => {
    const item = snapshots([], [earning()])[0];
    expect(item?.kind).toBe("earnings");
    if (item?.kind !== "earnings") throw new Error("Expected earnings item");
    expect(formatEstimate(item.event.eps_estimate, item.event.estimate_currency, "fr")).toBe("N/D");
    expect(formatEstimate(item.event.revenue_estimate, item.event.estimate_currency, "fr")).toBe("N/D");
    expect(item.timeIsEstimated).toBe(true);
  });

  it("maps exact provinces and regional groups to bounded province-first queries", () => {
    expect(calendarProvinceCodes("QC")).toEqual(["QC"]);
    expect(calendarProvinceCodes("prairies")).toEqual(["AB", "SK", "MB"]);
    expect(calendarProvinceCodes("atlantic")).toEqual(["NB", "NS", "PE", "NL"]);
    expect(calendarProvinceCodes("CA")).toEqual([]);
    expect(calendarProvinceCodes("all")).toEqual([]);
  });

  it("preserves provincial source metadata and estimated-time status", () => {
    const provincial = {
      region: "NL",
      province: "Terre-Neuve-et-Labrador",
      language: "fr",
      mode: "province-first",
      latest_releases: [],
      upcoming_events: [{ id: "nl-jobs", region: "NL", province: "Terre-Neuve-et-Labrador", title: "Emploi — Terre-Neuve-et-Labrador", description: "Volet provincial vérifiable.", category: "Emploi", importance: "Élevée", importance_score: 100, starts_at: "2026-09-04T13:00:00Z", time_is_estimated: true, source: "Statistique Canada", source_kind: "statcan", source_url: "https://statcan.gc.ca/jobs", official: true, specificity: "province-normalized" }],
      sources: [],
      generated_at: "2026-09-03T10:00:00Z",
      refresh_after_seconds: 900,
      message: null,
    } satisfies ProvincialMacroSnapshot;
    const item = mergeCalendarEvents(null, null, [provincial])[0];
    expect(item).toMatchObject({ kind: "economic", regions: ["NL"], source: "Statistique Canada", url: "https://statcan.gc.ca/jobs", timeIsEstimated: true });
  });
});
