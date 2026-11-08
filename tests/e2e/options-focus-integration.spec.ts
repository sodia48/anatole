import { expect, test } from "@playwright/test";

test("opens the selected Focus symbol in Options without loading RY first", async ({ page }, testInfo) => {
  const requested: string[] = [];
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [], source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => {
    const symbol = new URL(route.request().url()).searchParams.get("symbol") ?? "";
    requested.push(symbol);
    return route.fulfill({ json: {
      market: "tsx", symbol, provider_symbol: symbol, name: `Synthetic ${symbol}`, category: "Banks", exchange: "TEST",
      underlying_price: null, requested_expiration: null, expirations: [], contracts: [], analytics: null,
      source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600, stale: false,
    } });
  });
  await page.goto("/focus/TD", { waitUntil: "domcontentloaded" });
  const link = page.getByRole("link", { name: "Voir les options canadiennes" });
  await expect(link).toHaveAttribute("href", "/options?symbol=TD");
  await link.click();
  await expect(page.getByRole("heading", { name: "TD · Synthetic TD" })).toBeVisible();
  expect(requested.length).toBeGreaterThan(0);
  expect(requested.every((symbol) => symbol === "TD")).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("focus-options-synthetic.png"), fullPage: true });
  await page.evaluate(() => window.history.pushState(null, "", "/options?symbol=RY"));
  await expect(page.getByRole("heading", { name: "RY · Synthetic RY" })).toBeVisible();
  requested.length = 0;
  await page.goto("/options?symbol=%24BAD");
  await expect(page.getByRole("alert").filter({ hasText: "Symbole invalide" })).toBeVisible();
  expect(requested).toEqual([]);
});
