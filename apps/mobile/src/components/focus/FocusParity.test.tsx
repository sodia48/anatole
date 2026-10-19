import { act, fireEvent, render } from "@testing-library/react-native";

import { MobileFocusAnalysts } from "./MobileFocusAnalysts";
import { MobileFocusFinancials } from "./MobileFocusFinancials";
import { MobileFocusDiagnostic } from "./MobileFocusDiagnostic";
import { MobileFocusPeers } from "./MobileFocusPeers";
import { MobileFocusScenarios } from "./MobileFocusScenarios";
import { MobileFocusDocuments } from "./MobileFocusDocuments";
import { MobileFocusCapital } from "./MobileFocusCapital";
import { MobileFocusFundamentals } from "./MobileFocusFundamentals";
import { MobileFocusValuation } from "./MobileFocusValuation";
import { MobileFocusNavigation } from "./MobileFocusNavigation";
import { MobileFocusFundamentalTabs } from "./MobileFocusFundamentalTabs";
import { MobileFundamentalPortal } from "./MobileFundamentalPortal";
import { MobileFocusPro } from "./MobileFocusPro";
import { focusPeriods } from "./MobileFocusOverview";
import { liveQuoteStatus } from "./liveStatus";
import type { FinancialPeriod, FundamentalMetrics, FundamentalSnapshot } from "@/src/lib/api/types";
import type { FundamentalDiagnostic, PeerComparison } from "@anatole/shared/fundamental-intelligence";
import { defaultScenarioRequest, type ScenarioSimulation } from "@anatole/shared/fundamental-scenarios";
import type { FundamentalDocumentResearch } from "@anatole/shared/fundamental-documents";
import type { FundamentalCapitalResearch } from "@anatole/shared/fundamental-capital";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

afterEach(() => jest.useRealTimers());

const metricKeys = [
  "market_cap", "enterprise_value", "trailing_pe", "forward_pe", "price_to_book", "price_to_sales",
  "enterprise_to_revenue", "enterprise_to_ebitda", "trailing_eps", "forward_eps", "beta",
  "fifty_two_week_high", "fifty_two_week_low", "average_volume_10d", "average_volume_3m",
  "shares_outstanding", "dividend_rate", "dividend_yield", "payout_ratio", "total_revenue",
  "revenue_per_share", "gross_profit", "ebitda", "net_income_to_common", "free_cash_flow",
  "operating_cash_flow", "total_cash", "total_debt", "debt_to_equity", "current_ratio", "quick_ratio",
  "gross_margin", "operating_margin", "profit_margin", "return_on_assets", "return_on_equity",
  "revenue_growth", "earnings_growth",
] as const;
const metrics = Object.fromEntries(metricKeys.map((key) => [key, null])) as FundamentalMetrics;
const snapshot: FundamentalSnapshot = {
  ticker: "RY.TO", symbol: "RY", name: "Royal Bank", exchange: "TOR", currency: "CAD", financial_currency: "CAD", website: null, sector: "Financials", industry: null,
  status: "partial", message: "Partial official coverage", metrics: { ...metrics, market_cap: 200_000_000_000, gross_margin: 20.6669, operating_margin: 5.2298, revenue_growth: 0.16 }, annual_financials: [], quarterly_financials: [],
  ttm: { period_end: null, currency: "CAD", total_revenue: null }, highlights: { latest_period_end: null, revenue_growth_yoy: null, operating_income_growth_yoy: null, net_income_growth_yoy: null, eps_growth_yoy: null, free_cash_flow_growth_yoy: null, three_year_revenue_cagr: null, three_year_net_income_cagr: null, three_year_free_cash_flow_cagr: null, cash_conversion_percent: null, net_debt_to_ebitda: null },
  earnings_history: [{ period: "Q2", actual: null, estimate: 3.2, surprise_percent: null }], earnings_estimates: [], analysts: { recommendation_key: "buy", recommendation_mean: 2, analyst_count: 12, target_low: null, target_mean: 220, target_median: null, target_high: 250, current_price: 200, upside_to_mean_percent: 10, strong_buy: 3, buy: 6, hold: 3, sell: 0, strong_sell: 0 }, events: { earnings_dates: [], ex_dividend_date: null, dividend_date: null },
  official_coverage: { is_tsx_composite: true, status: "mixed", official_periods: 2, annual_official_periods: 1, quarterly_official_periods: 1, official_fields: 12, sec_cik: null, source_types: ["issuer_official_document"], documents_found: 2, documents_parsed: 2, structured_periods: 0, annual_structured_periods: 0, quarterly_structured_periods: 0, structured_fields: 0, calculated_fields: 0, yahoo_statements_error: null, discovery_url: null, message: "Mixed sources" },
  source: "issuer + public structured data", generated_at: "2026-08-30T00:00:00Z", refresh_after_seconds: 1800,
};

describe("mobile Focus parity", () => {
  it("keeps LIVE as the first mobile Focus period", () => {
    expect(focusPeriods[0]).toEqual({ label: "LIVE", range: "1d", interval: "1m" });
  });
  it("never labels delayed or disconnected quotes as LIVE", () => {
    const pick = (fr: string) => fr;
    expect(liveQuoteStatus("live", false, pick)).toBe("LIVE");
    expect(liveQuoteStatus("live", true, pick)).toBe("CONNECTÉ · DIFFÉRÉ");
    expect(liveQuoteStatus("connecting", false, pick)).toBe("CONNEXION…");
    expect(liveQuoteStatus("offline", false, pick)).toBe("HORS LIGNE");
  });
  it("keeps every functional Focus section in the native navigation", async () => {
    const onChange = jest.fn(); const view = await render(<MobileFocusNavigation onChange={onChange} section="overview" />);
    expect(view.getByText("Fondamentaux")).toBeTruthy();
    expect(view.queryByText("Résultats")).toBeNull();
    expect(view.queryByText("Analystes")).toBeNull();
    expect(view.getByText("Écosystème")).toBeTruthy();
    expect(view.getByText("Intelligence")).toBeTruthy();
    await fireEvent.press(view.getByText("Pro")); expect(onChange).toHaveBeenCalledWith("pro");
  });
  it("nests Results and Analysts under Fundamentals", async () => {
    const onChange = jest.fn();
    const view = await render(<MobileFocusFundamentalTabs view="portal" onChange={onChange} />);
    expect(view.getByText("Intelligence 360°")).toBeTruthy();
    await fireEvent.press(view.getByText(/Autres vues/));
    expect(view.getByText("Résultats")).toBeTruthy();
    expect(view.getByText("Analystes")).toBeTruthy();
    expect(view.getByText("Diagnostic 360°")).toBeTruthy();
    await fireEvent.press(view.getByText("Résultats"));
    await fireEvent.press(view.getByText(/Autres vues/));
    await fireEvent.press(view.getByText("Analystes"));
    expect(onChange).toHaveBeenCalledWith("financials");
    expect(onChange).toHaveBeenCalledWith("analysts");
  });
  it("opens the diagnostic from the eight-module native portal", async () => {
    const onOpen = jest.fn();
    const view = await render(<MobileFundamentalPortal ticker="RY" onOpen={onOpen} />);
    expect(view.getByText("Anatole Fundamental Intelligence 360")).toBeTruthy();
    expect(view.getByTestId("fundamental-portal-assistant")).toBeTruthy();
    await fireEvent.press(view.getByTestId("fundamental-portal-diagnostic"));
    expect(onOpen).toHaveBeenCalledWith("diagnostic");
  });
  it("renders sourced diagnostic values and switches all three native modes", async () => {
    const point = { value: 15, period_end: "2025-12-31T00:00:00Z", period_type: "annual" as const,
      unit: "percent" as const, currency: null, nature: "calculated" as const, formula: "income / revenue",
      inputs: ["net_income", "total_revenue"], source_name: "Issuer report", source_url: "https://issuer.example/report.pdf",
      source_type: "issuer_official_document", source_confidence: "official" as const, filed_at: "2026-02-10T00:00:00Z" };
    const diagnostic = { ticker: "RY.TO", name: "Royal Bank", sector: "Financials", industry: "Bank",
      sector_family: "bank", generated_at: "2026-02-11T00:00:00Z", source_generated_at: "2026-02-10T00:00:00Z",
      stale: true, financial_currency: "CAD", status: "partial", methodology_fr: "Calculs déterministes.",
      methodology_en: "Deterministic calculations.", missing_data: [], global_score: null, sector_metrics: [],
      findings: [{ kind: "observation", text_fr: "Marge publiée.", text_en: "Published margin.", measure_keys: ["net_margin"] }],
      measures: [{ key: "net_margin", label_fr: "Marge nette", label_en: "Net margin", dimension: "profitability",
        unit: "percent", observations: [point], status: "available", reason_fr: null, reason_en: null,
        method_fr: "Bénéfice / revenus", method_en: "Income / revenue" }],
      dimensions: [{ key: "profitability", label_fr: "Rentabilité", label_en: "Profitability", measure_keys: ["net_margin"],
        available_count: 1, score: null, score_status: "insufficient", contributions: [],
        explanation_fr: "Données insuffisantes", explanation_en: "Insufficient data" }],
    } as FundamentalDiagnostic;
    const view = await render(<MobileFocusDiagnostic diagnostic={diagnostic} error={null} loading={false} onRetry={jest.fn()} />);
    expect(view.getByText("Marge publiée.")).toBeTruthy();
    expect(view.getByText(/Instantané périmé/)).toBeTruthy();
    expect(view.getByText("15 %")).toBeTruthy();
    expect(view.getByText(/Issuer report/)).toBeTruthy();
    await fireEvent.press(view.getByText("Tableau"));
    expect(view.getByText("Dernière valeur")).toBeTruthy();
    await fireEvent.press(view.getByText("Graphiques"));
    expect(view.getByText("Historique · pourcentages")).toBeTruthy();
  });
  it("keeps peer medians unavailable for a small sample and supports replacing peers", async () => {
    const comparison = { target: "RY.TO", sector: "Financials", sector_family: "bank", universe_source: "XIC",
      universe_as_of: "2026-10-15", method_fr: "Même secteur, taille comparable.", method_en: "Same sector, comparable size.",
      selected: ["TD.TO"], excluded: {}, candidates: [
        { ticker: "TD", name: "Toronto-Dominion", sector: "Financials", selection_basis: "verified", comparability: "direct" },
        { ticker: "BMO", name: "Bank of Montreal", sector: "Financials", selection_basis: "verified", comparability: "direct" },
      ], measures: [{ key: "revenue_growth", label_fr: "Croissance des revenus", label_en: "Revenue growth", basis: "annual",
        unit: "percent", median: null, rank: null, sample_size: 2, minimum_sample_size: 6,
        explanation_fr: "Échantillon insuffisant.", explanation_en: "Insufficient sample.", values: [
          { ticker: "RY.TO", value: 10, period_end: "2025-12-31T00:00:00Z", source_name: "Issuer report",
            source_url: "https://issuer.example/report.pdf", source_confidence: "official" },
          { ticker: "TD.TO", value: 8, period_end: "2025-12-31T00:00:00Z", source_name: "Issuer report",
            source_url: "https://issuer.example/report.pdf", source_confidence: "official" },
        ] }],
    } as PeerComparison;
    const onSelect = jest.fn();
    const view = await render(<MobileFocusPeers comparison={comparison} error={null} loading={false} onRetry={jest.fn()} onSelect={onSelect} />);
    expect(view.getByText(/Échantillon insuffisant/)).toBeTruthy();
    await fireEvent.press(view.getByText("Voir les sources"));
    expect(view.getAllByText(/Issuer report/).length).toBeGreaterThan(0);
    await fireEvent.press(view.getByText(/Choisir ou remplacer les sociétés/));
    await fireEvent.press(view.getByText(/BMO · Bank of Montreal/));
    expect(onSelect).toHaveBeenCalledWith(["TD", "BMO"]);
    await fireEvent.press(view.getByText("Tableau"));
    expect(view.getByText("Indicateur")).toBeTruthy();
    await fireEvent.press(view.getByText("Graphiques"));
    expect(view.getByText("RY · 10 %")).toBeTruthy();
  });
  it("keeps scenario assumptions editable and values distinct from market prices", async () => {
    const metric = (value: number | null) => ({ value, unit: "money" as const,
      status: value === null ? "unavailable" as const : "calculated" as const,
      formula: "Revenue shock", missing_inputs: value === null ? ["annual report"] : [] });
    const simulation = { ticker: "RY.TO", sector_family: "bank", baseline_period_end: "2025-12-31T00:00:00Z",
      currency: "CAD", baseline_source: "Issuer report", baseline_source_url: "https://issuer.example/report.pdf",
      baseline_filed_at: "2026-02-10T00:00:00Z", baseline_stale: false, status: "partial", limitations_fr: ["Pas des prévisions."],
      limitations_en: ["Not forecasts."], outcomes: defaultScenarioRequest.scenarios.map((assumptions, index) => ({
        key: assumptions.key, assumptions,
        revenue: metric([85, 100, 115][index] ?? null), operating_income: metric(null), net_income: metric(null),
        operating_cash_flow: metric(null), free_cash_flow: metric(null), operating_margin: metric(null),
        free_cash_flow_margin: metric(null), dcf: { status: "unavailable", reason: "Bank-specific model required",
          settings: null, projected_fcf: [], enterprise_value: null, net_debt: null, equity_value: null,
          shares_outstanding: null, per_share: null, sensitivity: [], formula: "Discounted FCF" },
      })) } as ScenarioSimulation;
    const onCalculate = jest.fn();
    const view = await render(<MobileFocusScenarios simulation={simulation} error={null} loading={false}
      onRetry={jest.fn()} onCalculate={onCalculate} />);
    expect(view.getByText(/Pas des prévisions\./)).toBeTruthy();
    await fireEvent.press(view.getByText("Calculer les scénarios"));
    expect(onCalculate).toHaveBeenCalledWith(expect.objectContaining({ scenarios: expect.arrayContaining([
      expect.objectContaining({ key: "prudent", revenue_change_percent: -15 }),
    ]) }));
    await fireEvent.press(view.getByText("Tableau"));
    expect(view.getByText("Indicateur")).toBeTruthy();
    await fireEvent.press(view.getByText("Graphiques"));
    expect(view.getAllByText(/Revenus ·/).length).toBeGreaterThan(0);
  });
  it("shows literal report excerpts with verified pages and an editable search", async () => {
    const passage = { document_url: "https://issuer.example/annual.pdf", document_title: "Annual report",
      document_type: "annual", published_at: "2026-02-10T00:00:00Z", page_number: 3,
      topic: "results" as const, excerpt: "Revenue increased to 100 CAD in the annual period." };
    const research: FundamentalDocumentResearch = { ticker: "RY.TO", status: "available", query: null, source_stale: false,
      documents_scanned: 1, documents: [{ url: passage.document_url, title: passage.document_title,
        document_type: "annual", published_at: passage.published_at, pages_scanned: 20 }],
      passages: [passage], reported_observations: [], comparisons: [],
      limitations_fr: ["Page vérifiée."], limitations_en: ["Page verified."] };
    const onSearch = jest.fn();
    const view = await render(<MobileFocusDocuments research={research} error={null} loading={false}
      onRetry={jest.fn()} onSearch={onSearch} />);
    expect(view.getByText(passage.excerpt)).toBeTruthy();
    expect(view.getByText(/Annual report · page 3/)).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Rechercher un terme ou une expression"), "Revenue");
    await fireEvent.press(view.getByText("Rechercher"));
    expect(onSearch).toHaveBeenCalledWith("Revenue");
  });
  it("separates sourced capital uses from unavailable analyst revisions", async () => {
    const value = (amount: number | null) => ({ value: amount, status: amount === null ? "unavailable" as const : "calculated" as const,
      formula: "Explicit calculation", missing_inputs: amount === null ? ["reported input"] : [] });
    const period = { period_end: "2025-12-31T00:00:00Z", currency: "CAD", source_name: "Issuer report",
      source_url: "https://issuer.example/report.pdf", source_confidence: "official" as const,
      filed_at: "2026-02-10T00:00:00Z", operating_cash_flow: value(70), capital_expenditure: value(20),
      dividends: value(10), repurchases: value(5), free_cash_flow: value(40), cash_after_allocations: value(35),
      capex_share_of_known_uses: value(57), earnings_cash_conversion: value(70), debt_change: value(-10) };
    const research: FundamentalCapitalResearch = { ticker: "RY.TO", status: "partial", financial_currency: "CAD", stale: false,
      periods: [period], analysts: { status: "partial", as_of: "2026-02-10T00:00:00Z", source_name: "Secondary analyst snapshot",
        source_confidence: "secondary_snapshot", recommendation_key: "buy", distribution: { strong_buy: 1, buy: 5, hold: 2, sell: 0, strong_sell: 0 },
        target_low: null, target_mean: 150, target_median: null, target_high: null, target_currency: null, estimates: [],
        actual_vs_consensus: [], revision_history_status: "unavailable", revision_history_reason_fr: "Aucun historique daté des révisions.",
        revision_history_reason_en: "No dated revision history." }, limitations_fr: ["Calcul illustratif."], limitations_en: ["Illustrative calculation."] };
    const view = await render(<MobileFocusCapital research={research} error={null} loading={false} onRetry={jest.fn()} />);
    expect(view.getByText("Aucun historique daté des révisions.")).toBeTruthy();
    await fireEvent.press(view.getByText("Tableau"));
    expect(view.getByText("Indicateur")).toBeTruthy();
    await fireEvent.press(view.getByText("Graphiques"));
    expect(view.getByText(/Flux opérationnel · 70 CAD/)).toBeTruthy();
  });
  it("renders null backend values as N/D in fundamentals", async () => {
    const view = await render(<MobileFocusFundamentals error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    expect(view.getAllByText("N/D").length).toBeGreaterThan(5); expect(view.getByText(/MIXED/)).toBeTruthy();
    expect(view.getByText("20,67 %")).toBeTruthy(); expect(view.getByText("5,23 %")).toBeTruthy(); expect(view.getByText("0,16 %")).toBeTruthy();
    expect(view.queryByText("Capitalisation")).toBeNull();
    expect(view.getByText("Marché")).toBeTruthy();
  });
  it("renders valuation separately for the Price view", async () => {
    const view = await render(<MobileFocusValuation error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    expect(view.getByText("Valorisation")).toBeTruthy();
    expect(view.getByText("Capitalisation")).toBeTruthy();
  });
  it("renders financial and analyst snapshots without inventing periods", async () => {
    const financials = await render(<MobileFocusFinancials error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    expect(financials.getByText("Aucune période disponible.")).toBeTruthy();
    const analysts = await render(<MobileFocusAnalysts error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    expect(analysts.getByText("BUY")).toBeTruthy(); expect(analysts.getByText("12")).toBeTruthy();
  });
  it("switches native statement modes while preserving negative, zero and source data", async () => {
    const periods = [
      { period_end: "2025-12-31", currency: "CAD", total_revenue: 120, net_income: -4,
        free_cash_flow: 0, source: { source_name: "Issuer 2025" } },
      { period_end: "2024-12-31", currency: "CAD", total_revenue: 100, net_income: 5,
        free_cash_flow: null, source: { source_name: "Issuer 2024" } },
    ] as unknown as FinancialPeriod[];
    const view = await render(<MobileFocusFinancials error={null} loading={false} onRetry={jest.fn()}
      snapshot={{ ...snapshot, annual_financials: periods }} />);
    expect(view.getByText("Issuer 2025 · date N/D")).toBeTruthy();
    await fireEvent.press(view.getByText("Graphiques"));
    expect(view.getByText("Évolution des résultats publiés")).toBeTruthy();
    await fireEvent.press(view.getByText("Tableau"));
    expect(view.getByText("États financiers publiés")).toBeTruthy();
    expect(view.getByText("2025-12-31")).toBeTruthy();
  });
  it("uses pie and donut only for a valid native analyst distribution", async () => {
    const view = await render(<MobileFocusAnalysts error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    await fireEvent.press(view.getByText("Graphiques"));
    await fireEvent.press(view.getByText("Secteurs"));
    await fireEvent.press(view.getByText("Anneau"));
    await fireEvent.press(view.getAllByText("Achat fort: 3")[0]!);
    expect(view.getByText(/25\.0 %/)).toBeTruthy();
  });
  it("mounts Focus Pro only through its specialized embed WebView", async () => {
    const view = await render(<MobileFocusPro ticker="RY" />); expect(view.getByTestId("focus-pro-webview")).toBeTruthy();
  });
  it("waits for the configured ACK before declaring Focus Pro ready", async () => {
    const view = await render(<MobileFocusPro ticker="RY" />);
    const webview = view.getByTestId("focus-pro-webview");
    await act(async () => webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: "ready", ticker: "RY" }) } }));
    expect(view.queryByText("Workstation prête")).toBeNull();
    await act(async () => webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: "configured", ticker: "RY", timeframe: "1D", chartType: "candles" }) } }));
    expect(view.getByText("Workstation prête")).toBeTruthy();
  });
  it("shows the bridge timeout and retries without replacing the WebView", async () => {
    jest.useFakeTimers();
    const view = await render(<MobileFocusPro ticker="RY" />);
    const webview = view.getByTestId("focus-pro-webview");
    await act(async () => webview.props.onLoadStart());
    await act(async () => { await jest.advanceTimersByTimeAsync(12_000); });
    expect(view.getByText("Focus Pro met trop de temps à répondre.")).toBeTruthy();
    await act(async () => view.getByTestId("focus-pro-retry").props.onAccessibilityAction({ nativeEvent: { actionName: "activate" } }));
    expect(view.getAllByText("Chargement de Focus Pro…").length).toBeGreaterThan(0);
    expect(view.getByTestId("focus-pro-webview")).toBe(webview);
  });
});
