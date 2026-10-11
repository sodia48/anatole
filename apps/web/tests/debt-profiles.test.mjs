import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relative, overrides = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } });
  const exports = {};
  new Function("require", "exports", outputText)((id) => overrides[id] ?? require(id), exports);
  return exports;
}
const formatting = load("../lib/debt-profile-format.ts");
const Page = load("../app/taux-obligations/page.tsx", {
  "@/lib/debt-profile-format": formatting,
  "@/components/fixed-income/FixedIncomeClient.module.css": { default: {} },
}).default;
const quality = { status: "limited", freshness: "unavailable", observed_at: null };
const base = { coverage: "limited", borrowing_program_amount: null, debt_outstanding: null,
  average_term: null, recent_issues: [], green_social_sustainable_program: null, quality,
  source_urls: ["https://www.finances.gouv.qc.ca/investor_relations/"] };
const rich = { coverage: "partial", quality: { ...quality, status: "partial" } };
async function render(t, tab, rows) {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => rows }));
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ tab }) }));
}

test("debt amounts use locale, millions/billions and at most two decimals", () => {
  assert.equal(formatting.formatDebtAmount(23_465_000_000, "fr"), "23,47 G CAD");
  assert.equal(formatting.formatDebtAmount(23_465_000_000, "en"), "23.47 B CAD");
  assert.equal(formatting.formatDebtAmount(251_000_000, "fr"), "251 M CAD");
  assert.equal(formatting.formatDebtAmount(600_000_000, "en", "USD"), "600 M USD");
});

test("province SSR renders only available facts and stably sorts richer profiles first", async (t) => {
  const rows = [
    { ...base, code: "YT", name: "Yukon" },
    { ...base, ...rich, code: "QC", name: "Québec", borrowing_program_amount: 23_465_000_000, fiscal_year: "2026-27",
      quality: { ...rich.quality, freshness: "delayed", observed_at: "2026-06-29T00:00:00Z" } },
    { ...base, ...rich, code: "ON", name: "Ontario", borrowing_program_amount: 46_200_000_000 },
    { ...base, code: "NU", name: "Nunavut" },
  ];
  const html = await render(t, "provinces", rows);
  assert.ok(html.indexOf("Québec") < html.indexOf("Ontario") && html.indexOf("Ontario") < html.indexOf("Yukon"));
  assert.ok(html.indexOf("Yukon") < html.indexOf("Nunavut"));
  assert.match(html, /23,47 G CAD/);
  assert.match(html, /46,2 G CAD/);
  assert.match(html, /2026-06-29/);
  assert.match(html, /Source officielle vérifiée; profil chiffré non encore structuré\./);
  assert.match(html, /Official source verified; structured numeric profile not yet available\./);
  assert.doesNotMatch(html, /N\/D|N\/A|Dette en cours|Terme moyen|Dernière émission/);
  assert.equal((html.match(/target="_blank"/g) ?? []).length, 4);
});

test("municipal SSR shows Toronto, Vancouver and Quebec facts without zero or missing-data rows", async (t) => {
  const rows = [
    { ...base, slug: "montreal", city: "Montréal", province: "QC" },
    { ...base, ...rich, slug: "toronto", city: "Toronto", province: "ON", recent_issues: [
      { issue_amount: 450_000_000, currency: "CAD", settlement_date: "2026-04-17", coupon_percent: 4.5, maturity_date: "2055-03-11" },
    ] },
    { ...base, ...rich, slug: "vancouver", city: "Vancouver", province: "BC", bond_programs: ["Green Bond Program", "General Debenture Program"] },
    { ...base, ...rich, slug: "quebec", city: "Québec", province: "QC", borrowing_program_amount: 251_000_000, fiscal_year: "2026" },
  ];
  const html = await render(t, "municipalities", rows);
  assert.ok(html.indexOf("Toronto") < html.indexOf("Montréal"));
  assert.match(html, /450 M CAD/);
  assert.match(html, /251 M CAD/);
  assert.match(html, /Green Bond Program · General Debenture Program/);
  assert.match(html, /Source officielle vérifiée; aucune donnée obligataire structurée exploitable pour le moment\./);
  assert.doesNotMatch(html, /N\/D|N\/A/);
  const sourceOnly = html.slice(html.lastIndexOf("<article"));
  assert.doesNotMatch(sourceOnly, /Émissions vérifiées|Dette en cours|Programme d’emprunt/);
});

test("unavailable sources are not labelled verified and model-like markup stays escaped", async (t) => {
  const html = await render(t, "provinces", [{ ...base, code: "QC", name: "<script>alert(1)</script>",
    coverage: "unavailable", quality: { ...quality, status: "unavailable" } }]);
  assert.match(html, /Source officielle momentanément indisponible/);
  assert.doesNotMatch(html, /Source officielle vérifiée|<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("published issue yield is labelled at issuance and never inferred from coupon", async (t) => {
  const html = await render(t, "provinces", [{ ...base, ...rich, code: "NL", name: "Newfoundland and Labrador",
    recent_issues: [{ issue_date: "2026-09-28", coupon_percent: 3.25, yield_percent: 3.862,
      yield_source: "https://investorrelations.gov.nl.ca/", currency: "CAD", issue_amount: 600_000_000 }] }]);
  assert.match(html, /Rendement publié à l’émission/);
  assert.match(html, /3,86 %/);
  assert.doesNotMatch(html, /spread|Rendement marché/);
});
