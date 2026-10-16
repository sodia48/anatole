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

test("Focus scenarios separate editable assumptions, sourced results and conditional DCF", async ({ page }) => {
  const requests: Request[] = [];
  await page.route("**/stocks/RY/fundamental-intelligence/scenarios", route => {
    const body = route.request().postDataJSON() as Request;
    requests.push(body);
    return route.fulfill({ json: response(body) });
  });
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Scénarios" }).click();
  const panel = page.getByRole("region", { name: "Simulateur fondamental" });
  await expect(panel.getByText(/Sensibilités illustratives, pas des prévisions/)).toBeVisible();
  await expect(panel.getByRole("link", { name: /Issuer annual report/ })).toHaveAttribute("href", "https://issuer.example/report.pdf");
  await panel.getByRole("group", { name: "Prudent" }).getByRole("spinbutton", { name: "Variation des revenus (%)" }).fill("-20");
  await panel.getByRole("checkbox", { name: "Saisir mes taux et calculer la DCF" }).check();
  await panel.getByRole("button", { name: "Calculer les scénarios" }).click();
  await expect.poll(() => requests.some(item => item.scenarios[0]?.revenue_change_percent === -20 && item.dcf?.discount_rate_percent === 10)).toBe(true);
  await panel.getByRole("group", { name: "Mode des scénarios" }).getByRole("button", { name: "Vue tableau" }).click();
  await expect(panel.getByRole("table").first()).toContainText("80 CAD");
  const beforeModeChange = requests.length;
  await panel.getByRole("group", { name: "Mode des scénarios" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(panel.getByText("Prudent · 80 CAD")).toBeVisible();
  expect(requests.length).toBe(beforeModeChange);
});
