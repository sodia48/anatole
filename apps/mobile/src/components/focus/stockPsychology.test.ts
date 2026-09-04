import { buildStockPsychology } from "./stockPsychology";

const snapshot = (count: number) => ({
  quote: { source: "public", delayed: true }, profile: { name: "Royal Bank", sector: "Financials" }, generated_at: "2026-09-03T00:00:00Z",
  technicals: { rsi_14: 55 }, history: Array.from({ length: count }, (_, index) => ({ time: index, open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 1_000 + index })),
}) as never;

describe("stock psychology", () => {
  it("returns N/D when real input coverage is insufficient", () => expect(buildStockPsychology(snapshot(10)).score).toBeNull());
  it("computes a transparent score only with sufficient observed inputs", () => {
    const reading = buildStockPsychology(snapshot(70));
    expect(reading.score).not.toBeNull(); expect(reading.coverage).toBeGreaterThanOrEqual(70); expect(reading.methodology).toContain("pas une recommandation");
  });
});
