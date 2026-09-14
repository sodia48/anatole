import { expect, test } from "@playwright/test";

function trade(overrides: Record<string, unknown> = {}) {
  return {
    id: "shop-lutke-2026-09-09",
    ticker: "SHOP",
    company: "Shopify",
    market: "Canada",
    insider_name: "Lutke (Tobias Albin)",
    role: "CEO",
    transaction_type: "sell",
    transaction_label: "Vente au marché",
    transaction_code: "S",
    trade_date: "2026-09-09",
    filing_date: "2026-09-09",
    shares: 15_000,
    price: 129,
    price_currency: "USD",
    value: 1_935_000,
    value_currency: "USD",
    currency_source: "source",
    price_type: "market",
    classification_source: "provider_code",
    price_validation: "verified",
    price_validation_detail: "Prix cohérent avec SHOP (USD).",
    market_price_ranges: [
      { listing: "SHOP.TO", currency: "CAD", low: 174, high: 180 },
      { listing: "SHOP", currency: "USD", low: 127, high: 131 },
    ],
    holdings_after: 1_000_000,
    ownership: "Direct",
    unusual: true,
    source_name: "Finnhub — données d’initiés canadiennes",
    source_url: "https://finnhub.io/docs/api/insider-transactions",
    official_verification_url: "https://www.sedi.ca/",
    official_source: false,
    regulatory_source_name: "SEDI",
    ...overrides,
  };
}

test("insider prices always show their currency or explicit uncertainty", async ({ page }) => {
  const trades = [
    trade(),
    trade({
      id: "td-unknown-currency",
      ticker: "TD",
      company: "Toronto-Dominion Bank",
      insider_name: "Jane Doe",
      shares: 100,
      value: 12_900,
      price_currency: null,
      value_currency: null,
      currency_source: "unknown",
      price_validation: "unavailable",
      price_validation_detail: null,
      market_price_ranges: [],
    }),
  ];
  await page.route("**/api/anatole/api/v1/discovery/insiders**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      trades,
      summary: {
        transactions: 2,
        companies: 2,
        buys: 0,
        sells: 2,
        grants_and_exercises: 0,
        buy_value: 0,
        sell_value: 1_947_900,
        net_value: -1_947_900,
        buy_value_currency: null,
        sell_value_currency: null,
        net_value_currency: null,
        buy_ratio_percent: 0,
        unusual_transactions: 1,
      },
      sources: [],
      market: "Canada",
      requested_ticker: null,
      scanned_symbols: 2,
      generated_at: "2026-09-09T12:00:00Z",
      refresh_after_seconds: 900,
      message: null,
    }),
  }));
  await page.route("**/api/anatole/api/v1/discovery/ipo**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [],
      summary: { total: 0, canada: 0, united_states: 0, companies: 0, newly_listed: 0, regulatory_filings: 0 },
      sources: [],
      generated_at: "2026-09-09T12:00:00Z",
      refresh_after_seconds: 1800,
      message: null,
    }),
  }));

  await page.goto("/ipo-insiders", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Initiés Achats, ventes/i }).click();
  await expect(page.getByRole("heading", { name: /Mouvements récents/ })).toBeVisible();

  await expect(page.getByText(/129,00\s*USD/).first()).toBeVisible();
  await expect(page.getByText(/1,94\s*M\s*USD/).first()).toBeVisible();
  await expect(page.getByText(/129,00 — devise non fournie/).first()).toBeVisible();
  await expect(page.getByText(/9 sept\. 2026/).first()).toBeVisible();
  await expect(page.getByText(/8 sept\. 2026/)).toHaveCount(0);
  await expect(page.getByText(/^129\s*\$$/)).toHaveCount(0);
  await page.getByText("Détails de la transaction").first().click();
  await expect(page.getByText(/SHOP\.TO: 174\.00–180\.00 CAD/)).toBeVisible();
  await expect(page.getByText(/SHOP: 127\.00–131\.00 USD/)).toBeVisible();
  await expect(page.getByText("Prix cohérent avec SHOP (USD).")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "MARCHÉ" }).locator("option:checked"))
    .toHaveText(/Canada — Initiés \(fournisseurs · vérification SEDI\)/);
});
