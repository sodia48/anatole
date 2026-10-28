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
  await expect(page.getByRole("cell", { name: "N/D" }).first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Prix fourni*" })).toBeVisible();
  await expect(page.getByText("Max pain estimé")).toHaveCount(0);
  if (testInfo.project.name.startsWith("mobile")) {
    const scrollable = await page.getByRole("region", { name: "Chaîne d'options" }).evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(scrollable).toBe(true);
  }
  releaseGold();
  await page.getByLabel("Échéance").selectOption("2027-11-25");
  await expect(page.getByRole("heading", { name: "RB · RBOB Gasoline" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2027-11-25" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("options-rb-synthetic.png"), fullPage: true });
});
