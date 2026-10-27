import { expect, test } from "@playwright/test";

test.describe("Focus Pro workstation", () => {
  test("shows the selected stock's latest news below the price chart", async ({ page }, testInfo) => {
    const recentNewsDate = new Date(Date.now() - 30 * 60 * 1_000).toISOString();
    await page.route("**/api/anatole/api/v1/stocks/RY/fundamentals", (route) => route.fulfill({ json: {
      ticker: "RY.TO", symbol: "RY", name: "Royal Bank of Canada", exchange: "TSX",
      currency: "CAD", financial_currency: "CAD", website: null,
      sector: "Financials", industry: "Banks", status: "partial", message: null,
      stale: false, refresh_in_progress: false, metrics: {}, annual_financials: [], quarterly_financials: [],
      ttm: { period_end: "2026-09-30", currency: "CAD", total_revenue: null, gross_profit: null,
        operating_income: null, ebitda: null, net_income: null, diluted_eps: null,
        operating_cash_flow: null, capital_expenditure: null, free_cash_flow: null,
        dividends_paid: null, share_repurchases: null, total_cash: null, total_debt: null,
        net_debt: null, gross_margin: null, operating_margin: null, net_margin: null,
        free_cash_flow_margin: null },
      highlights: { latest_period_end: "2026-09-30", revenue_growth_yoy: null,
        operating_income_growth_yoy: null, net_income_growth_yoy: null, eps_growth_yoy: null,
        free_cash_flow_growth_yoy: null, three_year_revenue_cagr: null,
        three_year_net_income_cagr: null, three_year_free_cash_flow_cagr: null,
        cash_conversion_percent: null, net_debt_to_ebitda: null },
      earnings_history: [], earnings_estimates: [], analysts: {},
      events: { earnings_dates: [], ex_dividend_date: null, dividend_date: null },
      official_coverage: { status: "mixed", yahoo_statements_error: null },
      source: "E2E fixture", generated_at: recentNewsDate, refresh_after_seconds: 1800,
    } }));
    await page.route("**/api/anatole/api/v1/stocks/RY/news?**", (route) => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
      return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ticker: "RY",
        symbol: "RY.TO",
        company: "Royal Bank of Canada",
        items: Array.from({ length: 10 }, (_, index) => ({
          id: `royal-bank-news-${index}`,
          title: index === 0
            ? "Royal Bank of Canada announces a strategic investment"
            : `Royal Bank of Canada update ${index + 1}`,
          summary: index === 0
            ? "The bank announced a new strategic investment for its Canadian operations."
            : `Verified article summary ${index + 1}.`,
          url: `https://example.com/royal-bank-news-${index}`,
          publisher: "Canadian Business Wire",
          published_at: recentNewsDate,
          related_tickers: ["RY.TO", "RY"],
          image_url: index === 0 ? "https://images.example.com/royal-bank.jpg" : null,
        })).slice((pageNumber - 1) * 6, pageNumber * 6),
        total_items: 10, page: pageNumber, page_size: 6, has_more: pageNumber === 1,
        status: "ok",
        detail: null,
        generated_at: new Date().toISOString(),
        refresh_after_seconds: 900,
      }),
      });
    });
    await page.route("https://images.example.com/royal-bank.jpg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#143f68"/><path d="M0 520L380 260L690 460L1200 120V600H0Z" fill="#2d76ff"/><circle cx="970" cy="160" r="105" fill="#9fc8ff"/></svg>',
    }));
    await page.route("**/api/anatole/api/v1/discovery/news/brief", (route) => {
      const request = route.request().postDataJSON() as { title: string; summary: string };
      return route.fulfill({ json: {
        title: request.title, summary: request.summary, key_figures: [], changes: [],
        why_it_matters: "", watch: [], source_url: "https://example.com/royal-bank-news-0",
        source_name: "Canadian Business Wire", source_mode: "feed_summary",
        source_note: "Only the publisher's excerpt is available.",
        availability: "publisher_excerpt", source_language: "en", translation_status: "unavailable",
        relevance: "direct", detail_available: false, generated_at: recentNewsDate,
      } });
    });

    await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    const performance = page.getByRole("region", { name: "Performance du titre" });
    const stockNews = page.getByRole("region", { name: /Dernières nouvelles pour RY|Latest news for RY/i });
    await expect(performance).toBeVisible();
    await expect(stockNews).toBeVisible();
    const articleButtons = stockNews.getByRole("button", { name: /Lire l’analyse|Read analysis/ });
    await expect(articleButtons).toHaveCount(6);
    await stockNews.getByRole("button", { name: "Charger plus" }).click();
    await expect(articleButtons).toHaveCount(10);
    await expect(stockNews.getByText("10 événements")).toBeVisible();
    await expect(stockNews.getByText("Royal Bank of Canada announces a strategic investment")).toBeVisible();
    await expect(stockNews.getByText("The bank announced a new strategic investment for its Canadian operations.")).toBeVisible();
    await expect(stockNews.getByText("Canadian Business Wire").first()).toBeVisible();
    const valuation = page.locator('[data-focus-valuation="true"]');
    await expect(valuation).toBeVisible();
    const [performanceBox, valuationBox, stockNewsBox] = await Promise.all([performance.boundingBox(), valuation.boundingBox(), stockNews.boundingBox()]);
    expect(valuationBox?.y).toBeGreaterThan(performanceBox?.y ?? Number.POSITIVE_INFINITY);
    expect(stockNewsBox?.y).toBeGreaterThan(performanceBox?.y ?? Number.POSITIVE_INFINITY);
    expect(stockNewsBox?.y).toBeGreaterThan(valuationBox?.y ?? Number.POSITIVE_INFINITY);

    await articleButtons.first().click();
    const reader = page.getByRole("dialog", { name: "Royal Bank of Canada announces a strategic investment" });
    await expect(reader).toBeVisible();
    await expect(reader.getByRole("heading", { name: "Résumé" })).toBeVisible();
    await expect(reader.getByText("The bank announced a new strategic investment for its Canadian operations.")).toBeVisible();
    // A publisher image URL alone is not a verified republication licence.
    await expect(reader.locator("img")).toHaveCount(0);
    expect(await reader.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, color: style.color, opacity: style.opacity };
    })).toEqual({ background: "rgb(7, 21, 33)", color: "rgb(244, 249, 253)", opacity: "1" });
    await expect(reader.getByText("Only the publisher's excerpt is available.")).toBeVisible();
    await expect(reader.getByRole("link", { name: "Voir la source originale" })).toHaveAttribute("href", "https://example.com/royal-bank-news-0");
    await page.keyboard.press("Escape");
    await expect(reader).toHaveCount(0);

    await articleButtons.nth(1).click();
    const noImageReader = page.getByRole("dialog", { name: "Royal Bank of Canada update 2" });
    await expect(noImageReader).toBeVisible();
    await expect(noImageReader.locator("img")).toHaveCount(0);
    await noImageReader.getByRole("button", { name: "Fermer" }).click();

    await page.evaluate(() => {
      const preferences = JSON.parse(localStorage.getItem("anatole.preferences.v0.4") ?? "{}");
      localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({ ...preferences, language: "en", theme: "blue" }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    const englishNews = page.getByRole("region", { name: "Latest news for RY" });
    await expect(englishNews.getByText("Read analysis").first()).toBeVisible();
    await englishNews.getByRole("button", { name: /Read analysis/ }).first().click();
    const englishReader = page.getByRole("dialog", { name: "Royal Bank of Canada announces a strategic investment" });
    await expect(englishReader.getByRole("link", { name: "View original source" })).toBeVisible();
    expect(await englishReader.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, color: style.color, opacity: style.opacity };
    })).toEqual({ background: "rgb(255, 255, 255)", color: "rgb(7, 27, 44)", opacity: "1" });
    await page.screenshot({ path: testInfo.outputPath("focus-blue-english-reader.png") });
  });

  test("chart, indicators, drawings, layout and comparison", async ({ page }) => {
    await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    await expect(page.getByRole("region", { name: "Performance du titre" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1J", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "5J", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "1M", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "3A", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "MAX", exact: true })).toBeVisible();
    await expect(page.getByText(/Variation du cours seul, sans dividendes/)).toBeVisible();
    const volumePanel = page.getByRole("complementary", { name: /Volume échangé/i });
    await expect(volumePanel).toBeVisible();
    await expect(volumePanel.getByText(/Somme des volumes des bougies disponibles/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Focus Pro chart" })).toHaveCount(0);

    const oneWeekRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/stocks/RY/focus")
        && url.searchParams.get("range") === "5d"
        && url.searchParams.get("interval") === "5m";
    });
    await Promise.all([
      oneWeekRequest,
      page.getByRole("button", { name: "5J", exact: true }).click(),
    ]);
    await expect(page.getByRole("button", { name: "5J", exact: true })).toHaveAttribute("aria-pressed", "true");

    const oneMonthRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/stocks/RY/focus")
        && url.searchParams.get("range") === "1mo"
        && url.searchParams.get("interval") === "1d";
    });
    await Promise.all([
      oneMonthRequest,
      page.getByRole("button", { name: "1M", exact: true }).click(),
    ]);
    await expect(page.getByRole("button", { name: "1M", exact: true })).toHaveAttribute("aria-pressed", "true");

    const threeYearRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/stocks/RY/focus")
        && url.searchParams.get("range") === "5y"
        && url.searchParams.get("interval") === "1wk";
    });
    await Promise.all([threeYearRequest, page.getByRole("button", { name: "3A", exact: true }).click()]);
    await expect(page.getByRole("button", { name: "3A", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "RY · 3A" })).toBeVisible();

    await page.getByRole("button", { name: /Workstation pro|Pro workstation/i }).click();
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
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: /Workstation pro|Pro workstation/i }).click();
    await expect(page.getByText("1/50")).toBeVisible();
  });

  test("alerts, fundamental markers and backtest", async ({ page }) => {
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
    await page.getByRole("button", { name: /Workstation pro|Pro workstation/i }).click();
    await expect(page.getByRole("region", { name: "Focus Pro chart" })).toBeVisible();

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
  });

  test("workstation switches language after preferences reload", async ({ page }) => {
    await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: /Workstation pro|Pro workstation/i }).click();
    await expect(page.getByRole("region", { name: "Focus Pro chart" })).toBeVisible();
    await expect(page.getByText(/POSTE PROFESSIONNEL/).first()).toBeVisible();

    await page.evaluate(() => {
      const preferences = JSON.parse(localStorage.getItem("anatole.preferences.v0.4") ?? "{}");
      localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({ ...preferences, language: "en" }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: /Workstation pro|Pro workstation/i }).click();
    await expect(page.getByText(/PROFESSIONAL CHART/).first()).toBeVisible();
  });

  test("authenticated PAPER order remains simulated and account-linked", async ({ page }, testInfo) => {
    const email = `focus-paper-${testInfo.project.name.replace(/[^a-z0-9]/gi, "-")}-${crypto.randomUUID()}@example.com`;
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
    await page.getByRole("button", { name: /Workstation pro|Pro workstation/i }).click();
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
