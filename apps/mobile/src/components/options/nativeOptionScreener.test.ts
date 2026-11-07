import type { OptionContract } from "@/src/lib/api/options";

import { heatmapScale, screenLoadedContracts, type ScreenerCriteria } from "./optionScreenerLogic";

const base: OptionContract = {
  symbol: "RY-C100", underlying: "RY", market: "tsx", contract: null, side: "call", strike: 100,
  expiration: "2027-11-25", exchange: "TSX", bid: 1, ask: 2, last: 1.5, change: null,
  percent_change: null, volume: 12, open_interest: 40, implied_volatility: null, delta: null,
  gamma: null, theta: null, vega: null, in_the_money: null, source: "Synthetic", delayed: true,
};
const contracts: OptionContract[] = [
  base,
  { ...base, symbol: "RY-P100", side: "put", volume: null, open_interest: null },
  { ...base, symbol: "RY-C105", strike: 105, expiration: "2028-02-25", volume: 120, open_interest: 8 },
];
const all: ScreenerCriteria = { query: "", side: "both", expiration: "", minVolume: null, minOpenInterest: null, sort: "expiration" };

test("filters the loaded chain without treating missing volume or interest as zero", () => {
  expect(screenLoadedContracts(contracts, all)).toHaveLength(3);
  expect(screenLoadedContracts(contracts, { ...all, minVolume: 0 })).toHaveLength(2);
  expect(screenLoadedContracts(contracts, { ...all, minOpenInterest: 20 }).map((item) => item.symbol)).toEqual(["RY-C100"]);
  expect(screenLoadedContracts(contracts, { ...all, side: "put", expiration: "2027-11-25" }).map((item) => item.symbol)).toEqual(["RY-P100"]);
  expect(screenLoadedContracts(contracts, { ...all, query: "105" }).map((item) => item.symbol)).toEqual(["RY-C105"]);
});

test("sorts observed volume first and scales heatmap only from reported values", () => {
  const result = screenLoadedContracts(contracts, { ...all, sort: "volume" });
  expect(result.map((item) => item.symbol)).toEqual(["RY-C105", "RY-C100", "RY-P100"]);
  expect(heatmapScale(result, "volume")).toBe(120);
  expect(heatmapScale(result, "open_interest")).toBe(40);
});
