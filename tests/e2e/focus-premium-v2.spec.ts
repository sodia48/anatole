import { expect, test } from "@playwright/test";

const annual = [
  { period_end: "2025-12-31", period_type: "annual", currency: "CAD", total_revenue: 120, ebitda: 35, net_income: -4, free_cash_flow: 0, diluted_eps: -0.5, gross_margin: 25, source: { source_name: "Issuer annual 2025", filed_at: "2026-02-10" } },
  { period_end: "2024-12-31", period_type: "annual", currency: "CAD", total_revenue: 100, ebitda: 30, net_income: 5, free_cash_flow: 8, diluted_eps: 0.6, gross_margin: null, source: { source_name: "Issuer annual 2024", filed_at: "2025-02-10" } },
];
const quarterly = [
  { period_end: "2026-06-30", period_type: "quarterly", currency: "CAD", total_revenue: 33, net_income: 2, free_cash_flow: -1, source: { source_name: "Issuer quarter Q2", filed_at: "2026-08-01" } },
  { period_end: "2026-03-31", period_type: "quarterly", currency: "CAD", total_revenue: 31, net_income: null, free_cash_flow: 0, source: { source_name: "Issuer quarter Q1", filed_at: "2026-05-01" } },
];
const snapshot = {
  ticker: "RY.TO", symbol: "RY", name: "Royal Bank fixture", exchange: "TSX", currency: "CAD", financial_currency: "CAD",
  website: null, sector: "Financials", industry: "Bank", status: "partial", message: "Partial data", stale: true,
  refresh_in_progress: false, metrics: { total_revenue: 120, ebitda: 35, net_income_to_common: -4, total_cash: 12, total_debt: 8 },
  annual_financials: annual, quarterly_financials: quarterly,
  ttm: { total_revenue: 120, ebitda: 35, net_income: -4, free_cash_flow: 0, net_debt: -4, currency: "CAD" },
  highlights: { revenue_growth_yoy: 2, eps_growth_yoy: -3 },
  earnings_estimates: [
    { period: "0q", end_date: "2026-09-30", eps_average: 1.2, eps_low: 1, eps_high: 1.4, eps_growth: 2, revenue_average: 40, revenue_low: 38, revenue_high: 42 },
    { period: "+1q", end_date: "2026-12-31", eps_average: 1.3, eps_low: 1.1, eps_high: 1.5, eps_growth: 3, revenue_average: 44, revenue_low: 42, revenue_high: 46 },
  ],
  earnings_history: [
    { period: "2026-Q1", actual: -0.5, estimate: 0.1, surprise_percent: -600 },
    { period: "2026-Q2", actual: 0, estimate: 0.2, surprise_percent: -100 },
  ],
  analysts: { analyst_count: 10, recommendation_key: "hold", recommendation_mean: 2.5, current_price: 100,
    target_low: 80, target_median: 105, target_mean: 110, target_high: 130, upside_to_mean_percent: 10,
    strong_buy: 1, buy: 2, hold: 5, sell: 2, strong_sell: 0 },
  events: { earnings_dates: ["2026-11-01"], ex_dividend_date: "2026-10-20", dividend_date: "2026-11-20" },
  official_coverage: { status: "mixed", official_periods: 2, official_fields: 10 },
  source: "Verified fixture source", generated_at: "2026-10-12T12:00:00Z", refresh_after_seconds: 1800,
};

async function openFundamentals(page: import("@playwright/test").Page, language: "fr" | "en" = "fr") {
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: language === "fr" ? "Fondamentaux" : "Fundamentals", exact: true }).click();
  await page.getByRole("navigation", { name: language === "fr" ? "Vues fondamentales" : "Fundamental views" })
    .getByRole("button", { name: language === "fr" ? "Explorer" : "Explore" }).click();
  await page.getByRole("combobox", { name: language === "fr" ? "Contenu à explorer" : "Explore content" }).selectOption("fundamentals");
}

test("V2 modes preserve exact annual and quarterly evidence without refetch", async ({ page }) => {
  let requests = 0;
  await page.route("**/stocks/RY/fundamentals", route => { requests++; return route.fulfill({ json: snapshot }); });
  await openFundamentals(page);
  await page.getByRole("group", { name: "Mode de la synthèse" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(page.getByRole("heading", { name: "Croissance et rentabilité publiées" })).toBeVisible();
  await page.getByText("Données exactes du graphique").first().click();
  await expect(page.getByRole("row", { name: /2025-12-31/ }).first()).toContainText("Issuer annual 2025");
  const before = requests;
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Explorer" }).click();
  await page.getByRole("combobox", { name: "Contenu à explorer" }).selectOption("financials");
  await page.getByRole("navigation", { name: "Vues des résultats financiers" }).getByRole("button", { name: "Annuel" }).click();
  await page.getByRole("group", { name: "Mode d’affichage des états financiers" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(page.getByTestId("financials-chart-view")).toBeVisible();
  await page.getByTestId("financials-chart-view").getByRole("button", { name: "Autres montants" }).click();
  await expect(page.getByTestId("financials-chart-view").getByLabel(/Bénéfice net, 2025-12-31/)).toHaveCount(1);
  const chartPoint = page.getByTestId("financials-chart-view").locator('circle[tabindex="0"]').first();
  await chartPoint.focus();
  await expect(chartPoint).toBeFocused();
  await page.getByRole("group", { name: "Mode d’affichage des états financiers" }).getByRole("button", { name: "Vue tableau" }).click();
  await expect(page.locator('table[data-view="income"]')).toContainText("2025");
  await page.getByRole("navigation", { name: "Vues des résultats financiers" }).getByRole("button", { name: "Trimestriel" }).click();
  await expect(page.locator('table[data-view="income"]')).toContainText("2026");
  expect(requests).toBe(before);
});

test("financial charts identify fiscal quarters, retain exact closes and keep annual years", async ({ page }, testInfo) => {
  const fiscalAnnual = [2024, 2025].map(year => ({ ...annual[0], period_end: `${year}-01-31`,
    source: { ...annual[0].source, confidence: "official" } }));
  const fiscalQuarters = ["2023-04-30", "2023-07-31", "2023-10-31", "2024-01-31"].map((period_end, index) => ({
    ...quarterly[0], period_end, total_revenue: 31 + index, source: { source_name: `Issuer ${period_end}`, filed_at: "2024-03-01" },
  }));
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: {
    ...snapshot, annual_financials: fiscalAnnual, quarterly_financials: fiscalQuarters,
  } }));
  await openFundamentals(page);
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Explorer" }).click();
  await page.getByRole("combobox", { name: "Contenu à explorer" }).selectOption("financials");
  await page.getByRole("navigation", { name: "Vues des résultats financiers" }).getByRole("button", { name: "Trimestriel" }).click();
  await page.getByRole("group", { name: "Mode d’affichage des états financiers" }).getByRole("button", { name: "Vue graphiques" }).click();
  const chart = page.getByTestId("financials-chart-view").locator("section[aria-label]").first();
  const axisLabels = await chart.locator('svg text[y="207"]').allTextContents();
  expect(axisLabels[0]).toBe("Q1 2024");
  expect(axisLabels.at(-1)).toBe("Q4 2024");
  expect(axisLabels.every(label => /^Q[1-4] 2024$/.test(label))).toBe(true);
  await chart.screenshot({ path: testInfo.outputPath("quarterly-after.png") });
  await chart.getByText("Données exactes du graphique").click();
  for (const label of ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"])
    await expect(chart.getByRole("row", { name: new RegExp(label) })).toBeVisible();
  const point = chart.getByRole("button", { name: /Revenus, Q1 2024, 2023-04-30/ });
  await point.click();
  await expect(chart.getByRole("status")).toContainText("2023-04-30");
  await expect(chart.getByRole("status")).toContainText("Issuer 2023-04-30");
  await chart.screenshot({ path: testInfo.outputPath("quarterly-detail-after.png") });
  await page.getByRole("navigation", { name: "Vues des résultats financiers" }).getByRole("button", { name: "Annuel" }).click();
  const annualChart = page.getByTestId("financials-chart-view").locator("section[aria-label]").first();
  await expect(annualChart.locator('svg text[y="207"]')).toContainText(["2024", "2025"]);
  await annualChart.screenshot({ path: testInfo.outputPath("annual-after.png") });
});

test("V2 earnings, estimates and analysts remain usable on mobile", async ({ page }) => {
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  await page.route("**/stocks/RY/fundamental-intelligence/capital", route => route.fulfill({ json: {
    ticker: "RY.TO", status: "partial", financial_currency: "CAD", stale: false, periods: [],
    analysts: { status: "partial", as_of: "2026-10-12T00:00:00Z", source_name: "Verified analyst fixture",
      source_confidence: "secondary_snapshot", recommendation_key: "hold", distribution: { strong_buy: 1, buy: 2, hold: 5, sell: 2, strong_sell: 0 },
      target_low: 80, target_mean: 110, target_median: 105, target_high: 130, target_currency: null, estimates: [],
      actual_vs_consensus: [], revision_history_status: "unavailable", revision_history_reason_fr: "Révisions non vérifiables.",
      revision_history_reason_en: "Revisions unverified." }, limitations_fr: [], limitations_en: [],
  } }));
  await openFundamentals(page);
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Explorer" }).click();
  await page.getByRole("combobox", { name: "Contenu à explorer" }).selectOption("financials");
  await page.getByRole("navigation", { name: "Vues des résultats financiers" }).getByRole("button", { name: "Estimations" }).click();
  await page.getByRole("button", { name: "Vue graphiques" }).click();
  await expect(page.getByText("Prévisions / consensus").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Vues des résultats financiers" }).getByRole("button", { name: "BPA & calendrier" }).click();
  await page.getByRole("button", { name: "Vue graphiques" }).click();
  const earningsChart = page.getByTestId("earnings-chart-view");
  await expect(earningsChart).toBeVisible();
  await earningsChart.getByText("Données exactes du graphique").first().click();
  await expect(earningsChart.getByRole("row", { name: /2026-Q1/ }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Explorer" }).click();
  await page.getByRole("combobox", { name: "Contenu à explorer" }).selectOption("capital");
  await expect(page.getByRole("heading", { name: "Consensus analystes actuel" })).toBeVisible();
  await expect(page.getByText("Conserver", { exact: true })).toBeVisible();
  await expect(page.getByText(/Achat fort · 1/)).toBeVisible();
  await expect(page.getByText("devise non vérifiée")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("English chart labels, source and saved mode survive navigation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
    theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y", defaultUniverse: "tsx60", language: "en",
  })));
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  await openFundamentals(page, "en");
  await page.getByRole("group", { name: "Summary display mode" }).getByRole("button", { name: "Chart view" }).click();
  await expect(page.getByRole("heading", { name: "Published growth and profitability" })).toBeVisible();
  await expect(page.getByText("Verified fixture source").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Explore content" }).selectOption("financials");
  await page.getByRole("combobox", { name: "Explore content" }).selectOption("fundamentals");
  await expect(page.getByRole("group", { name: "Summary display mode" }).getByRole("button", { name: "Chart view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
});
