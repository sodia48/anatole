import { expect, test } from "@playwright/test";

const rows = [
  { period: "0q", end_date: "2026-09-30", eps_average: 2.5, eps_low: 2.2, eps_high: 2.8, eps_year_ago: 2.3, eps_growth: 8.7, eps_analyst_count: 9, revenue_average: 12_000_000_000, revenue_low: 11_000_000_000, revenue_high: 13_000_000_000, revenue_year_ago: 11_500_000_000, revenue_growth: 4.3, revenue_analyst_count: 8 },
  { period: "+1q", end_date: "2026-12-31", eps_average: 3.2, eps_low: 2.8, eps_high: 3.6, eps_year_ago: 3.5, eps_growth: -8.6, eps_analyst_count: 12, revenue_average: 14_000_000_000, revenue_low: 13_000_000_000, revenue_high: 15_000_000_000, revenue_year_ago: 13_000_000_000, revenue_growth: 7.7, revenue_analyst_count: 10 },
  { period: "0y", end_date: "2026-12-31", eps_average: 11, eps_low: 10, eps_high: 12, eps_year_ago: 10, eps_growth: 10, eps_analyst_count: 14, revenue_average: 55_000_000_000, revenue_low: 51_000_000_000, revenue_high: 59_000_000_000, revenue_year_ago: 50_000_000_000, revenue_growth: 10, revenue_analyst_count: 13 },
  { period: "+1y", end_date: "2027-12-31", eps_average: 12, eps_low: 11, eps_high: 13, eps_year_ago: 11, eps_growth: 0, eps_analyst_count: 15, revenue_average: 58_000_000_000, revenue_low: 55_000_000_000, revenue_high: 61_000_000_000, revenue_year_ago: 55_000_000_000, revenue_growth: 0, revenue_analyst_count: 14 },
];

const snapshot = {
  ticker: "RY.TO", symbol: "RY", name: "Royal Bank fixture", exchange: "TSX",
  currency: "CAD", financial_currency: "CAD", website: null, sector: "Financials", industry: "Bank",
  status: "available", message: null, stale: false, refresh_in_progress: false,
  metrics: {}, annual_financials: [], quarterly_financials: [], ttm: {}, highlights: {},
  earnings_history: [], earnings_estimates: rows, analysts: {}, events: { earnings_dates: [], ex_dividend_date: null, dividend_date: null },
  official_coverage: {}, source: "Verified fixture source", generated_at: "2026-10-12T12:00:00Z",
  refresh_after_seconds: 1800,
};

async function openEstimates(page: import("@playwright/test").Page, language: "fr" | "en" = "fr") {
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" })
    .getByRole("button", { name: language === "fr" ? "Fondamentaux" : "Fundamentals", exact: true }).click();
  await page.getByRole("navigation", { name: language === "fr" ? "Vues fondamentales" : "Fundamental views" })
    .getByRole("button", { name: language === "fr" ? "Résultats" : "Financials", exact: true }).click();
  await page.getByRole("navigation", { name: language === "fr" ? "Vues des résultats financiers" : "Financial results views" })
    .getByRole("button", { name: language === "fr" ? "Estimations" : "Estimates", exact: true }).click();
}

test("estimates table and cards keep exact data and saved selection without refetch", async ({ page }, testInfo) => {
  let requests = 0;
  await page.route("**/stocks/RY/fundamentals", route => {
    requests += 1;
    return route.fulfill({ json: snapshot });
  });
  await openEstimates(page);
  const table = page.getByTestId("estimates-table-view");
  const cards = page.getByTestId("estimates-card-view");
  if (testInfo.project.name === "desktop-chromium") await expect(table).toBeVisible();
  else await expect(cards).toBeVisible();
  const before = requests;
  await page.getByRole("button", { name: "Vue tableau" }).click();
  await expect(table.getByRole("row", { name: /\+1q/ })).toContainText("-8,6 %");
  await expect(table.getByRole("row", { name: /\+1q/ })).toContainText("3,20");
  await page.getByRole("button", { name: "Vue cartes" }).click();
  await expect(cards.locator('[data-period="+1q"]')).toContainText("3,20");
  await expect(cards.locator('[data-period="+1q"]')).toContainText("-8,6 %");
  await expect(cards.locator('[data-period="+1y"]')).toContainText("0 %");
  expect(requests).toBe(before);
  await openEstimates(page);
  await expect(cards).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lecture rapide" })).toBeVisible();
  await expect(page.getByText("Verified fixture source")).toBeVisible();
  await page.getByRole("button", { name: "Vue tableau" }).focus();
  await page.keyboard.press("Enter");
  await expect(table).toBeVisible();
  await page.getByRole("navigation", { name: "Vues des résultats financiers" })
    .getByRole("button", { name: "Vue d’ensemble" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord financier" })).toBeVisible();
});

test("partial English estimates preserve N/D and do not fabricate a range", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
    theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y", defaultUniverse: "tsx60", language: "en",
  })));
  const partial = { ...snapshot, status: "partial", earnings_estimates: rows.map(row =>
    row.period === "+1q" ? { ...row, eps_average: null, eps_low: null, eps_high: null, eps_growth: null, eps_analyst_count: null } : row) };
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: partial }));
  await openEstimates(page, "en");
  await page.getByRole("button", { name: "Card view" }).click();
  await expect(page.getByText("Partial or stale data", { exact: false })).toBeVisible();
  const quarter = page.getByTestId("estimates-card-view").locator('[data-period="+1q"]');
  await expect(quarter).toContainText("N/D");
  await expect(quarter.locator('[role="img"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Quick read" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
