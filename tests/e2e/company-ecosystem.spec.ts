import { expect, test, type Page, type Route } from "@playwright/test";

const GENERATED_AT = "2026-08-24T12:00:00Z";
const SHOPIFY_AMAZON_URL =
  "https://www.shopify.com/news/shopify-merchants-can-soon-choose-to-offer-buy-with-prime-directly-within-their-shopify-checkout";
const MDA_GLOBALSTAR_URL =
  "https://mda.space/article/mda-space-signs-1.1b-contract-with-globalstar-to-build-next-generation-leo-constellation";

type FixtureNode = {
  id: string;
  ticker: string | null;
  name: string;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  public_company: boolean;
  node_type: "company" | "private_company";
};

const ry = node("RY", "Royal Bank of Canada", "TSX", "Financials");
const shop = node("SHOP", "Shopify", "TSX", "Information Technology");
const amazon = node("AMZN", "Amazon.com", "NASDAQ", "Consumer Discretionary");
const mda = node("MDA", "MDA Space", "TSX", "Industrials");
const globalstar = node("GSAT", "Globalstar", "NYSE American", "Communication Services");

const shopifyAmazon = relationship({
  id: "rel-shop-amazon-partner",
  source: shop,
  target: amazon,
  type: "strategic_partner",
  title: "Shopify merchants can offer Buy with Prime",
  url: SHOPIFY_AMAZON_URL,
  excerpt:
    "Shopify merchants in the U.S. will soon have the option to offer Buy with Prime directly within their Shopify Checkout.",
  issuer: "Shopify",
  contractValue: null,
  currency: null,
});

const mdaGlobalstar = relationship({
  id: "rel-mda-globalstar-contract",
  source: mda,
  target: globalstar,
  type: "major_contract",
  title: "MDA Space signs $1.1B contract with Globalstar",
  url: MDA_GLOBALSTAR_URL,
  excerpt:
    "MDA Space has signed a definitive contract with Globalstar Inc. to be the prime contractor for the satellite operator's next generation low Earth orbit constellation, with a total contract value of approximately $1.1 billion.",
  issuer: "MDA Space",
  contractValue: 1_100_000_000,
  currency: "CAD",
});

function node(
  ticker: string,
  name: string,
  exchange: string,
  sector: string,
): FixtureNode {
  return {
    id: `ticker:${ticker}`,
    ticker,
    name,
    exchange,
    country: ticker === "AMZN" || ticker === "GSAT" ? "United States" : "Canada",
    sector,
    industry: null,
    public_company: true,
    node_type: "company",
  };
}

function relationship({
  id,
  source,
  target,
  type,
  title,
  url,
  excerpt,
  issuer,
  contractValue,
  currency,
}: {
  id: string;
  source: FixtureNode;
  target: FixtureNode;
  type: "strategic_partner" | "major_contract";
  title: string;
  url: string;
  excerpt: string;
  issuer: string;
  contractValue: number | null;
  currency: string | null;
}) {
  return {
    id,
    source_node_id: source.id,
    target_node_id: target.id,
    relationship_type: type,
    direction: "source_to_target",
    status: "active",
    confidence: "verified",
    materiality: contractValue ? "material" : "notable",
    revenue_share_percent: null,
    contract_value: contractValue,
    contract_currency: currency,
    first_seen: "2025-02-10T00:00:00Z",
    last_seen: "2025-02-10T00:00:00Z",
    source_count: 1,
    last_verified_at: "2025-02-10T00:00:00Z",
    evidence: [
      {
        id: `evidence:${id}`,
        relationship_id: id,
        source_type: "press_release",
        title,
        url,
        published_at: "2025-02-10T00:00:00Z",
        document_date: "2025-02-10T00:00:00Z",
        excerpt,
        issuer,
      },
    ],
    correlation_2w: null,
    correlation_1m: null,
    correlation_3m: null,
    correlation_6m: null,
    correlation_1y: null,
    correlation_2y: null,
  };
}

function snapshot(center: FixtureNode, nodes: FixtureNode[], relationships: ReturnType<typeof relationship>[]) {
  return {
    center,
    nodes,
    relationships,
    sector_exposure: relationships.length
      ? [{ sector: nodes.find((item) => item.id !== center.id)?.sector ?? "Other", verified_relationship_count: 1, quantified_revenue_share_percent: null }]
      : [],
    sources: [
      {
        source: "Documents officiels",
        status: relationships.length ? "available" : "partial",
        count: relationships.length,
        detail: relationships.length
          ? "Official issuer evidence loaded."
          : "No explicit public relationship was found in the documents available to this fixture.",
      },
      { source: "SEC", status: "unavailable", count: 0, detail: "No relevant SEC filing in this fixture." },
      { source: "SEDAR+/IR", status: relationships.length ? "available" : "partial", count: relationships.length, detail: "Only traceable official issuer sources are retained." },
      { source: "Finnhub Supply Chain", status: "unavailable", count: 0, detail: "Finnhub Supply Chain non disponible pour ce compte." },
    ],
    generated_at: GENERATED_AT,
    stale: false,
    coverage: {
      depth: 1,
      node_limit: 40,
      truncated: false,
      verified_relationships: relationships.length,
      corroborated_relationships: 0,
      secondary_relationships: 0,
      official_documents_scanned: relationships.length,
      message_fr: relationships.length ? null : "Anatole n'a pas trouvé suffisamment de relations publiques vérifiables pour cette entreprise.",
      message_en: relationships.length ? null : "Anatole did not find enough publicly verifiable relationships for this company.",
    },
  };
}

const snapshots = new Map([
  ["RY", snapshot(ry, [ry], [])],
  ["SHOP", snapshot(shop, [shop, amazon], [shopifyAmazon])],
  ["AMZN", snapshot(amazon, [amazon, shop], [shopifyAmazon])],
  ["MDA", snapshot(mda, [mda, globalstar], [mdaGlobalstar])],
  ["GSAT", snapshot(globalstar, [globalstar, mda], [mdaGlobalstar])],
]);

async function mockCompanyNetwork(page: Page): Promise<void> {
  await page.route("**/api/anatole/api/v1/discovery/company-network/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/company-network/path")) {
      await fulfillPath(route, url);
      return;
    }
    const match = url.pathname.match(/\/company-network\/([^/]+)(?:\/evidence)?$/);
    const ticker = decodeURIComponent(match?.[1] ?? "RY").toUpperCase();
    const value = snapshots.get(ticker) ?? snapshot(node(ticker, ticker, "Unknown", "Unknown"), [node(ticker, ticker, "Unknown", "Unknown")], []);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  });
  await page.route("**/api/anatole/api/v1/discovery/company-network/path?**", async (route) => {
    await fulfillPath(route, new URL(route.request().url()));
  });
}

async function fulfillPath(route: Route, url: URL): Promise<void> {
  const fromTicker = (url.searchParams.get("from_ticker") ?? "").toUpperCase();
  const toTicker = (url.searchParams.get("to_ticker") ?? "").toUpperCase();
  const found = fromTicker === "MDA" && toTicker === "GSAT";
  const body = found
    ? {
        from_company: mda,
        to_company: globalstar,
        nodes: [mda, globalstar],
        relationships: [mdaGlobalstar],
        depth: 1,
        generated_at: GENERATED_AT,
        found: true,
        message_fr: null,
        message_en: null,
      }
    : {
        from_company: snapshots.get(fromTicker)?.center ?? ry,
        to_company: snapshots.get(toTicker)?.center ?? ry,
        nodes: [],
        relationships: [],
        depth: 0,
        generated_at: GENERATED_AT,
        found: false,
        message_fr: "Aucun lien vérifié n'a été trouvé dans les données disponibles.",
        message_en: "No verified relationship was found in the available data.",
      };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function openEcosystem(page: Page, ticker: string): Promise<void> {
  await page.goto(`/focus/${ticker}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: /Écosystème|Ecosystem/, exact: true }).click();
  await expect(page.locator('[data-ecosystem-ready="true"]')).toBeVisible();
}

test.describe("Company ecosystem", () => {
  test("verified network, value chain, evidence, path finder and responsive layout", async ({ page }) => {
    test.setTimeout(120_000);
    await mockCompanyNetwork(page);

    await openEcosystem(page, "RY");
    await expect(page.getByText("Anatole n'a pas trouvé suffisamment de relations publiques vérifiables pour cette entreprise.", { exact: true })).toBeVisible();
    await expect(page.getByText("Cette absence ne signifie pas que l'entreprise n'a aucun fournisseur, client ou partenaire.", { exact: true })).toBeVisible();
    await expect(page.getByText(/0 (relations|edges)/)).toBeVisible();

    await openEcosystem(page, "SHOP");
    await expect(page.getByRole("img", { name: /Shopify.*2 (nœuds|nodes).*1 relations/i })).toBeVisible();
    const edge = page.getByRole("button", { name: /Partenaire.*Shopify.*Amazon/i });
    await expect(edge).toBeVisible();
    await edge.click();

    await page.getByRole("button", { name: /Chaîne de valeur|Value chain/, exact: true }).click();
    await expect(page.getByRole("heading", { name: /Partenaires.*coentreprises.*filiales/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /AMZN.*Amazon/i })).toBeVisible();

    await page.getByRole("button", { name: /Preuves|Evidence/, exact: true }).click();
    const evidencePanel = page.getByRole("region", { name: /Relations et preuves|Relationships and evidence/i });
    await expect(evidencePanel.getByText(/Shopify.*Amazon/)).toBeVisible();
    const source = page.getByRole("link", { name: /Voir la source|View source/i });
    await expect(source).toHaveAttribute("href", SHOPIFY_AMAZON_URL);

    await page.getByRole("button", { name: /Réseau|Network/, exact: true }).click();
    await page.getByRole("button", { name: /Amazon.com.*AMZN/i }).click();
    const actions = page.getByRole("status");
    await expect(actions.getByRole("link", { name: /Ouvrir Focus|Open Focus/i })).toHaveAttribute("href", "/focus/AMZN");
    await expect(actions.getByRole("button", { name: /Étendre à la profondeur 2|Expand to depth 2/i })).toBeVisible();
    await actions.getByRole("button", { name: /Recentrer le réseau|Recenter network/i }).click();
    await expect(page.getByRole("heading", { name: /Company ecosystem.*AMZN|Écosystème d’entreprise.*AMZN/i })).toBeVisible();

    await openEcosystem(page, "MDA");
    await expect(page.getByRole("img", { name: /MDA Space.*2 (nœuds|nodes).*1 relations/i })).toBeVisible();
    await page.getByRole("button", { name: /Preuves|Evidence/, exact: true }).click();
    await expect(page.getByText(/1\s?100\s?000\s?000/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Voir la source|View source/i })).toHaveAttribute("href", MDA_GLOBALSTAR_URL);

    const pathFinder = page.getByRole("region", { name: /Trouver le lien avec une entreprise|Find a relationship with a company/i });
    const target = pathFinder.getByLabel(/Entreprise cible|Target company/i);
    await target.fill("GSAT");
    await pathFinder.getByRole("button", { name: /Trouver le lien|Find relationship/i }).click();
    await expect(pathFinder.getByText("Globalstar", { exact: true })).toBeVisible();
    await expect(pathFinder.getByRole("link", { name: /Source/i })).toHaveAttribute("href", MDA_GLOBALSTAR_URL);

    await target.fill("RY");
    await pathFinder.getByRole("button", { name: /Trouver le lien|Find relationship/i }).click();
    await expect(pathFinder.getByText("Aucun lien vérifié n'a été trouvé dans les données disponibles.", { exact: true })).toBeVisible();

    await page.evaluate(() => {
      const preferences = JSON.parse(localStorage.getItem("anatole.preferences.v0.4") ?? "{}");
      localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({ ...preferences, language: "en" }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
    await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Ecosystem", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Company ecosystem.*MDA/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fullscreen" })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
  });
});
