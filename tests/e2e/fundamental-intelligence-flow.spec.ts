import { expect, test } from "@playwright/test";

const generated = "2026-10-17T12:00:00Z";
const source = "https://issuer.example/RY-2025.pdf";
const previousSource = "https://issuer.example/RY-2024.pdf";
const metric = (value: number | null, unit: "money" | "percent" = "money") => ({
  value, unit, status: value === null ? "unavailable" : "calculated",
  formula: "Reported baseline × explicit scenario assumption",
  missing_inputs: value === null ? ["annual report input"] : [],
});

test("public research flows from institutional Assistant through Focus evidence to a sourced alert", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    calls.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: {
      intent: "stock_analysis", title: "RY", answer: "## Scénario illustratif\n- Revenus −15 % : calcul, pas prévision.",
      facts: [], links: [], sources: [{ label: "Rapport annuel", detail: source, status: "delayed" }],
      suggestions: [], confidence: "moyenne", disclaimer: "Analyse éducative.", guardrail_triggered: false,
      generated_at: generated, conversation_id: "ba809b54-1d09-4cef-bb4b-bc3afae9175c", context: {},
      actions: [{ label: "Voir scénarios dans Focus", href: "/focus/RY?view=scenarios", kind: "navigate" }],
      evidence: [{ sources: [{ label: "Rapport annuel", type: "fundamental_report", freshness: "delayed", url: source }], missing_data: [] }],
      permission_required: false,
    } });
  });
  await page.route("**/stocks/RY/fundamental-intelligence/scenarios", async (route) => {
    const request = route.request().postDataJSON() as { scenarios: { key: string; revenue_change_percent: number }[] };
    await route.fulfill({ json: {
      ticker: "RY.TO", sector_family: "industrial", baseline_period_end: "2025-12-31T00:00:00Z",
      currency: "CAD", baseline_source: "Issuer annual report", baseline_source_url: source,
      baseline_filed_at: "2026-02-10T00:00:00Z", baseline_stale: false, status: "partial",
      limitations_fr: ["Sensibilités illustratives, pas des prévisions."], limitations_en: ["Illustrative sensitivities."],
      outcomes: request.scenarios.map((scenario) => ({
        key: scenario.key, assumptions: scenario,
        revenue: metric(100 * (1 + scenario.revenue_change_percent / 100)), operating_income: metric(20),
        net_income: metric(null), operating_cash_flow: metric(null), free_cash_flow: metric(null),
        operating_margin: metric(20, "percent"), free_cash_flow_margin: metric(null, "percent"),
        dcf: { status: "unavailable", reason: "Cash flow inputs missing", settings: null,
          projected_fcf: [], enterprise_value: null, net_debt: null, equity_value: null,
          shares_outstanding: null, per_share: null, sensitivity: [], formula: "No DCF without explicit inputs" },
      })),
    } });
  });
  await page.route("**/stocks/RY/fundamental-intelligence/peers*", async (route) => {
    await route.fulfill({ json: {
      target: "RY.TO", sector: "Financials", sector_family: "bank", universe_source: "TSX", universe_as_of: "2026-10-17",
      candidates: [{ ticker: "TD", name: "Toronto-Dominion", sector: "Financials", selection_basis: "Canadian index constituent" }],
      selected: ["TD.TO"], excluded: {}, method_fr: "Même secteur.", method_en: "Same sector.",
      measures: [{ key: "net_margin", label_fr: "Marge nette", label_en: "Net margin",
        basis: "annual", unit: "percent", values: [{ ticker: "RY.TO", value: 15,
          period_end: "2025-12-31T00:00:00Z", source_name: "Issuer annual report", source_url: source,
          source_confidence: "official" }, { ticker: "TD.TO", value: 12,
          period_end: "2025-12-31T00:00:00Z", source_name: "Issuer annual report", source_url: "https://issuer.example/TD-2025.pdf",
          source_confidence: "official" }], median: null, rank: null, sample_size: 2,
        minimum_sample_size: 6, explanation_fr: "Médiane indisponible : échantillon insuffisant.",
        explanation_en: "Median unavailable: insufficient sample." }],
    } });
  });
  await page.route("**/stocks/RY/fundamental-intelligence/documents*", async (route) => {
    const passage = (year: number, url: string, excerpt: string) => ({
      document_url: url, document_title: `Annual report ${year}`, document_type: "annual",
      published_at: `${year + 1}-02-10T00:00:00Z`, page_number: 3, topic: "results", excerpt,
    });
    const current = passage(2025, source, "Revenue rose in the annual period.");
    const previous = passage(2024, previousSource, "Revenue was stable in the annual period.");
    await route.fulfill({ json: {
      ticker: "RY.TO", status: "available", query: null, source_stale: false, documents_scanned: 2,
      documents: [{ url: source, title: current.document_title, document_type: "annual", published_at: current.published_at, pages_scanned: 10 },
        { url: previousSource, title: previous.document_title, document_type: "annual", published_at: previous.published_at, pages_scanned: 10 }],
      passages: [current, previous], reported_observations: [],
      comparisons: [{ topic: "results", current, previous, status: "different_excerpt", note: "Review significance." }],
      limitations_fr: ["Extraits vérifiés."], limitations_en: ["Verified excerpts."],
    } });
  });
  let alertRequest: { rules: Array<{ id: string; event_type: string; threshold: number; cooldown_minutes: number }> } | null = null;
  await page.route("**/api/v1/workspace/alerts/evaluate", async (route) => {
    alertRequest = route.request().postDataJSON() as typeof alertRequest;
    const rule = alertRequest!.rules[0];
    await route.fulfill({ json: {
      items: [{ id: rule.id, symbol: "RY", name: "Royal Bank", metric: null,
        event_type: rule.event_type, alert_type: "price_level", metric_label: "Marge opérationnelle",
        operator: null, threshold: rule.threshold, current_value: 5.5, unit: "points",
        triggered: true, status: "triggered", message: "Baisse de marge publiée dans le rapport annuel officiel.",
        source, event_fingerprint: "RY:margin:2025:filing", event_value: "2025-12-31",
        evaluated_at: generated }], triggered_count: 1, monitored_count: 1, unavailable_count: 0,
      generated_at: generated, refresh_after_seconds: 30,
    } });
  });

  await page.goto("/institutionnel/recherche?symbol=RY&thesis=PRIVATE_RESEARCH_SENTINEL", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Alertes fondamentales" })).toHaveAttribute("href", "/alertes");
  await page.waitForFunction(() => Object.keys(document.querySelector('button[aria-label="Ouvrir Anatole Assistant"]') ?? {}).some((key) => key.startsWith("__reactFiber")));
  await page.getByRole("button", { name: "Ouvrir Anatole Assistant" }).click();
  await page.getByLabel("Votre question").fill("Que deviendraient les ratios si les revenus diminuaient de 15 % pour RY ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  const dialog = page.getByRole("dialog", { name: "Anatole Assistant" });
  await expect(dialog.getByRole("heading", { name: "Scénario illustratif" })).toBeVisible();
  expect(JSON.stringify(calls[0])).not.toContain("PRIVATE_RESEARCH_SENTINEL");
  expect((calls[0].context as { symbol: string }).symbol).toBe("RY");
  expect(calls[0].portfolio_positions).toEqual([]);
  await dialog.getByRole("link", { name: /Voir scénarios dans Focus/ }).click();
  await expect(page).toHaveURL(/\/focus\/RY\?view=scenarios/);
  const scenarios = page.getByRole("region", { name: "Simulateur fondamental" });
  await expect(scenarios.getByRole("link", { name: /Issuer annual report/ })).toHaveAttribute("href", source);
  await expect(scenarios).toContainText("pas des prévisions");

  const views = page.getByRole("navigation", { name: "Vues fondamentales" });
  await views.getByRole("combobox", { name: "Ouvrir un module" }).selectOption("peers");
  const peers = page.getByRole("region", { name: "Comparateur sectoriel" });
  await peers.getByRole("group", { name: "Mode des comparaisons" }).getByRole("button", { name: "Vue cartes" }).click();
  await expect(peers).toContainText("Médiane indisponible");
  await expect(peers.getByRole("link", { name: /Issuer annual report/ }).first()).toHaveAttribute("href", source);
  await views.getByRole("combobox", { name: "Ouvrir un module" }).selectOption("documents");
  const documents = page.getByRole("region", { name: "Recherche dans les rapports officiels" });
  await expect(documents.getByRole("link", { name: /Annual report 2025 · page 3/ }).first()).toHaveAttribute("href", `${source}#page=3`);

  await page.goto("/alertes", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Signaler un problème" })).toHaveAttribute("data-client-ready", "true");
  await page.getByLabel("Symbole").fill("RY");
  await page.getByLabel("Type de règle").selectOption("event");
  await page.getByLabel("Changement minimal").fill("4");
  await page.getByLabel("Rappel minimal").selectOption("10080");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText("Baisse de marge publiée dans le rapport annuel officiel.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Document source" })).toHaveAttribute("href", source);
  expect(alertRequest?.rules[0]).toMatchObject({ event_type: "fundamental_margin_drop", threshold: 4, cooldown_minutes: 10080 });
});
