import type { CockpitSnapshot, TerminalSnapshot } from "@/src/lib/api/types";
import {
  buildTodayAttention,
  buildTodayHeatmap,
  buildTodayMarketReading,
  buildTodayTimeline,
  classifyTrailingSector,
  driverMove,
  driverRelationship,
  personalNewsTargets,
  resolveTodayPhase,
  selectPersonalMovers,
  selectTodayDrivers,
} from "./model";

function tile(symbol: string, change: number, weight: number) {
  return { ticker: symbol, symbol, name: symbol, sector: symbol === "CNQ" ? "Energy" : "Financials", weight, price: 100, change, change_percent: change, volume: 1_000, timestamp: "2026-09-02T15:00:00Z", source: "public", delayed: true };
}

const gainers = [tile("RY", 3, 6), tile("TD", 2.5, 5), tile("BMO", 2, 4), tile("BNS", 1.5, 3), tile("CNQ", 1, 2)];
const losers = [tile("RY", 3, 6), tile("SHOP", -1, 4), tile("ENB", -1.5, 3), tile("SU", -2, 2), tile("CNR", -3, 1)];
const cockpit: CockpitSnapshot = {
  universe: "S&P/TSX Composite",
  weighted_change_percent: 0.6,
  breadth: { advancers: 120, decliners: 80, unchanged: 10, advance_ratio: 60 },
  sectors: [
    { sector: "Energy", change_percent: 1.2, weight: 18.5, advancers: 20, decliners: 5, unchanged: 1 },
    { sector: "Financials", change_percent: -0.4, weight: 31.2, advancers: 10, decliners: 20, unchanged: 1 },
  ],
  constituents: [...gainers, ...losers.filter((item) => item.symbol !== "RY")],
  top_gainers: gainers,
  top_losers: losers,
  generated_at: "2026-09-02T15:00:00Z",
  refresh_after_seconds: 60,
};

const terminal = {
  schema_version: 2,
  regime: "Constructif",
  risk_level: "Modéré",
  anomalies: [
    { id: "a1", symbol: "RY", type: "volume_spike", severity: "high", direction: "positive", title: "Volume RY", detail: "Volume observé." },
    { id: "a2", symbol: "MISSING", type: "gap", severity: "watch", direction: "negative", title: "Gap", detail: "Écart observé." },
  ],
  sector_rotation: [{ sector: "Energy", quadrant: "LEADERSHIP", state: "Leadership", x: 4, y: 2 }],
  market_drivers: [],
} as unknown as TerminalSnapshot;

describe("Today intelligence model", () => {
  it.each([
    ["2026-09-02T12:00:00Z", "pre_market"],
    ["2026-09-02T15:00:00Z", "session"],
    ["2026-09-02T21:00:00Z", "post_market"],
    ["2026-09-05T15:00:00Z", "off_hours"],
  ])("resolves Toronto phase %s", (value, expected) => {
    expect(resolveTodayPhase(new Date(value), value).phase).toBe(expected);
  });

  it("does not claim an open market when the session quote is stale", () => {
    const result = resolveTodayPhase(new Date("2026-09-02T15:00:00Z"), "2026-09-01T20:00:00Z", "fr");
    expect(result.phase).toBe("session");
    expect(result.marketStatus).toBe("Dernières données disponibles");
    expect(result.marketStatus.toLowerCase()).not.toContain("ouvert");
  });

  it("marks a recent delayed quote as delayed rather than current", () => {
    const french = resolveTodayPhase(new Date("2026-09-02T15:00:00Z"), "2026-09-02T14:55:00Z", "fr", true);
    const english = resolveTodayPhase(new Date("2026-09-02T15:00:00Z"), "2026-09-02T14:55:00Z", "en", true);
    expect(french.quoteIsCurrent).toBe(false);
    expect(french.marketStatus).toBe("Données de séance différées");
    expect(english.quoteIsCurrent).toBe(false);
    expect(english.marketStatus).toBe("Delayed session data");
    expect(resolveTodayPhase(new Date("2026-09-02T15:00:00Z"), "2026-09-02T14:55:00Z", "fr", false).quoteIsCurrent).toBe(true);
  });

  it("classifies the trailing sector as least strong when every sector is positive", () => {
    const trailing = { ...cockpit.sectors[1]!, change_percent: 0.2 };
    expect(classifyTrailingSector(trailing, "fr")).toEqual(expect.objectContaining({ label: "Secteur le moins fort", underPressure: false }));
    const reading = buildTodayMarketReading({ cockpit: { ...cockpit, sectors: [{ ...cockpit.sectors[0]!, change_percent: 0.8 }, trailing] }, terminal: null, universe: "composite", language: "fr" });
    expect(reading.detail).toContain("Financials affiche la progression la plus faible (+0,20 %).");
    expect(reading.detail).not.toContain("Financials est sous pression");
  });

  it("classifies a negative trailing sector as under pressure", () => {
    expect(classifyTrailingSector(cockpit.sectors[1], "en")).toEqual(expect.objectContaining({ label: "Sector under pressure", underPressure: true }));
  });

  it("uses under-pressure wording in a mixed market and never infers regime persistence", () => {
    const reading = buildTodayMarketReading({ cockpit, terminal, universe: "composite", language: "fr" });
    expect(reading.detail).toContain("Financials est sous pression (-0,40 %).");
    expect(reading.detail).toContain("Le régime Terminal · TSX 60 est actuellement constructif.");
    expect(reading.detail).not.toMatch(/demeure|remains/i);
    const english = buildTodayMarketReading({ cockpit, terminal, universe: "composite", language: "en" });
    expect(english.detail).toContain("The Terminal · TSX 60 regime is currently constructive.");
  });

  it("builds positive, negative and partial readings without invented causality", () => {
    const positive = buildTodayMarketReading({ cockpit, terminal, psychology: { score: 61, label: "Optimiste" } as never, universe: "composite", language: "fr" });
    const negative = buildTodayMarketReading({ cockpit: { ...cockpit, weighted_change_percent: -1 }, terminal: null, universe: "tsx60", language: "en" });
    const partial = buildTodayMarketReading({ cockpit: null, terminal: null, universe: "composite", language: "fr" });
    expect(positive.tone).toBe("positive");
    expect(positive.detail).toContain("Terminal · TSX 60");
    expect(negative.tone).toBe("negative");
    expect(partial.tone).toBe("neutral");
    expect(`${positive.headline} ${positive.detail}`).not.toMatch(/caus|fait monter|fait baisser/i);
  });

  it("uses driver priority and preserves percent versus basis-point units", () => {
    const drivers = [
      { key: "canada_10y", status: "available", change_1d: 6, change_unit: "bps", correlation_60d_to_tsx: -0.5 },
      { key: "wti", status: "available", change_1d: 1.2, change_unit: "%", correlation_60d_to_tsx: 0.8 },
      { key: "gold", status: "unavailable", change_1d: null, change_unit: "%", correlation_60d_to_tsx: null },
    ] as TerminalSnapshot["market_drivers"];
    expect(selectTodayDrivers(drivers).map((item) => item.key)).toEqual(["wti", "canada_10y"]);
    expect(driverMove(drivers[0]!, "fr")).toContain("bps");
    expect(driverMove(drivers[1]!, "fr")).toContain("%");
    expect(driverRelationship(drivers[1]!, "fr")).toContain("Corrélation récente");
  });

  it("ranks triggered alerts first, boosts personal symbols, deduplicates tickers and caps attention at five", () => {
    const result = buildTodayAttention({
      alerts: { items: [{ id: "rule", symbol: "RY", status: "triggered", message: "Seuil observé", current_value: 100, triggered: true }], triggered_count: 1, monitored_count: 1, unavailable_count: 0 },
      terminal,
      calendar: { events: [{ id: "cpi", title: "IPC", starts_at: "2026-09-02T16:00:00Z", importance: "high", category: "Inflation", country: "Canada", regions: ["CA", "QC"] }], generated_at: "2026-09-02T10:00:00Z" },
      earnings: { events: [{ ticker: "TD", symbol: "TD", company: "TD Bank", sector: "Financials", starts_at: "2026-09-03T12:00:00Z", window_start: "2026-09-03T12:00:00Z", window_end: "2026-09-03T13:00:00Z", time_is_estimated: true, eps_estimate: null, revenue_estimate: null, estimate_currency: null }], companies_with_dates: 1, generated_at: "2026-09-02T10:00:00Z" },
      screener: { universe: "Composite", items: [{ ticker: "RY", symbol: "RY", name: "RY", sector: "Financials", price: 100, change_percent: 3, volume: 100, average_volume_20d: 50, relative_volume: 2, momentum_20d: 12, rsi_14: 55, sma_20: 90, sma_50: 80, trend: "Haussière", score: 90, signal: "Fort", source: "public", delayed: true, quote_as_of: null }], sectors: ["Financials"], generated_at: "2026-09-02", refresh_after_seconds: 180, live_items: 1, fallback_items: 0 },
      insiders: { trades: [{ id: "i1", ticker: "CNQ", insider_name: "A", transaction_label: "Achat", unusual: true }], summary: {}, sources: [] } as never,
      news: { items: Array.from({ length: 5 }, (_, index) => ({ id: `n${index}`, title: `News ${index}`, summary: "Résumé", url: "https://example.com", published_at: "2026-09-02" })), generated_at: "2026-09-02" },
      watchlistSymbols: ["RY"], portfolioSymbols: [], universe: "composite", language: "fr", now: new Date("2026-09-02T15:00:00Z"),
    });
    expect(result).toHaveLength(5);
    expect(result[0]?.symbol).toBe("RY");
    expect(result[0]?.kind).toBe("alert");
    expect(result[0]?.count).toBe(3);
    expect(result[0]?.badge).toBe("Dans votre watchlist");
    expect(result.some((item) => item.kind === "calendar")).toBe(true);
    expect(result.some((item) => item.kind === "earnings")).toBe(true);
    expect(result.some((item) => item.kind === "news")).toBe(false);
    const insiderOnly = buildTodayAttention({ insiders: { trades: [{ id: "i1", ticker: "CNQ", insider_name: "A", transaction_label: "Achat", unusual: true }], summary: {}, sources: [] } as never, universe: "composite", language: "fr", now: new Date("2026-09-02T15:00:00Z") });
    expect(insiderOnly[0]?.kind).toBe("insider");
  });

  it("keeps a high anomaly above lower priority screener and news observations", () => {
    const result = buildTodayAttention({ terminal, news: { items: [{ id: "n", title: "N", summary: "D", url: "https://example.com", published_at: "2026-09-02" }], generated_at: "2026-09-02" }, universe: "composite", language: "en", now: new Date("2026-09-02T15:00:00Z") });
    expect(result[0]?.kind).toBe("anomaly");
  });

  it("builds at most ten unique stock tiles from five gainers and five losers", () => {
    const result = buildTodayHeatmap("stocks", cockpit, terminal);
    expect(result.nodes.length).toBeLessThanOrEqual(10);
    expect(new Set(result.nodes.map((item) => item.symbol)).size).toBe(result.nodes.length);
  });

  it("keeps real sector weights and joins anomalies only to real market tiles", () => {
    const sectors = buildTodayHeatmap("sectors", cockpit, terminal);
    const anomalies = buildTodayHeatmap("anomalies", cockpit, terminal);
    expect(sectors.nodes.find((item) => item.sector === "Energy")?.weight).toBe(18.5);
    expect(anomalies.nodes).toEqual([expect.objectContaining({ id: "a1", symbol: "RY", weight: 6, changePercent: 3 })]);
    expect(anomalies.unmapped[0]).toEqual(expect.objectContaining({ symbol: "MISSING" }));
    expect(anomalies.unmapped[0]).not.toHaveProperty("weight");
    expect(anomalies.unmapped[0]).not.toHaveProperty("changePercent");
  });

  it("selects three watchlist movers and no more than two deduplicated stock-news targets", () => {
    const watchlist = { items: [tile("RY", 1, 1), tile("TD", -4, 1), tile("CNQ", 3, 1), tile("BMO", 2, 1)] } as never;
    expect(selectPersonalMovers(watchlist).map((item) => item.symbol)).toEqual(["TD", "CNQ", "BMO"]);
    expect(personalNewsTargets(watchlist, { positions: [{ symbol: "TD", ticker: "TD", name: "TD", day_change_percent: -4 }, { symbol: "SHOP", ticker: "SHOP", name: "Shopify", day_change_percent: 5 }] } as never)).toEqual([
      expect.objectContaining({ symbol: "SHOP" }),
      expect.objectContaining({ symbol: "TD" }),
    ]);
  });

  it("merges calendar and earnings chronologically, preserves provincial regions and labels market markers as usual", () => {
    const now = new Date("2026-09-02T14:00:00Z");
    const fr = buildTodayTimeline(
      { events: [{ id: "qc", title: "Emploi Québec", starts_at: "2026-09-02T15:00:00Z", importance: "high", category: "Emploi", country: "Canada", regions: ["QC"] }], generated_at: now.toISOString() },
      { events: [{ ticker: "RY", symbol: "RY", company: "Royal Bank", sector: null, starts_at: "2026-09-02T16:00:00Z", window_start: "2026-09-02T16:00:00Z", window_end: "2026-09-02T17:00:00Z", time_is_estimated: false, eps_estimate: null, revenue_estimate: null, estimate_currency: null }], companies_with_dates: 1, generated_at: now.toISOString() },
      now, "fr",
    );
    expect(fr.length).toBeLessThanOrEqual(8);
    expect(fr.find((item) => item.id === "calendar:qc")?.region).toBe("QC");
    expect(fr.findIndex((item) => item.id === "calendar:qc")).toBeLessThan(fr.findIndex((item) => item.id.startsWith("earnings:")));
    expect(fr.filter((item) => item.kind === "market_marker").every((item) => /habitu/i.test(`${item.title} ${item.importance}`))).toBe(true);
    const en = buildTodayTimeline(null, null, now, "en");
    expect(en.some((item) => item.title === "Usual TSX open")).toBe(true);
  });
});
