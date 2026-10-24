import { expect, test } from "@playwright/test";

const published = "2026-10-20T14:30:00Z";

test("macro reader shows grounded quick and detailed briefs across viewports", async ({ page }, testInfo) => {
  await page.route("**/api/anatole/api/v1/discovery/news?**", (route) => route.fulfill({ json: {
    items: [{
      id: "statcan-jobs", title: "L'emploi augmente de 2,1 % au Canada",
      summary: "Statistique Canada indique que l'emploi a augmenté de 2,1 % en septembre. Le taux de chômage est resté stable à 5,9 %. La prochaine enquête sera publiée en novembre.",
      url: "https://www150.statcan.gc.ca/n1/daily-quotidien/", source: "Statistique Canada",
      category: "Travail", published_at: published, sentiment: "neutre", sentiment_score: 0,
      regions: ["CA"], image_url: null,
    }], source_statuses: [], generated_at: published, refresh_after_seconds: 60,
  } }));
  const requests: Array<{ context: string; language: string }> = [];
  await page.route("**/api/anatole/api/v1/discovery/news/brief", (route) => {
    const request = route.request().postDataJSON() as { context: string; language: string };
    requests.push(request);
    return route.fulfill({ json: {
      title: "L'emploi augmente de 2,1 % au Canada",
      summary: "L'emploi a augmenté de 2,1 % en septembre selon Statistique Canada.",
      key_figures: [{ value: "2,1 %", context: "L'emploi a augmenté de 2,1 % en septembre.", kind: "actual" }],
      changes: ["Le taux de chômage est resté stable à 5,9 %."],
      why_it_matters: "", watch: ["La prochaine enquête sera publiée en novembre."],
      source_url: "https://www150.statcan.gc.ca/n1/daily-quotidien/", source_name: "Statistique Canada",
      source_mode: "official_page", availability: "article", source_language: "fr",
      translation_status: "original", relevance: "not_applicable", detail_available: true,
      source_note: "Publication officielle consultée.", generated_at: published,
    } });
  });

  await page.goto("/actualites");
  await expect(page.getByRole("heading", { name: "L'emploi augmente de 2,1 % au Canada" })).toBeVisible();
  await page.getByRole("button", { name: "Lire le résumé" }).click();
  const reader = page.getByRole("dialog", { name: "L'emploi augmente de 2,1 % au Canada" });
  await expect(reader.getByRole("heading", { name: "Résumé" })).toBeVisible();
  await expect(reader.getByText("L'emploi a augmenté de 2,1 % en septembre selon Statistique Canada.")).toBeVisible();
  await expect(reader.getByText("Article consulté")).toBeVisible();
  await expect(reader.getByRole("link", { name: "Voir la source originale" })).toHaveAttribute("href", "https://www150.statcan.gc.ca/n1/daily-quotidien/");
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request).toEqual(expect.objectContaining({ context: "macro", language: "fr" }));
  }
  await page.screenshot({ path: testInfo.outputPath("news-reader-quick.png") });

  await reader.getByRole("button", { name: "Analyse détaillée" }).click();
  await expect(reader.getByRole("heading", { name: "Chiffres clés" })).toBeVisible();
  await expect(reader.getByText("Donnée publiée")).toBeVisible();
  await expect(reader.getByRole("heading", { name: "À surveiller" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("news-reader-detail.png") });
  await page.keyboard.press("Escape");
  await expect(reader).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lire le résumé" })).toBeFocused();
});

test("Focus CNQ shares the reader and ignores an obsolete article response", async ({ page }, testInfo) => {
  await page.route("**/api/anatole/api/v1/stocks/CNQ/news?**", (route) => route.fulfill({ json: {
    ticker: "CNQ", symbol: "CNQ.TO", company: "Canadian Natural Resources",
    items: [
      { id: "cnq-results", title: "Canadian Natural Resources reports quarterly results",
        summary: "The company reported revenue of $10 billion in the quarter.",
        url: "https://www.globenewswire.com/news-release/cnq-results", publisher: "GlobeNewswire",
        published_at: published, related_tickers: ["CNQ.TO"], image_url: null },
      { id: "cnq-limited", title: "Canadian Natural Resources announces an update",
        summary: "", url: "https://example.com/cnq-update", publisher: "Market Wire",
        published_at: published, related_tickers: ["CNQ.TO"], image_url: null },
    ], status: "ok", detail: null, generated_at: published, refresh_after_seconds: 900,
  } }));
  let delayed = true;
  await page.route("**/api/anatole/api/v1/discovery/news/brief", async (route) => {
    const request = route.request().postDataJSON() as { title: string; url: string };
    if (request.title.includes("quarterly") && delayed) {
      delayed = false;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    try {
      await route.fulfill({ json: {
        title: request.title, summary: request.title.includes("quarterly")
          ? "The company reported revenue of $10 billion in the quarter." : request.title,
        key_figures: request.title.includes("quarterly")
          ? [{ value: "$10 billion", context: "Revenue of $10 billion was reported.", kind: "actual" }] : [],
        changes: [], why_it_matters: "", watch: [], source_url: request.url,
        source_name: "GlobeNewswire", source_mode: request.title.includes("quarterly") ? "feed_summary" : "title_only",
        source_note: request.title.includes("quarterly") ? "Only the publisher's excerpt is available." : "Only the title and metadata are available.",
        availability: request.title.includes("quarterly") ? "publisher_excerpt" : "limited",
        source_language: "en", translation_status: "unavailable", relevance: "direct",
        detail_available: request.title.includes("quarterly"), generated_at: published,
      } });
    } catch { /* The first request can be cancelled when the reader closes. */ }
  });

  await page.goto("/focus/CNQ");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  const news = page.getByRole("region", { name: /Dernières nouvelles pour CNQ|Latest news for CNQ/i });
  await expect(news.getByRole("button")).toHaveCount(2);
  await news.getByRole("button").first().click();
  const firstReader = page.getByRole("dialog", { name: "Canadian Natural Resources reports quarterly results" });
  await expect(firstReader).toBeVisible();
  await firstReader.getByRole("button", { name: "Fermer" }).click();
  await news.getByRole("button").nth(1).click();
  const limited = page.getByRole("dialog", { name: "Canadian Natural Resources announces an update" });
  await expect(limited.getByText("Informations limitées")).toBeVisible();
  await expect(limited.getByText("$10 billion")).toHaveCount(0);
  await expect(page).toHaveURL(/\/focus\/CNQ$/);
  await page.waitForTimeout(700);
  await expect(limited.getByText("Informations limitées")).toBeVisible();
  await limited.getByRole("button", { name: "Fermer" }).click();
  await news.getByRole("button").first().click();
  const results = page.getByRole("dialog", { name: "Canadian Natural Resources reports quarterly results" });
  await expect(results.getByText("Résumé de l’éditeur")).toBeVisible();
  await results.getByRole("button", { name: "Analyse détaillée" }).click();
  await expect(results.getByText("$10 billion").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("focus-cnq-reader.png") });
});

test("reader preserves the source during an API failure and retries", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/discovery/news?**", (route) => route.fulfill({ json: {
    items: [{ id: "retry-story", title: "Publication sur l'emploi au Canada",
      summary: "L'emploi a progressé selon l'extrait officiel.",
      url: "https://www150.statcan.gc.ca/n1/daily-quotidien/", source: "Statistique Canada",
      category: "Travail", published_at: published, sentiment: "neutre", sentiment_score: 0,
      regions: ["CA"], image_url: null }],
    source_statuses: [], generated_at: published, refresh_after_seconds: 60,
  } }));
  let recovered = false;
  await page.route("**/api/anatole/api/v1/discovery/news/brief", (route) => recovered
    ? route.fulfill({ json: {
      title: "Publication sur l'emploi au Canada", summary: "L'emploi a progressé selon l'extrait officiel.",
      key_figures: [], changes: [], why_it_matters: "", watch: [],
      source_url: "https://www150.statcan.gc.ca/n1/daily-quotidien/", source_name: "Statistique Canada",
      source_mode: "feed_summary", source_note: "Seul l'extrait de l'éditeur est disponible.",
      availability: "publisher_excerpt", source_language: "fr", translation_status: "original",
      relevance: "not_applicable", detail_available: false, generated_at: published,
    } })
    : route.fulfill({ status: 503, json: { detail: "Source momentanément indisponible" } }));

  await page.goto("/actualites");
  await page.getByRole("button", { name: "Lire le résumé" }).click();
  const reader = page.getByRole("dialog", { name: "Publication sur l'emploi au Canada" });
  await expect(reader.getByRole("heading", { name: "Résumé indisponible" })).toBeVisible();
  await expect(reader.getByText("Statistique Canada")).toBeVisible();
  recovered = true;
  await reader.getByRole("button", { name: "Réessayer" }).click();
  await expect(reader.getByRole("heading", { name: "Résumé", exact: true })).toBeVisible();
  await expect(reader.getByText("Résumé de l’éditeur")).toBeVisible();
});
