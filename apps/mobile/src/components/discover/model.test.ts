import { screenDiscover, strategyAvailable } from "./model";
const rows = [{ ticker: "RY", name: "Royal Bank", sector: "Financials", momentum_20d: 6.3, rsi_14: 27.4, relative_volume: 2.1, score: 80 }, { ticker: "TD", name: "TD", sector: "Financials", momentum_20d: 1, rsi_14: 50, relative_volume: 1, score: 60 }] as never;
describe("discover strategies", () => {
  it("uses actual momentum, oversold and unusual-volume metrics as reasons", () => { expect(screenDiscover(rows, "momentum")[0]?.reasons[0]).toContain("6.3"); expect(screenDiscover(rows, "oversold")[0]?.reasons[0]).toContain("27.4"); expect(screenDiscover(rows, "unusual_volume")[0]?.reasons[0]).toContain("2.1x"); });
  it("keeps breakout unavailable without batch history and fundamentals strategies unavailable without batch facts", () => { expect(strategyAvailable("breakout")).toBe(false); expect(strategyAvailable("value")).toBe(false); expect(strategyAvailable("quality")).toBe(false); expect(strategyAvailable("dividend")).toBe(false); });
  it("contains no recommendation wording", () => expect(JSON.stringify(screenDiscover(rows, "momentum"))).not.toMatch(/acheter|vendre|opportunité/i));
});
