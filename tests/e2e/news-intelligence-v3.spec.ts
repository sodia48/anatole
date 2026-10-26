import { expect, test } from "@playwright/test";

const published = "2026-10-20T14:30:00Z";

function macroItem(title: string, summary: string, url: string, source = "Statistique Canada") {
  return { id: title, title, summary, url, source, category: "Économie",
    published_at: published, sentiment: "neutre", sentiment_score: 0, regions: ["CA"], image_url: null };
}

async function mockMacro(page: import("@playwright/test").Page, item: ReturnType<typeof macroItem>, brief: Record<string, unknown>) {
  await page.route("**/api/anatole/api/v1/discovery/news?**", (route) => route.fulfill({ json: {
    items: [item], source_statuses: [], generated_at: published, refresh_after_seconds: 60,
  } }));
  await page.route("**/api/anatole/api/v1/discovery/news/brief", (route) => route.fulfill({ json: {
    title: item.title, source_url: item.url, source_name: item.source,
    source_mode: "feed_summary", availability: "publisher_excerpt", source_language: "fr",
    translation_status: "original", relevance: "not_applicable", generated_at: published,
    key_figures: [], figure_series: [], changes: [], why_it_matters: "", watch: [],
    detail_available: true, source_note: "Seul l'extrait fourni par l'éditeur est disponible.", ...brief,
  } }));
}

test("antimony forecast has one compact series and distinct growth periods", async ({ page }, testInfo) => {
  const item = macroItem("Prévisions du marché mondial de l'antimoine", "Le marché mondial de l'antimoine devrait croître.", "https://example.com/antimony", "Fixture de test");
  const evidence = "The global antimony market is forecast to reach USD 4.94 billion in 2025, USD 5.26 billion in 2026 and USD 6.65 billion by 2030.";
  await mockMacro(page, item, {
    summary: "Le marché mondial de l'antimoine devrait passer de 4,94 milliards USD en 2025 à 6,65 milliards USD en 2030.",
    figure_series: [
      { label: "Marché mondial de l'antimoine — prévisions", figures: [
        { value: "4,94 milliards USD", label: "Taille prévue", period: "2025", kind: "forecast", context: evidence },
        { value: "5,26 milliards USD", label: "Taille prévue", period: "2026", kind: "forecast", context: evidence },
        { value: "6,65 milliards USD", label: "Taille prévue", period: "2030", kind: "forecast", context: evidence },
      ] },
      { label: "Croissance annualisée annoncée", figures: [
        { value: "6,6 %", period: "2025–2026", kind: "forecast", context: "L'éditeur annonce 6,6 % pour 2025–2026." },
        { value: "6,1 %", period: "2026–2030", kind: "forecast", context: "L'éditeur annonce 6,1 % pour 2026–2030." },
      ] },
    ],
  });
  await page.goto("/actualites");
  await page.getByRole("button", { name: "Lire le résumé" }).click();
  const reader = page.getByRole("dialog", { name: item.title });
  await reader.getByRole("button", { name: "Analyse détaillée" }).click();
  await expect(reader.getByRole("heading", { name: "Chiffres importants" })).toBeVisible();
  await expect(reader.getByRole("table")).toHaveCount(2);
  await expect(reader.getByRole("row", { name: /2025.*4,94 milliards USD/ })).toBeVisible();
  await expect(reader.getByRole("row", { name: /2030.*6,65 milliards USD/ })).toBeVisible();
  await expect(reader.getByRole("row", { name: /2025–2026.*6,6 %/ })).toBeVisible();
  await expect(reader.getByText(evidence)).toHaveCount(3);
  await expect(reader.getByText(evidence).first()).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("antimony-after.png") });
});

test("macroeconomic release keeps figures concise and accessible", async ({ page }, testInfo) => {
  const item = macroItem("L'emploi progresse en septembre", "L'emploi progresse de 2,1 %.", "https://www150.statcan.gc.ca/n1/daily-quotidien/");
  await mockMacro(page, item, {
    summary: "L'emploi a progressé de 2,1 % en septembre selon Statistique Canada.",
    key_figures: [{ value: "2,1 %", label: "Variation de l'emploi", period: "Septembre 2026", kind: "actual", context: "L'emploi a progressé de 2,1 % en septembre." }],
    watch: ["La prochaine enquête sera publiée en novembre."],
    source_mode: "official_page", availability: "article", source_note: "Publication officielle consultée.",
  });
  await page.goto("/actualites");
  await page.getByRole("button", { name: "Lire le résumé" }).click();
  const reader = page.getByRole("dialog", { name: item.title });
  await reader.getByRole("button", { name: "Analyse détaillée" }).click();
  await expect(reader.getByText("Variation de l'emploi")).toBeVisible();
  await expect(reader.getByText("2,1 %", { exact: true })).toBeVisible();
  await expect(reader.getByText("L'emploi a progressé de 2,1 % en septembre.")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("macro-after.png") });
});

test("publisher excerpt is honest when the full article cannot be read", async ({ page }, testInfo) => {
  const item = macroItem("Antimony market outlook", "The antimony market is expected to expand.", "https://example.com/antimony", "Fixture de test");
  await mockMacro(page, item, {
    summary: "The antimony market is expected to expand.", detail_available: false,
    source_language: "en", translation_status: "unavailable",
    source_note: "Seul l'extrait fourni par l'éditeur est disponible. Texte original conservé : traduction fiable indisponible.",
  });
  await page.goto("/actualites");
  await page.getByRole("button", { name: "Lire le résumé" }).click();
  const reader = page.getByRole("dialog", { name: item.title });
  await expect(reader.getByRole("heading", { name: "Résumé" })).toBeVisible();
  await expect(reader.getByText("Résumé de l’éditeur")).toBeVisible();
  await expect(reader.getByText(/traduction fiable indisponible/)).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("limited-after.png") });
});

test("Focus CNQ favors direct announcements and separates sector news", async ({ page }, testInfo) => {
  await page.route("**/api/anatole/api/v1/stocks/CNQ/news?**", (route) => route.fulfill({ json: {
    ticker: "CNQ", symbol: "CNQ.TO", company: "Canadian Natural Resources", status: "ok", detail: null,
    coverage_note: null, generated_at: published, refresh_after_seconds: 900,
    items: [
      { id: "official", title: "Canadian Natural Announces 2026 Second Quarter Results", summary: "", publisher: "Canadian Natural Resources", url: "https://www.cnrl.com/wp-content/uploads/2026/08/0806-Q226-Front-End.pdf", published_at: "2026-08-06T00:00:00Z", related_tickers: ["CNQ.TO"], relevance: "direct", origin: "company_release", image_url: null },
      { id: "analyst", title: "RBC Raises Price Target on Canadian Natural Resources", summary: "RBC raised its price target on the company.", publisher: "MT Newswires", url: "https://example.com/analyst", published_at: published, related_tickers: ["CNQ.TO"], relevance: "direct", origin: "publisher", image_url: null },
      { id: "sector", title: "Oil sands production expands in Alberta", summary: "Industry output increased in Alberta.", publisher: "Energy Wire", url: "https://example.com/sector", published_at: published, related_tickers: [], relevance: "sector", origin: "publisher", image_url: null },
    ],
  } }));
  await page.route("**/api/anatole/api/v1/discovery/news/brief", (route) => route.fulfill({ json: {
    title: "Canadian Natural Announces 2026 Second Quarter Results", summary: "", key_figures: [], figure_series: [],
    changes: [], why_it_matters: "", watch: [], source_url: "https://www.cnrl.com/wp-content/uploads/2026/08/0806-Q226-Front-End.pdf",
    source_name: "Canadian Natural Resources", source_mode: "title_only", source_note: "Seuls le titre et les métadonnées sont disponibles.",
    availability: "limited", source_language: "en", translation_status: "original", relevance: "direct",
    detail_available: false, generated_at: published,
  } }));
  await page.goto("/focus/CNQ");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  const news = page.getByRole("region", { name: /Dernières nouvelles pour CNQ|Latest news for CNQ/i });
  const cards = news.getByRole("button", { name: /Lire le résumé/ });
  await expect(cards).toHaveCount(2);
  await expect(news.getByRole("link", { name: /Voir l'article/ })).toHaveCount(1);
  await news.getByRole("button", { name: "Entreprise", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("cnq-after.png") });
  await news.getByRole("button", { name: "Secteur", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await news.getByRole("button", { name: "Toutes", exact: true }).click();
  await expect(news.getByRole("link", { name: /Voir l'article/ })).toHaveAttribute("href", /cnrl\.com/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
