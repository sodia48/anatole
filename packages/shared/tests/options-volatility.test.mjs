import assert from "node:assert/strict";
import test from "node:test";
import { volatilitySeries } from "../src/options-chain.ts";

const option = (side, strike, iv, delta, changes = {}) => ({
  symbol: `FIXTURE-${side}-${strike}`, underlying: "RY", market: "tsx", contract: null,
  expiration: "2027-11-25", side, strike, implied_volatility: iv, delta, ...changes,
});

test("summarizes an identifiable synthetic series without inventing missing values", () => {
  const contracts = [
    option("put", 90, 30, -0.25), option("call", 110, 20, 0.25),
    option("call", 100, 24, 0.5), option("put", 100, 25, -0.5),
    option("call", 120, null, null), option("put", 80, 0, null),
  ];
  const [series] = volatilitySeries(contracts, 100);
  assert.equal(series.points.length, 4);
  assert.deepEqual(series.atm.map((p) => [p.side, p.strike]), [["call", 100], ["put", 100]]);
  assert.equal(series.skew.difference, 10);
  assert.equal(volatilitySeries(contracts, null)[0].atm.length, 0);
});

test("keeps futures months apart and drops ambiguous, invalid, and unidentifiable observations", () => {
  const future = { market: "commodities", underlying: "GC" };
  const contracts = [
    option("call", 10, 20, 0.25, { ...future, contract: "GCZ27" }),
    option("put", 10, 30, -0.25, { ...future, contract: "GCG28" }),
    option("call", 12, 22, 0.25, { ...future, contract: null }),
    option("call", 100, 25, 0.25), option("call", 100, 26, 0.26, { symbol: "OTHER-DELIVERABLE" }),
    option("put", 95, 31, -0.25),
    option("call", 105, 19, 0.25, { expiration: "2027-02-30" }),
  ];
  const series = volatilitySeries(contracts, 100);
  assert.equal(series.length, 3);
  assert.ok(series.every((item) => item.skew === null));
  assert.ok(series.filter((item) => item.contract !== null).every((item) => item.atm.length === 0));
  const equity = series.find((item) => item.contract === null);
  assert.deepEqual(equity.points.map((item) => item.symbol), ["FIXTURE-put-95"]);
});

test("ignores invalid dates, non-finite strikes and invalid volatility", () => {
  const contracts = [
    option("call", Infinity, 22, 0.25),
    option("put", 95, -2, -0.25),
    option("call", 100, NaN, 0.25),
    option("put", 90, 28, -0.25, { expiration: "2027-13-01" }),
  ];
  assert.deepEqual(volatilitySeries(contracts, 100), []);
});

test("does not select arbitrarily between equally close 25-delta options", () => {
  const [series] = volatilitySeries([
    option("put", 90, 30, -0.25), option("call", 105, 20, 0.20), option("call", 110, 19, 0.30),
  ], 100);
  assert.equal(series.skew, null);
});
