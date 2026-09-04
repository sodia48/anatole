import type { TerminalOpportunity, TerminalSnapshot } from "@/src/lib/api/types";
import { filterAndSortRadar, opportunityLabel, regimeLabel, riskLabel, sectorStateLabel, uniqueRadarItems } from "./model";

function opportunity(overrides: Partial<TerminalOpportunity>): TerminalOpportunity {
  return { symbol: "RY", name: "Royal Bank", sector: "Financials", price: 200, change_percent: 1, momentum_20d: 5, rsi_14: 55, relative_volume: 1.2, score: 70, signal: "Constructif", opportunity_type: "Leadership", reasons: ["Score élevé"], ...overrides };
}

const lowRy = opportunity({ score: 60 });
const highRy = opportunity({ score: 82, relative_volume: 1.4 });
const shop = opportunity({ symbol: "SHOP", name: "Shopify", sector: "Technology", score: 92, change_percent: 3, momentum_20d: 14, relative_volume: 0.8 });
const enb = opportunity({ symbol: "ENB", name: "Enbridge", sector: "Energy", score: 45, change_percent: -2, momentum_20d: 20, relative_volume: 3 });

const snapshot = { opportunities: [lowRy, shop], leaders: [highRy], laggards: [enb] } as TerminalSnapshot;

describe("Terminal radar Web-parity model", () => {
  it("deduplicates the opportunities/leaders/laggards union by highest score", () => {
    const result = uniqueRadarItems(snapshot);
    expect(result.map((item) => item.symbol)).toEqual(["RY", "SHOP", "ENB"]);
    expect(result.find((item) => item.symbol === "RY")?.score).toBe(82);
  });

  it("sorts all, volume, momentum and pressure exactly like the Web", () => {
    const items = uniqueRadarItems(snapshot);
    expect(filterAndSortRadar(items, "all").map((item) => item.symbol)).toEqual(["SHOP", "RY", "ENB"]);
    expect(filterAndSortRadar(items, "volume").map((item) => item.symbol)).toEqual(["ENB", "RY", "SHOP"]);
    expect(filterAndSortRadar(items, "momentum").map((item) => item.symbol)).toEqual(["ENB", "SHOP", "RY"]);
    expect(filterAndSortRadar(items, "pressure").map((item) => item.symbol)).toEqual(["ENB", "RY", "SHOP"]);
  });

  it("filters sectors locally without another snapshot", () => {
    expect(filterAndSortRadar(uniqueRadarItems(snapshot), "all", "Financials").map((item) => item.symbol)).toEqual(["RY"]);
  });

  it("keeps French labels and translates the deterministic Terminal vocabulary to English", () => {
    expect(regimeLabel("Haussier", "fr")).toBe("Haussier");
    expect(regimeLabel("Haussier", "en")).toBe("Bullish");
    expect(riskLabel("Modéré", "en")).toBe("Moderate");
    expect(sectorStateLabel("Faiblesse", "en")).toBe("Weakness");
    expect(opportunityLabel("Sous pression", "en")).toBe("Under pressure");
  });
});
