import { expect, test } from "@playwright/test";

test("Focus official reports show exact passages, verified pages and bounded comparison", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/stocks/RY/fundamental-intelligence/documents*", route => {
    const url = new URL(route.request().url());
    requests.push(url.searchParams.get("query") ?? "");
    const source = "https://issuer.example/annual-2025.pdf";
    const prior = "https://issuer.example/annual-2024.pdf";
    const passage = (document_url: string, document_title: string, published_at: string, page_number: number, excerpt: string) => ({
      document_url, document_title, document_type: "annual", published_at, page_number, topic: "results", excerpt,
    });
    const current = passage(source, "Annual report 2025", "2026-02-10T00:00:00Z", 3, "Revenue increased to 100 CAD in the annual period.");
    const previous = passage(prior, "Annual report 2024", "2025-02-10T00:00:00Z", 4, "Revenue increased to 90 CAD in the annual period.");
    return route.fulfill({ json: {
      ticker: "RY.TO", status: "available", query: url.searchParams.get("query"), source_stale: false, documents_scanned: 2,
      documents: [{ url: source, title: "Annual report 2025", document_type: "annual", published_at: current.published_at, pages_scanned: 24 },
        { url: prior, title: "Annual report 2024", document_type: "annual", published_at: previous.published_at, pages_scanned: 24 }],
      passages: [current, previous], reported_observations: [], comparisons: [{ topic: "results", current, previous, status: "different_excerpt",
        note: "Text differs between publications; significance requires review." }],
      limitations_fr: ["Page vérifiée dans le PDF."], limitations_en: ["Page verified in the PDF."],
    } });
  });
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Rapports" }).click();
  const panel = page.getByRole("region", { name: "Recherche dans les rapports officiels" });
  await expect(panel.getByText("Revenue increased to 100 CAD in the annual period.").first()).toBeVisible();
  await expect(panel.getByRole("link", { name: /Annual report 2025 · page 3/ }).first()).toHaveAttribute("href", "https://issuer.example/annual-2025.pdf#page=3");
  await panel.getByRole("textbox", { name: "Rechercher un terme ou une expression" }).fill("Revenue");
  await panel.getByRole("button", { name: "Rechercher" }).click();
  await expect.poll(() => requests.includes("Revenue")).toBe(true);
  await expect(panel.getByText(/Différence de texte à examiner/)).toBeVisible();
  await expect(panel.getByText("Revenue increased to 90 CAD in the annual period.").first()).toBeVisible();
});
