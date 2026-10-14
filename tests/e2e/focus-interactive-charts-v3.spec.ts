import { expect, test } from "@playwright/test";

const years = [2015, 2018, 2020, 2022, 2024, 2025];
const annual = years.map((year, index) => ({
  period_end: `${year}-12-31`, period_type: "annual", currency: "CAD",
  total_revenue: [40, 50, 70, 80, 100, 120][index],
  ebitda: [10, 12, 16, 18, 20, 24][index],
  operating_income: [7, 9, 12, null, 17, 20][index],
  net_income: [4, 5, 7, -2, 9, 10][index],
  free_cash_flow: [3, 4, 0, 6, 8, 9][index],
  gross_margin: [20, 21, 22, 23, 24, 25][index],
  source: { source_name: `Issuer ${year}`, filed_at: `${year + 1}-02-10` },
}));
const snapshot = {
  ticker: "RY.TO", symbol: "RY", name: "Royal Bank fixture", exchange: "TSX", currency: "CAD",
  financial_currency: "CAD", sector: "Financials", industry: "Bank", status: "partial", message: null,
  metrics: { trailing_pe: 12, forward_pe: 11, price_to_book: 2, price_to_sales: 3,
    enterprise_to_revenue: 4, enterprise_to_ebitda: 8 },
  annual_financials: annual, quarterly_financials: [], ttm: {}, highlights: {},
  earnings_history: [{ period: "2025-Q3", actual: 1.2, estimate: 1.1, surprise_percent: 9.09 }],
  earnings_estimates: [{ period: "+1q", end_date: "2026-03-31", eps_average: 1.3, eps_low: 1.1,
    eps_high: 1.5, revenue_average: 130, revenue_low: 120, revenue_high: 140 }],
  analysts: { analyst_count: 10, recommendation_key: "hold", recommendation_mean: 2.5, current_price: 100,
    target_low: 80, target_median: 105, target_mean: 110, target_high: 130, upside_to_mean_percent: 10,
    strong_buy: 1, buy: 2, hold: 5, sell: 2, strong_sell: 0 },
  events: { earnings_dates: [], ex_dividend_date: null, dividend_date: null }, official_coverage: {},
  source: "Verified fixture", generated_at: "2026-01-01T12:00:00Z", refresh_after_seconds: 1800,
};

async function openSummary(page: import("@playwright/test").Page) {
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("group", { name: "Mode de la synthèse" }).getByRole("button", { name: "Vue graphiques" }).click();
  return page.locator('section[aria-label="Croissance et rentabilité publiées"]');
}

test("V3 compares metrics with real date windows, safe chart shapes and Base 100 without refetch", async ({ page }) => {
  let requests = 0;
  await page.route("**/stocks/RY/fundamentals", route => { requests++; return route.fulfill({ json: snapshot }); });
  const chart = await openSummary(page);
  await expect(chart.getByText("Type de graphique")).toBeVisible();
  const before = requests;
  await chart.getByLabel("Type de graphique").selectOption("area");
  await chart.getByLabel("Période").selectOption("1y");
  await chart.getByText("Données exactes du graphique").click();
  await expect(chart.locator("tbody tr")).toHaveCount(2);
  await chart.getByLabel("Période").selectOption("3y");
  await expect(chart.locator("tbody tr")).toHaveCount(3);
  await chart.getByLabel("Période").selectOption("5y");
  await expect(chart.locator("tbody tr")).toHaveCount(4);
  await chart.getByLabel("Période").selectOption("10y");
  await expect(chart.locator("tbody tr")).toHaveCount(6);
  const metrics = chart.getByRole("group", { name: "Indicateurs et séries affichées" });
  await expect(metrics.getByRole("button", { name: "Revenus" })).toHaveAttribute("aria-pressed", "true");
  await expect(chart.getByRole("button", { name: "Base 100" })).toBeDisabled();
  await metrics.getByRole("button", { name: "Bénéfice net" }).click();
  await metrics.getByRole("button", { name: "Flux disponible" }).click();
  await expect(chart.getByRole("button", { name: "Base 100" })).toBeEnabled();
  await chart.getByRole("button", { name: "Base 100" }).click();
  await expect(chart.getByText(/Base 100 au 2015-12-31/)).toBeVisible();
  await expect(chart.locator("tbody tr").last()).toContainText("Issuer 2025");
  expect(requests).toBe(before);
});

test("V3 desktop tooltip shows exact date, real value, source and locks until Escape", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop hover and keyboard journey");
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  const chart = await openSummary(page);
  const point = chart.locator('circle[aria-label^="Revenus, 2025-12-31"]');
  await point.hover();
  await expect(chart.getByRole("status")).toContainText("2025-12-31");
  await expect(chart.getByRole("status")).toContainText("Issuer 2025");
  await point.click();
  await page.mouse.move(0, 0);
  await expect(chart.getByRole("status")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chart.getByRole("status")).toHaveCount(0);
  await point.focus();
  await point.press("Enter");
  await expect(chart.getByRole("status")).toBeVisible();
  await page.mouse.click(0, 0);
  await expect(chart.getByRole("status")).toHaveCount(0);
});

test("V3 touch reveals details without horizontal page overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch journey");
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  const chart = await openSummary(page);
  await chart.locator('circle[aria-label^="Revenus, 2025-12-31"]').tap();
  await expect(chart.getByRole("status")).toContainText("2025-12-31");
  await expect(chart.getByRole("status")).toContainText("Issuer 2025");
  await chart.getByRole("button", { name: "Fermer les détails" }).click();
  await expect(chart.getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("V3 analyst pie and donut are reserved for complete positive compositions", async ({ page }) => {
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  await openSummary(page);
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Analystes" }).click();
  await page.getByRole("group", { name: "Mode du consensus analystes" }).getByRole("button", { name: "Vue graphiques" }).click();
  const chartType = page.getByRole("group", { name: "Type de graphique" });
  await chartType.getByRole("button", { name: "Secteurs" }).click();
  await expect(page.locator('[data-kind="pie"]')).toBeVisible();
  await chartType.getByRole("button", { name: "Anneau" }).click();
  await expect(page.locator('[data-kind="donut"]')).toBeVisible();
  await page.getByRole("button", { name: "Achat fort: 1" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Achat fort: 1" })).toContainText("10.0 %");
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Synthèse" }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Analystes" }).click();
  await expect(page.locator('[data-kind="donut"]')).toBeVisible();
});

test("V3 refuses to put two published currencies on one axis while retaining exact rows", async ({ page }) => {
  const mixed = { ...snapshot, annual_financials: annual.map((row, index) => index === 0 ? { ...row, currency: "USD" } : row) };
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: mixed }));
  const chart = await openSummary(page);
  await expect(chart.getByRole("status")).toContainText("plusieurs devises");
  await chart.getByText("Données exactes du graphique").click();
  await expect(chart.locator("tbody tr")).toHaveCount(6);
  await expect(chart.locator("tbody tr").first()).toContainText("US");
});

test("V3 keeps chart preferences and English labels after navigation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
    theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y", defaultUniverse: "tsx60", language: "en",
  })));
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: snapshot }));
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fundamentals", exact: true }).click();
  await page.getByRole("group", { name: "Summary display mode" }).getByRole("button", { name: "Chart view" }).click();
  let chart = page.locator('section[aria-label="Published growth and profitability"]');
  await chart.getByLabel("Chart type").selectOption("points");
  await chart.getByLabel("Period").selectOption("3y");
  await chart.getByRole("group", { name: "Metrics and visible series" }).getByRole("button", { name: "Net income" }).click();
  await page.getByRole("navigation", { name: "Fundamental views" }).getByRole("button", { name: "Financials" }).click();
  await page.getByRole("navigation", { name: "Fundamental views" }).getByRole("button", { name: "Overview" }).click();
  chart = page.locator('section[aria-label="Published growth and profitability"]');
  await expect(chart.getByLabel("Chart type")).toHaveValue("points");
  await expect(chart.getByLabel("Period")).toHaveValue("3y");
  await expect(chart.getByRole("group", { name: "Metrics and visible series" }).getByRole("button", { name: "Net income" })).toHaveAttribute("aria-pressed", "false");
});
