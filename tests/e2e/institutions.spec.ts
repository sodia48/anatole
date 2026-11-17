import { expect, test, type Page } from "@playwright/test";

const institution = {
  cik: "0001234567",
  name: "NORTH STAR ASSET MANAGEMENT",
  country: "Canada",
  report_period: "2026-06-30",
  filed_at: "2026-08-12",
  filing_url: "https://www.sec.gov/Archives/edgar/data/1234567/example-index.html",
  total_13f_value: 125_000_000_000,
  holdings_count: 320,
  previous_total_13f_value: 118_000_000_000,
  top10_concentration_percent: 31.4,
  new_positions_count: 12,
  increased_positions_count: 81,
  reduced_positions_count: 54,
  closed_positions_count: 8,
  comparison_available: true,
};

const source = {
  source: "SEC EDGAR — Form 13F-HR",
  status: "available",
  detail: "Official SEC filing and information table.",
  url: institution.filing_url,
  updated_at: "2026-08-12T16:00:00Z",
};

const flow = {
  ticker: "AAPL",
  cusip: "037833100",
  issuer: "APPLE INC",
  institutions_holding: 18,
  institutions_increased: 11,
  institutions_reduced: 4,
  institutions_new: 3,
  institutions_closed: 1,
  aggregate_share_change: 2_400_000,
  current_reported_value: 8_900_000_000,
  institution_names: [institution.name, "EXAMPLE CAPITAL"],
};

const snapshot = {
  institutions: [
    institution,
    {
      ...institution,
      cik: "0007654321",
      name: "EXAMPLE CAPITAL PARTNERS",
      country: "États-Unis",
      total_13f_value: 85_000_000_000,
      new_positions_count: 6,
    },
  ],
  top_increased: [flow],
  top_new: [flow],
  top_reduced: [flow],
  top_closed: [flow],
  report_period: "2026-06-30",
  previous_report_period: "2026-03-31",
  generated_at: "2026-08-12T16:00:00Z",
  extracted_at: "2026-08-12T15:00:00Z",
  validated_at: "2026-08-12T16:00:00Z",
  period_status: "published_dataset",
  institutions_reporting: 2,
  institutions_comparable: 1,
  sources: [source],
  stale: false,
  message: null,
};

const detail = {
  institution,
  holdings: [
    {
      cusip: "037833100",
      ticker: "AAPL",
      issuer: "APPLE INC",
      security_class: "COM",
      shares: 12_000_000,
      previous_shares: 10_000_000,
      share_change: 2_000_000,
      share_change_percent: 20,
      value: 2_250_000_000,
      portfolio_weight_percent: 18,
      previous_value: 1_800_000_000,
      put_call: null,
      status: "increased",
    },
    {
      cusip: "594918104",
      ticker: "MSFT",
      issuer: "MICROSOFT CORP",
      security_class: "COM",
      shares: 4_000_000,
      previous_shares: 0,
      share_change: 4_000_000,
      share_change_percent: null,
      value: 1_700_000_000,
      portfolio_weight_percent: 13.6,
      previous_value: 0,
      put_call: null,
      status: "new",
    },
  ],
  previous_report_period: "2026-03-31",
  source_statuses: [source],
  generated_at: "2026-08-12T16:00:00Z",
  stale: false,
  message: null,
};

const securityHoldings = {
  query: "037833100",
  report_period: "2026-06-30",
  total: 1,
  limit: 20,
  offset: 0,
  results: [{
    cik: institution.cik,
    institution_name: institution.name,
    filing_url: institution.filing_url,
    cusip: flow.cusip,
    ticker: flow.ticker,
    issuer: flow.issuer,
    security_class: "COM",
    put_call: null,
    shares: 12_000_000,
    previous_shares: 10_000_000,
    share_change: 2_000_000,
    value: 2_250_000_000,
    status: "increased",
  }],
};

async function mockInstitutionApi(page: Page): Promise<void> {
  await page.route("**/api/anatole/api/v1/discovery/institutions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/security/activity")) {
      await route.fulfill({ json: flow });
      return;
    }
    if (url.pathname.endsWith("/security/holdings")) {
      await route.fulfill({ json: securityHoldings });
      return;
    }
    if (url.pathname.endsWith(`/${institution.cik}`)) {
      await route.fulfill({ json: detail });
      return;
    }
    await route.fulfill({ json: snapshot });
  });
}

test.beforeEach(async ({ page }) => {
  await mockInstitutionApi(page);
});

test("classement, recherche, tri et radar Institutions", async ({ page }, testInfo) => {
  await page.goto("/institutions");
  await expect(page.getByRole("heading", { name: "Intelligence institutionnelle" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("institutions-overview.png"), fullPage: true });
  await expect(page.getByText(/Dernier trimestre complet : T2 2026/)).toBeVisible();
  await expect(page.getByText("1 comparables")).toBeVisible();
  await expect(page.getByText(/Données extraites le 12 août 2026/)).toBeVisible();
  await page.getByRole("button", { name: "Gestionnaires", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("institutions-managers.png"), fullPage: true });
  await expect(page.locator('a[href="/institutions/0001234567"]:visible').first()).toBeVisible();
  await page.getByLabel("Rechercher une institution").fill("North Star");
  await expect(page.locator('a[href="/institutions/0001234567"]:visible').first()).toBeVisible();
  await expect(page.locator('a[href="/institutions/0007654321"]:visible')).toHaveCount(0);
  await page.getByLabel("Trier les institutions").selectOption("new");
  await page.getByRole("button", { name: "Radar", exact: true }).click();
  await page.getByRole("tab", { name: "Nouvelles positions" }).click();
  await expect(page.getByText("APPLE INC", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Voir les déclarants" }).click();
  await expect(page.getByLabel("Ticker ou CUSIP")).toHaveValue("037833100");
  await page.getByRole("button", { name: "Consulter les déclarants" }).click();
  await expect(page.getByText("Positions déclarées")).toBeVisible();
  await expect(page.locator('a[href="/institutions/0001234567"]:visible')).toHaveCount(1);
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test("activité par titre et détail des positions", async ({ page }) => {
  await page.goto("/institutions");
  await page.getByRole("button", { name: "Titres", exact: true }).click();
  await page.getByLabel("Ticker ou CUSIP").fill("AAPL");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.getByText("Principaux déclarants :")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ouvrir Focus/ })).toHaveAttribute("href", "/focus/AAPL");
  await page.getByRole("button", { name: "Consulter les déclarants" }).click();
  await page.locator('a[href="/institutions/0001234567"]:visible').first().click();
  await expect(page).toHaveURL(/\/institutions\/0001234567$/);
  await expect(page.getByRole("heading", { name: institution.name })).toBeVisible();
  await expect(page.getByText("APPLE INC").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Nouvelle position" }).click();
  await expect(page.getByText("MICROSOFT CORP").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("APPLE INC").filter({ visible: true })).toHaveCount(0);
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test("classement complet paginé sur mobile et ordinateur", async ({ page }) => {
  const managers = Array.from({ length: 25 }, (_, index) => ({
    ...institution,
    cik: String(index + 1).padStart(10, "0"),
    name: `GESTIONNAIRE ${String(index + 1).padStart(2, "0")}`,
    total_13f_value: 125_000_000_000 - index * 1_000_000_000,
  }));
  await page.route("**/api/anatole/api/v1/discovery/institutions?**", async (route) => {
    await route.fulfill({ json: { ...snapshot, institutions: managers, institutions_reporting: 25 } });
  });
  await page.goto("/institutions");
  await page.getByRole("button", { name: "Gestionnaires", exact: true }).click();
  await expect(page.getByText("GESTIONNAIRE 01", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("GESTIONNAIRE 25", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(page.getByText("GESTIONNAIRE 25", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByLabel("Rechercher une institution").fill("GESTIONNAIRE 01");
  await expect(page.getByText("GESTIONNAIRE 01", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Précédent", exact: true })).toHaveCount(0);
});

test("la section Institutions suit la préférence anglaise", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
      theme: "dark",
      density: "comfortable",
      decimals: 2,
      defaultRange: "1y",
      defaultUniverse: "tsx60",
      language: "en",
    }));
  });
  await page.goto("/institutions");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
  await expect(page.getByRole("heading", { name: "Institutional intelligence" })).toBeVisible();
  await expect(page.getByText(/Share changes compare two quarterly 13F filings/)).toBeVisible();
});

test("la page Institutions conserve un contraste lisible avec Anatole Blanc", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
      theme: "blue",
      density: "comfortable",
      decimals: 2,
      defaultRange: "1y",
      defaultUniverse: "tsx60",
      language: "fr",
    }));
    localStorage.setItem("anatole.appearance-choice.v1", "1");
  });

  await page.goto("/institutions");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");

  const heading = page.getByRole("heading", { name: "Intelligence institutionnelle" });
  const metric = page.getByText("Valeur 13F déclarée", { exact: true }).locator("..").locator("strong");
  await page.getByRole("button", { name: "Gestionnaires", exact: true }).click();
  const ranking = page.getByRole("heading", { name: "Gestionnaires 13F" });

  await expect(heading).toHaveCSS("color", "rgb(8, 32, 51)");
  await expect(metric).toHaveCSS("color", "rgb(8, 32, 51)");
  await expect(ranking).toHaveCSS("color", "rgb(8, 32, 51)");
});
