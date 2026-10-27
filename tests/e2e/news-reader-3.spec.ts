import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

const published = "2026-10-26T15:00:00Z";
const originalUrl = "https://www.newswire.ca/news-releases/5n-plus-results-schedule.html";
const officialUrl = "https://www.5nplus.com/fr/nouvelles/5n-plus-inc-annoncera-ses-resultats-T3-2026/";
const frenchTitle = "5N Plus inc. annoncera ses résultats du troisième trimestre 2026 le 2 novembre 2026";
const englishTitle = "5N Plus Inc. to Release Third Quarter 2026 Results on November 2, 2026";

test("5N Plus: official French schedule is readable in Focus, with calendar and sources", async ({ page }, testInfo) => {
  await page.route("**/api/anatole/api/v1/stocks/VNP/news?**", (route) => route.fulfill({ json: {
    ticker: "VNP", symbol: "VNP.TO", company: "5N Plus Inc.", status: "ok", detail: null,
    generated_at: published, refresh_after_seconds: 900,
    items: [{ id: "5n-schedule", title: englishTitle,
      summary: "5N Plus will release its third quarter 2026 results on November 2 after market close and host a conference call November 3.",
      publisher: "CNW", url: originalUrl, published_at: published,
      related_tickers: ["VNP.TO"], relevance: "direct", origin: "publisher", event_type: "results",
      related_sources: [{ title: frenchTitle, url: officialUrl, publisher: "5N Plus", published_at: published, origin: "company_release" }],
    }],
  } }));
  await page.route("**/api/anatole/api/v1/discovery/news/brief", (route) => {
    const request = route.request().postDataJSON() as { candidate_sources?: Array<{ url: string }> };
    expect(request.candidate_sources?.[0].url).toBe(officialUrl);
    return route.fulfill({ json: {
      title: frenchTitle,
      summary: "5N Plus prévoit publier ses résultats du troisième trimestre 2026 le 2 novembre après la clôture des marchés. Une conférence téléphonique suivra le 3 novembre à 8 h, heure de l’Est.",
      key_figures: [], figure_series: [], changes: [], why_it_matters: "", watch: [],
      source_url: officialUrl, source_name: "5N Plus", source_mode: "article_page",
      source_note: "Communiqué public consulté.", generated_at: published,
      availability: "article", source_language: "fr", translation_status: "original",
      relevance: "direct", detail_available: true,
      article: {
        kind: "results_schedule", coverage: "structured", coverage_note: "Lecture structurée du communiqué · texte intégral chez l’éditeur", title: frenchTitle, published_at: published,
        facts: ["5N Plus prévoit publier ses résultats le 2 novembre 2026 après la clôture.",
          "Une conférence téléphonique suivra le 3 novembre 2026 à 8 h, heure de l’Est."],
        events: [
          { kind: "results_scheduled", label: "Publication des résultats", starts_at: "2026-11-02T00:00:00-05:00", timing: "after_close", timezone: "America/Toronto", phone_numbers: [] },
          { kind: "conference", label: "Conférence téléphonique", starts_at: "2026-11-03T08:00:00-05:00", timing: "confirmed", timezone: "America/Toronto",
            phone_numbers: ["1 800 990-4777", "1 289 819-1299", "1 514 400-3794"], access_code: "04970", replay_until: "2026-11-10T00:00:00-05:00" },
        ],
        limitations: ["Les résultats financiers ne figurent pas dans cette annonce."],
        source_url: officialUrl, original_url: originalUrl,
        alternate_sources: [{ title: englishTitle, url: originalUrl, publisher: "CNW", origin: "original" }], language: "fr",
      },
    } });
  });
  await page.goto("/focus/VNP", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: /5N Plus Inc.*Lire l’analyse/ }).click();
  const reader = page.getByRole("dialog", { name: frenchTitle });
  await expect(reader).toBeVisible();
  await expect(reader.getByRole("button", { name: "Lire l’article" })).toHaveAttribute("aria-pressed", "true");
  await expect(reader.getByRole("heading", { name: "Événements importants" })).toBeVisible();
  await expect(reader.getByText("5N Plus prévoit publier ses résultats le 2 novembre 2026 après la clôture.", { exact: true })).toBeVisible();
  await expect(reader.getByText(/2 novembre 2026.*après la clôture/).last()).toBeVisible();
  await expect(reader.getByText(/3 novembre 2026.*8 h 00/)).toBeVisible();
  await expect(reader.getByText("Les résultats financiers ne figurent pas dans cette annonce.")).toBeVisible();
  await expect(reader.getByRole("link", { name: /Voir le communiqué officiel/ })).toHaveAttribute("href", officialUrl);
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
  await page.evaluate(() => { document.documentElement.dataset.theme = "blue"; });
  await expect(reader.getByRole("heading", { name: "Événements importants" })).toBeVisible();
  const blueAccessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(blueAccessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await reader.getByRole("heading", { name: frenchTitle }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("5n-reader-after-top.png") });
  await reader.getByText("Numéros et code d’accès").click();
  await expect(reader.getByText(/1 800 990-4777/)).toBeVisible();
  await expect(reader.getByText(/04970/)).toBeVisible();
  await expect(reader.getByText(/10 novembre 2026/)).toBeVisible();
  const download = page.waitForEvent("download");
  await reader.getByRole("link", { name: "Ajouter au calendrier" }).click();
  const calendar = await download;
  expect(calendar.suggestedFilename()).toBe("anatole-conference.ics");
  expect(await readFile(await calendar.path(), "utf8")).toContain("DTSTART:20261103T130000Z");
  const invalidCalendar = await page.request.get("/api/news-calendar?start=2026-11-03&title=Test&source=http://127.0.0.1/");
  expect(invalidCalendar.status()).toBe(400);
  await page.screenshot({ path: testInfo.outputPath("5n-reader-after-details.png") });
  await reader.getByRole("button", { name: "Résumé Anatole" }).click();
  await expect(reader.getByText(/5N Plus prévoit publier ses résultats/)).toBeVisible();
  await expect(reader.getByRole("heading", { name: "Événements importants" })).toHaveCount(0);
  await reader.getByRole("button", { name: "Analyse financière" }).click();
  await expect(reader.getByText(/5N Plus prévoit publier ses résultats/)).toBeVisible();
  await reader.getByRole("button", { name: "Fermer" }).click();
  await expect(page).toHaveURL(/\/focus\/VNP$/);
});
