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
      top_position_percent: 38.28,
      top_three_percent: 88.03,
      diversification_score: 55.4,
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

function historicalSnapshot() {
  const data = snapshot();
  const performance = Array.from({ length: 252 }, (_, index) => ({
    time: 1_746_057_600 + index * 86_400,
    portfolio: 100 + index * 0.05,
    benchmark: 100 + index * 0.04,
  }));
  return {
    ...data,
    portfolio_score: 61.7,
    performance,
    performance_horizons: [
      { horizon: "1d", return_percent: 0.5, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "observed_day" },
      { horizon: "1w", return_percent: 1.2, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "current_positions_reconstructed" },
      { horizon: "1m", return_percent: 3.4, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "current_positions_reconstructed" },
      { horizon: "3m", return_percent: 6.8, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "current_positions_reconstructed" },
      { horizon: "ytd", return_percent: 9.1, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "current_positions_reconstructed" },
      { horizon: "1y", return_percent: 12.5, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "current_positions_reconstructed" },
    ],
    contribution_horizons: [
      {
        horizon: "1d",
        coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 },
        methodology: "observed_day",
        items: [
          { symbol: "RY", contribution_percent: 0.28, security_return_percent: 0.8, current_weight_percent: 38.3 },
          { symbol: "TD", contribution_percent: 0.14, security_return_percent: 0.5, current_weight_percent: 28.7 },
          { symbol: "XIC", contribution_percent: 0.08, security_return_percent: 0.3, current_weight_percent: 33.0 },
        ],
      },
    ],
    correlation: {
      symbols: ["RY", "TD", "XIC"],
      values: [[1, 0.72, 0.64], [0.72, 1, 0.58], [0.64, 0.58, 1]],
      observations: [[251, 251, 251], [251, 251, 251], [251, 251, 251]],
      average_correlation: 0.65,
      highest_pair: ["RY", "TD", 0.72],
      lowest_pair: ["TD", "XIC", 0.58],
      minimum_observations: 40,
    },
    stress_tests: [
      { key: "tsx", label: "TSX -5 %", shock: -5, shock_unit: "percent", estimated_portfolio_change_percent: -4.1, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "historical sensitivity" },
      { key: "wti", label: "WTI -10 %", shock: -10, shock_unit: "percent", estimated_portfolio_change_percent: -1.2, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "historical sensitivity" },
      { key: "cad_usd", label: "CAD/USD +5 %", shock: 5, shock_unit: "percent", estimated_portfolio_change_percent: 0.6, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "historical sensitivity" },
      { key: "canada_10y", label: "Canada 10 ans +50 pdb", shock: 50, shock_unit: "basis_points", estimated_portfolio_change_percent: -0.7, coverage: { symbols_expected: 3, symbols_available: 3, coverage_percent: 100 }, methodology: "historical sensitivity" },
    ],
    risk_reading: [
      "67.0 % du portefeuille est concentré dans le secteur Financials.",
      "Les trois principales positions représentent 100.0 %.",
      "RY et TD présentent une corrélation récente de 0.72, calculée sur des rendements quotidiens partagés.",
    ],
    methodology: "Les horizons supérieurs à un jour reconstituent la performance des positions actuelles en supposant les quantités constantes.",
    risk: {
      ...data.risk,
      volatility_percent: 15.8,
      beta: 0.89,
      max_drawdown_percent: -8.75,
      sharpe_ratio: 1.94,
      risk_level: "Faible",
      history_coverage_percent: 100,
      history_observations: 251,
    },
  };
}

test.describe("Portfolio progressive degradation", () => {
  test("keeps valuation visible when history fails and retries the full snapshot directly", async ({ page }) => {
    let fastCalls = 0;
    let fullCalls = 0;
    let fullReady = false;
    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);
    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get("fast") === "true") {
        fastCalls += 1;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot()) });
        return;
      }
      fullCalls += 1;
      if (fullReady) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(historicalSnapshot()) });
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
      hasText: "Certaines données historiques du portefeuille sont temporairement indisponibles.",
    });
    await expect(portfolioAlert).toBeVisible();
    await expect(page.getByText("5 200,00 $", { exact: false })).toBeVisible();
    await expect(page.getByText("N/D", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Historique du portefeuille temporairement indisponible.")).toBeVisible();
    await expect(portfolioAlert).not.toContainText("technical-reference");

    fullReady = true;
    const fullCallsBeforeRetry = fullCalls;
    await portfolioAlert.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByRole("img", { name: "Performance du portefeuille et du TSX Composite" })).toBeVisible();
    expect(fastCalls).toBe(1);
    expect(fullCalls).toBe(fullCallsBeforeRetry + 1);
  });

  test("does not restart a full snapshot for unchanged account sync events", async ({ page }) => {
    let fastCalls = 0;
    let fullCalls = 0;
    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);
    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get("fast") === "true") {
        fastCalls += 1;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot()) });
        return;
      }
      fullCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(historicalSnapshot()) });
    });

    await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });
    await expect.poll(() => fullCalls).toBe(1);
    for (let index = 0; index < 3; index += 1) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("anatole-workspace-sync-applied")));
      await page.waitForTimeout(150);
    }

    await expect(page.getByRole("img", { name: "Performance du portefeuille et du TSX Composite" })).toBeVisible();
    expect(fastCalls).toBe(1);
    expect(fullCalls).toBe(1);
  });

  test("renders portfolio and benchmark curves and clears historical errors", async ({ page }) => {
    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);
    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const data = requestUrl.searchParams.get("fast") === "true"
        ? snapshot()
        : historicalSnapshot();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });

    await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });
    const chart = page.getByRole("img", { name: "Performance du portefeuille et du TSX Composite" });
    await expect(chart).toBeVisible();
    await expect(chart.locator("path")).toHaveCount(2);
    await expect(chart.locator("path").first()).toHaveAttribute("d", /L/);
    await expect(chart.locator("path").nth(1)).toHaveAttribute("d", /L/);
    await expect(page.getByText("15.8 %", { exact: true })).toBeVisible();
    await expect(page.getByText("0.89", { exact: true })).toBeVisible();
    await expect(page.getByText("-8.8 %", { exact: true })).toBeVisible();
    await expect(page.getByText("1.94", { exact: true })).toBeVisible();
    await expect(page.getByText("61.7", { exact: true })).toBeVisible();
    await expect(page.getByText("+12.5 %", { exact: true })).toBeVisible();
    await expect(page.getByText("Diversification 55.4/100", { exact: true })).toBeVisible();
    await expect(page.getByText("Certaines données historiques du portefeuille sont temporairement indisponibles.")).toHaveCount(0);
  });

  test("keeps the portfolio curve when the benchmark history is unavailable", async ({ page }) => {
    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);
    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const data = requestUrl.searchParams.get("fast") === "true"
        ? snapshot()
        : {
            ...historicalSnapshot(),
            performance: historicalSnapshot().performance.map((point) => ({
              ...point,
              benchmark: null,
            })),
          };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });

    await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });
    const chart = page.getByRole("img", { name: "Performance du portefeuille et du TSX Composite" });
    await expect(chart.locator("path").first()).toHaveAttribute("d", /L/);
    await expect(chart.locator("path").nth(1)).toHaveAttribute("d", "");
    await expect(page.getByText("La courbe du portefeuille reste disponible; l’historique du TSX Composite est temporairement indisponible.")).toBeVisible();
  });

  test("switches performance benchmark on demand without slowing the default TSX view", async ({ page }) => {
    let performanceCalls = 0;
    let lastPerformanceBody: Record<string, unknown> | null = null;

    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);

    await page.route("**/api/anatole/api/v1/workspace/portfolio/performance", async (route) => {
      performanceCalls += 1;
      lastPerformanceBody = route.request().postDataJSON() as Record<string, unknown>;
      const points = Array.from({ length: 25 }, (_, index) => ({
        time: 1_777_000_000 + index * 86_400,
        portfolio: 100 + index * 0.3,
        benchmark: 100 + index * 0.2,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          range: "1y",
          range_label: "1 an",
          benchmark: "^GSPC",
          benchmark_name: "S&P 500",
          points,
          portfolio_return_percent: 7.2,
          benchmark_return_percent: 4.8,
          excess_return_percent: 2.4,
          coverage_percent: 100,
          methodology: "Current-weight reconstruction.",
          generated_at: "2026-09-22T18:00:00Z",
          refresh_after_seconds: 300,
        }),
      });
    });

    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname.endsWith("/portfolio/performance")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          requestUrl.searchParams.get("fast") === "true"
            ? snapshot()
            : historicalSnapshot(),
        ),
      });
    });

    await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Portefeuille vs S&P/TSX Composite" })).toBeVisible();
    expect(performanceCalls).toBe(0);

    await page.getByLabel("Benchmark de performance").selectOption("^GSPC");

    await expect.poll(() => performanceCalls).toBe(1);
    await expect(page.getByRole("heading", { name: "Portefeuille vs S&P 500" })).toBeVisible();
    await expect(page.getByText("+7.20 %", { exact: true })).toBeVisible();
    await expect(page.getByText("+2.40 %", { exact: true })).toBeVisible();

    expect(lastPerformanceBody).toMatchObject({
      benchmark: "^GSPC",
      range: "1y",
    });
  });


  test("supports 5-year, 10-year and dated MAX performance horizons", async ({ page }) => {
    const requestedRanges: string[] = [];

    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);

    await page.route("**/api/anatole/api/v1/workspace/portfolio/performance", async (route) => {
      const body = route.request().postDataJSON() as { range: string; benchmark: string };
      requestedRanges.push(body.range);

      const start = body.range === "max"
        ? Date.UTC(1998, 0, 2) / 1000
        : Date.UTC(2016, 0, 2) / 1000;
      const points = Array.from({ length: 40 }, (_, index) => ({
        time: start + index * 31 * 86_400,
        portfolio: 100 + index * 0.4,
        benchmark: 100 + index * 0.25,
      }));

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          range: body.range,
          range_label: body.range,
          benchmark: body.benchmark,
          benchmark_name: "S&P/TSX Composite",
          points,
          portfolio_return_percent: 15.6,
          benchmark_return_percent: 9.75,
          excess_return_percent: 5.85,
          coverage_percent: 100,
          methodology: "Performance reconstituée.",
          generated_at: "2026-09-22T22:00:00Z",
          refresh_after_seconds: 300,
        }),
      });
    });

    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname.endsWith("/portfolio/performance")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          requestUrl.searchParams.get("fast") === "true"
            ? snapshot()
            : historicalSnapshot(),
        ),
      });
    });

    await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "5A", exact: true }).click();
    await expect.poll(() => requestedRanges).toContain("5y");

    await page.getByRole("button", { name: "10A", exact: true }).click();
    await expect.poll(() => requestedRanges).toContain("10y");

    await page.getByRole("button", { name: "MAX", exact: true }).click();
    await expect.poll(() => requestedRanges).toContain("max");
    await expect(page.getByText("MAX : depuis 1998", { exact: true })).toBeVisible();
  });

  test("shows advanced portfolio intelligence without extra network calls when switching tabs", async ({ page }) => {
    let fullCalls = 0;
    await page.addInitScript((saved) => {
      localStorage.setItem("anatole:portfolio:v1", JSON.stringify(saved));
      localStorage.setItem("anatole.appearance-choice.v1", "1");
    }, positions);

    await page.route("**/api/anatole/api/v1/workspace/portfolio**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get("fast") === "true") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot()) });
        return;
      }
      fullCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(historicalSnapshot()) });
    });

    await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });

    const intelligence = page.getByTestId("portfolio-intelligence");
    await expect(intelligence).toBeVisible();
    await expect(intelligence.getByRole("heading", { name: "Intelligence du portefeuille" })).toBeVisible();
    const oneYearReturn = intelligence.getByText("+12.50 %", { exact: true });
    await expect(oneYearReturn).toHaveCount(2);
    await expect(oneYearReturn.first()).toBeVisible();

    await intelligence.getByRole("tab", { name: "Contribution" }).click();
    await expect(intelligence.getByText("+0.28 %", { exact: true })).toBeVisible();

    await intelligence.getByRole("tab", { name: "Corrélations" }).click();
    await expect(intelligence.getByText("RY / TD", { exact: true })).toBeVisible();
    await expect(intelligence.getByText("0.65", { exact: true })).toBeVisible();

    await intelligence.getByRole("tab", { name: "Stress tests" }).click();
    await expect(intelligence.getByText("TSX -5 %", { exact: true })).toBeVisible();
    await expect(intelligence.getByText("-4.10 %", { exact: true })).toBeVisible();

    expect(fullCalls).toBe(1);
  });

});
