import { expect, test, type Page } from "@playwright/test";

function snapshot(status = "available") {
  const date = new Date(Date.now() + 7 * 86_400_000).toISOString();
  return {
    universe: "Canada", status, refresh_in_progress: status === "loading",
    constituent_count: status === "available" ? 4600 : 0,
    companies_with_dates: status === "available" ? 1 : 0,
    events: status === "available" ? [{
      ticker: "AAG.V", symbol: "AAG.V", company: "Aftermath Silver", exchange: "TSXV",
      sector: "Materials", weight: null, starts_at: date, window_start: date, window_end: date,
      time_is_estimated: true, eps_estimate: 0, revenue_estimate: null,
      estimate_currency: "CAD", eps_analyst_count: 1, revenue_analyst_count: null,
    }] : [],
    source_statuses: [], generated_at: new Date().toISOString(), refresh_after_seconds: 5,
  };
}

async function open(page: Page) {
  await page.goto("/calendrier");
  await expect(page.getByRole("button", { name: "Signaler un problème" })).toHaveAttribute("data-client-ready", "true");
  await page.getByRole("button", { name: "Résultats Canada", exact: true }).click();
  return page.getByRole("region", { name: "Résultats Canada à venir", exact: true });
}

test("Canada includes non-index listings, exchange-safe links and real zero EPS", async ({ page }) => {
  const universes: string[] = [];
  await page.route("**/discovery/earnings-calendar?**", async (route) => {
    universes.push(new URL(route.request().url()).searchParams.get("universe")!);
    await route.fulfill({ json: snapshot() });
  });
  const panel = await open(page);
  await expect(panel.getByText("Aftermath Silver", { exact: true })).toBeVisible();
  expect(universes[0]).toBe("canada");
  await expect(panel.getByRole("link", { name: "AAG.V", exact: true })).toHaveAttribute("href", "/focus/AAG.V");
  await expect(panel.getByText("0,00 CAD", { exact: true })).toBeVisible();
  await panel.getByPlaceholder("Ticker ou entreprise").fill("no matching company");
  await expect(panel.getByText("Aftermath Silver", { exact: true })).toHaveCount(0);
  await panel.getByPlaceholder("Ticker ou entreprise").fill("AAG");
  await expect(panel.getByText("Aftermath Silver", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "TSX Composite", exact: true }).click();
  await expect.poll(() => universes).toContain("composite");
});

test("unavailable is not zero or perpetual loading and refresh recovers", async ({ page }) => {
  let status = "unavailable";
  await page.route("**/discovery/earnings-calendar?**", (route) => route.fulfill({ json: snapshot(status) }));
  const panel = await open(page);
  await expect(panel.getByText("Indisponible", { exact: true })).toBeVisible();
  await expect(panel.getByText("Chargement…", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("0", { exact: true })).toHaveCount(0);
  status = "available";
  await panel.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(panel.getByText("Aftermath Silver", { exact: true })).toBeVisible();
  status = "unavailable";
  await panel.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Dernières données disponibles");
  await expect(panel.getByText("Aftermath Silver", { exact: true })).toBeVisible();
});

test("cold start polls until dates arrive without showing an empty market", async ({ page }) => {
  let requests = 0;
  let ready = false;
  await page.route("**/discovery/earnings-calendar?**", (route) => {
    requests += 1;
    return route.fulfill({ json: snapshot(ready ? "available" : "loading") });
  });
  const panel = await open(page);
  await expect(panel.getByText("Synchronisation des dates et estimations…", { exact: true })).toBeVisible();
  await expect(panel.getByText("0", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("Aucune date future publiée pour ces filtres.", { exact: true })).toHaveCount(0);
  ready = true;
  await expect(panel.getByText("Aftermath Silver", { exact: true })).toBeVisible({ timeout: 12_000 });
  expect(requests).toBeGreaterThan(1);
});

test("large calendars render progressively but search includes undisplayed stocks", async ({ page }) => {
  const data = snapshot();
  const event = data.events[0];
  data.events = Array.from({ length: 80 }, (_, index) => ({ ...event,
    ticker: `STOCK${index}.V`, symbol: `STOCK${index}.V`, company: `Canadian company ${index}`,
  }));
  data.companies_with_dates = 80;
  await page.route("**/discovery/earnings-calendar?**", (route) => route.fulfill({ json: data }));
  const panel = await open(page);
  await expect(panel.getByRole("article")).toHaveCount(60);
  await panel.getByRole("button", { name: "Afficher plus (60/80)", exact: true }).click();
  await expect(panel.getByRole("article")).toHaveCount(80);
  await panel.getByPlaceholder("Ticker ou entreprise").fill("STOCK79");
  await expect(panel.getByRole("article")).toHaveCount(1);
  await expect(panel.getByRole("link", { name: "STOCK79.V", exact: true })).toBeVisible();
});
