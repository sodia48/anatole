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

test("quarter labels respect verified fiscal closes and do not invent a fiscal quarter", () => {
  for (const [yearEnd, close, expected] of [
    [12, "2023-03-31", "Q1 2023"], [1, "2023-04-30", "Q1 2024"],
    [4, "2023-07-31", "Q1 2024"], [10, "2023-01-31", "Q1 2023"],
  ]) {
    const annual = [{ period_end: `2023-${String(yearEnd).padStart(2, "0")}-28`, source: { confidence: "official" } }];
    const fiscalMonth = shared.focusFiscalYearEndMonth(annual);
    assert.equal(fiscalMonth, yearEnd);
    assert.equal(shared.focusPeriodLabel(close, "quarterly", fiscalMonth), expected);
  }
  assert.equal(shared.focusPeriodLabel("2023-07-31", "quarterly"), "Q3 2023 (cal.)");
  assert.equal(shared.focusPeriodLabel("2023-07-31", "annual"), "2023");
  assert.equal(shared.focusFiscalYearEndMonth([{ period_end: "2023-12-31", source: { confidence: "secondary" } }]), null);
  assert.equal(shared.focusFiscalYearEndMonth([
    { period_end: "2022-12-31", source: { confidence: "official" } },
    { period_end: "2023-01-31", source: { confidence: "official" } },
  ]), null);
  const periods = ["2023-03-31", "2023-06-30", "2023-09-30", "2023-12-31", "2024-03-31"];
  const labels = periods.map(period => shared.focusPeriodLabel(period, "quarterly", 12));
  const layout = browser.createLayout(periods, browser.indexes(periods, "all"), [1, 2, 3, 4, 5], "line", 640, "fr", labels);
  assert.deepEqual(labels, ["Q1 2023", "Q2 2023", "Q3 2023", "Q4 2023", "Q1 2024"]);
  assert.ok(layout.ticks.length <= 5);
});
