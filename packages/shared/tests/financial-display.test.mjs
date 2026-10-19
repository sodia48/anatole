import assert from "node:assert/strict";
import test from "node:test";
import { analystRecommendation, comparableDelta, exactFinancialNumber, formatFinancialNumber, signedBar } from "../src/financial-display.ts";

test("financial display keeps scale, sign and exact access in both languages", () => {
  assert.equal(formatFinancialNumber(2_871_409_200, { language: "fr", unit: "money", currency: "CAD" }), "2,87 G CAD");
  assert.equal(formatFinancialNumber(36_722_400, { language: "en", unit: "money", currency: "CAD" }), "36.72 M CAD");
  assert.equal(formatFinancialNumber(-10, { language: "fr", unit: "money", currency: "CAD" }), "-10 CAD");
  assert.equal(formatFinancialNumber(0, { language: "fr" }), "0");
  assert.equal(formatFinancialNumber(0.001, { language: "fr" }), "<0,01");
  assert.equal(formatFinancialNumber(null, { language: "en" }), "N/A");
  assert.equal(exactFinancialNumber(235.21309, "fr"), "235,21309");
  assert.equal(analystRecommendation("strong_buy", "fr"), "Achat fort");
  assert.equal(analystRecommendation("hold", "en"), "Hold");
  assert.equal(comparableDelta(10, 8, "fr", "percent"), "2 % · 25 %");
  assert.deepEqual(signedBar(-5, 10), { left: "25%", width: "25%" });
  assert.deepEqual(signedBar(5, 10), { left: "50%", width: "25%" });
});
