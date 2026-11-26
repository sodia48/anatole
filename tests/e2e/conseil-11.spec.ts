import { expect, test } from "@playwright/test";

const existingProfile = {
  currency: "CAD",
  goal_type: "home",
  goal_name: "Maison 2032",
  horizon_years: 6,
  target_amount: 180000,
  current_savings: 52000,
  monthly_contribution: 800,
  essential_monthly_expenses: 2400,
  liquid_reserve: 16000,
  high_interest_debt: false,
  income_stability: "high",
  liquidity_need: "medium",
  loss_comfort: "medium",
  experience: "intermediate",
};

test("Conseil 11 accueille un nouveau profil dans quatre espaces", async ({ page }, testInfo) => {
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("conseil-spaces").getByRole("button")).toHaveCount(4);
  await expect(page.getByTestId("conseil-next-action")).toBeVisible();
  await expect(page.getByTestId("conseil-priority-metrics")).toHaveCount(0);
  await testInfo.attach("conseil-nouveau-accueil", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByTestId("conseil-next-action").getByRole("button").click();
  await expect(page.getByRole("navigation", { name: /Étapes du plan|Plan steps/i })).toBeVisible();
  await page.getByTestId("conseil-space-shop").click();
  await expect(page.getByText(/Qu’est-ce que tu veux magasiner|What are you shopping for/i)).toBeVisible();
  await page.getByTestId("conseil-space-dossier").click();
  await expect(page.getByRole("navigation", { name: /Étapes du plan|Plan steps/i })).toBeVisible();
});

test("Conseil 11 conserve le profil et les espaces visités après actualisation", async ({ page }, testInfo) => {
  await page.addInitScript((profile) => {
    window.localStorage.setItem("anatole:advisor-profile:v1", JSON.stringify(profile));
  }, existingProfile);
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("conseil-priority-metrics").locator("article")).toHaveCount(3);
  await expect(page.getByTestId("conseil-priority-alert")).toBeVisible();
  await expect(page.getByTestId("conseil-next-action")).toHaveCount(1);
  await testInfo.attach("conseil-profil-accueil", { body: await page.screenshot(), contentType: "image/png" });
  await expect(page.getByRole("navigation", { name: /Étapes du plan|Plan steps/i })).toHaveCount(0);
  await page.getByTestId("conseil-space-projects").click();
  await expect(page.getByTestId("advisor-command-center")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("conseil-projects")).toBeVisible();
  await expect(page.getByTestId("advisor-command-center")).toBeVisible();
  await page.getByTestId("conseil-space-dossier").click();
  await expect(page.getByTestId("conseil-dossier").getByText("Maison 2032").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Modifier mon profil|Edit my profile/i })).toBeVisible();
});

test("Conseil 11 modifie un objectif existant sans reprendre le questionnaire", async ({ page }) => {
  await page.addInitScript((profile) => {
    if (!window.localStorage.getItem("anatole:advisor-profile:v1")) {
      window.localStorage.setItem("anatole:advisor-profile:v1", JSON.stringify(profile));
    }
  }, existingProfile);
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("conseil-space-dossier").click();
  await page.getByRole("button", { name: /Modifier mon profil|Edit my profile/i }).click();
  await page.getByLabel(/Nom du projet|Project name/i).fill("Maison révisée");
  await page.getByLabel(/Combien veux-tu atteindre|How much do you want to reach/i).fill("200000");
  await page.getByRole("button", { name: /Revenir à Aujourd’hui|Back to Today/i }).click();
  await expect(page.getByTestId("conseil-priority-metrics")).toContainText(/148\s?000/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("conseil-priority-metrics")).toContainText(/148\s?000/);
  await page.getByTestId("conseil-space-dossier").click();
  await expect(page.getByTestId("conseil-dossier")).toContainText("Maison révisée");
});

test("Conseil 11 préserve le questionnaire Magasiner pendant la navigation", async ({ page }) => {
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("conseil-space-shop").click();
  await page.getByRole("button", { name: /Cartes de crédit|Credit cards/i }).first().click();
  await expect(page.getByTestId("shopping-question-province")).toBeVisible();
  await page.getByTestId("conseil-space-today").click();
  await page.getByTestId("conseil-space-shop").click();
  await expect(page.getByTestId("shopping-question-province")).toBeVisible();
});

test("Conseil 11 compare trois offres sourcées dans Magasiner", async ({ page }) => {
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("conseil-space-shop").click();
  await page.getByRole("button", { name: /Bancaire|Banking/i }).first().click();
  const next = async () => {
    const button = page.getByTestId("shopping-continue");
    await expect(button).toBeEnabled();
    await button.click();
  };
  await page.getByTestId("shopping-question-province").getByRole("combobox").selectOption("QC");
  await next();
  await page.getByTestId("shopping-question-banking_goal").getByRole("button", { name: /Compte de tous les jours|Everyday account/i }).click();
  await next();
  await page.getByTestId("shopping-question-monthly_transactions").getByRole("spinbutton").fill("30");
  await next();
  await page.getByTestId("shopping-question-average_balance").getByRole("spinbutton").fill("2000");
  await next();
  await page.getByTestId("shopping-question-branch_need").getByRole("button", { name: /Non|No/i }).click();
  await next();
  await page.getByTestId("shopping-question-fee_tolerance").getByRole("button", { name: /Je veux 0|I want \$0/i }).click();
  await next();
  await page.getByTestId("shopping-question-special_status").getByRole("button", { name: /Aucun|None/i }).click();
  await next();

  const grid = page.getByTestId("shopping-product-grid-banking");
  await expect(grid).toBeVisible();
  expect(await grid.locator("article input[type=checkbox]").count()).toBeGreaterThanOrEqual(4);
  for (const index of [0, 1, 2]) await grid.locator("article input[type=checkbox]").nth(index).check();
  await expect(grid.getByText(/Comparaison rapide|Quick comparison/i)).toBeVisible();
  await grid.locator("article input[type=checkbox]").nth(3).check();
  await expect(grid.locator("article input[type=checkbox]:checked")).toHaveCount(3);
  await expect(grid).toContainText(/Vérifié|Verified/i);
  await expect(grid.locator("article a[href^='https://']").first()).toBeVisible();
});

test("Conseil 11 respecte la langue anglaise et le thème clair existants", async ({ page }, testInfo) => {
  await page.addInitScript((profile) => {
    window.localStorage.setItem("anatole:advisor-profile:v1", JSON.stringify(profile));
    window.localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
      theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y",
      defaultUniverse: "tsx60", language: "en",
    }));
  }, existingProfile);
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  await expect(page.getByTestId("conseil-space-today")).toContainText("Today");
  await expect(page.getByTestId("conseil-priority-metrics").locator("article")).toHaveCount(3);
  await testInfo.attach("conseil-english-light", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByTestId("conseil-space-shop").click();
  await expect(page.getByText("Find the product that fits your need.")).toBeVisible();
});

test("Conseil 11 reste navigable sur mobile sans débordement horizontal", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"));
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  for (const space of ["today", "projects", "shop", "dossier"] as const) {
    await page.getByTestId(`conseil-space-${space}`).click();
    await expect(page.getByTestId(`conseil-${space}`)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${space} overflow`).toBeLessThanOrEqual(1);
  }
});
