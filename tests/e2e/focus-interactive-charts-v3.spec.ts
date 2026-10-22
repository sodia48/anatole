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
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Explorer" }).click();
  await page.getByRole("combobox", { name: "Contenu à explorer" }).selectOption("fundamentals");
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
  await chart.getByText("Comprendre le graphique").click();
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

test("V4 keeps one sourced analyst consensus in Explorer", async ({ page }) => {
  await page.route("**/stocks/RY/fundamental-intelligence/capital", route => route.fulfill({ json: {
    ticker: "RY.TO", status: "partial", financial_currency: "CAD", stale: false, periods: [],
    analysts: { status: "partial", as_of: "2026-02-10T00:00:00Z", source_name: "Verified consensus snapshot",
      source_confidence: "secondary_snapshot", recommendation_key: "hold", distribution: { strong_buy: 1, buy: 2, hold: 5, sell: 2, strong_sell: 0 },
      target_low: 80, target_mean: 110, target_median: 105, target_high: 130, target_currency: "CAD", estimates: [],
      actual_vs_consensus: [], revision_history_status: "unavailable", revision_history_reason_fr: "Révisions non vérifiables.",
      revision_history_reason_en: "Revisions unverified." }, limitations_fr: [], limitations_en: [],
  } }));
  await page.goto("/focus/RY?view=analysts");
  await expect(page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Explorer" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Contenu à explorer" })).toHaveValue("capital");
  const consensus = page.getByRole("region", { name: "Allocation du capital" });
  await expect(consensus.getByRole("heading", { name: "Consensus analystes actuel" })).toBeVisible();
  await expect(consensus.getByText("Verified consensus snapshot")).toBeVisible();
  await expect(consensus.getByText("Conserver", { exact: true })).toBeVisible();
  await expect(consensus.getByText(/Achat fort · 1/)).toContainText("10 %");
  await expect(consensus.getByText("Révisions non vérifiables.")).toBeVisible();
});

test("V3 refuses to put two published currencies on one axis while retaining exact rows", async ({ page }) => {
  const mixed = { ...snapshot, annual_financials: annual.map((row, index) => index === 0 ? { ...row, currency: "USD" } : row) };
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: mixed }));
  const chart = await openSummary(page);
  await chart.getByLabel("Période").selectOption("all");
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
  await page.getByRole("navigation", { name: "Fundamental views" }).getByRole("button", { name: "Explore" }).click();
  await page.getByRole("combobox", { name: "Explore content" }).selectOption("fundamentals");
  await page.getByRole("group", { name: "Summary display mode" }).getByRole("button", { name: "Chart view" }).click();
  let chart = page.locator('section[aria-label="Published growth and profitability"]');
  await chart.getByLabel("Chart type").selectOption("points");
  await chart.getByLabel("Period").selectOption("3y");
  await chart.getByRole("group", { name: "Metrics and visible series" }).getByRole("button", { name: "Net income" }).click();
  await page.getByRole("combobox", { name: "Explore content" }).selectOption("financials");
  await page.getByRole("combobox", { name: "Explore content" }).selectOption("fundamentals");
  chart = page.locator('section[aria-label="Published growth and profitability"]');
  await expect(chart.getByLabel("Chart type")).toHaveValue("points");
  await expect(chart.getByLabel("Period")).toHaveValue("3y");
  await expect(chart.getByRole("group", { name: "Metrics and visible series" }).getByRole("button", { name: "Net income" })).toHaveAttribute("aria-pressed", "false");
});

test("V6 makes a long annual gap explicit and keeps dates legible at the rendered width", async ({ page }, testInfo) => {
  const sparse = [2012, 2013, 2014, 2025, 2026].map((year, index) => ({
    ...annual[0], period_end: `${year}-03-31`, total_revenue: 100 + index * 20,
    ebitda: 20 + index * 3, net_income: 10 + index * 2,
    source: { source_name: `Filed ${year}`, filed_at: `${year}-06-30` },
  }));
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: { ...snapshot, annual_financials: sparse } }));
  const chart = await openSummary(page);
  await chart.getByLabel("Période").selectOption("all");
  if (process.env.CAPTURE_V6_STAGE === "before") {
    await chart.screenshot({ path: testInfo.outputPath("v6-before-chart.png") });
    return;
  }
  await chart.getByText("Comprendre le graphique").click();
  await expect(chart.getByText(/Axe par observations/)).toBeVisible();
  await expect(chart.locator('g[aria-label="Intervalle sans données"]')).toHaveCount(1);
  await expect(chart.locator('path[class*="line"]').first()).toBeVisible();
  const ticks = await chart.locator('svg text[y="207"]').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, text: node.textContent };
  }));
  expect(ticks[0]?.text).toBe("2012");
  expect(ticks.at(-1)?.text).toBe("2026");
  expect(ticks.every((tick, index) => index === 0 || ticks[index - 1].right + 4 < tick.left)).toBe(true);
  await chart.getByText("Données exactes du graphique").click();
  await expect(chart.locator("tbody tr")).toHaveCount(5);
  await expect(chart.locator("tbody tr").first()).toContainText("2012-03-31");
  if (process.env.CAPTURE_V6_STAGE === "after") await chart.screenshot({ path: testInfo.outputPath("v6-after-chart.png") });
});

test("V6 retains signed, zero and missing EPS without enabling invalid Base 100", async ({ page }) => {
  const eps = [1.2, -0.4, 0, null, 1.5];
  const rows = [2021, 2022, 2023, 2024, 2025].map((year, index) => ({
    ...annual[0], period_end: `${year}-12-31`, diluted_eps: eps[index],
    source: { source_name: `Issuer ${year}`, filed_at: `${year + 1}-02-10` },
  }));
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: { ...snapshot, annual_financials: rows } }));
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Explorer" }).click();
  await page.getByRole("combobox", { name: "Contenu à explorer" }).selectOption("financials");
  await page.getByRole("navigation", { name: "Vues des résultats financiers" }).getByRole("button", { name: "Annuel" }).click();
  await page.getByRole("group", { name: "Mode d’affichage des états financiers" }).getByRole("button", { name: "Vue graphiques" }).click();
  const chart = page.locator('section[aria-label="BPA dilué publié"]');
  await chart.getByLabel("Type de graphique").selectOption("bar");
  await expect(chart.getByRole("button", { name: "Base 100" })).toBeDisabled();
  await expect(chart.locator('svg rect')).toHaveCount(4);
  await chart.getByText("Données exactes du graphique").click();
  await expect(chart.locator("tbody tr").nth(2)).toContainText("0");
  await expect(chart.locator("tbody tr").nth(3)).toContainText("N/D");
});

test("V6 separates financial orders of magnitude into selectable axes", async ({ page }) => {
  const distant = annual.map(row => ({ ...row, total_revenue: 1_000_000_000_000,
    ebitda: 12_000_000_000, operating_income: 8_000_000_000, net_income: 3_000_000_000,
    free_cash_flow: 2_000_000_000 }));
  await page.route("**/stocks/RY/fundamentals", route => route.fulfill({ json: { ...snapshot, annual_financials: distant } }));
  const chart = await openSummary(page);
  const legend = chart.getByRole("group", { name: "Indicateurs et séries affichées" });
  await expect(legend.getByRole("button", { name: "Revenus" })).toHaveAttribute("aria-pressed", "true");
  await expect(legend.getByRole("button", { name: "BAIIA" })).toHaveAttribute("aria-pressed", "false");
  const majorAxis = await chart.locator("svg").textContent();
  await chart.getByRole("button", { name: "Autres montants" }).click();
  await expect(legend.getByRole("button", { name: "BAIIA" })).toHaveAttribute("aria-pressed", "true");
  expect(await chart.locator("svg").textContent()).not.toBe(majorAxis);
});
