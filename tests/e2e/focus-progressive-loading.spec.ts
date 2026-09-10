import { test, expect } from "@playwright/test";

test("Focus keeps analyst snapshot while refreshing and uses compact empty state", async ({ page }) => {
  const analysts = Object.fromEntries([
    "recommendation_key", "recommendation_mean", "analyst_count", "target_low", "target_mean",
    "target_median", "target_high", "current_price", "upside_to_mean_percent", "strong_buy", "buy", "hold", "sell", "strong_sell",
  ].map(key => [key, null]));
  const snapshot = { ticker: "RY.TO", symbol: "RY", name: "Royal Bank fixture", currency: "CAD",
    financial_currency: "CAD", sector: "Financials", industry: "Bank", status: "partial", message: null,
    metrics: {}, annual_financials: [], quarterly_financials: [], ttm: {}, highlights: {},
    earnings_history: [], earnings_estimates: [], analysts,
    events: { earnings_dates: [], ex_dividend_date: null, dividend_date: null },
    official_coverage: {}, source: "Deterministic test fixture", generated_at: new Date().toISOString(),
    refresh_in_progress: false, refresh_after_seconds: 1800 };
  let blocked = false;
  let release!: () => void;
  let consensus = false;
  let fail = false;
  await page.route("**/stocks/RY/fundamentals", async route => {
    if (fail) { await route.fulfill({ status: 503, body: "offline" }); return; }
    if (blocked) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { ...snapshot, analysts: consensus ? { ...analysts, target_mean: 42, analyst_count: 5 } : analysts } });
  });
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Analystes", exact: true }).click();
  await expect(page.getByText("Consensus analystes temporairement indisponible.", { exact: true })).toBeVisible();
  await expect(page.getByText("Répartition des recommandations", { exact: true })).toHaveCount(0);
  consensus = true;
  const refresh = page.getByRole("button", { name: "Actualiser", exact: true });
  await refresh.click();
  await expect(page.getByText("Répartition des recommandations", { exact: true })).toBeVisible();
  blocked = true;
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(page.getByText("Royal Bank fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("Répartition des recommandations", { exact: true })).toBeVisible();
  await expect(page.getByText("Chargement des données fondamentales…", { exact: true })).toHaveCount(0);
  await expect.poll(() => Boolean(release)).toBe(true);
  release();
  await expect(refresh).toBeEnabled();
  blocked = false;
  fail = true;
  await refresh.click();
  await expect(page.getByRole("status").filter({ hasText: "Dernières données disponibles" })).toBeVisible();
  await expect(page.getByText("Répartition des recommandations", { exact: true })).toBeVisible();
});
