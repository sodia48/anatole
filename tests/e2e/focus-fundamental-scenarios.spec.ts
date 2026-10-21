import { expect, test } from "@playwright/test";

type Request = { scenarios: { key: "prudent" | "central" | "optimistic"; revenue_change_percent: number }[];
  dcf: { discount_rate_percent: number; terminal_growth_percent: number; forecast_fcf_growth_percent: number } | null };
const metric = (value: number | null, unit: "money" | "percent" = "money") => ({ value, unit,
  status: value === null ? "unavailable" : "calculated", formula: "Explicit scenario calculation", missing_inputs: value === null ? ["annual report"] : [] });

function response(request: Request) {
  return { ticker: "RY.TO", sector_family: "industrial", baseline_period_end: "2025-12-31T00:00:00Z",
    currency: "CAD", baseline_source: "Issuer annual report", baseline_source_url: "https://issuer.example/report.pdf",
    baseline_filed_at: "2026-02-10T00:00:00Z", baseline_stale: false, status: "available",
    limitations_fr: ["Sensibilités illustratives, pas des prévisions ni des prix de marché certains."],
    limitations_en: ["Illustrative sensitivities, not forecasts or certain market prices."],
    outcomes: request.scenarios.map(scenario => ({ key: scenario.key, assumptions: scenario,
      revenue: metric(100 * (1 + scenario.revenue_change_percent / 100)), operating_income: metric(20),
      net_income: metric(15), operating_cash_flow: metric(18), free_cash_flow: metric(10),
      operating_margin: metric(20, "percent"), free_cash_flow_margin: metric(10, "percent"),
      dcf: { status: request.dcf ? "calculated" : "unavailable", reason: request.dcf ? null : "Explicit rates required",
        settings: request.dcf, projected_fcf: request.dcf ? [10, 11, 12, 13, 14] : [],
        enterprise_value: request.dcf ? 120 : null, net_debt: 20, equity_value: request.dcf ? 100 : null,
        shares_outstanding: 10, per_share: request.dcf ? 10 : null,
        sensitivity: request.dcf ? [{ discount_rate_percent: 10, terminal_growth_percent: 2, per_share: 10 }] : [],
        formula: "Discounted FCF", },
    })) };
}

test("Focus scenarios separate editable assumptions, sourced results and conditional DCF", async ({ page }, testInfo) => {
  const requests: Request[] = [];
  await page.route("**/stocks/RY/fundamental-intelligence/scenarios", route => {
    const body = route.request().postDataJSON() as Request;
    requests.push(body);
    return route.fulfill({ json: response(body) });
  });
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Simuler" }).click();
  const panel = page.getByRole("region", { name: "Simulateur fondamental" });
  await expect(panel.getByRole("heading", { name: "Résultats" })).toBeVisible();
  await panel.getByText("Méthodologie et limites").click();
  await expect(panel.getByText(/Sensibilités illustratives, pas des prévisions/)).toBeVisible();
  await expect(panel.getByRole("link", { name: /Issuer annual report/ })).toHaveAttribute("href", "https://issuer.example/report.pdf");
  await panel.getByText("Personnaliser les hypothèses").click();
  await panel.getByRole("navigation", { name: "Scénarios" }).getByRole("button", { name: "Prudent" }).click();
  await panel.getByRole("group", { name: "Prudent" }).getByRole("spinbutton", { name: "Variation des revenus (%)" }).fill("-20");
  await panel.getByRole("checkbox", { name: "Saisir mes taux et calculer la DCF" }).check();
  await panel.getByRole("button", { name: "Calculer les scénarios" }).click();
  await expect.poll(() => requests.some(item => item.scenarios[0]?.revenue_change_percent === -20 && item.dcf?.discount_rate_percent === 10)).toBe(true);
  await expect(panel.getByText("Simulation mise à jour")).toBeVisible();
  await expect(panel.getByText("Prudent · 80 CAD")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Résultats" })).toBeFocused();
  await expect(panel.getByRole("heading", { name: "Résultats" })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollX)).toBe(0);
  if (process.env.CAPTURE_V5) {
    await page.waitForTimeout(700);
    await panel.screenshot({ path: `docs/v5/simulator-industrial-${testInfo.project.name}.png` });
  }
  await panel.getByRole("combobox", { name: "Indicateur du graphique" }).selectOption("net_income");
  await expect(panel.getByText("Prudent · 15 CAD")).toBeVisible();
});

test("TD shows bank-only sensitivities and opens Anatole in place with scenario context", async ({ page }, testInfo) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/stocks/TD/fundamental-intelligence/scenarios", route => {
    const body = route.request().postDataJSON() as Request;
    const result = response(body);
    return route.fulfill({ json: { ...result, ticker: "TD.TO", sector_family: "bank", status: "partial",
      outcomes: result.outcomes.map(outcome => ({ ...outcome, operating_income: metric(null), net_income: metric(null),
        operating_cash_flow: metric(null), free_cash_flow: metric(null), operating_margin: metric(null, "percent"),
        free_cash_flow_margin: metric(null, "percent"), dcf: { ...outcome.dcf, status: "unavailable",
          reason: "A generic FCF DCF is not suitable for this business model", per_share: null } })) } });
  });
  await page.route("**/api/anatole/api/v1/assistant/chat", async route => {
    calls.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { intent: "stock_analysis", title: "TD", answer: "## Simulation demandée dans Focus\n- Revenus calculés",
      facts: [], links: [], sources: [], suggestions: [], confidence: "moyenne", disclaimer: "Illustratif.",
      guardrail_triggered: false, generated_at: "2026-10-20T12:00:00Z", conversation_id: "ba809b54-1d09-4cef-bb4b-bc3afae9175c",
      context: {}, actions: [], evidence: [], permission_required: false } });
  });
  await page.goto("/focus/TD?view=scenarios");
  const panel = page.getByRole("region", { name: "Simulateur fondamental" });
  await expect(panel.getByRole("heading", { name: "Résultats" })).toBeVisible();
  await expect(panel.getByText(/DCF générique|DCF.*inadaptée/)).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: /DCF/ })).toHaveCount(0);
  await expect(panel.getByRole("combobox", { name: "Indicateur du graphique" }).locator("option")).toHaveCount(1);
  if (process.env.CAPTURE_V5) await panel.screenshot({ path: `docs/v5/simulator-bank-${testInfo.project.name}.png` });
  await panel.getByText("Personnaliser les hypothèses").click();
  await panel.getByRole("group", { name: "Central" }).getByRole("spinbutton", { name: "Variation des revenus (%)" }).fill("9");
  await page.getByRole("button", { name: "Interroger Anatole" }).click();
  await expect(page).toHaveURL(/\/focus\/TD\?view=scenarios/);
  const dialog = page.getByRole("dialog", { name: "Anatole Assistant" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Votre question").fill("Pourquoi la DCF ne convient-elle pas à TD ?");
  await dialog.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(dialog.getByRole("heading", { name: "Simulation demandée dans Focus" })).toBeVisible();
  const context = calls[0]?.context as { symbol: string; metadata: Record<string, string> };
  expect(context.symbol).toBe("TD");
  expect(context.metadata.focus_module).toBe("scenarios");
  expect(context.metadata.scenario_request).toBeUndefined();
  await dialog.getByRole("button", { name: "Fermer l’assistant" }).click();
  await expect(panel.getByRole("group", { name: "Central" }).getByRole("spinbutton", { name: "Variation des revenus (%)" })).toHaveValue("9");
  await panel.getByRole("button", { name: "Analyser avec Anatole" }).click();
  await dialog.getByLabel("Votre question").fill("Compare mes trois scénarios TD");
  await dialog.getByRole("button", { name: "Envoyer la question" }).click();
  await expect.poll(() => calls.length).toBe(2);
  const scenarioContext = calls[1].context as { metadata: Record<string, string> };
  expect(JSON.parse(scenarioContext.metadata.scenario_request).scenarios).toHaveLength(3);
  await dialog.getByRole("button", { name: "Fermer l’assistant" }).click();
  await expect(panel.getByRole("button", { name: "Analyser avec Anatole" })).toBeVisible();
});

test("English sky theme keeps the bank simulator readable without DCF inputs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
    theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y", defaultUniverse: "tsx60", language: "en",
  })));
  await page.route("**/stocks/TD/fundamental-intelligence/scenarios", route => {
    const body = route.request().postDataJSON() as Request;
    const result = response(body);
    return route.fulfill({ json: { ...result, ticker: "TD.TO", sector_family: "bank", status: "partial",
      outcomes: result.outcomes.map(outcome => ({ ...outcome, net_income: metric(null), operating_income: metric(null),
        operating_cash_flow: metric(null), free_cash_flow: metric(null), operating_margin: metric(null, "percent"),
        free_cash_flow_margin: metric(null, "percent"), dcf: { ...outcome.dcf, status: "unavailable",
          reason: "A generic FCF DCF is not suitable for this business model", per_share: null } })) } });
  });
  await page.goto("/focus/TD?view=scenarios");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  const panel = page.getByRole("region", { name: "Fundamental simulator" });
  await expect(panel.getByRole("heading", { name: "Financial simulator — TD" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(panel.getByText(/generic.*DCF|DCF.*suitable/i)).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: /DCF/ })).toHaveCount(0);
  await panel.getByText("Customize assumptions").click();
  await expect(panel.getByRole("button", { name: "Calculate scenarios" })).toBeVisible();
});

test("a failed recalculation keeps the last reliable result and accepts a retry", async ({ page }) => {
  let failure = 0;
  await page.route("**/stocks/RY/fundamental-intelligence/scenarios", route => {
    const body = route.request().postDataJSON() as Request;
    if (failure === -1) return route.abort("timedout");
    return failure ? route.fulfill({ status: failure, json: { detail: "upstream unavailable" } })
      : route.fulfill({ json: response(body) });
  });
  await page.goto("/focus/RY?view=scenarios");
  const panel = page.getByRole("region", { name: "Simulateur fondamental" });
  await expect(panel.getByText("Central · 100 CAD")).toBeVisible();
  await panel.getByText("Personnaliser les hypothèses").click();
  await panel.getByRole("group", { name: "Central" }).getByRole("spinbutton", { name: "Variation des revenus (%)" }).fill("12");
  for (const status of [400, 422, 500, -1]) {
    failure = status;
    await panel.getByRole("button", { name: "Calculer les scénarios" }).click();
    await expect(panel.getByText("Ancien calcul — mise à jour échouée")).toBeVisible();
    await expect(panel.getByText("Central · 100 CAD")).toBeVisible();
    await expect(panel.getByRole("alert")).toBeVisible();
  }
  failure = 0;
  await panel.getByRole("button", { name: "Calculer les scénarios" }).click();
  await expect(panel.getByText("Simulation mise à jour")).toBeVisible();
  await expect(panel.getByText("Central · 112 CAD")).toBeVisible();
});
