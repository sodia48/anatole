import { expect, test } from "@playwright/test";

const source = "https://www.bankofcanada.ca/rates/interest-rates/canadian-bonds/";
const asOf = "2026-10-07T00:00:00Z";
const quality = { scope: "federal_curve", status: "full", source, observed_at: asOf,
  freshness: "delayed", coverage: "6/6 benchmark tenors" };
const point = (tenor: string, latest: number, previous: number) => ({
  official_series_id: `BD.CDN.${tenor}.DQ.YLD`, label: tenor, tenor, latest, previous,
  bp_change: Math.round((latest - previous) * 100), observed_at: asOf, source_url: source, freshness: "delayed",
});
const curve = { points: [point("2Y", 3.23, 3.20), point("3Y", 3.34, 3.33), point("5Y", 3.60, 3.59),
  point("7Y", 3.69, 3.67), point("10Y", 3.94, 3.92), point("Long", 4.30, 4.28)],
  marketable_averages: [point("1-3Y", 3.22, 3.20), point("3-5Y", 3.53, 3.50),
    point("5-10Y", 3.78, 3.76), point(">10Y", 4.22, 4.20)],
  spread_2s10s_bps: 71, spread_2s5s_bps: 37, spread_5s_long_bps: 70, spread_10s_long_bps: 36,
  policy_rate: point("Policy", 2.25, 2.25), real_long_yield: point("Real Long", 1.98, 1.97),
  curve_shape: "normal", generated_at: asOf, source: "Bank of Canada Valet",
  debt_management_url: "https://www.canada.ca/en/department-finance/services/publications/debt-management.html", quality };
const issue = { issuer_level: "municipal", issuer: "City of Toronto", jurisdiction: "ON", city: "Toronto",
  cusip: "891288DM1", maturity_date: "2036-06-02", settlement_date: "2026-03-11", coupon_percent: 3.5,
  issue_amount: 350000000, currency: "CAD", outstanding_amount: 1100000000, bond_type: null,
  official_url: "https://www.toronto.ca/city-government/budget-finances/city-finance/investor-relations/recently-settled-bond-issues/",
  yield_percent: null, spread_to_canada_bps: null };
const provinceQuality = { scope: "province_profiles", status: "limited", source: null,
  observed_at: null, freshness: "unavailable", coverage: "Official issuer links only" };
const provinces = [
  { code: "QC", name: "Québec", issuer: "Gouvernement du Québec", coverage: "limited",
    borrowing_program_amount: null, fiscal_year: null, debt_outstanding: null, average_term: null,
    green_social_sustainable_program: null, recent_issues: [],
    source_urls: ["https://www.finances.gouv.qc.ca/investor_relations/"], quality: provinceQuality },
  { code: "ON", name: "Ontario", issuer: "Province of Ontario", coverage: "partial",
    borrowing_program_amount: 46200000000, fiscal_year: "2026-27", debt_outstanding: null, average_term: null,
    green_social_sustainable_program: "Ontario Sustainable Bonds", recent_issues: [],
    source_urls: ["https://www.ofina.on.ca/borrowing_debt/borrowing.htm"], quality: provinceQuality },
];
const municipalities = [
  { slug: "toronto", city: "Toronto", province: "ON", coverage: "partial", debt_outstanding: null,
    borrowing_program_amount: null, green_social_sustainable_program: "Green, social and sustainable debenture programs",
    recent_issues: [issue], source_urls: [issue.official_url], quality: { ...provinceQuality, scope: "municipal_issues" } },
  { slug: "montreal", city: "Montréal", province: "QC", coverage: "limited", debt_outstanding: null,
    borrowing_program_amount: null, green_social_sustainable_program: null, recent_issues: [],
    source_urls: ["https://montreal.ca/sujets/politiques-financieres"], quality: { ...provinceQuality, scope: "municipal_issues" } },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/anatole/api/v1/fixed-income/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/canada/curve") ? curve : path.endsWith("/canada/history")
      ? { period: "1M", observations: [{ observed_at: "2026-10-07", yields_percent: { "2Y": 3.23, "5Y": 3.60, "10Y": 3.94, Long: 4.30 } }], source_url: source, quality }
      : path.endsWith("/provinces") ? provinces : path.endsWith("/municipalities") ? municipalities : {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
});

test("Cockpit place Taux Canada après les secteurs et avant le statut", async ({ page }) => {
  const tile = { ticker: "RY", symbol: "RY", name: "Royal Bank", sector: "Financials", weight: 100,
    price: 150, change: 1, change_percent: 0.7, volume: 10000, timestamp: asOf, source: "fixture", delayed: true };
  await page.route("**/api/anatole/api/v1/market/cockpit?**", async (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ universe: "S&P/TSX 60", universe_as_of: "2026-10-07",
      universe_source: "Fixture", weighted_change_percent: 0.7, breadth: { advancers: 1, decliners: 0, unchanged: 0, advance_ratio: 100 },
      sectors: [{ sector: "Financials", weight: 100, change_percent: 0.7, advancers: 1, decliners: 0, unchanged: 0 }],
      constituents: [tile], top_gainers: [tile], top_losers: [], generated_at: asOf, refresh_after_seconds: 60 }) }));
  await page.goto("/cockpit", { waitUntil: "domcontentloaded" });
  const card = page.getByRole("region", { name: "Taux Canada" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("2Y");
  await expect(card).toContainText("5Y");
  await expect(card).toContainText("10Y");
  await expect(card).toContainText("Long");
  await expect(card).toContainText("+3 pb");
  await expect(card.getByRole("link", { name: /Voir Taux & Obligations/ })).toHaveAttribute("href", "/taux-obligations");
  await expect(page.getByLabel(/Carte du marché S&P\/TSX 60/)).toBeVisible();
  expect(await page.evaluate(() => {
    const sectors = document.querySelector(".cockpit-lower-grid");
    const rates = document.querySelector(".canada-rates-card");
    const footer = document.querySelector(".status-footer");
    return Boolean(sectors && rates && footer &&
      sectors.compareDocumentPosition(rates) & Node.DOCUMENT_POSITION_FOLLOWING &&
      rates.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(width[0]).toBeLessThanOrEqual(width[1] + 1);
});

test("hub affiche la courbe, les profils officiels et les émissions sans faux rendement", async ({ page }) => {
  await page.goto("/taux-obligations", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Courbe de référence du Canada" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.language = "en"; });
  await expect(page.getByRole("heading", { name: "Government of Canada benchmark curve" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.language = "fr"; });
  await expect(page.getByText(/2s10s/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Gestion de la dette fédérale/ })).toHaveAttribute("href", /canada\.ca/);
  await page.getByRole("link", { name: "Provinces" }).click();
  await expect(page.getByRole("heading", { name: /Québec/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Ontario/ })).toBeVisible();
  await expect(page.getByText(/source de marché non configurée/)).toBeVisible();
  await page.getByRole("link", { name: "Municipalités" }).click();
  await expect(page.getByRole("heading", { name: /Toronto/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Montréal/ })).toBeVisible();
  await page.getByRole("link", { name: "Émissions" }).click();
  await page.getByRole("textbox", { name: "Search an issue" }).fill("Toronto 2036");
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page).toHaveURL(/query=Toronto(\+|%20)2036/);
  await expect(page.getByText(/Le coupon n’est pas un rendement de marché/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Rendement marché" })).toBeVisible();
});

test("Assistant explique la courbe et renvoie au hub", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => route.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ intent: "fixed_income", title: "Taux & Obligations",
      answer: "## Courbe du Canada\n- 10Y : 3,94 %.", facts: [], links: [], sources: [{ label: "Banque du Canada", detail: source, status: "delayed" }],
      suggestions: [], confidence: "moyenne", disclaimer: "Analyse éducative", guardrail_triggered: false,
      generated_at: asOf, conversation_id: "ba809b54-1d09-4cef-bb4b-bc3afae9175c", context: {},
      actions: [{ label: "Voir Taux & Obligations", href: "/taux-obligations", kind: "navigate" }],
      evidence: [{ skill: "fixed_income", sources: [{ label: "Banque du Canada", type: "government", freshness: "delayed", timestamp: asOf, url: source }], missing_data: [], limitations: [] }],
      permission_required: false }) }));
  await page.goto("/taux-obligations", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Object.keys(document.querySelector('button[aria-label="Ouvrir Anatole Assistant"]') ?? {}).some((key) => key.startsWith("__reactFiber")));
  await page.getByRole("button", { name: "Ouvrir Anatole Assistant" }).click();
  await page.getByLabel("Votre question").fill("Quelle est la courbe des taux canadienne ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  const dialog = page.getByRole("dialog", { name: "Anatole Assistant" });
  await expect(dialog.getByRole("heading", { name: "Courbe du Canada" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Voir Taux & Obligations/ })).toHaveAttribute("href", "/taux-obligations");
});
