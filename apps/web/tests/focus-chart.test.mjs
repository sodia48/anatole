import { test } from "node:test";
import assert from "node:assert/strict";
import {
  focusBase100Reference, focusChartChange, focusChartIndexes, focusChartValue, focusPeriodDate,
} from "../../../packages/shared/src/focus-chart.ts";

test("actual dates, irregular quarters and real 1/3/5/10-year windows", () => {
  const periods = ["2026-09-30", "2015-12-31", "2025-01-31", "2022-12-31", "2019-12-31"];
  assert.deepEqual(focusChartIndexes(periods, "all"), [1, 4, 3, 2, 0]);
  assert.deepEqual(focusChartIndexes(periods, "1y"), [0]);
  assert.deepEqual(focusChartIndexes(periods, "3y"), [2, 0]);
  assert.deepEqual(focusChartIndexes(periods, "5y"), [3, 2, 0]);
  assert.deepEqual(focusChartIndexes(periods, "10y"), [4, 3, 2, 0]);
  assert.equal(focusPeriodDate("2025-Q3"), Date.UTC(2025, 8, 30));
  assert.equal(focusPeriodDate("+1q · 2026-12-31"), Date.UTC(2026, 11, 31));
  assert.equal(focusPeriodDate("2026-02-30"), null);
});

test("Base 100 uses a shared positive reference and refuses zero, negatives and sign changes", () => {
  const indexes = [0, 1, 2];
  assert.equal(focusBase100Reference([
    { id: "a", values: [null, 100, 120] }, { id: "b", values: [null, 20, 25] },
  ], indexes), 1);
  assert.equal(focusChartValue(120, 100), 120);
  assert.equal(focusChartValue(0, 100), 0);
  assert.equal(focusChartValue(12, 0), null);
  assert.equal(focusBase100Reference([{ id: "a", values: [0, 10, 12] }], indexes), null);
  assert.equal(focusBase100Reference([{ id: "a", values: [10, -2, 12] }], indexes), null);
  assert.equal(focusBase100Reference([{ id: "a", values: [10, null, 12] },
    { id: "b", values: [null, 20, 24] }], indexes), null);
});

test("change uses the previous available observation without inventing missing data", () => {
  assert.deepEqual(focusChartChange([100, null, 125], [0, 1, 2], 2), { delta: 25, percent: 25, previous: 0 });
  assert.deepEqual(focusChartChange([0, 5], [0, 1], 1), { delta: 5, percent: null, previous: 0 });
  assert.deepEqual(focusChartChange([-2, 10], [0, 1], 1), { delta: 12, percent: null, previous: 0 });
  assert.equal(focusChartChange([null, 5], [0, 1], 1), null);
});
