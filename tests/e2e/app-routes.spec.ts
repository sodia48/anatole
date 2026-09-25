import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/actualites",
  "/admin",
  "/alertes",
  "/assistant",
  "/assistant/magasiner",
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

    if (testInfo.project.name.startsWith("mobile-")) {
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


test("Anatole Magasiner garde le bouton Continuer visible", async ({ page }) => {
  await page.goto("/assistant/magasiner", { waitUntil: "domcontentloaded" });

  const creditCard = page.getByRole("button", {
    name: /Cartes de crédit|Credit cards/i,
  });
  await expect(creditCard).toBeVisible();
  await creditCard.click();

  const province = page.getByRole("combobox").first();
  await expect(province).toBeVisible();
  await province.selectOption("QC");

  const continueButton = page.getByTestId("shopping-continue");
  await expect(continueButton).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(
    page.getByText(/combien dépenses-tu par mois|how much do you spend on a card each month/i),
  ).toBeVisible();
});


test("Anatole Magasiner affiche des produits reels apres le questionnaire carte", async ({ page }) => {
  await page.goto("/assistant/magasiner", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", {
    name: /Cartes de crédit|Credit cards/i,
  }).click();

  const next = async () => {
    const button = page.getByTestId("shopping-continue");
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await button.click();
  };

  await page.getByTestId("shopping-question-province").getByRole("combobox").selectOption("QC");
  await next();
  await page.getByTestId("shopping-question-monthly_spend").getByRole("spinbutton").fill("2000");
  await next();
  await page.getByTestId("shopping-question-balance_behavior").getByRole("button", {
    name: /Ça m’arrive de reporter un solde|I sometimes carry a balance/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-carried_balance").getByRole("spinbutton").fill("500");
  await next();
  await page.getByTestId("shopping-question-reward_goal").getByRole("button", {
    name: /Assurances et avantages|Insurance and perks/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-spend_focus").getByRole("button", {
    name: /Épicerie|Groceries/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-ecosystem").getByRole("button", {
    name: /Aucun en particulier|None in particular/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-fee_comfort").getByRole("button", {
    name: /Plus si les avantages valent la peine|More if the perks are worth it/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-travel_frequency").getByRole("button", {
    name: /Rarement|Rarely/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-income_band").getByRole("button", {
    name: /Moins de 60 000|Under \$60,000/i,
  }).click();
  await next();

  const grid = page.getByTestId("shopping-product-grid-credit_card");
  await expect(grid).toBeVisible();
  await expect(grid).toContainText(/RBC|TD|CIBC|Desjardins|Tangerine|MBNA/i);
});

test("Anatole Magasiner affiche des comptes bancaires reels apres le questionnaire", async ({ page }) => {
  await page.goto("/assistant/magasiner", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Bancaire|Banking/i }).click();

  const next = async () => {
    const button = page.getByTestId("shopping-continue");
    await expect(button).toBeEnabled();
    await button.click();
  };

  await page.getByTestId("shopping-question-province").getByRole("combobox").selectOption("QC");
  await next();
  await page.getByTestId("shopping-question-banking_goal").getByRole("button", {
    name: /Compte de tous les jours|Everyday account/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-monthly_transactions").getByRole("spinbutton").fill("30");
  await next();
  await page.getByTestId("shopping-question-average_balance").getByRole("spinbutton").fill("2000");
  await next();
  await page.getByTestId("shopping-question-branch_need").getByRole("button", {
    name: /Non|No/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-fee_tolerance").getByRole("button", {
    name: /Je veux 0|I want \$0/i,
  }).click();
  await next();
  await page.getByTestId("shopping-question-special_status").getByRole("button", {
    name: /Aucun|None/i,
  }).click();
  await next();

  const grid = page.getByTestId("shopping-product-grid-banking");
  await expect(grid).toBeVisible();
  await expect(grid).toContainText(/Tangerine|Simplii|TD|Scotiabank|BMO|Desjardins/i);
});
