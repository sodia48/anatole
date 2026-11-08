import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultOptionFilters, filterOptions, loadOptionFilters, restoreOptionFilters, saveOptionFilters } from "./optionFilters";
import type { OptionContract } from "@/src/lib/api/options";

const contract = (overrides: Partial<OptionContract>): OptionContract => ({
  symbol: "fixture", underlying: "FIXTURE", market: "tsx", contract: null, side: "call", strike: 100,
  expiration: "2027-01-15", exchange: "FIXTURE", bid: 1, ask: 2, last: 1.5, change: null,
  percent_change: null, volume: 0, open_interest: 0, implied_volatility: 25, delta: 0.5,
  gamma: null, theta: null, vega: null, in_the_money: null, source: "fixture", delayed: false,
  ...overrides,
});

test("numeric filters preserve published zero and reject missing data or invalid thresholds", () => {
  const zero = contract({ symbol: "zero" });
  const missing = contract({ symbol: "missing", volume: null });
  const filters = { ...defaultOptionFilters, volume: "0" };
  expect(filterOptions([zero, missing], filters, null, false)).toEqual([zero]);
  expect(filterOptions([zero], { ...filters, volume: "invalid" }, null, false)).toEqual([]);
  expect(filterOptions([zero], { ...defaultOptionFilters, spread: "0,5" }, null, false)).toEqual([]);
  expect(filterOptions([zero], { ...defaultOptionFilters, deltaMin: "0,5" }, null, false)).toEqual([zero]);
});

test("freshness and liquidity cannot treat unconfirmed or crossed quotes as current", () => {
  const commodity = contract({ market: "commodities" });
  const equity = contract({});
  expect(filterOptions([commodity, equity], { ...defaultOptionFilters, freshness: "fresh" }, 100, false)).toEqual([equity]);
  expect(filterOptions([equity], { ...defaultOptionFilters, freshness: "fresh" }, 100, true)).toEqual([]);
  const crossed = contract({ bid: 3, ask: 2 });
  expect(filterOptions([crossed, equity], { ...defaultOptionFilters, availability: "quoted" }, 100, false)).toEqual([equity]);
  expect(filterOptions([crossed], { ...defaultOptionFilters, availability: "missing" }, 100, false)).toEqual([crossed]);
});

test("moneyness requires an observed underlying and restores only valid preferences", () => {
  const call = contract({ strike: 100 });
  const put = contract({ side: "put", strike: 100 });
  expect(filterOptions([call, put], { ...defaultOptionFilters, moneyness: "itm" }, null, false)).toEqual([]);
  expect(filterOptions([call, put], { ...defaultOptionFilters, moneyness: "itm" }, 110, false)).toEqual([call]);
  expect(restoreOptionFilters('{"volume":"10","freshness":"fresh","availability":"bad"}'))
    .toEqual({ ...defaultOptionFilters, volume: "10", freshness: "fresh" });
  expect(restoreOptionFilters("{")).toEqual(defaultOptionFilters);
});

test("a read after rapid changes waits for the last queued preference write", async () => {
  await AsyncStorage.clear();
  void saveOptionFilters({ ...defaultOptionFilters, volume: "1" });
  void saveOptionFilters({ ...defaultOptionFilters, volume: "10" });
  expect((await loadOptionFilters()).volume).toBe("10");
});
