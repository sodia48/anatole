import { expect, test } from "@playwright/test";

const positions = [
  { symbol: "RY", quantity: 12, average_cost: 122 },
  { symbol: "TD", quantity: 18, average_cost: 78 },
  { symbol: "XIC", quantity: 25, average_cost: 33 },
];

function position(symbol: string, price: number, quantity: number, averageCost: number) {
  const marketValue = price * quantity;
  const costBasis = averageCost * quantity;
  return {
    symbol,
    ticker: `${symbol}.TO`,
    name: symbol === "RY" ? "Royal Bank of Canada" : symbol === "TD" ? "Toronto-Dominion Bank" : "iShares Core S&P/TSX Capped Composite Index ETF",
    sector: symbol === "XIC" ? "Marché canadien" : "Financials",
    currency: "CAD",
    quantity,
    average_cost: averageCost,
    price,
    fx_rate: 1,
    cost_basis: costBasis,
    market_value: marketValue,
    unrealized_pnl: marketValue - costBasis,
    unrealized_pnl_percent: ((marketValue - costBasis) / costBasis) * 100,
    day_pnl: quantity,
    day_change_percent: 0.5,
    weight_percent: 33.33,
    momentum_20d: null,
    rsi_14: null,
    relative_volume: null,
    trend: null,
    score: null,
    source: "public-session",
    delayed: true,
  };
}

function snapshot(items = [
  position("RY", 200, 12, 122),
  position("TD", 100, 18, 78),
  position("XIC", 40, 25, 33),
]) {
  const total = items.reduce((sum, item) => sum + item.market_value, 0);
  const cost = items.reduce((sum, item) => sum + item.cost_basis, 0);
  const pnl = total - cost;
  return {
    base_currency: "CAD",
    benchmark: "^GSPTSE",
    benchmark_name: "S&P/TSX Composite",
    total_market_value: total,
    total_cost_basis: cost,
    total_unrealized_pnl: pnl,
    total_unrealized_pnl_percent: (pnl / cost) * 100,
    total_day_pnl: items.reduce((sum, item) => sum + item.day_pnl, 0),
    total_day_change_percent: 0.5,
    portfolio_score: null,
    positions: items,
    sector_allocation: [{ key: "financials", label: "Financials", value: total, weight_percent: 100 }],
    currency_allocation: [{ key: "cad", label: "CAD", value: total, weight_percent: 100 }],
    performance: [],
    risk: {
      volatility_percent: null,
      beta: null,
      max_drawdown_percent: null,
      sharpe_ratio: null,
      concentration_hhi: 3333,
      top_position_percent: 33.33,
      top_three_percent: 100,
      diversification_score: 49.4,
      risk_level: null,
      history_coverage_percent: 0,
      history_observations: 0,
    },
    contributors: [],
    detractors: [],
    notes: ["Couverture historique insuffisante."],
    generated_at: "2026-09-13T18:00:00Z",
    refresh_after_seconds: 30,
  };
}

test.describe("Portfolio progressive degradation", () => {
  test("keeps valuation visible when history fails and marks a missing quote unavailable", async ({ page }) => {
    let fastCalls = 0;
    let partial = false;
    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);
    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get("fast") === "true") {
        fastCalls += 1;
        const data = partial
          ? snapshot([position("RY", 200, 12, 122)])
          : snapshot();
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "X-Request-ID": "technical-reference" },
        body: JSON.stringify({ detail: "Une erreur interne temporaire est survenue" }),
      });
    });

    await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });
    const portfolioAlert = page.getByRole("alert").filter({
      hasText: "Certaines données du portefeuille sont temporairement indisponibles.",
    });
    await expect(portfolioAlert).toBeVisible();
    await expect(page.getByText("5 200,00 $", { exact: false })).toBeVisible();
    await expect(page.getByText("N/D", { exact: true }).first()).toBeVisible();
    await expect(portfolioAlert).not.toContainText("technical-reference");

    partial = true;
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect.poll(() => fastCalls).toBeGreaterThanOrEqual(2);
    const tdRow = page.getByRole("row").filter({ hasText: "TD" });
    await expect(tdRow.getByText("Données temporairement indisponibles")).toBeVisible();
    await expect(tdRow.getByText("N/D", { exact: true }).first()).toBeVisible();
    const ryRow = page.getByRole("row").filter({ hasText: "RY" });
    await expect(ryRow.getByText("200,00 $", { exact: false })).toBeVisible();
  });
});
