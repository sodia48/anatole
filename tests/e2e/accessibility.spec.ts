import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = [
  "/aujourdhui",
  "/cockpit",
  "/screener",
  "/actualites",
  "/calendrier",
  "/focus/RY",
  "/portefeuille",
  "/alertes",
  "/notifications",
  "/parametres",
] as const;

for (const route of ROUTES) {
  test(`${route} ne contient aucune violation axe sérieuse ou critique`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const seriousViolations = results.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );

    expect(seriousViolations).toEqual([]);
  });
}
