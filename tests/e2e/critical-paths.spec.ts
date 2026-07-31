import { expect, test } from "@playwright/test";

const criticalRoutes = [
  { path: "/cockpit", label: /TSX 60|Cockpit/i },
  { path: "/screener", label: /Screener/i },
  { path: "/etf", label: /ETF/i },
  { path: "/focus/RY", label: /Focus|RY/i },
  { path: "/terminal", label: /Terminal Pro|Signaux/i },
  { path: "/qualite", label: /Qualité des données/i },
];

for (const route of criticalRoutes) {
  test(`${route.path} charge sans écran cassé`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(route.label);
    await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
  });

  test(`${route.path} ne déborde pas horizontalement`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  });
}

test("le Cockpit expose les deux univers", async ({ page }) => {
  await page.goto("/cockpit", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("TSX 60", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Composite", { exact: true }).first()).toBeVisible();
});

test("le signalement bêta est accessible", async ({ page }) => {
  await page.goto("/cockpit", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Signaler un problème" }).click();
  await expect(page.getByRole("dialog")).toContainText("Que s’est-il passé");
  await expect(page.getByText("Aucune donnée financière personnelle")).toBeVisible();
});
