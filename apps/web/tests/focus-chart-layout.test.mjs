import { test } from "node:test";
import assert from "node:assert/strict";
import * as shared from "../../../packages/shared/src/focus-chart.ts";
import * as browser from "../public/focus-chart-layout.mjs";

test("browser chart calculations preserve the shared financial rules", () => {
  const periods = ["2012-03-31", "2013-03-31", "2014-03-31", "2025-03-31", "2026-03-31"];
  for (const range of ["1y", "3y", "5y", "10y", "all"]) {
    assert.deepEqual(browser.indexes(periods, range), shared.focusChartIndexes(periods, range));
  }
  assert.equal(browser.periodDate("2026-02-30"), shared.focusPeriodDate("2026-02-30"));
  assert.equal(browser.periodDate("2025-Q3"), shared.focusPeriodDate("2025-Q3"));
  const series = [{ id: "eps", values: [2, -1, 0, null, 3] }];
  const selected = browser.indexes(periods, "all");
  assert.equal(browser.base100Reference(series, selected), shared.focusBase100Reference(series, selected));
  assert.equal(browser.chartValue(120, 100), shared.focusChartValue(120, 100));
  assert.deepEqual(browser.chartChange(series[0].values, selected, 4), shared.focusChartChange(series[0].values, selected, 4));
  const layout = browser.createLayout(periods, selected, [2, -1, 0, 3], "line", 320, "fr");
  assert.deepEqual(layout.gaps, [3]);
  assert.deepEqual(layout.ticks, [0, 4]);
  assert.equal(layout.label(periods[0]), "2012");
  assert.ok(layout.x(4) <= 320);
});
