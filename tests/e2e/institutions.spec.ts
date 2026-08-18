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

async function mockInstitutionApi(page: Page): Promise<void> {
  await page.route("**/api/anatole/api/v1/discovery/institutions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/security/activity")) {
      await route.fulfill({ json: flow });
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

test("classement, recherche, tri et radar Institutions", async ({ page }) => {
  await page.goto("/institutions");
  await expect(page.getByRole("heading", { name: /Suivre les grands gestionnaires/i })).toBeVisible();
  await expect(page.locator('a[href="/institutions/0001234567"]:visible').first()).toBeVisible();
  await page.getByLabel("Rechercher une institution").fill("North Star");
  await expect(page.locator('a[href="/institutions/0001234567"]:visible').first()).toBeVisible();
  await expect(page.locator('a[href="/institutions/0007654321"]:visible')).toHaveCount(0);
  await page.getByLabel("Trier les institutions").selectOption("new");
  await page.getByRole("tab", { name: "Nouvelles positions" }).click();
  await expect(page.getByText("APPLE INC", { exact: true }).last()).toBeVisible();
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test("activité par titre et détail des positions", async ({ page }) => {
  await page.goto("/institutions");
  await page.getByLabel("Ticker ou CUSIP").fill("AAPL");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.getByText("Principaux déclarants :")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ouvrir Focus/ })).toHaveAttribute("href", "/focus/AAPL");
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
  await expect(page.getByRole("heading", { name: /Track major institutional managers/ })).toBeVisible();
  await expect(page.getByText(/Changes are inferred by comparing quarterly 13F filings/)).toBeVisible();
});
