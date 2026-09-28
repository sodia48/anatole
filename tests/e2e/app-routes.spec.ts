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
  "/institutionnel",
  "/institutionnel/attribution",
  "/institutionnel/clients",
  "/institutionnel/comite",
  "/institutionnel/construction",
  "/institutionnel/enterprise",
  "/institutionnel/gouvernance",
  "/institutionnel/macro",
  "/institutionnel/multi-actifs",
  "/institutionnel/recherche",
  "/institutionnel/risque",
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


test("Anatole Conseil expose le plan vivant, le laboratoire et le lien Magasiner contextuel", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Première propriété",
        horizon_years: 4,
        target_amount: 75000,
        current_savings: 26000,
        monthly_contribution: 650,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });

  const command = page.getByTestId("advisor-command-center");
  await expect(command).toBeVisible();
  await expect(command).toContainText(/Ton plan se met à jour|Your plan updates/i);
  await expect(command).toContainText(/Parcours propriété|Home-buying path/i);

  await page.getByTestId("advisor-tab-scenarios").click();
  const lab = page.getByTestId("advisor-scenario-lab");
  await expect(lab).toBeVisible();
  await expect(lab).toContainText(/Valeur projetée|Projected value/i);

  const monthlySlider = page.getByTestId("advisor-monthly-delta");
  await monthlySlider.fill("300");

  await page.getByRole("button", { name: /Vue d’ensemble|Overview/i }).click();
  const contextual = page.getByTestId("advisor-contextual-shopping");
  await expect(contextual).toHaveAttribute(
    "href",
    "/assistant/magasiner?category=mortgage",
  );

  await contextual.click();
  await expect(page).toHaveURL(/\/assistant\/magasiner\?category=mortgage/);
  await expect(page.getByTestId("shopping-question-province")).toBeVisible();
});


test("Anatole Conseil V3 bascule vers le cockpit, manipule la trajectoire et enregistre un scénario", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Maison 2030",
        horizon_years: 4,
        target_amount: 75000,
        current_savings: 26000,
        monthly_contribution: 650,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });

  await expect(page.getByText(/Ton plan, en un coup d’œil|Your plan at a glance/i)).toBeVisible();
  await expect(page.getByTestId("advisor-primary-plan")).toContainText(/26.*000|26,000/i);

  await page.getByTestId("advisor-tab-scenarios").click();
  await expect(page.getByTestId("advisor-trajectory-chart")).toBeVisible();

  const monthly = page.getByTestId("advisor-monthly-delta");
  await monthly.fill("300");

  const lab = page.getByTestId("advisor-scenario-lab");
  await lab.getByPlaceholder(/Nom du scénario|Scenario name/i).fill("Accéléré");
  await lab.getByRole("button", { name: /Enregistrer|Save/i }).click();
  await expect(lab).toContainText("Accéléré");

  await page.getByRole("button", { name: /Jumeau financier|Financial twin/i }).click();
  const twin = page.getByTestId("advisor-financial-twin");
  await expect(twin).toBeVisible();
  await twin.getByLabel(/Revenu mensuel net|Net monthly income/i).fill("5200");
  await expect(twin).toContainText(/Flux mensuel disponible|Available monthly flow/i);
});

test("Anatole Conseil V3 garde le questionnaire pour un nouveau profil", async ({ page }) => {
  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Qu’est-ce que tu veux accomplir|What do you want to achieve/i)).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Étapes du plan|Plan steps/i })).toBeVisible();
});


test("Anatole Conseil V4 ajoute Decision Lab et bilan synchronisable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Maison 2030",
        horizon_years: 4,
        target_amount: 75000,
        current_savings: 26000,
        monthly_contribution: 650,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  const v4 = page.getByTestId("advisor-v4-layer");
  await expect(v4).toBeVisible();
  await expect(v4).toContainText(/V4/);

  await page.getByTestId("advisor-decision-input").fill(
    "Et si j’achetais une maison à 550000 $ dans 3 ans ?",
  );
  await expect(page.getByTestId("advisor-decision-preview")).toContainText(
    /Projet immobilier|Home purchase/i,
  );

  await v4.getByRole("button", { name: /Bilan Anatole|Anatole Balance/i }).click();
  const balance = page.getByTestId("advisor-v4-balance");
  await expect(balance).toBeVisible();
  await balance.getByLabel(/Revenu mensuel net|Net monthly income/i).fill("5200");
  await expect(v4).toContainText(/Flux mensuel libre|Monthly free cash flow/i);
});
test("Anatole Conseil V5 expose les dix modules financiers", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Maison 2030",
        horizon_years: 4,
        target_amount: 75000,
        current_savings: 26000,
        monthly_contribution: 650,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });

  const suite = page.getByTestId("advisor-v4-layer");
  await expect(suite).toBeVisible();
  await expect(suite).toHaveAttribute("data-version", "5");
  await expect(suite).toContainText(/V5/);
  await expect(suite).toContainText(/V4/);

  const tabs = page.getByTestId("advisor-v5-tabs").getByRole("button");
  await expect(tabs).toHaveCount(10);

  await page.getByTestId("advisor-v5-tab-tax").click();
  const tax = page.getByTestId("advisor-v5-tax");
  await expect(tax).toContainText(/CELI|TFSA/);
  await expect(tax).toContainText(/REER|RRSP/);
  await expect(tax).toContainText(/CELIAPP|FHSA/);
  await expect(tax).toContainText(/REEE|RESP/);

  await page.getByTestId("advisor-v5-tab-mortgage").click();
  await expect(page.getByTestId("advisor-v5-mortgage")).toContainText(
    /Capital hypothécaire|Mortgage principal/i,
  );

  await page.getByTestId("advisor-v5-tab-quality").click();
  await expect(page.getByTestId("advisor-v5-quality")).toContainText(
    /D’où vient chaque chiffre|Where does each number come from/i,
  );
});

test("Anatole Conseil adapte l'échelle de trajectoire quand la cible est très éloignée", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "wealth",
        goal_name: "Capital long terme",
        horizon_years: 30,
        target_amount: 1000000,
        current_savings: 200000,
        monthly_contribution: 0,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-tab-scenarios").click();

  await expect(page.getByTestId("advisor-target-offscale")).toBeVisible();
  const yAxis = await page.getByTestId("advisor-trajectory-y-axis").innerText();
  expect(yAxis).not.toMatch(/1\s*000\s*000/);
  await expect(page.getByTestId("advisor-trajectory-chart")).toContainText(
    /Cible réelle|Actual target/i,
  );
});

test("Anatole Conseil ne trace plus une cible hors échelle comme un faux plafond", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Objectif long terme",
        horizon_years: 30,
        target_amount: 500000,
        current_savings: 200000,
        monthly_contribution: 0,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-tab-scenarios").click();

  await expect(page.getByTestId("advisor-target-offscale")).toBeVisible();
  await expect(page.getByTestId("advisor-target-path")).toHaveCount(0);

  const yAxis = page.getByTestId("advisor-trajectory-y-axis");
  await expect(yAxis.locator("span")).toHaveCount(5);
  await expect(yAxis).not.toContainText(/500\s*000/);

  const overflow = await page
    .getByTestId("advisor-trajectory-svg")
    .evaluate((element) => getComputedStyle(element).overflow);
  expect(overflow).toBe("hidden");
});

test("Anatole Conseil V7 transforme la trajectoire en Trajectory Lab", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Objectif long terme",
        horizon_years: 30,
        target_amount: 500000,
        current_savings: 200000,
        monthly_contribution: 0,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-tab-scenarios").click();

  const chart = page.getByTestId("advisor-trajectory-chart");
  await expect(chart).toContainText(/TRAJECTOIRE LAB|TRAJECTORY LAB/i);
  await expect(page.getByTestId("advisor-trajectory-summary")).toContainText(
    /Valeur projetée|Projected value/i,
  );
  await expect(page.getByTestId("advisor-target-offscale")).toBeVisible();
  await expect(page.getByTestId("advisor-target-path")).toHaveCount(0);
  await expect(page.getByTestId("advisor-scenario-path")).toHaveCount(0);

  await page.getByTestId("advisor-trajectory-scale-target").click();
  await expect(page.getByTestId("advisor-target-path")).toHaveCount(1);

  await page.getByTestId("advisor-trajectory-mode-percent").click();
  await expect(page.getByTestId("advisor-trajectory-y-axis")).toContainText(
    /%/,
  );
  await expect(page.getByTestId("advisor-target-path")).toHaveCount(1);
  await expect(chart).toContainText(/Objectif = 100%|Target = 100%/i);
  await expect(chart).toContainText(/Cible réelle|Actual target/i);
});

test("Anatole Conseil V7 sépare le scénario quand les hypothèses changent", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Maison 2030",
        horizon_years: 8,
        target_amount: 180000,
        current_savings: 50000,
        monthly_contribution: 500,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: null,
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-tab-scenarios").click();

  await expect(page.getByTestId("advisor-scenario-path")).toHaveCount(0);
  await page.getByTestId("advisor-monthly-delta").fill("300");
  await expect(page.getByTestId("advisor-scenario-path")).toHaveCount(1);
});

test("Anatole Conseil V8 relie les 20 modules du Financial Command Deck", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "home",
        goal_name: "Maison 2030",
        horizon_years: 8,
        target_amount: 180000,
        current_savings: 50000,
        monthly_contribution: 500,
        essential_monthly_expenses: 2600,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: "medium",
        experience: "intermediate"
      }),
    );
    window.localStorage.setItem(
      "anatole:advisor-workspace:v4",
      JSON.stringify({
        financialOs: {
          household: {
            userIncome: 5200,
            partnerIncome: 0,
            dependants: 0,
            cash: 18000,
            investments: 42000,
            property: 0,
            vehicles: 12000,
            otherAssets: 0,
            essentialExpenses: 2200,
            discretionaryExpenses: 650,
            housingCosts: 1200,
            insuranceCosts: 180,
            otherFixedCosts: 120
          },
          debts: [
            { id: "card", label: "Carte", balance: 4200, annualRate: 19.99, monthlyPayment: 250 }
          ],
          goals: [
            { id: "home", label: "Maison", target: 180000, current: 50000, monthly: 500, horizonMonths: 96 },
            { id: "reserve", label: "Réserve", target: 18000, current: 9000, monthly: 200, horizonMonths: 24 }
          ],
          tax: {
            tfsa: { room: 15000, planned: 5000 },
            rrsp: { room: 12000, planned: 3000 },
            fhsa: { room: 8000, planned: 8000 },
            resp: { room: null, planned: null }
          },
          mortgage: {
            purchasePrice: 550000,
            downPayment: 110000,
            annualRate: 4.5,
            amortizationYears: 25,
            renewalRate: 5.5
          },
          events: [
            { id: "move", label: "Déménagement", monthOffset: 12, oneTimeCost: 3500, recurringMonthlyCost: 0, monthlyIncomeDelta: 0 }
          ],
          forecastMonths: 24
        }
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });

  const v8 = page.getByTestId("advisor-v8-layer");
  await expect(v8).toBeVisible();
  await expect(v8).toHaveAttribute("data-feature-count", "20");
  await expect(v8).toContainText(/FINANCIAL COMMAND DECK/i);

  for (const key of ["today", "goals", "scenarios", "decisions", "products"] as const) {
    await page.getByTestId(`advisor-v8-tab-${key}`).click();
    await expect(page.getByTestId(`advisor-v8-${key}`)).toBeVisible();
    await expect(page.getByTestId(`advisor-v8-${key}`).locator("[data-module]")).toHaveCount(4);
  }

  await page.getByTestId("advisor-v8-tab-scenarios").click();
  await expect(page.getByTestId("advisor-v8-scenarios")).toContainText(/PROBABILITY LAB/i);
  await expect(page.getByTestId("advisor-v8-scenarios")).toContainText(/STRESS LAB/i);

  await page.getByTestId("advisor-v8-tab-decisions").click();
  await expect(page.getByTestId("advisor-v8-decisions")).toContainText(/DEBT CENTER/i);
  await expect(page.getByTestId("advisor-v8-decisions")).toContainText(/CANADA TAX LENS/i);

  await page.getByTestId("advisor-v8-tab-products").click();
  await expect(v8.getByRole("link", { name: /Ouvrir Magasiner|Open Shop/i })).toHaveAttribute(
    "href",
    "/assistant/magasiner",
  );
  await expect(v8.getByRole("button", { name: /Exporter le dossier JSON|Export JSON dossier/i })).toBeVisible();
});

test("Anatole Conseil V8 persiste les hypothèses de simulation", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "wealth",
        goal_name: "Capital long terme",
        horizon_years: 12,
        target_amount: 300000,
        current_savings: 70000,
        monthly_contribution: 900,
        essential_monthly_expenses: 2600,
        liquid_reserve: 12000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "medium",
        loss_comfort: "medium",
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-v8-tab-scenarios").click();

  const returnInput = page.getByLabel(
    /Rendement moyen hypothétique|Assumed average return/i,
  );
  const volatilityInput = page.getByLabel(
    /Volatilité hypothétique|Assumed volatility/i,
  );

  await returnInput.fill("6.5");
  await volatilityInput.fill("12.5");
  await expect(returnInput).toHaveValue("6.5");
  await expect(volatilityInput).toHaveValue("12.5");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-v8-tab-scenarios").click();

  await expect(
    page.getByLabel(/Rendement moyen hypothétique|Assumed average return/i),
  ).toHaveValue("6.5");
  await expect(
    page.getByLabel(/Volatilité hypothétique|Assumed volatility/i),
  ).toHaveValue("12.5");
});

test("Anatole Conseil V9 expose les 35 capacités dans sept espaces", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
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
        experience: "intermediate"
      }),
    );
    window.localStorage.setItem(
      "anatole:advisor-workspace:v4",
      JSON.stringify({
        financialOs: {
          household: {
            userIncome: 5400,
            partnerIncome: 0,
            dependants: 0,
            cash: 16000,
            investments: 48000,
            property: 0,
            vehicles: 10000,
            otherAssets: 0,
            essentialExpenses: 2100,
            discretionaryExpenses: 650,
            housingCosts: 1250,
            insuranceCosts: 170,
            otherFixedCosts: 130
          },
          debts: [
            {
              id: "card",
              label: "Carte",
              balance: 3500,
              annualRate: 19.99,
              monthlyPayment: 250
            }
          ],
          goals: [
            {
              id: "home",
              label: "Maison",
              target: 180000,
              current: 52000,
              monthly: 500,
              horizonMonths: 72
            }
          ],
          events: [
            {
              id: "move",
              label: "Déménagement",
              monthOffset: 18,
              oneTimeCost: 4500,
              recurringMonthlyCost: 0,
              monthlyIncomeDelta: 0
            }
          ]
        },
        v8: {
          province: "QC",
          expectedReturn: 5,
          volatility: 11
        }
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });

  const v9 = page.getByTestId("advisor-v9-layer");
  await expect(v9).toBeVisible();
  await expect(v9).toHaveAttribute("data-feature-count", "35");
  await expect(v9).toContainText(/V9 INTELLIGENCE OS/i);

  const spaces = [
    "pulse",
    "household",
    "labs",
    "intelligence",
    "decisions",
    "optimize",
    "pro",
  ] as const;

  for (const key of spaces) {
    await page.getByTestId(`advisor-v9-tab-${key}`).click();
    const zone = page.getByTestId(`advisor-v9-${key}`);
    await expect(zone).toBeVisible();
    await expect(zone.locator("[data-module]")).toHaveCount(5);
  }

  await expect(page.getByTestId("advisor-v8-layer")).toBeVisible();
});

test("Anatole Conseil V9 importe un CSV bancaire local et détecte les récurrences", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "reserve",
        goal_name: "Réserve",
        horizon_years: 2,
        target_amount: 25000,
        current_savings: 9000,
        monthly_contribution: 500,
        essential_monthly_expenses: 2200,
        liquid_reserve: 9000,
        high_interest_debt: false,
        income_stability: "high",
        liquidity_need: "high",
        loss_comfort: "low",
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });

  const csv = [
    "date,description,amount",
    "2026-05-01,Netflix,-20",
    "2026-06-01,Netflix,-20",
    "2026-07-01,Netflix,-20",
    "2026-07-02,Payroll,3200",
  ].join("\n");

  await page.getByTestId("advisor-v9-bank-csv").setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  const pulse = page.getByTestId("advisor-v9-pulse");
  await expect(pulse).toBeVisible();

  const bank = pulse.locator('[data-module="01"]');
  await expect(bank).toContainText(/4 transaction/i);

  const recurring = pulse.locator('[data-module="04"]');
  await expect(recurring).toContainText(/netflix/i);

  const stored = await page.evaluate(() =>
    window.localStorage.getItem("anatole:advisor-v9-local:v1"),
  );
  expect(stored).toContain("Netflix");

  const syncedWorkspace = await page.evaluate(() =>
    window.localStorage.getItem("anatole:advisor-workspace:v4"),
  );
  expect(syncedWorkspace ?? "").not.toContain("Netflix");
});

test("Anatole Conseil V9 persiste le mode urgence localement", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "anatole:advisor-profile:v1",
      JSON.stringify({
        currency: "CAD",
        goal_type: "wealth",
        goal_name: "Capital",
        horizon_years: 10,
        target_amount: 250000,
        current_savings: 60000,
        monthly_contribution: 700,
        essential_monthly_expenses: 2500,
        liquid_reserve: 12000,
        high_interest_debt: false,
        income_stability: "medium",
        liquidity_need: "medium",
        loss_comfort: "medium",
        experience: "intermediate"
      }),
    );
  });

  await page.goto("/assistant", { waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-v9-tab-pro").click();

  const toggle = page.getByTestId("advisor-v9-emergency-toggle");
  await toggle.check();
  await expect(toggle).toBeChecked();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("advisor-v9-tab-pro").click();
  await expect(page.getByTestId("advisor-v9-emergency-toggle")).toBeChecked();
  await expect(page.getByTestId("advisor-v9-layer")).toContainText(
    /MODE URGENCE ACTIF|EMERGENCY MODE ACTIVE/i,
  );
});

test("Anatole demande le choix Particulier ou Institutionnel a l'ouverture", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const gateway = page.getByTestId("persona-gateway");
  await expect(gateway).toBeVisible();
  await expect(page.getByTestId("persona-particulier")).toBeVisible();
  await expect(page.getByTestId("persona-institutionnel")).toBeVisible();

  await page.getByTestId("persona-particulier").click();
  await expect(page).toHaveURL(/\/aujourdhui$/);

  const persona = await page.evaluate(() =>
    window.localStorage.getItem("anatole:persona:v1"),
  );
  expect(persona).toBe("particulier");
});

test("Le choix Institutionnel ouvre les 70 capacites d'Anatole Institutional", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("persona-institutionnel").click();

  await expect(page).toHaveURL(/\/institutionnel$/);

  const hub = page.getByTestId("institutional-hub");
  await expect(hub).toBeVisible();
  await expect(hub).toHaveAttribute("data-capability-count", "70");

  const commandCenter = page.getByTestId("institutional-command-center");
  await expect(commandCenter).toBeVisible();
  await expect(
    page.getByTestId("institutional-desk-grid").locator("a"),
  ).toHaveCount(6);
  await expect(
    page.getByTestId("institutional-morning-brief"),
  ).toBeVisible();

  const grid = page.getByTestId("institutional-capability-grid");
  await expect(grid.locator("[data-capability-id]")).toHaveCount(70);

  const persona = await page.evaluate(() =>
    window.localStorage.getItem("anatole:persona:v1"),
  );
  expect(persona).toBe("institutionnel");
});

test("Anatole Institutional permet de chercher et ouvrir une capacite", async ({ page }) => {
  await page.goto("/institutionnel", { waitUntil: "domcontentloaded" });

  await page.waitForFunction(() =>
    window.localStorage.getItem("anatole:persona:v1") === "institutionnel",
  );

  const search = page.getByTestId("institutional-search");
  await expect(search).toBeVisible();
  await search.fill("Thesis Monitor");
  await expect(search).toHaveValue("Thesis Monitor");

  const grid = page.getByTestId("institutional-capability-grid");
  const matches = grid.locator("[data-capability-id]");
  await expect(matches).toHaveCount(2);

  const thesisMonitor = grid.locator('[data-capability-id="14"]');
  await expect(thesisMonitor).toBeVisible();
  await thesisMonitor.click();
  const detail = page.getByTestId("institutional-capability-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(/Suivi de th.se|Thesis Monitor/i);

  await expect(
    page.getByTestId("institutional-switch-mode"),
  ).toBeVisible();
});
test("Anatole Institutional Risk Center reutilise le moteur portefeuille verifie", async ({ page }) => {
  await page.goto("/institutionnel/risque", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByTestId("institutional-risk-center"),
  ).toBeVisible();

  await expect(page.locator("body")).toContainText(
    /Risk Center/i,
  );

  await expect(page.locator("body")).not.toContainText(
    /Application error|Internal Server Error/i,
  );
});
test("Anatole Institutional structure une these sans inventer de donnees", async ({ page }) => {
  await page.goto("/institutionnel/recherche", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByTestId("institutional-research-center"),
  ).toBeVisible();

  await page.locator('input[name="symbol"]').fill("RY");
  await page.locator('input[name="horizon"]').fill("12 mois");
  await page.locator('textarea[name="thesis"]').fill(
    "Croissance des revenus et discipline de capital à vérifier.",
  );
  await page.locator('textarea[name="invalidation"]').fill(
    "La thèse est invalidée si les hypothèses opérationnelles ne sont plus soutenues.",
  );

  await page.getByRole("button", {
    name: "Générer le mémo de thèse",
  }).click();

  await expect(page).toHaveURL(/symbol=RY/);

  const memo = page.getByTestId("institutional-thesis-memo");
  await expect(memo).toBeVisible();
  await expect(memo).toContainText("RY");
  await expect(memo).toContainText(/Croissance des revenus/);

  await expect(page.locator("body")).not.toContainText(
    /Application error|Internal Server Error/i,
  );
});
test("Anatole Institutional structure une decision de comite humaine", async ({ page }) => {
  await page.goto("/institutionnel/comite", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByTestId("institutional-committee-center"),
  ).toBeVisible();

  await page.locator('input[name="symbol"]').fill("RY");
  await page.locator('input[name="analyst"]').fill("Analyste test");
  await page.locator('input[name="pm"]').fill("PM test");
  await page.locator('textarea[name="thesis"]').fill(
    "Thèse soumise au comité pour vérification.",
  );
  await page.locator('textarea[name="evidence"]').fill(
    "Sources et preuves à vérifier dans Anatole.",
  );
  await page.locator('textarea[name="risk_review"]').fill(
    "Risque revu avant toute décision.",
  );
  await page.locator('textarea[name="rationale"]').fill(
    "Motifs consignés par le comité.",
  );
  await page.locator('select[name="decision"]').selectOption("hold");

  await page.getByRole("button", {
    name: "Générer le mémo comité",
  }).click();

  await expect(page).toHaveURL(/symbol=RY/);

  const memo = page.getByTestId("institutional-committee-memo");
  await expect(memo).toBeVisible();
  await expect(memo).toContainText("RY");
  await expect(memo).toContainText("Décision différée");
  await expect(memo).toContainText(/Motifs consignés/);

  await expect(page.locator("body")).not.toContainText(
    /Application error|Internal Server Error/i,
  );
});
test("Anatole Institutional structure un pack de preuve gouvernance", async ({ page }) => {
  await page.goto("/institutionnel/gouvernance", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByTestId("institutional-governance-center"),
  ).toBeVisible();

  await page.locator('input[name="subject"]').fill("RY");
  await page.locator('input[name="source"]').fill("TMX");
  await page.locator('input[name="provider"]').fill("TMX");
  await page.locator('input[name="model_version"]').fill(
    "portfolio-risk-v1",
  );
  await page.locator('textarea[name="transformation"]').fill(
    "Transformation documentée par l'équipe.",
  );
  await page.locator('textarea[name="limitations"]').fill(
    "Couverture à vérifier.",
  );

  await page.getByRole("button", {
    name: "Générer le pack de preuve",
  }).click();

  await expect(page).toHaveURL(/subject=RY/);

  const pack = page.getByTestId("institutional-evidence-pack");
  await expect(pack).toBeVisible();
  await expect(pack).toContainText("RY");
  await expect(pack).toContainText("TMX");
  await expect(pack).toContainText("portfolio-risk-v1");

  await expect(page.locator("body")).not.toContainText(
    /Application error|Internal Server Error/i,
  );
});
test("Anatole Institutional compare deux scenarios pre-trade sans ordre", async ({ page }) => {
  await page.goto("/institutionnel/construction", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("institutional-construction-center")).toBeVisible();
  await page.locator('input[name="symbol"]').fill("RY");
  await page.locator('input[name="portfolio_value"]').fill("1000000");
  await page.locator('input[name="current_weight"]').fill("4");
  await page.locator('input[name="target_a"]').fill("5");
  await page.locator('input[name="target_b"]').fill("7");
  await page.locator('input[name="max_position"]').fill("6");
  await page.locator('input[name="cost_bps"]').fill("10");
  await page.getByRole("button", { name: "Comparer les scénarios" }).click();
  const comparison = page.getByTestId("institutional-pretrade-comparison");
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("Scénario A");
  await expect(comparison).toContainText("Scénario B");
  await expect(comparison).toContainText("À revoir");
});
test("Anatole Institutional structure un scenario macro hypothetique", async ({ page }) => {
  await page.goto("/institutionnel/macro", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("institutional-macro-center")).toBeVisible();
  await page.locator('select[name="growth"]').selectOption("down");
  await page.locator('select[name="inflation"]').selectOption("up");
  await page.locator('textarea[name="evidence"]').fill("Validation dans Canada 360 requise.");
  await page.getByRole("button", { name: "Générer le mémo macro" }).click();
  const memo = page.getByTestId("institutional-macro-memo");
  await expect(memo).toBeVisible();
  await expect(memo).toContainText("Ralentissement inflationniste");
  await expect(memo).toContainText(/ne constitue pas une prévision/i);
});
test("Anatole Institutional calcule un post-mortem attribution", async ({ page }) => {
  await page.goto("/institutionnel/attribution", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("institutional-attribution-center")).toBeVisible();
  await page.locator('input[name="symbol"]').fill("RY");
  await page.locator('input[name="portfolio_return"]').fill("8");
  await page.locator('input[name="benchmark_return"]').fill("5");
  await page.locator('input[name="allocation_bps"]').fill("50");
  await page.locator('input[name="selection_bps"]').fill("200");
  await page.locator('input[name="fx_bps"]').fill("25");
  await page.locator('input[name="factor_bps"]').fill("10");
  await page.locator('input[name="timing_bps"]').fill("15");
  await page.locator('input[name="fees_bps"]').fill("-10");
  await page.getByRole("button", { name: "Générer la revue" }).click();
  const memo = page.getByTestId("institutional-attribution-memo");
  await expect(memo).toBeVisible();
  await expect(memo).toContainText("+300 bps");
  await expect(memo).toContainText("+290 bps");
  await expect(memo).toContainText("+10 bps");
  await expect(memo).toContainText(/entrées analyste V1/i);
});
test("Anatole Institutional calcule un FX overlay multi-actifs", async ({ page }) => {
  await page.goto("/institutionnel/multi-actifs", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByTestId("institutional-multi-asset-center"),
  ).toBeVisible();

  await page.locator('input[name="portfolio_value"]').fill("1000000");
  await page.locator('input[name="foreign_exposure"]').fill("30");
  await page.locator('input[name="current_hedge"]').fill("25");
  await page.locator('input[name="target_hedge"]').fill("50");
  await page.locator('input[name="cost_bps"]').fill("5");

  await page.getByRole("button", {
    name: "Calculer le scénario",
  }).click();

  const results = page.getByTestId("institutional-multi-asset-results");

  await expect(results).toBeVisible();
  await expect(results).toContainText("300000 CAD");
  await expect(results).toContainText("75000 CAD");
  await expect(results).toContainText("150000 CAD");
  await expect(results).toContainText("50.0 %");
});
test("Anatole Institutional prepare une revue client sans PII", async ({ page }) => {
  await page.goto("/institutionnel/clients", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByTestId("institutional-client-review-center"),
  ).toBeVisible();

  await page.locator('input[name="client_ref"]').fill("CLIENT-042");
  await page.locator('input[name="horizon"]').fill("10 ans");
  await page.locator('textarea[name="objective"]').fill(
    "Croissance à long terme avec besoins de liquidité limités.",
  );
  await page.locator('textarea[name="portfolio_changes"]').fill(
    "Allocation et risque à revoir lors de la prochaine rencontre.",
  );
  await page.locator('textarea[name="questions"]').fill(
    "Confirmer horizon, liquidité et tolérance au risque.",
  );

  await page.getByRole("button", {
    name: "Générer le mémo de revue",
  }).click();

  const memo = page.getByTestId("institutional-client-review-memo");

  await expect(memo).toBeVisible();
  await expect(memo).toContainText("CLIENT-042");
  await expect(memo).toContainText("10 ans");
  await expect(memo).toContainText(/Croissance à long terme/);
});
test("Anatole Institutional construit un readiness pack enterprise", async ({ page }) => {
  await page.goto("/institutionnel/enterprise", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByTestId("institutional-enterprise-center"),
  ).toBeVisible();

  await page.locator('input[name="org_alias"]').fill("INSTITUTION-A");
  await page.locator('input[name="region"]').fill("Canada");
  await page.locator('select[name="auth"]').selectOption("oidc");
  await page.locator('select[name="data_plane"]').selectOption("snowflake");
  await page.locator('input[name="oms_pms"]').fill("PMS cible à intégrer");
  await page.locator('textarea[name="audit"]').fill(
    "Journaliser les accès et modifications sensibles.",
  );

  await page.getByRole("button", {
    name: "Générer le readiness pack",
  }).click();

  const pack = page.getByTestId(
    "institutional-enterprise-readiness-pack",
  );

  await expect(pack).toBeVisible();
  await expect(pack).toContainText("INSTITUTION-A");
  await expect(pack).toContainText("SSO OIDC requis");
  await expect(pack).toContainText("Snowflake");
});
