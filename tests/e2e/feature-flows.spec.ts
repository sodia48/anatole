import { expect, test, type Page } from "@playwright/test";

async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Signaler un problème" }),
  ).toHaveAttribute("data-client-ready", "true");
}

test.describe("contrôles fonctionnels Anatole", () => {
  test("la préférence de langue met à jour le document et le hub", async ({ page }) => {
    await gotoReady(page, "/parametres?section=preferences");
    await page.getByRole("button", { name: /English Canadian English interface/i }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
    await expect(page.getByRole("heading", { name: "Account & settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anatole language" })).toBeVisible();
  });

  test("le Cockpit conserve le choix Composite", async ({ page }) => {
    await gotoReady(page, "/cockpit");
    const composite = page.getByRole("radio", { name: /Composite/i });
    await composite.check();
    await expect(composite).toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("anatole-cockpit-universe"))).toBe("composite");
  });

  test("le Screener filtre et ouvre un ticker réel", async ({ page }) => {
    await gotoReady(page, "/screener");
    await page.getByPlaceholder("Ticker ou entreprise").fill("RY");
    const focusLink = page.locator('main a[href="/focus/RY"]').first();
    await expect(focusLink).toBeVisible();
    await focusLink.click();
    await expect(page).toHaveURL(/\/focus\/RY$/);
  });

  test("Actualités et Calendrier acceptent les régions provinciales", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoReady(page, "/actualites");
    const newsRegion = page.getByLabel("Région");
    const qcRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/discovery/provincial-macro")
        && url.searchParams.get("region") === "QC";
    });
    await Promise.all([qcRequest, newsRegion.selectOption("QC")]);

    await gotoReady(page, "/calendrier");
    const calendarRegion = page.getByLabel("Région");
    const onRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/discovery/provincial-calendar")
        && url.searchParams.get("region") === "ON";
    });
    await Promise.all([onRequest, calendarRegion.selectOption("ON")]);
  });

  test("le Calendrier affiche les résultats à venir des composantes TSX", async ({ page }) => {
    const requestedUniverses: string[] = [];
    const startsAt = new Date(Date.now() + 14 * 86_400_000).toISOString();

    await page.route("**/api/anatole/api/v1/discovery/earnings-calendar?**", async (route) => {
      const url = new URL(route.request().url());
      const universe = url.searchParams.get("universe") ?? "composite";
      requestedUniverses.push(universe);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          universe: universe === "tsx60" ? "S&P/TSX 60" : "S&P/TSX Composite",
          universe_as_of: "2026-08-29",
          constituent_count: universe === "tsx60" ? 60 : 220,
          companies_with_dates: 1,
          events: [{
            ticker: "RY",
            symbol: "RY.TO",
            company: "Royal Bank of Canada",
            sector: "Financials",
            weight: 10.0,
            starts_at: startsAt,
            window_start: startsAt,
            window_end: startsAt,
            time_is_estimated: true,
            source: "Yahoo Finance public quote calendar",
            url: "https://finance.yahoo.com/quote/RY.TO/calendar/",
          }],
          source_statuses: [{
            source: "Yahoo Finance public quote calendar",
            status: "ok",
            detail: "1 upcoming earnings date",
          }],
          generated_at: new Date().toISOString(),
          refresh_after_seconds: 10800,
        }),
      });
    });

    await gotoReady(page, "/calendrier");
    await page.getByRole("button", { name: /Résultats TSX|TSX earnings/i }).click();
    const earnings = page.getByRole("region", { name: /Résultats TSX à venir|Upcoming TSX earnings/i });
    await expect(earnings).toBeVisible();
    await expect(earnings.getByText("Royal Bank of Canada")).toBeVisible();
    await earnings.getByRole("button", { name: "TSX 60" }).click();
    await expect.poll(() => requestedUniverses).toContain("tsx60");
  });

  test("le répertoire ETF recherche et ouvre XIC", async ({ page }) => {
    await gotoReady(page, "/etf");
    await page.getByLabel("Rechercher un ETF").fill("XIC");
    const xic = page.locator('a[href="/etf/XIC"]:visible').first();
    await expect(xic).toBeVisible();
    await xic.click();
    await expect(page).toHaveURL(/\/etf\/XIC$/);
  });

  test("IPO et initiés changent d’onglet sans perdre la route", async ({ page }) => {
    await gotoReady(page, "/ipo-insiders");
    await page.getByRole("button", { name: /Initiés Achats, ventes/i }).click();
    await expect(page.getByPlaceholder("Ex. RY, SHOP, AAPL")).toBeVisible();
    await expect(page).toHaveURL(/\/ipo-insiders$/);
  });

  test("Focus change de période avec des données réelles de démonstration", async ({ page }) => {
    await gotoReady(page, "/focus/RY");
    await page.getByRole("button", { name: /Workstation pro|Pro workstation/i }).click();
    const timeframe = page.getByLabel(/Unité de temps|Timeframe/i);
    const focusRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/stocks/RY/focus")
        && url.searchParams.get("range") === "3mo"
        && url.searchParams.get("interval") === "60m";
    });
    await Promise.all([focusRequest, timeframe.selectOption("4h")]);
    await expect(timeframe).toHaveValue("4h");
    await expect(page.getByRole("heading", { name: /RY.*4h/i })).toBeVisible();
    await expect(page.getByText(/observations/).first()).toBeVisible();
  });

  test("le Comparateur ajoute puis retire ENB", async ({ page }) => {
    await gotoReady(page, "/comparateur");
    const composer = page.getByPlaceholder(/Ajouter un ticker/i);
    await composer.fill("ENB");
    await composer.press("Enter");
    const remove = page.getByRole("button", { name: "Retirer ENB" });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(remove).toHaveCount(0);
  });

  test("la Watchlist persiste un ajout et permet son retrait", async ({ page }) => {
    await gotoReady(page, "/watchlist");
    await page.getByLabel("Symbole à ajouter").fill("RY");
    await page.getByRole("button", { name: "Ajouter" }).click();
    const remove = page.getByRole("button", { name: "Retirer RY" });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(remove).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retirer TD" })).toBeVisible();
  });

  test("le Portefeuille charge un exemple, analyse et retire une position", async ({ page }) => {
    await gotoReady(page, "/portefeuille");
    await page.getByRole("button", { name: /Charger (un exemple|l’exemple)/i }).first().click();
    const remove = page.getByRole("button", { name: "Supprimer RY" });
    await expect(remove).toBeVisible();
    await expect(page.getByRole("button", { name: "Exporter" })).toBeEnabled();
    await remove.click();
    await expect(remove).toHaveCount(0);
  });

  test("les Alertes créent, évaluent et suppriment une règle", async ({ page }) => {
    await gotoReady(page, "/alertes");
    await page.getByLabel("Symbole").fill("RY");
    await page.getByRole("button", { name: /^RY Royal Bank/i }).click();
    await page.getByLabel("Seuil").fill("1");
    await page.getByRole("button", { name: "Créer" }).click();
    const remove = page.getByRole("button", { name: "Supprimer l’alerte" });
    await expect(remove).toBeVisible();
    await page.getByRole("button", { name: /Vérifier maintenant|Vérification/i }).click();
    await expect(page.getByText(/Déclenchée|Surveillance|Indisponible/).first()).toBeVisible();
    await remove.click();
    await expect(page.getByText("Aucune alerte")).toBeVisible();
  });
});
