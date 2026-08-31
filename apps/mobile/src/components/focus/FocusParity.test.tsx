import { act, fireEvent, render } from "@testing-library/react-native";

import { MobileFocusAnalysts } from "./MobileFocusAnalysts";
import { MobileFocusFinancials } from "./MobileFocusFinancials";
import { MobileFocusFundamentals } from "./MobileFocusFundamentals";
import { MobileFocusNavigation } from "./MobileFocusNavigation";
import { MobileFocusPro } from "./MobileFocusPro";
import { focusPeriods } from "./MobileFocusOverview";
import { liveQuoteStatus } from "./liveStatus";
import type { FundamentalMetrics, FundamentalSnapshot } from "@/src/lib/api/types";

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
    expect(view.getByText("Fondamentaux")).toBeTruthy(); expect(view.getByText("Résultats")).toBeTruthy(); expect(view.getByText("Analystes")).toBeTruthy(); expect(view.getByText("Écosystème")).toBeTruthy();
    fireEvent.press(view.getByText("Pro")); expect(onChange).toHaveBeenCalledWith("pro");
  });
  it("renders null backend values as N/D in fundamentals", async () => {
    const view = await render(<MobileFocusFundamentals error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    expect(view.getAllByText("N/D").length).toBeGreaterThan(5); expect(view.getByText(/MIXED/)).toBeTruthy();
    expect(view.getByText("20,67 %")).toBeTruthy(); expect(view.getByText("5,23 %")).toBeTruthy(); expect(view.getByText("0,16 %")).toBeTruthy();
  });
  it("renders financial and analyst snapshots without inventing periods", async () => {
    const financials = await render(<MobileFocusFinancials error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    expect(financials.getByText("Aucune période disponible.")).toBeTruthy();
    const analysts = await render(<MobileFocusAnalysts error={null} loading={false} onRetry={jest.fn()} snapshot={snapshot} />);
    expect(analysts.getByText("BUY")).toBeTruthy(); expect(analysts.getByText("12")).toBeTruthy();
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
