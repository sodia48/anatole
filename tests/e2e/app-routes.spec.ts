import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/actualites",
  "/admin",
  "/alertes",
  "/assistant",
  "/aujourdhui",
  "/avis-financier",
  "/bienvenue",
  "/calendrier",
  "/cockpit",
  "/comparateur",
  "/compte",
  "/conditions",
  "/confidentialite",
  "/etf",
  "/etf/XIC",
  "/focus/RY",
  "/insiders",
  "/ipo",
  "/ipo-insiders",
  "/institutions",
  "/notifications",
  "/parametres",
  "/portefeuille",
  "/preferences",
  "/psychologie",
  "/qualite",
  "/roadmap",
  "/screener",
  "/terminal",
  "/watchlist",
];

for (const route of routes) {
  test(`${route} rend sans erreur critique`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const criticalApi404: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !/Failed to load resource: the server responded with a status of (401|403) \((Unauthorized|Forbidden)\)/i.test(
          message.text(),
        )
      ) {
        consoleErrors.push(message.text());
      }
    });
    page.on("response", (response) => {
      const url = response.url();
      if (
        response.status() === 404 &&
        /\/api\/(?:account|notifications|admin)(?:\/|$)/.test(url)
      ) {
        criticalApi404.push(url);
      }
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status() ?? 200, route).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
    await expect(page.locator("h1:visible, h2:visible").first()).toBeVisible();

    if (testInfo.project.name === "mobile-pixel-7") {
      await page.waitForTimeout(350);
      const dimensions = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll, `${route} overflow`).toBeLessThanOrEqual(dimensions.client + 1);
    }

    expect(criticalApi404, `${route} API 404`).toEqual([]);
    expect(consoleErrors, `${route} console errors`).toEqual([]);
  });
}
