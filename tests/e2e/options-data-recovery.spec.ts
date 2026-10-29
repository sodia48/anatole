import { expect, test } from "@playwright/test";

test("commodity selection stays responsive and ignores an obsolete chain", async ({ page }, testInfo) => {
  let releaseGold!: () => void;
  let markGoldRequested!: () => void;
  const goldGate = new Promise<void>((resolve) => { releaseGold = resolve; });
  const goldRequested = new Promise<void>((resolve) => { markGoldRequested = resolve; });
  const generated = "2026-10-27T12:00:00Z";
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => {
    const market = new URL(route.request().url()).searchParams.get("market");
    return route.fulfill({ json: { market, items: market === "commodities" ? [
      { symbol: "GC", name: "Gold", market, category: "Metals", exchange: "TEST", provider_symbol: "GC", source_url: null },
      { symbol: "RB", name: "RBOB Gasoline", market, category: "Energy", exchange: "TEST", provider_symbol: "RB", source_url: null },
    ] : [], source_statuses: [], generated_at: generated, refresh_after_seconds: 21600 } });
  });
  await page.route("**/api/anatole/api/v1/options/chain?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const market = query.get("market");
    const symbol = query.get("symbol") ?? "";
    if (market === "commodities" && symbol === "GC") {
      markGoldRequested();
      await goldGate;
    }
    const hasContract = market === "commodities" && symbol === "RB";
    const expiry = "2027-11-25";
    const contracts = hasContract && (!query.get("expiration") || query.get("expiration") === expiry) ? [{
      symbol: "RB-fixture-C", underlying: "RB", market, contract: "RBZ27", side: "call", strike: 2.5,
      expiration: expiry, exchange: "TEST", bid: null, ask: null, last: 0.1, change: null,
      percent_change: null, volume: null, open_interest: 0, implied_volatility: null,
      delta: null, gamma: null, theta: null, vega: null, in_the_money: null, source: "fixture", delayed: true,
    }, {
      symbol: "RB-fixture-P", underlying: "RB", market, contract: "RBZ27", side: "put", strike: 2.5,
      expiration: expiry, exchange: "TEST", bid: 0.2, ask: 0.3, last: 0.25, change: null,
      percent_change: null, volume: 10, open_interest: 0, implied_volatility: null,
      delta: null, gamma: null, theta: null, vega: null, in_the_money: null, source: "fixture", delayed: true,
    }] : [];
    const body = { market, symbol, provider_symbol: symbol, name: symbol === "RB" ? "RBOB Gasoline" : symbol,
      category: "Energy", exchange: "TEST", underlying_price: null, requested_expiration: query.get("expiration"),
      expirations: hasContract ? [expiry] : [], contracts,
      analytics: { contract_count: contracts.length, call_count: contracts.length, put_count: 0,
        call_volume: null, put_volume: null, call_open_interest: null, put_open_interest: null,
        put_call_volume_ratio: null, put_call_open_interest_ratio: null, atm_implied_volatility: null, max_pain_estimate: null },
      source_statuses: [{ source: "fixture", status: "partial", detail: "Synthetic delayed snapshot" }],
      generated_at: generated, refresh_after_seconds: 21600, stale: hasContract };
    await route.fulfill({ json: body }).catch(() => undefined);
  });
  await page.goto("/options", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "RY · RY" })).toBeVisible();
  await page.getByRole("button", { name: "Matières premières", exact: true }).click();
  await goldRequested;
  const rb = page.getByRole("button", { name: "RB RBOB Gasoline" });
  await expect(rb).toBeVisible();
  await rb.click();
  await expect(page.getByRole("heading", { name: "RB · RBOB Gasoline" })).toBeVisible();
  await expect(page.getByText("instantané périmé")).toBeVisible();
  await expect(page.getByRole("button", { name: /CALL 2,5/ })).toContainText("N/D");
  await expect(page.getByRole("button", { name: /CALL 2,5/ })).toContainText("Prix fourni*");
  await expect(page.getByRole("button", { name: /PUT 2,5/ })).toContainText("OI 0");
  await expect(page.getByText("Max pain estimé")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Chaîne d'options" })).toBeVisible();
  await page.getByRole("button", { name: /PUT 2,5/ }).click();
  await expect(page.getByRole("region", { name: "Détails du contrat" })).toContainText("RB-fixture-P");
  await page.getByText("Filtres de chaîne").click();
  await page.getByLabel("Volume minimum").fill("1");
  await expect(page.getByRole("button", { name: /CALL 2,5/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /PUT 2,5/ })).toBeVisible();
  releaseGold();
  await page.getByLabel("Échéance").selectOption("2027-11-25");
  await expect(page.getByRole("heading", { name: "RB · RBOB Gasoline" })).toBeVisible();
  await expect(page.getByText("2027-11-25 · RBZ27", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Vue avancée" }).click();
  const hydrated = page.waitForResponse((response) => response.url().includes("/options/chain?") &&
    new URL(response.url()).searchParams.get("market") === "tsx");
  await page.reload({ waitUntil: "domcontentloaded" });
  await hydrated;
  await page.getByRole("button", { name: "Matières premières", exact: true }).click();
  await page.getByRole("button", { name: "RB RBOB Gasoline" }).click();
  await expect(page.getByRole("heading", { name: "RB · RBOB Gasoline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vue compacte" })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Filtres de chaîne").click();
  await expect(page.getByLabel("Volume minimum")).toHaveValue("1");
  await expect(page.getByRole("button", { name: /CALL 2,5/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /PUT 2,5/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("options-rb-synthetic.png"), fullPage: true });
});

test("an options universe error remains visible when the chain succeeds", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Univers temporairement indisponible" } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Royal Bank", category: "Banks", exchange: "TEST",
    underlying_price: null, requested_expiration: null, expirations: [], contracts: [], analytics: null,
    source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 21600, stale: false,
  } }));
  await page.goto("/options");
  await expect(page.getByRole("heading", { name: "RY · Royal Bank" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Univers temporairement indisponible");
});
