import { expect, test, type Page, type Route } from "@playwright/test";

const plan = {
  title: "Plan de test éducatif",
  summary: "Résumé déterministe sans recommandation de placement.",
  currency: "CAD",
  profile_completeness: 0,
  readiness_score: 50,
  capacity_profile: "Équilibrée",
  capacity_score: 50,
  reserve_months: null,
  portfolio_score: null,
  portfolio_risk_level: null,
  top_position_percent: null,
  projections: [],
  priorities: [],
  risk_dimensions: [],
  stress_tests: [],
  boundaries: ["Information éducative uniquement."],
  generated_at: "2026-08-17T00:00:00Z",
};

const safeAssistantResponse = {
  intent: "explain",
  title: "Explication éducative",
  answer: "Cette réponse explique uniquement les données du plan de test. Elle ne recommande aucun achat, vente ou maintien de titre.",
  facts: [],
  links: [],
  sources: [],
  suggestions: [],
  confidence: "limitée",
  disclaimer: "Information éducative seulement; aucun conseil financier, fiscal ou juridique.",
  guardrail_triggered: false,
  plan: null,
  generated_at: "2026-08-17T00:00:00Z",
};

async function openAssistantComposer(page: Page): Promise<void> {
  await page.route("**/api/anatole/api/v1/workspace/advisor-plan", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plan) }),
  );
  await page.goto("/assistant");
  await page.getByRole("button", { name: /Ton plan/ }).click();
  await page.getByRole("button", { name: /Calculer mon plan/ }).click();
  await expect(page.getByRole("heading", { name: /Tes 3 prochaines étapes/ })).toBeVisible();
  await page.getByRole("button", { name: /Besoin d’une explication/ }).click();
  await expect(page.getByPlaceholder(/Explique-moi pourquoi ma réserve/)).toBeVisible();
}

async function submitQuestion(page: Page): Promise<void> {
  await page.getByPlaceholder(/Explique-moi pourquoi ma réserve/).fill(
    "Explique les limites du plan sans faire de recommandation.",
  );
  await page.getByRole("button", { name: /Envoyer/ }).click();
}

test("le provider de test retourne une réponse éducative déterministe", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/workspace/assistant", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(safeAssistantResponse),
    }),
  );
  await openAssistantComposer(page);
  await submitQuestion(page);

  await expect(page.getByText(safeAssistantResponse.answer)).toBeVisible();
  await expect(page.getByText(safeAssistantResponse.disclaimer)).toBeVisible();
});

for (const scenario of [
  {
    name: "timeout",
    fulfill: (route: Route) => route.abort("timedout"),
  },
  {
    name: "fournisseur indisponible",
    fulfill: (route: Route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Fournisseur de test indisponible." }),
    }),
  },
  {
    name: "réponse vide ou invalide",
    fulfill: (route: Route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "",
    }),
  },
] as const) {
  test(`le provider de test gère ${scenario.name}`, async ({ page }) => {
    await page.route("**/api/anatole/api/v1/workspace/assistant", scenario.fulfill);
    await openAssistantComposer(page);
    await submitQuestion(page);

    await expect(page.getByText(/temporairement indisponible|Fournisseur de test indisponible|Failed to fetch|JSON/i)).toBeVisible();
    await expect(page.getByText(safeAssistantResponse.answer)).toHaveCount(0);
  });
}
