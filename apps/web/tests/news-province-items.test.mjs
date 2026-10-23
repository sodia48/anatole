import { test } from "node:test";
import assert from "node:assert/strict";
import { provinceItems, provinceStatuses } from "../public/news-province-items.mjs";

test("direct provincial releases precede a bounded, dated StatCan fallback", () => {
  const published_at = new Date().toISOString();
  const direct = { id: "qc-1", title: "Emploi au Québec", summary: "Publication provinciale",
    source_url: "https://quebec.example/release", source: "Institut du Québec", category: "Travail",
    published_at, source_kind: "statistics", importance: "Élevée", province: "Québec" };
  const statcan = { id: "ca-1", title: "Labour force", summary: "Official release",
    url: "https://statcan.example/release", source: "Statistique Canada", category: "Travail",
    published_at, regions: ["QC"] };
  const items = provinceItems([direct, { ...direct, id: "old", published_at: "2020-01-01" }],
    [statcan, { ...statcan, id: "duplicate" }, { ...statcan, id: "unrelated", regions: ["ON"] }],
    "QC", "Québec");
  assert.deepEqual(items.map(item => item.id), ["qc-1", "official-ca-1"]);
  assert.equal(items[0].publishedAt, published_at);
  assert.equal(provinceStatuses(items, "fr")[0].detail, "1 publication officielle datée.");
});
