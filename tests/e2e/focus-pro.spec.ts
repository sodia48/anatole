import { expect, test } from "@playwright/test";

test.describe("Focus Pro workstation", () => {
  test("chart, indicators, drawings, layout, comparison, markers, alerts and backtest", async ({ page }) => {
    const visibleEarningsDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000).toISOString();
    await page.route("**/api/anatole/api/v1/stocks/RY/fundamentals", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ticker: "RY",
        source: "E2E official fixture",
        quarterly_financials: [],
        events: {
          earnings_dates: [visibleEarningsDate],
          ex_dividend_date: null,
          dividend_date: null,
        },
        metrics: { dividend_rate: null, dividend_yield: null },
      }),
    }));
    await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    await expect(page.getByRole("region", { name: "Focus Pro chart" })).toBeVisible();
    await expect(page.getByText(/FOCUS PRO/).first()).toBeVisible();

    const chartType = page.getByLabel(/Type de graphique|Chart type/i);
    await chartType.selectOption("line");
    await expect(chartType).toHaveValue("line");
    await page.getByLabel(/Unité de temps|Timeframe/i).selectOption("4h");
    await expect(page.getByRole("heading", { name: /RY.*4h/i })).toBeVisible();

    await page.getByRole("button", { name: /Indicateurs|Indicators/i }).click();
    const indicators = page.getByRole("region", { name: /Panneau des indicateurs|Indicator panel/i });
    await expect(indicators).toBeVisible();
    await indicators.getByRole("button", { name: /Ajouter|Add/i }).click();
    await expect(indicators.getByText("4/20")).toBeVisible();
    await indicators.getByRole("button", { name: /Fermer|Close/i }).click();

    await page.getByRole("button", { name: /Comparer|Compare/i }).click();
    const comparisons = page.getByRole("region", { name: /Comparaisons|Comparisons/i });
    await comparisons.getByRole("button", { name: /TSX 60/i }).click();
    await expect(comparisons.getByText("XIU", { exact: true })).toBeVisible();
    await comparisons.getByRole("button", { name: /Fermer|Close/i }).click();

    await page.getByRole("button", { name: /Horizontale|Horizontal line/i }).click();
    const drawingSurface = page.getByLabel("Surface de dessin Focus Pro");
    await drawingSurface.click({ position: { x: 180, y: 180 } });
    await expect(page.getByText("1/50")).toBeVisible();
    await page.getByRole("button", { name: /Annuler|Undo/i }).click();
    await expect(page.getByText("0/50")).toBeVisible();
    await page.getByRole("button", { name: /Rétablir|Redo/i }).click();
    await expect(page.getByText("1/50")).toBeVisible();
    await page.getByRole("button", { name: /Sauvegarder le layout|Save layout/i }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("1/50")).toBeVisible();

    await page.getByRole("button", { name: /^Alerte$|^Alert$/i }).click();
    await page.getByRole("button", { name: /Ajouter aux alertes|Add to alerts/i }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("anatole:alerts:v1") ?? "[]").length)).toBeGreaterThan(0);

    await page.getByRole("button", { name: /Afficher les événements fondamentaux|Show fundamental events/i }).click();
    await expect(page.getByText(/1.*marqueurs|1.*markers/i)).toBeVisible();
    await page.getByRole("button", { name: /^E\b/ }).click();
    await expect(page.getByText(/E2E official fixture/)).toBeVisible();

    const backtest = page.getByRole("region", { name: "Backtest" });
    await backtest.getByRole("button", { name: /Exécuter|Run/i }).click();
    await expect(backtest.getByText(/Résultat net|Net profit/i)).toBeVisible({ timeout: 45_000 });

    await page.evaluate(() => {
      const preferences = JSON.parse(localStorage.getItem("anatole.preferences.v0.4") ?? "{}");
      localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({ ...preferences, language: "en" }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/PROFESSIONAL CHART/).first()).toBeVisible();
  });

  test("authenticated PAPER order remains simulated and account-linked", async ({ page }, testInfo) => {
    const email = `focus-paper-${testInfo.project.name.replace(/[^a-z0-9]/gi, "-")}-${testInfo.retry}@example.com`;
    const registration = await page.request.post("/api/account/register", {
      data: {
        email,
        password: "Anatole2026!",
        display_name: "Focus Paper",
        accepted_terms: true,
        accepted_privacy: true,
      },
    });
    expect(registration.status()).toBe(201);
    await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    await expect(page.getByRole("region", { name: "Focus Pro chart" })).toBeVisible();
    await page.getByRole("navigation", { name: "Focus Pro toolbar" }).getByRole("button", { name: "PAPER", exact: true }).click();
    const ticket = page.getByRole("region", { name: "Paper trading ticket" });
    await expect(ticket).toBeVisible();
    await expect(ticket.getByText("Equity", { exact: true })).toBeVisible();
    await ticket.getByLabel(/Quantité|Quantity/i).fill("2");
    await ticket.getByRole("button", { name: /Prévisualiser|Preview/i }).click();
    await expect(ticket.getByText(/aucune exécution réelle|no real execution/i)).toBeVisible();
    await ticket.getByRole("button", { name: /Acheter — PAPER|Buy — PAPER/i }).click();
    await expect(ticket.getByText(/Ordre soumis|Order submitted/i)).toBeVisible();
    await expect(ticket.getByText(/BUY 2 RY/)).toBeVisible();
  });
});
