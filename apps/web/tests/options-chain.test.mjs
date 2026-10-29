import { test } from "node:test";
import assert from "node:assert/strict";
import { pairOptions } from "../../../packages/shared/src/options-chain.ts";

const option = (symbol, side, overrides = {}) => ({
  symbol, side, market: "commodities", underlying: "RB", contract: "RBZ27",
  expiration: "2027-11-25", strike: 2.5, ...overrides,
});

test("pairs only a single matching call and put", () => {
  const rows = pairOptions([option("c", "call"), option("p", "put")]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].call.symbol, "c");
  assert.equal(rows[0].put.symbol, "p");
});

test("different contract months and unknown expiry never pair", () => {
  const rows = pairOptions([
    option("c", "call"), option("p", "put", { contract: "RBF28" }),
    option("x", "call", { expiration: null }), option("y", "put", { expiration: null }),
  ]);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => !row.call || !row.put));
});

test("ambiguous series stay separate instead of pairing arbitrarily", () => {
  const rows = pairOptions([option("c1", "call"), option("c2", "call"), option("p", "put")]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => !row.call || !row.put));
});
