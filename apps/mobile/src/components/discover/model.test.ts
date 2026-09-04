import { screenDiscover, strategyAvailable } from "./model";
import type { ScreenerRow } from "@/src/lib/api/types";
const rows = [{ ticker: "RY", name: "Royal Bank", sector: "Financials", momentum_20d: 6.3, rsi_14: 27.4, relative_volume: 2.1, score: 80 }, { ticker: "TD", name: "TD", sector: "Financials", momentum_20d: 1, rsi_14: 50, relative_volume: 1, score: 60 }] as ScreenerRow[];
describe("discover strategies", () => {
  it("uses actual momentum, oversold and unusual-volume metrics as reasons", () => { expect(screenDiscover(rows, "momentum")[0]?.reasons[0]).toContain("6.3"); expect(screenDiscover(rows, "oversold")[0]?.reasons[0]).toContain("27.4"); expect(screenDiscover(rows, "unusual_volume")[0]?.reasons[0]).toContain("2.1x"); });
  it("uses sourced breakout fields and keeps unsupported fundamentals strategies unavailable", () => {
    const breakoutRows = [{ ...rows[0], breakout_20d: true, breakout_percent: 1.4, prior_high_20d: 100 }, { ...rows[1], breakout_20d: null, breakout_percent: null, prior_high_20d: null }] as never;
    expect(strategyAvailable("breakout")).toBe(true);
    expect(screenDiscover(breakoutRows, "breakout")[0]?.reasons[0]).toContain("+1.4 %");
    expect(strategyAvailable("value")).toBe(false); expect(strategyAvailable("quality")).toBe(false); expect(strategyAvailable("dividend")).toBe(false);
  });
  it("contains no recommendation wording", () => expect(JSON.stringify(screenDiscover(rows, "momentum"))).not.toMatch(/acheter|vendre|opportunité/i));
});
