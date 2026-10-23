import { expect, test, type Page } from "@playwright/test";

const ttm = {
  period_end: "2026-09-30", currency: "CAD", total_revenue: 12_000_000_000,
  gross_profit: null, operating_income: null, ebitda: null, net_income: 1_200_000_000,
  diluted_eps: null, operating_cash_flow: null, capital_expenditure: null,
  free_cash_flow: 900_000_000, dividends_paid: null, share_repurchases: null,
  total_cash: null, total_debt: null, net_debt: null, gross_margin: null,
  operating_margin: null, net_margin: null, free_cash_flow_margin: null,
};
const highlights = {
  latest_period_end: "2026-09-30", revenue_growth_yoy: 5.2,
  operating_income_growth_yoy: null, net_income_growth_yoy: null,
  eps_growth_yoy: null, free_cash_flow_growth_yoy: null,
  three_year_revenue_cagr: null, three_year_net_income_cagr: null,
  three_year_free_cash_flow_cagr: null, cash_conversion_percent: null,
  net_debt_to_ebitda: null,
};
const snapshot = {
  ticker: "RY.TO", symbol: "RY", name: "Partial issuer fixture", exchange: "TSX",
  currency: "CAD", financial_currency: "CAD", website: null,
  sector: "Industrials", industry: "Industrial Services", status: "partial", message: null,
  stale: false, refresh_in_progress: false, metrics: {}, annual_financials: [], quarterly_financials: [],
  ttm, highlights, earnings_history: [], earnings_estimates: [], analysts: {},
  events: { earnings_dates: [], ex_dividend_date: null, dividend_date: null },
  official_coverage: { status: "mixed", yahoo_statements_error: null },
  source: "Verified fixture source", generated_at: "2026-10-20T12:00:00Z", refresh_after_seconds: 1800,
};

async function openDashboard(page: Page) {
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" })
    .getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" })
    .getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord financier" })).toBeVisible();
}

test("partial dashboard selects verified metrics and explains missing values", async ({ page }, testInfo) => {
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  await openDashboard(page);
  const dashboard = page.locator(".ff-modeStack").first();
  if (process.env.DASHBOARD_CAPTURE === "after")
    await expect(dashboard.getByText("Voir les données indisponibles")).toBeVisible();
  if (process.env.DASHBOARD_CAPTURE) await page.screenshot({ path: testInfo.outputPath(`dashboard-${process.env.DASHBOARD_CAPTURE}.png`), fullPage: true });
  if (process.env.DASHBOARD_CAPTURE === "before") return;
  await expect(dashboard.locator(".ff-dashboardMetrics").first().locator(".ff-metric")).toHaveCount(3);
  await expect(dashboard.getByText("Revenus TTM")).toBeVisible();
  await expect(dashboard.getByText("Bénéfice net TTM")).toBeVisible();
  await expect(dashboard.getByText("Flux disponible TTM")).toBeVisible();
  await expect(dashboard.locator(".ff-group")).toHaveCount(1);
  await dashboard.getByText("Voir les données indisponibles").click();
  await expect(dashboard.getByText("Historique insuffisant").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("bank dashboard prioritizes relevant figures while retaining other reported metrics", async ({ page }) => {
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: {
    ...snapshot, sector: "Financials", industry: "Bank", ttm: {
      ...ttm, diluted_eps: 12.5, operating_cash_flow: 2_000_000_000,
      net_margin: 10, ebitda: 1_500_000_000,
    },
  } }));
  await openDashboard(page);
  const dashboard = page.locator(".ff-modeStack").first();
  await expect(dashboard.locator(".ff-dashboardMetrics").first().locator(".ff-metric")).toHaveCount(6);
  await expect(dashboard.locator(".ff-dashboardMetrics").first()).not.toContainText("BAIIA TTM");
  await dashboard.getByText("Autres indicateurs disponibles").click();
  await expect(dashboard.getByText("BAIIA TTM")).toBeVisible();
});

test("unavailable source is explicit and never fabricates a financial value", async ({ page }) => {
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: {
    ...snapshot, status: "unavailable", ttm: Object.fromEntries(Object.keys(ttm).map(key => [key, null])),
    highlights: Object.fromEntries(Object.keys(highlights).map(key => [key, null])),
    official_coverage: { status: "unavailable", yahoo_statements_error: "upstream timeout" },
  } }));
  await openDashboard(page);
  const dashboard = page.locator(".ff-modeStack").first();
  await expect(dashboard.getByText("Aucune métrique TTM vérifiée")).toBeVisible();
  await dashboard.getByText("Voir les données indisponibles").click();
  await expect(dashboard.getByText("Source indisponible").first()).toBeVisible();
  await expect(dashboard.getByText("upstream timeout")).toHaveCount(0);
});

test("core verified figures remain readable if the optional dashboard layout fails", async ({ page }) => {
  await page.route("**/focus-dashboard-layout.mjs", route => route.abort());
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  await openDashboard(page);
  const dashboard = page.locator(".ff-modeStack").first();
  await expect(dashboard.locator(".ff-dashboardMetrics").first().locator(".ff-metric")).toHaveCount(3);
  await expect(dashboard.getByText("Revenus TTM")).toBeVisible();
  await expect(dashboard.getByText("Bénéfice net TTM")).toBeVisible();
  await expect(dashboard.getByText("Flux disponible TTM")).toBeVisible();
});
