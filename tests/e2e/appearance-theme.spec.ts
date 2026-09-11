import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const preferences = (theme: "dark" | "blue", language: "fr" | "en" = "fr") => ({
  theme,
  density: "comfortable",
  decimals: 2,
  defaultRange: "1y",
  defaultUniverse: "tsx60",
  language,
});

test("restaure Anatole Blanc avant l'hydratation et applique une vraie palette claire", async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify(value)), preferences("blue"));
  await page.goto("/aujourdhui");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(await page.locator("html").evaluate((node) => node.style.colorScheme)).toBe("light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#FFFFFF");
});

test("affiche le chooser une fois, prévisualise Blanc et mémorise le choix blue", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("anatole.appearance-test-initialized") !== "1") {
      localStorage.removeItem("anatole.appearance-choice.v1");
      sessionStorage.setItem("anatole.appearance-test-initialized", "1");
    }
  });
  await page.goto("/aujourdhui");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Choisis ton Anatole" })).toBeVisible();
  await dialog.getByRole("radio", { name: "Anatole Blanc" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  await dialog.getByRole("button", { name: "Continuer avec ce thème" }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("anatole.preferences.v0.4") ?? "{}").theme)).toBe("blue");
  expect(await page.evaluate(() => localStorage.getItem("anatole.appearance-choice.v1"))).toBe("1");
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("permet de choisir Original et conserve le contrat dark", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("anatole.appearance-choice.v1");
    localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({ theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y", defaultUniverse: "tsx60", language: "fr" }));
  });
  await page.goto("/aujourdhui");
  await page.getByRole("radio", { name: "Anatole Original" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("anatole.preferences.v0.4") ?? "{}").theme)).toBe("dark");
});

test("n'affiche jamais le chooser dans Focus embarqué", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("anatole.appearance-choice.v1"));
  await page.goto("/embed/focus/RY");
  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-embedded", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("les réglages présentent les deux identités localisées", async ({ page }) => {
  await page.goto("/parametres?section=preferences");
  await expect(page.getByText("Anatole Original", { exact: true })).toBeVisible();
  await expect(page.getByText("Anatole Blanc", { exact: true })).toBeVisible();
  await expect(page.getByText("Blanc · clair et lisible", { exact: true })).toBeVisible();

  await page.addInitScript((value) => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify(value)), preferences("blue", "en"));
  await page.reload();
  await expect(page.getByText("Anatole White", { exact: true })).toBeVisible();
  await expect(page.getByText("White · clear and readable", { exact: true })).toBeVisible();
});

test("les cartes de valorisation dans Cours utilisent la palette blanche", async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem("anatole.preferences.v0.4", JSON.stringify(value));
    localStorage.setItem("anatole.appearance-choice.v1", "1");
  }, preferences("blue"));
  await page.route("**/api/anatole/api/v1/stocks/RY/fundamentals", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ticker: "RY.TO",
      symbol: "RY",
      name: "Royal Bank of Canada",
      sector: "Financial Services",
      industry: "Banks",
      currency: "CAD",
      financial_currency: "CAD",
      status: "available",
      message: null,
      metrics: { market_cap: 200_000_000_000 },
      annual_financials: [],
      quarterly_financials: [],
      ttm: {},
      highlights: {},
      earnings_history: [],
      earnings_estimates: [],
      analysts: {},
      events: { earnings_dates: [] },
      source: "E2E verified source",
      generated_at: new Date().toISOString(),
      refresh_after_seconds: 1800,
    }),
  }));

  await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Cours", exact: true }).click();
  const metric = page.getByText("Capitalisation", { exact: true }).locator("..");
  await expect(metric).toBeVisible();
  const colors = await metric.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).toBe("rgb(255, 255, 255)");
  expect(colors.color).toBe("rgb(8, 32, 51)");
});

for (const route of [
  "/aujourdhui", "/focus/RY", "/actualites", "/calendrier", "/portefeuille", "/screener",
  "/parametres?section=preferences", "/cockpit", "/etf", "/ipo-insiders", "/institutions",
  "/terminal", "/comparateur", "/psychologie", "/watchlist", "/alertes", "/assistant", "/qualite",
  "/compte", "/notifications", "/conditions", "/confidentialite", "/avis-financier",
  "/roadmap", "/bienvenue", "/admin",
]) {
  test(`Anatole Blanc reste accessible sur ${route}`, async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("anatole.preferences.v0.4", JSON.stringify(value));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, preferences("blue"));
    await page.goto(route);
    await expect(page.getByRole("button", { name: "Signaler un problème" })).toHaveAttribute("data-client-ready", "true");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator(".discovery-loading, .cockpit-loading")).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}
