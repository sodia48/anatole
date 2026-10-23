import { expect, test } from "@playwright/test";

const collectedAt = "2026-10-20T14:30:00Z";

for (const state of ["unavailable", "available"] as const) {
  test(`Canadian macro feed presents one StatCan source state (${state})`, async ({ page }, testInfo) => {
    await page.route("**/api/anatole/api/v1/discovery/news?**", (route) => route.fulfill({ json: {
      items: state === "available" ? [{
        id: "statcan-labour", title: "Enquête sur la population active", summary: "Publication officielle.",
        url: "https://www150.statcan.gc.ca/n1/fr/daily-quotidien/", source: "Statistique Canada",
        category: "Travail", published_at: collectedAt, sentiment: "neutre", sentiment_score: 0,
        regions: ["CA"], image_url: null,
      }] : [],
      source_statuses: state === "available"
        ? [{ source: "Statistique Canada — Tous les sujets", status: "ok", detail: "1 élément pertinent", last_success_at: collectedAt }]
        : ["Travail", "Comptes économiques", "Commerce international", "Énergie"].map((category) => ({
          source: `Statistique Canada — ${category}`, status: "unavailable", detail: "XML invalide", last_success_at: collectedAt,
        })),
      generated_at: "2026-10-22T14:30:00Z", refresh_after_seconds: 60,
    } }));

    await page.goto("/actualites");
    await expect(page.getByRole("heading", { name: "Fil macro canadien" })).toBeVisible();
    const details = page.locator("details.source-status-details");
    await expect(details).toBeVisible();
    await expect(details.locator("article")).toHaveCount(1);
    if (state === "unavailable") {
      await expect(page.locator(".source-status-notice")).toContainText("Certaines publications de Statistique Canada");
      await expect(page.locator(".source-status-notice")).toContainText("Dernière collecte réussie");
    } else {
      await expect(page.locator(".source-status-notice")).toHaveCount(0);
      await expect(page.getByText("Enquête sur la population active")).toBeVisible();
    }
    await expect(page.getByText("XML invalide")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`macro-${state}-after.png`), fullPage: true });
    await details.getByText("État des sources").click();
    await expect(details.locator("article")).toBeVisible();
  });
}

test("provincial feed still renders after its filtering module loads", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/discovery/news?**", (route) => route.fulfill({ json: {
    items: [], source_statuses: [], generated_at: collectedAt, refresh_after_seconds: 60,
  } }));
  await page.route("**/api/anatole/api/v1/discovery/provincial-macro?**", (route) => route.fulfill({ json: {
    region: "QC", province: "Québec", language: "fr", mode: "province-first",
    latest_releases: [{ id: "qc-direct", region: "QC", province: "Québec", title: "Emploi au Québec",
      summary: "Publication provinciale officielle", category: "Travail", importance: "Élevée",
      importance_score: 80, source: "Institut de la statistique du Québec", source_kind: "statistics",
      source_url: "https://statistique.quebec.ca/fr/communique", published_at: collectedAt,
      period: null, official: true, specificity: "province-direct" }],
    upcoming_events: [], sources: [], generated_at: collectedAt, refresh_after_seconds: 60, message: null,
  } }));
  await page.goto("/actualites");
  await page.getByRole("combobox", { name: "Région" }).selectOption("QC");
  await expect(page.getByText("Emploi au Québec")).toBeVisible();
  await expect(page.getByText("Publication provinciale officielle")).toBeVisible();
});
