import type { NewsItem, ProvincialMacroRelease, SyncedWorkspaceData } from "@/src/lib/api/types";
import { classifyNewsCategory, dedupeNewsItems, filterNewsItems, lexicalToneLabel, provinceFirstNewsItems, rankNewsItems, selectPersonalNewsSymbols, sourceHealthLabel, type NewsFiltersState } from "./model";

function news(overrides: Partial<NewsItem> = {}): NewsItem {
  return { id: "n1", title: "La Banque du Canada publie sa décision", summary: "Décision de politique monétaire.", url: "https://example.com/n1", source: "Banque du Canada", category: "Politique monétaire", published_at: "2026-09-03T13:00:00Z", sentiment: "Neutre", sentiment_score: 0, regions: ["CA"], ...overrides };
}

function release(overrides: Partial<ProvincialMacroRelease> = {}): ProvincialMacroRelease {
  return {
    id: "r1",
    region: "QC",
    province: "Québec",
    title: "Investissement majeur au Québec",
    summary: "Publication économique provinciale.",
    category: "Investissement",
    importance: "Élevée",
    importance_score: 90,
    source: "Gouvernement du Québec",
    source_kind: "government",
    source_url: "https://example.com/qc-release",
    published_at: "2026-09-03T13:15:00Z",
    period: null,
    official: true,
    specificity: "province-direct",
    ...overrides,
  };
}

const filters: NewsFiltersState = { primary: "all", region: "all", category: "all", search: "" };

describe("news intelligence model", () => {
  it("ranks at most three top stories deterministically without exposing a market-impact score", () => {
    const items = [news({ id: "generic", source: "Publisher", category: "Other", title: "General update", published_at: "2026-09-03T13:30:00Z" }), news({ id: "boc" }), news({ id: "inflation", source: "Statistique Canada", title: "L’IPC ralentit", category: "Inflation", published_at: "2026-09-03T12:00:00Z" }), news({ id: "old", published_at: "2026-08-01T00:00:00Z" })];
    const ranked = rankNewsItems(items, new Date("2026-09-03T14:00:00Z")).slice(0, 3);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.id).toBe("boc");
    expect(ranked[0]).not.toHaveProperty("impact_expected");
    expect(ranked[0]).not.toHaveProperty("conviction");
  });

  it("filters Canada, a province, category and local search while preserving regions", () => {
    const items = [news(), news({ id: "qc", title: "Emploi au Québec", summary: "Investissement régional", source: "Gouvernement du Québec", category: "Travail", regions: ["QC"] }), news({ id: "on", title: "Ontario housing", summary: "Housing release", category: "Housing", regions: ["ON"] })];
    expect(filterNewsItems(items, { ...filters, primary: "canada" })).toEqual([items[0]]);
    expect(filterNewsItems(items, { ...filters, region: "QC" })[0]?.regions).toEqual(["QC"]);
    expect(filterNewsItems(items, { ...filters, category: "labour" }).map((item) => item.id)).toEqual(["qc"]);
    expect(filterNewsItems(items, { ...filters, search: "investissement" }).map((item) => item.id)).toEqual(["qc"]);
    expect(classifyNewsCategory(items[2]!)).toBe("housing");
  });

  it("distinguishes all regions, Canada and Quebec exactly", () => {
    const items = [
      news({ id: "ca", regions: ["CA"] }),
      news({ id: "qc", regions: ["QC"] }),
      news({ id: "both", regions: ["CA", "QC"] }),
    ];
    expect(filterNewsItems(items, { ...filters, region: "all" }).map((item) => item.id)).toEqual(["ca", "qc", "both"]);
    expect(filterNewsItems(items, { ...filters, region: "CA" }).map((item) => item.id)).toEqual(["ca", "both"]);
    expect(filterNewsItems(items, { ...filters, region: "QC" }).map((item) => item.id)).toEqual(["qc", "both"]);
  });

  it("supports all remaining provinces and keeps Prairie and Atlantic groups", () => {
    const items = [
      news({ id: "sk", regions: ["SK"] }),
      news({ id: "mb", regions: ["MB"] }),
      news({ id: "nb", regions: ["NB"] }),
      news({ id: "ns", regions: ["NS"] }),
      news({ id: "pe", regions: ["PE"] }),
      news({ id: "nl", regions: ["NL"] }),
    ];
    expect(filterNewsItems(items, { ...filters, region: "SK" }).map((item) => item.id)).toEqual(["sk"]);
    expect(filterNewsItems(items, { ...filters, region: "MB" }).map((item) => item.id)).toEqual(["mb"]);
    expect(filterNewsItems(items, { ...filters, region: "NB" }).map((item) => item.id)).toEqual(["nb"]);
    expect(filterNewsItems(items, { ...filters, region: "NS" }).map((item) => item.id)).toEqual(["ns"]);
    expect(filterNewsItems(items, { ...filters, region: "PE" }).map((item) => item.id)).toEqual(["pe"]);
    expect(filterNewsItems(items, { ...filters, region: "NL" }).map((item) => item.id)).toEqual(["nl"]);
    expect(filterNewsItems(items, { ...filters, region: "prairies" }).map((item) => item.id)).toEqual(["sk", "mb"]);
    expect(filterNewsItems(items, { ...filters, region: "atlantic" }).map((item) => item.id)).toEqual(["nb", "ns", "pe", "nl"]);
  });

  it("uses only explicit preferred regions for My regions", () => {
    const items = [news({ id: "ca", regions: ["CA"] }), news({ id: "qc", regions: ["QC"] })];
    expect(filterNewsItems(items, { ...filters, primary: "my-regions" }, [])).toEqual([]);
    expect(filterNewsItems(items, { ...filters, primary: "my-regions" }, ["QC"]).map((item) => item.id)).toEqual(["qc"]);
  });

  it("prioritizes direct provincial releases, enriches duplicates and caps StatCan fallback", () => {
    const releases = [
      release(),
      ...Array.from({ length: 4 }, (_, index) => release({
        id: `statcan-${index}`,
        title: `StatCan release ${index}`,
        source: "Statistique Canada",
        source_kind: "statcan",
        source_url: `https://example.com/statcan-${index}`,
        published_at: `2026-09-03T1${index}:00:00Z`,
        specificity: "province-normalized",
      })),
    ];
    const fallback = [
      news({
        id: "same-direct",
        title: "Investissement majeur au Québec",
        source: "Gouvernement du Québec",
        url: "https://example.com/qc-release?utm_source=mobile",
        regions: ["QC"],
        image_url: "https://images.example.com/qc-release.jpg",
      }),
      news({
        id: "statcan-extra",
        title: "StatCan extra",
        source: "Statistique Canada",
        url: "https://example.com/statcan-extra",
        regions: ["QC"],
      }),
    ];

    const items = provinceFirstNewsItems(releases, fallback, "QC");
    expect(items[0]?.source).toBe("Gouvernement du Québec");
    expect(items[0]?.image_url).toBe("https://images.example.com/qc-release.jpg");
    expect(items.filter((item) => item.source === "Statistique Canada")).toHaveLength(1);
  });

  it("keeps FR and EN lexical tone explicitly separate from market impact", () => {
    expect(lexicalToneLabel("Négative", "fr")).toBe("Tonalité lexicale · Négative");
    expect(lexicalToneLabel("Negative", "en")).toBe("Lexical tone · Negative");
    expect(lexicalToneLabel("Positive", "en").toLowerCase()).not.toContain("market impact");
  });

  it("normalizes source health without exposing raw technical errors", () => {
    expect(sourceHealthLabel({ source: "StatCan", status: "ok", detail: null }, "fr")).toBe("Disponible");
    expect(sourceHealthLabel({ source: "BC Finance", status: "stale-cache", detail: "ConnectTimeout" }, "fr")).toBe("Dernières données disponibles");
    expect(sourceHealthLabel({ source: "Québec", status: "error", detail: "HTTP 500" }, "en")).toBe("Unavailable");
  });

  it("selects portfolio before watchlist, deduplicates and caps stock-news at five", () => {
    const workspace = { portfolio: [{ symbol: "RY.TO" }, { symbol: "TD" }], watchlist: ["TD", "CNQ", "SHOP", "BMO", "BCE", "AEM"] } as SyncedWorkspaceData;
    expect(selectPersonalNewsSymbols(workspace)).toEqual(["RY", "TD", "CNQ", "SHOP", "BMO"]);
  });

  it("deduplicates only near-identical stories from the same source and close window", () => {
    const original = news({ id: "a", title: "Canada employment rises in August", source: "StatCan", published_at: "2026-09-03T13:00:00Z", image_url: "https://images.example.com/jobs.jpg" });
    const duplicate = news({ id: "b", title: "Canada employment rises in August", source: "StatCan", published_at: "2026-09-03T13:30:00Z" });
    const otherSource = news({ id: "c", title: duplicate.title, source: "Another publisher", published_at: duplicate.published_at });
    const distinct = news({ id: "d", title: "Canada unemployment rate changes", source: "StatCan", published_at: duplicate.published_at });
    const deduplicated = dedupeNewsItems([original, duplicate, otherSource, distinct]);
    expect(deduplicated.map((item) => item.id).sort()).toEqual(["b", "c", "d"]);
    expect(deduplicated.find((item) => item.id === "b")?.image_url).toBe("https://images.example.com/jobs.jpg");
  });
});
