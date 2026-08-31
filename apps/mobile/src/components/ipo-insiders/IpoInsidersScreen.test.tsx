import { act, fireEvent, render, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState, Linking } from "react-native";

import { IpoInsidersScreen } from "./IpoInsidersScreen";

const mockUseQuery = jest.fn();
const mockCancelQueries = jest.fn(async () => undefined);
const mockIpo = jest.fn();
const mockInsiders = jest.fn();
let appStateHandler: ((state: string) => void) | undefined;

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { ipo: (...args: unknown[]) => mockIpo(...args), insiders: (...args: unknown[]) => mockInsiders(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options), useQueryClient: () => ({ cancelQueries: mockCancelQueries }) }));

const ipoSnapshot = {
  items: [{ id: "ipo-1", event_date: "2026-09-15T12:00:00Z", company: "Maple Corp", symbol: "MAP", symbols: ["MAP"], exchange: "TSX", country: "Canada", event_type: "Nouvelle inscription", status: "À venir", instrument_type: "company", instrument_label: "Société", source_name: "TSX", source_url: "https://tsx.example/map", official: true, confidence_score: 100, focus_available: true, offer_price: 12, offer_price_low: null, offer_price_high: null, offer_currency: "CAD", offer_price_status: "final", offer_price_label: "Prix IPO final", price_source_url: null }],
  summary: { total: 1, canada: 1, united_states: 0, companies: 1, newly_listed: 1, regulatory_filings: 0 }, sources: [{ source: "TSX", status: "available", count: 1, detail: null, url: "https://tsx.example" }], generated_at: "2026-08-31T12:00:00Z", refresh_after_seconds: 1800, message: null,
};

const insiderSnapshot = {
  trades: [{ id: "trade-1", ticker: "RY", company: "Royal Bank", market: "Canada", insider_name: "Jane Doe", role: "Director", transaction_type: "buy", transaction_label: "Achat", transaction_code: "P", trade_date: "2026-08-28", filing_date: "2026-08-29", shares: 1000, price: 200, value: 200000, holdings_after: 5000, ownership: "Direct", unusual: true, source_name: "Finnhub", source_url: "https://example.com", official_verification_url: "https://official.example/ry", official_source: false }],
  summary: { transactions: 1, companies: 1, buys: 1, sells: 0, grants_and_exercises: 0, buy_value: 200000, sell_value: 0, net_value: 200000, buy_ratio_percent: 100, unusual_transactions: 1 }, sources: [{ source: "Finnhub", status: "available", count: 1, detail: null, url: "https://example.com" }], market: "Canada", requested_ticker: null, scanned_symbols: 8, generated_at: "2026-08-31T12:00:00Z", refresh_after_seconds: 900, message: null,
};

ipoSnapshot.items.push({
  ...ipoSnapshot.items[0]!,
  id: "ipo-2",
  company: "Maple Two",
  symbol: "MAP2",
  symbols: ["MAP2"],
  source_url: "https://tsx.example/map2",
  focus_available: false,
});
insiderSnapshot.trades.push({ ...insiderSnapshot.trades[0]! });

let currentInsiders: any = insiderSnapshot;

function resultFor(options: { queryKey: unknown[]; enabled?: boolean }) {
  const key = String(options.queryKey[0]);
  const data = key === "ipo" ? ipoSnapshot : options.queryKey[1] === "enriched" && options.enabled === false ? undefined : currentInsiders;
  return { data, isLoading: false, isError: false, isSuccess: true, isFetching: false, isRefetching: false, error: null, refetch: jest.fn(async () => ({ data })) };
}

describe("mobile IPO and insider radar", () => {
  beforeEach(() => {
    currentInsiders = insiderSnapshot;
    mockUseQuery.mockReset();
    mockUseQuery.mockImplementation(resultFor);
    mockCancelQueries.mockClear();
    mockIpo.mockResolvedValue(ipoSnapshot);
    mockInsiders.mockResolvedValue(insiderSnapshot);
    jest.mocked(router.push).mockClear();
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders IPOs, then applies the complete progressive insider flow", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const view = await render(<IpoInsidersScreen />);
    const user = userEvent.setup();
    expect(new Set(ipoSnapshot.items.map((item) => item.id)).size).toBe(ipoSnapshot.items.length);
    expect(view.getByTestId("ipo-card-ipo-1")).toBeTruthy();
    expect(view.getByTestId("ipo-card-ipo-2")).toBeTruthy();
    expect(view.getByText("Maple Corp")).toBeTruthy();
    expect(view.getAllByText(/12,00/)).toHaveLength(2);
    expect(view.getAllByText("Source : TSX")).toHaveLength(2);
    await user.press(view.getByTestId("ipo-focus-MAP"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/focus/[ticker]", params: { ticker: "MAP" } });
    await user.press(view.getByTestId("ipo-source-ipo-1"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://tsx.example/map");
    await user.press(view.getByTestId("insiders-tab"));
    expect(view.getAllByTestId("insider-card-trade-1")).toHaveLength(1);
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/same key|duplicate key/i);
    expect(view.getByText("Royal Bank")).toBeTruthy();
    expect(view.getByText("Source : Finnhub")).toBeTruthy();
    const previewOptions = mockUseQuery.mock.calls.map(([value]) => value).find((value) => value.queryKey?.[1] === "preview");
    const previewController = new AbortController();
    await previewOptions.queryFn({ signal: previewController.signal });
    expect(mockInsiders).toHaveBeenCalledWith(expect.objectContaining({ market: "canada", days: 180, scanLimit: 8 }), previewController.signal);

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 750)); });
    const enrichedOptions = mockUseQuery.mock.calls.map(([value]) => value).filter((value) => value.queryKey?.[1] === "enriched").at(-1);
    expect(enrichedOptions.enabled).toBe(true);
    await enrichedOptions.queryFn({ signal: previewController.signal });
    expect(mockInsiders).toHaveBeenCalledWith(expect.objectContaining({ scanLimit: 24 }), previewController.signal);

    await user.press(view.getByTestId("insider-focus-RY"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/focus/[ticker]", params: { ticker: "RY" } });
    fireEvent.press(view.getByTestId("insider-source-trade-1"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://official.example/ry");
    await user.press(view.getByTestId("insider-market-us"));
    const usPreview = mockUseQuery.mock.calls.map(([value]) => value).filter((value) => value.queryKey?.[1] === "preview" && value.queryKey?.[2] === "us").at(-1);
    await usPreview.queryFn({ signal: previewController.signal });
    expect(mockInsiders).toHaveBeenCalledWith(expect.objectContaining({ market: "us", scanLimit: 10 }), previewController.signal);
    await user.press(view.getByTestId("insider-days-30"));
    await user.press(view.getByTestId("insider-type-sell"));
    expect(view.getByTestId("insider-type-sell").props.accessibilityState.selected).toBe(true);
    fireEvent.changeText(view.getByPlaceholderText("RY"), "RY");
    await user.press(view.getByTestId("insider-ticker-submit"));
    const tickerPreview = mockUseQuery.mock.calls.map(([value]) => value).filter((value) => value.queryKey?.[1] === "preview" && value.queryKey?.[4] === "RY").at(-1);
    await tickerPreview.queryFn({ signal: previewController.signal });
    expect(mockInsiders).toHaveBeenCalledWith(expect.objectContaining({ ticker: "RY", scanLimit: 1 }), previewController.signal);
    act(() => appStateHandler?.("background"));
    expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ["insiders"] });
    await view.unmount();
  });
});
