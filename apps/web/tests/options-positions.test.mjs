import assert from "node:assert/strict";
import test from "node:test";
import { parseTrackedOptions, validTrackedOption } from "../components/options/options-positions.ts";

const position = { id: "fixture", symbol: "TEST", underlying: "RY", market: "tsx", contract: null, side: "call", strike: 100,
  expiration: "2027-11-25", expiry_at: "2027-11-25T16:00:00-05:00", direction: "long", quantity: 2, multiplier: 100,
  premium: 3, currency: "CAD", reminder_days: 7 };

test("accepts only identified options with explicit matching expiry and verified specifications", () => {
  assert.equal(validTrackedOption(position), true);
  for (const change of [{ expiry_at: "2027-11-25T16:00" }, { expiry_at: "2027-11-26T16:00:00-05:00" },
    { expiration: "2027-02-30", expiry_at: "2027-02-30T16:00:00-05:00" }, { multiplier: 0 },
    { premium: -1 }, { quantity: 1.5 }, { currency: "CA" }, { currency: "XYZ" }, { currency: "XXX" }, { market: "commodities", contract: null }]) {
    assert.equal(validTrackedOption({ ...position, ...change }), false);
  }
});

test("refuses corrupt, unknown or duplicate local data instead of replacing it", () => {
  assert.deepEqual(parseTrackedOptions(null), []);
  assert.deepEqual(parseTrackedOptions(JSON.stringify({ version: 1, positions: [position] })), [position]);
  for (const raw of ["{", JSON.stringify({ version: 2, positions: [] }), JSON.stringify({ version: 1, positions: [position, position] }),
    JSON.stringify({ version: 1, positions: [{ ...position, multiplier: 0 }] })]) {
    assert.equal(parseTrackedOptions(raw), null);
  }
});
