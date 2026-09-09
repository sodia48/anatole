import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const theme of ["blue", "dark"] as const) {
  test(`IPO source status badges remain readable (${theme})`, async ({ page }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
        theme, language: "fr", density: "comfortable", decimals: 2,
        defaultRange: "1y", defaultUniverse: "tsx60",
      }));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, theme);
    await page.route("**/api/anatole/api/v1/discovery/ipo**", (route) => route.fulfill({ json: {
      items: [], summary: { total: 0, canada: 0, united_states: 0, companies: 0,
        newly_listed: 0, regulatory_filings: 0 },
      sources: ["available", "partial", "unavailable"].map((status) => ({
        source: `Test source ${status}`, status, count: 0, detail: null,
        url: "https://www.tsx.com/en/news/new-company-listings",
      })), generated_at: new Date().toISOString(), refresh_after_seconds: 300, message: null,
    } }));
    await page.goto("/ipo-insiders");
    await expect(page.getByText("DISPONIBLE", { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(results.violations).toEqual([]);
  });
}

// A populated table is essential: a loading screen cannot detect the pale
// company names that made the Screener unreadable in the former Sky theme.
for (const theme of ["blue", "dark"] as const) {
  test(`Screener populated table has readable contrast (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
        theme, language: "fr", density: "comfortable", decimals: 2,
        defaultRange: "1y", defaultUniverse: "tsx60",
      }));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, theme);
    await page.route("**/api/anatole/api/v1/discovery/screener**", (route) => route.fulfill({ json: {
      universe: "S&P/TSX Composite", sectors: ["Financials", "Energy"],
      live_items: 2, fallback_items: 0, generated_at: new Date().toISOString(),
      items: [
        { ticker: "RY.TO", symbol: "RY", name: "Royal Bank of Canada", sector: "Financials",
          price: 150, change_percent: 1.2, momentum_20d: 3.4, rsi_14: 55,
          relative_volume: 1.3, volume: 2500000, score: 72, signal: "Constructif" },
        { ticker: "CNQ.TO", symbol: "CNQ", name: "Canadian Natural Resources", sector: "Energy",
          price: 45, change_percent: -0.8, momentum_20d: null, rsi_14: null,
          relative_volume: null, volume: 1800000, score: null, signal: null },
      ],
    } }));
    await page.goto("/screener");
    await expect(page.locator(".screener-row")).toHaveCount(2);
    await expect(page.getByText("Royal Bank of Canada", { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    if (theme === "blue") {
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
      // Resolve the painted panel, including gradients, not just its text token.
      const background = await page.locator(".screener-table-wrap").evaluate(el => getComputedStyle(el).backgroundImage);
      expect(background).not.toContain("rgb(14, 36, 52)");
      expect(background).toContain("rgb(255, 255, 255)");
    }
    const results = await new AxeBuilder({ page }).include(".discovery-page").withRules(["color-contrast"]).analyze();
    expect(results.violations).toEqual([]);
    await page.getByPlaceholder("Ticker ou entreprise").fill("Canadian");
    await expect(page.locator(".screener-row")).toHaveCount(1);
    await expect(page.locator(".screener-row")).toHaveAttribute("href", "/focus/CNQ");
    await expect(page.locator(".score-pill")).toHaveText("N/D");
    await page.getByPlaceholder("Ticker ou entreprise").fill("");
    await page.screenshot({ path: testInfo.outputPath(`screener-${theme}.png`), fullPage: true });
  });
}
