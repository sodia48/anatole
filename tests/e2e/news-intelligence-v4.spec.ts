import { expect, test } from "@playwright/test";

const published = "2026-10-20T14:30:00Z";
const title = "Enbridge Reports Second Quarter 2026 Financial Results";
const sourceUrl = "https://www.enbridge.com/media-center/news/details?id=123885&lang=en";

function item(index: number) {
  const official = index < 5;
  return {
    id: `enb-${index}`,
    title: index === 0 ? title : official
      ? `Enbridge announces distinct corporate event ${index}`
      : index === 5 ? "Motley Fool looks at Enbridge dividend stocks"
        : `Enbridge market update ${index}`,
    summary: official
      ? index === 0
        ? "Enbridge reported second quarter 2026 results. GAAP earnings were $1.4 billion, compared with $2.2 billion a year earlier."
        : `Enbridge published details of corporate event ${index} on its official site.`
      : index === 5 ? "" : `Enbridge announced a specific market update ${index} in Canada.`,
    publisher: official ? "Enbridge" : index === 5 ? "The Motley Fool" : "Yahoo Finance",
    url: official ? index === 0 ? sourceUrl : `https://www.enbridge.com/media-center/news/details?id=12388${index}&lang=en`
      : `https://finance.yahoo.com/news/enbridge-${index}`,
    published_at: published,
    related_tickers: ["ENB.TO"], relevance: "direct", origin: official ? "company_release" : "publisher",
    image_url: null, event_type: official ? "financial_results" : "other",
    related_sources: index === 0 ? [{ title: "Enbridge second-quarter results explained", publisher: "Independent Wire",
      url: "https://example.com/enbridge-second-quarter", published_at: published, origin: "publisher" }] : [],
  };
}

test("ENB shows official and Yahoo coverage, full brief, load more, and title-only link", async ({ page }, testInfo) => {
  await page.route("**/api/anatole/api/v1/stocks/ENB/news?**", (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
    return route.fulfill({ json: {
    ticker: "ENB", symbol: "ENB.TO", company: "Enbridge", status: "ok", detail: null,
    coverage_note: null, stale: false, generated_at: published, refresh_after_seconds: 900,
    items: Array.from({ length: 8 }, (_, index) => item(index)).slice((pageNumber - 1) * 6, pageNumber * 6),
    total_items: 8, page: pageNumber, page_size: 6, has_more: pageNumber === 1,
  } });
  });
  await page.route("**/api/anatole/api/v1/discovery/news/brief", (route) => {
    const request = route.request().postDataJSON() as { title: string; url: string };
    return route.fulfill({ json: {
      title: request.title,
      summary: "Enbridge a publié ses résultats du deuxième trimestre 2026. Son bénéfice GAAP atteint 1,4 milliard $, contre 2,2 milliards $ un an plus tôt.",
      key_figures: [{ value: "1,4 milliard $", label: "Bénéfice GAAP", period: "T2 2026", kind: "actual", context: "GAAP earnings were $1.4 billion in second quarter 2026." }],
      figure_series: [], changes: ["Le bénéfice GAAP est inférieur aux 2,2 milliards $ de l'année précédente."],
      why_it_matters: "", watch: [], source_url: request.url, source_name: "Enbridge",
      source_mode: "article_page", source_note: "Communiqué officiel consulté.", availability: "article",
      source_language: "en", translation_status: "translated", relevance: "direct", detail_available: true,
      generated_at: published,
    } });
  });

  await page.goto("/focus/ENB");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  const news = page.getByRole("region", { name: /Dernières nouvelles pour ENB/ });
  await expect(news.getByText("8 événements")).toBeVisible();
  await expect(news.getByRole("button", { name: /Lire l’analyse/ })).toHaveCount(5);
  await expect(news.getByRole("link", { name: /Voir l’article original/ })).toHaveCount(1);
  await news.getByText("Autres sources · 1").click();
  await expect(news.getByRole("link", { name: /Independent Wire/ })).toHaveAttribute("href", "https://example.com/enbridge-second-quarter");
  await page.screenshot({ path: testInfo.outputPath("enb-feed-after.png"), fullPage: true });

  await news.getByRole("button", { name: /Enbridge Reports Second Quarter/ }).click();
  const reader = page.getByRole("dialog", { name: title });
  await expect(reader.getByText("20 octobre 2026")).toBeVisible();
  await expect(reader.getByText("1,4 milliard $", { exact: true })).toBeVisible();
  await expect(reader.getByText(/2,2 milliards/).first()).toBeVisible();
  await reader.getByRole("button", { name: "Lire l’article" }).click();
  await expect(reader.getByText("Bénéfice GAAP", { exact: true })).toBeVisible();
  await expect(reader.getByRole("link", { name: "Voir la source originale" })).toHaveAttribute("href", sourceUrl);
  await page.screenshot({ path: testInfo.outputPath("enb-reader-after.png") });
  await reader.getByRole("button", { name: "Fermer" }).click();
  await expect(reader).toHaveCount(0);

  const titleOnly = news.getByRole("link", { name: /Motley Fool.*Voir l’article original/ });
  await expect(titleOnly).toHaveAttribute("href", /finance\.yahoo\.com/);
  await expect(titleOnly).toHaveAttribute("target", "_blank");
  await expect(page.getByText("Informations limitées")).toHaveCount(0);
  await news.getByRole("button", { name: "Charger plus" }).click();
  await expect(news.getByRole("button", { name: /Lire l’analyse/ })).toHaveCount(7);
  await expect(news.getByRole("button", { name: "Charger plus" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/focus\/ENB$/);
});
