import { expect, test } from "@playwright/test";

const generated = "2026-10-17T12:00:00Z";

test("Particulier: question fondamentale sourcée puis vue Focus ciblée", async ({ page }) => {
  let request: Record<string, unknown> | null = null;
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    request = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: {
      intent: "stock_analysis", title: "RY", answer: "## Faits et calculs observés\n- Bénéfice net : 100 CAD.\n## Interprétation\nLa corrélation ne prouve pas une cause.",
      facts: [], links: [], sources: [{ label: "Rapport annuel", detail: "2025", status: "fallback" }],
      suggestions: [], confidence: "moyenne", disclaimer: "Analyse éducative.", guardrail_triggered: false,
      generated_at: generated, conversation_id: "ba809b54-1d09-4cef-bb4b-bc3afae9175c", context: {},
      actions: [{ label: "Voir diagnostic dans Focus", href: "/focus/RY?view=diagnostic", kind: "navigate" }],
      evidence: [{ sources: [{ label: "Rapport annuel", type: "fundamental_report", freshness: "stale", timestamp: generated }], missing_data: [] }],
      permission_required: false,
    } });
  });
  await page.route("**/stocks/RY/fundamental-intelligence/diagnostic", async (route) => {
    await route.fulfill({ json: {
      ticker: "RY.TO", name: "Royal Bank", sector_family: "bank", generated_at: generated,
      source_generated_at: generated, stale: true, status: "partial", financial_currency: "CAD",
      measures: [], dimensions: [], findings: [], sector_metrics: [], missing_data: ["cash_conversion"],
      methodology_fr: "Calculs sourcés.", methodology_en: "Sourced calculations.", global_score: null,
    } });
  });
  await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Object.keys(document.querySelector('button[aria-label="Ouvrir Anatole Assistant"]') ?? {}).some((key) => key.startsWith("__reactFiber")));
  await page.getByRole("button", { name: "Ouvrir Anatole Assistant" }).click();
  await page.getByLabel("Votre question").fill("Pourquoi les bénéfices progressent alors que les flux de trésorerie diminuent ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  const dialog = page.getByRole("dialog", { name: "Anatole Assistant" });
  await expect(dialog.getByRole("heading", { name: "Faits et calculs observés" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Voir diagnostic dans Focus/ })).toHaveAttribute("href", "/focus/RY?view=diagnostic");
  expect((request?.context as { symbol: string }).symbol).toBe("RY");
  await dialog.getByRole("link", { name: /Voir diagnostic dans Focus/ }).click();
  await expect(page).toHaveURL(/\/focus\/RY\?view=diagnostic/);
  await expect(page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Diagnostic 360°" })).toHaveAttribute("aria-pressed", "true");
});

test("Institutionnel: contexte public RY sans transmettre le brouillon privé", async ({ page }) => {
  let request: Record<string, unknown> | null = null;
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    request = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: {
      intent: "stock_analysis", title: "RY", answer: "## Comparaison sectorielle\n- Médiane indisponible : échantillon insuffisant.",
      facts: [], links: [], sources: [], suggestions: [], confidence: "limitée", disclaimer: "Analyse éducative.",
      guardrail_triggered: false, generated_at: generated, conversation_id: "ba809b54-1d09-4cef-bb4b-bc3afae9175c",
      context: {}, actions: [], evidence: [], permission_required: false,
    } });
  });
  await page.goto("/institutionnel/recherche?symbol=RY&thesis=CONFIDENTIAL_SENTINEL", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Object.keys(document.querySelector('button[aria-label="Ouvrir Anatole Assistant"]') ?? {}).some((key) => key.startsWith("__reactFiber")));
  await page.getByRole("button", { name: "Ouvrir Anatole Assistant" }).click();
  await expect(page.getByText("Focus · RY")).toBeVisible();
  await page.getByLabel("Votre question").fill("Comment RY se compare aux concurrents ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(page.getByRole("dialog", { name: "Anatole Assistant" }).getByRole("heading", { name: "Comparaison sectorielle" })).toBeVisible();
  expect((request?.context as { symbol: string; route: string }).symbol).toBe("RY");
  expect((request?.context as { route: string }).route).toBe("/institutionnel/recherche");
  expect(JSON.stringify(request)).not.toContain("CONFIDENTIAL_SENTINEL");
  expect(request?.portfolio_positions).toEqual([]);
});
