import { expect, test } from "@playwright/test";

const published = "2026-10-20T14:30:00Z";
const title = "Royal Bank of Canada reports quarterly results";
const articleUrl = "https://example.com/ry-results";

test("direct RY results connect sourced facts to fundamentals and the existing assistant", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/stocks/RY/news?**", route => route.fulfill({ json: {
    ticker: "RY.TO", symbol: "RY", company: "Royal Bank of Canada", status: "ok", detail: null,
    generated_at: published, refresh_after_seconds: 900, items: [{ id: "ry-results", title,
      summary: "The bank reported revenue of CAD 17 billion in the latest quarter.", url: articleUrl,
      publisher: "Issuer release", published_at: published, related_tickers: ["RY.TO"],
      relevance: "direct", origin: "company_release", event_type: "results", image_url: null }],
  } }));
  await page.route("**/api/anatole/api/v1/discovery/news/brief", route => route.fulfill({ json: {
    title, summary: "The bank reported revenue of CAD 17 billion in the latest quarter.",
    key_figures: [], figure_series: [], changes: [], why_it_matters: "", watch: [],
    source_url: articleUrl, source_name: "Issuer release", source_mode: "feed_summary",
    source_note: "Publisher excerpt only.", availability: "publisher_excerpt",
    source_language: "en", translation_status: "original", relevance: "direct",
    detail_available: true, generated_at: published,
  } }));
  await page.route("**/api/anatole/api/v1/stocks/RY/fundamentals", route => route.fulfill({ json: {
    ticker: "RY.TO", status: "available", source: "Issuer filing", generated_at: published,
    stale: false, financial_currency: "CAD", metrics: { dividend_rate: null, dividend_yield: null },
    quarterly_financials: [{ period_end: "2026-07-31", total_revenue: 16_000_000_000,
      diluted_eps: 4.5, currency: "CAD", source: { source_name: "Issuer filing",
        source_url: "https://example.com/ry-filing" } }],
    annual_financials: [], earnings_history: [], earnings_estimates: [], analysts: {},
    events: { earnings_dates: [], ex_dividend_date: null, dividend_date: null },
    ttm: {}, highlights: {}, official_coverage: { status: "mixed" },
  } }));
  let sentContext: Record<string, unknown> | undefined;
  await page.route("**/api/anatole/api/v1/assistant/chat", route => {
    sentContext = (route.request().postDataJSON() as { context: Record<string, unknown> }).context;
    return route.fulfill({ json: { intent: "stock_analysis", title: "RY", answer: "Analyse fondée sur les données disponibles.",
      facts: [], sources: [], evidence: [], actions: [], suggestions: [], confidence: "moyenne",
      disclaimer: "", generated_at: published, conversation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      permission_required: false } });
  });

  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: `${title} · Lire l’analyse` }).click();
  const reader = page.getByRole("dialog", { name: title });
  await reader.getByRole("button", { name: "Analyse financière" }).click();
  const impact = reader.getByRole("region", { name: "Impact de la nouvelle" });
  await expect(reader.getByText("The bank reported revenue of CAD 17 billion in the latest quarter.")).toHaveCount(1);
  await expect(impact.getByRole("heading", { name: "Contexte financier" })).toBeVisible();
  await expect(impact.getByText(/16.?000.?000.?000/)).toBeVisible();
  await expect(impact.getByRole("link", { name: "Document source" })).toHaveAttribute("href", "https://example.com/ry-filing");
  await impact.getByRole("button", { name: "Poser une question à Anatole" }).click();
  await expect(reader).toHaveCount(0);
  const assistant = page.getByRole("dialog", { name: "Anatole Assistant" });
  await expect(assistant).toBeVisible();
  await assistant.getByLabel("Votre question").fill("Cette annonce modifie-t-elle les perspectives de revenus ?");
  await assistant.getByRole("button", { name: "Envoyer la question" }).click();
  await expect.poll(() => sentContext).toBeDefined();
  expect(sentContext?.symbol).toBe("RY");
  expect(sentContext?.metadata).toEqual({ news_url: articleUrl, news_title: title });
});
