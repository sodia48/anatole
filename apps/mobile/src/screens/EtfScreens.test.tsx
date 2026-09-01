import { act, fireEvent, render, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";

import EtfDetailScreen from "@/app/etf/[ticker]";
import EtfDirectoryScreen, { filterEtfDirectory } from "@/app/etf";

const mockSaveWorkspace = jest.fn();
const mockUseQuery = jest.fn();

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({ ticker: "XIU" }) }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }) }));
jest.mock("@/src/components/ChartWebView", () => {
  const { View } = jest.requireActual("react-native");
  return { ChartWebView: () => <View testID="etf-chart" /> };
});
jest.mock("@/src/providers/MobileAccountProvider", () => ({
  useMobileAccount: () => ({
    saveWorkspace: mockSaveWorkspace,
    workspace: { revision: 1, updated_at: null, data: { watchlist: [], portfolio: [], alerts: [], preferences: {}, cockpit_universe: "tsx60", comparator_symbols: [], focus_layouts: [], focus_scripts: [], terminal_presets: [] } },
  }),
}));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { etfDirectory: jest.fn(), etfHoldings: jest.fn(), etfHistory: jest.fn() } }));

const directory = {
  items: [
    { ticker: "XIU", symbol: "XIU.TO", name: "iShares S&P/TSX 60", provider: "BlackRock", category: "Actions", exposure: "Canada large cap", currency: "CAD", price: 41.2, change_percent: 0.8, volume: 1_200_000, source: "Yahoo Finance", delayed: true },
    { ticker: "ZAG", symbol: "ZAG.TO", name: "BMO Aggregate Bond", provider: "BMO", category: "Obligations", exposure: "Canadian bonds", currency: "CAD", price: 14.5, change_percent: -0.2, volume: 220_000, source: "Yahoo Finance", delayed: true },
    { ticker: "CGL", symbol: "CGL.C.TO", name: "CIBC Gold Bullion", provider: "CIBC", category: "Matières premières", exposure: "Gold bullion", currency: "CAD", price: 31.4, change_percent: 0.1, volume: 0, source: "unavailable", delayed: true },
  ],
  categories: ["Actions", "Matières premières", "Obligations"],
  generated_at: "2026-08-30T14:00:00Z",
  refresh_after_seconds: 45,
};

const holdings = {
  ticker: "XIU", normalized_symbol: "XIU.TO", name: "iShares S&P/TSX 60", provider: "BlackRock", category: "Actions", exposure: "Canada large cap", description: "Tracks the S&P/TSX 60.", currency: "CAD", price: 41.2, change_percent: 0.8,
  holdings: [
    { rank: 1, symbol: "RY.TO", display_symbol: "RY", name: "Royal Bank", instrument_type: "equity", weight_percent: 8.2, price: 200, currency: "CAD", change_percent: 1.2, contribution_percent_points: 0.098, source: "Yahoo Finance", delayed: true },
    { rank: 2, symbol: "TD.TO", display_symbol: "TD", name: "Toronto-Dominion Bank", instrument_type: "equity", weight_percent: 6.5, price: null, currency: "CAD", change_percent: null, contribution_percent_points: null, source: "Yahoo Finance", delayed: true },
  ],
  sectors: [{ key: "financial-services", label: "Services financiers", weight_percent: 36.4 }],
  asset_classes: [{ key: "equity", label: "Actions", weight_percent: 99.6 }],
  top_holdings_weight_percent: 14.7, net_driver_contribution_percent_points: 0.098, positive_driver_contribution_percent_points: 0.098, negative_driver_contribution_percent_points: 0,
  quoted_holdings: 1, total_holdings_returned: 2, status: "partial", message: null, source_name: "Yahoo Finance", source_url: null, generated_at: "2026-08-30T14:00:00Z", refresh_after_seconds: 30,
};

const history = {
  ticker: "XIU", normalized_symbol: "XIU.TO", range: "1y", range_label: "1 an", currency: "CAD", interval: "1d",
  points: [{ timestamp: "2026-08-29T20:00:00Z", open: 40, high: 42, low: 39, close: 41.2, volume: 1_200_000 }], first_close: 40, last_close: 41.2, change: 1.2, change_percent: 3, period_high: 42, period_low: 39,
  status: "available", message: null, delayed: true, source_name: "Yahoo Finance", source_url: null, generated_at: "2026-08-30T14:00:00Z", refresh_after_seconds: 60,
};

jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options) }));

function queryResult(queryKey: unknown[], directoryError = false) {
  const key = String(queryKey[0]);
  const data = key === "etf-directory" ? directory : key === "etf-holdings" ? holdings : history;
  const isError = key === "etf-directory" && directoryError;
  return { data, isLoading: false, isError, isRefetching: false, error: isError ? new Error("offline") : null, refetch: jest.fn() };
}

describe("Canadian ETF mobile experience", () => {
  beforeEach(() => {
    jest.mocked(router.push).mockClear();
    mockSaveWorkspace.mockClear();
    mockUseQuery.mockClear();
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => queryResult(queryKey));
  });

  it("opens on the heatmap by default and keeps the virtualized list secondary", async () => {
    expect(filterEtfDirectory(directory.items, "bond", "all", "all").map((item) => item.ticker)).toEqual(["ZAG"]);
    expect(filterEtfDirectory(directory.items, "", "Actions", "BlackRock").map((item) => item.ticker)).toEqual(["XIU"]);
    expect(filterEtfDirectory(directory.items, "", "Obligations", "BMO").map((item) => item.ticker)).toEqual(["ZAG"]);
    const view = await render(<EtfDirectoryScreen />);
    expect(view.getByTestId("etf-directory-screen")).toBeTruthy();
    expect(view.getByTestId("etf-heatmap")).toBeTruthy();
    expect(view.queryByTestId("etf-row-XIU")).toBeNull();
    await act(async () => { fireEvent.press(view.getByTestId("etf-view-list")); });
    expect(view.getByTestId("etf-row-XIU")).toBeTruthy();
    expect(view.getByPlaceholderText("Ticker, nom, exposition…")).toBeTruthy();
    expect(view.getByText("BMO")).toBeTruthy();
    expect(view.getByTestId("etf-row-ZAG")).toBeTruthy();
    expect(view.getByTestId("etf-row-CGL")).toBeTruthy();
    await act(async () => view.unmount());
  });

  it("explains the sector Top 10 and opens the complete sector in the existing list", async () => {
    const view = await render(<EtfDirectoryScreen />);
    expect(view.getByText("Top 10 par secteur selon la liquidité disponible")).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId("etf-heatmap-group-Actions")); });
    expect(view.getByTestId("etf-heatmap-view-all-sector")).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId("etf-heatmap-view-all-sector")); });
    expect(view.getByTestId("etf-view-list").props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId("etf-row-XIU")).toBeTruthy();
    expect(view.queryByTestId("etf-row-ZAG")).toBeNull();
    await act(async () => view.unmount());
  });

  it("keeps persisted directory data visible after a refresh error", async () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => queryResult(queryKey, true));
    const view = await render(<EtfDirectoryScreen />);
    expect(mockUseQuery.mock.calls.map(([options]) => options.queryKey)).toContainEqual(["etf-directory"]);
    expect(mockUseQuery.mock.results.at(-1)?.value.isError).toBe(true);
    expect(await view.findByText("Dernières données disponibles")).toBeTruthy();
    expect(await view.findByTestId("etf-heatmap")).toBeTruthy();
    await act(async () => view.unmount());
  });

  it("supports sector, provider and direction modes, drill-down, ETF tap and N/D details", async () => {
    const view = await render(<EtfDirectoryScreen />);
    expect(view.getByTestId("etf-heatmap-mode-sector").props.accessibilityState.selected).toBe(true);
    await act(async () => { fireEvent.press(view.getByTestId("etf-heatmap-mode-provider")); });
    expect(view.getByTestId("etf-heatmap-mode-provider").props.accessibilityState.selected).toBe(true);
    await act(async () => { fireEvent.press(view.getByTestId("etf-heatmap-group-BlackRock")); });
    expect(view.getByTestId("etf-heatmap-back")).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId("etf-heatmap-back")); });
    await act(async () => { fireEvent.press(view.getByTestId("etf-heatmap-mode-direction")); });
    expect(view.getByTestId("etf-heatmap-mode-direction").props.accessibilityState.selected).toBe(true);
    await act(async () => { fireEvent.press(view.getByTestId("etf-heatmap-tile-XIU")); });
    expect(router.push).toHaveBeenCalledWith({ pathname: "/etf/[ticker]", params: { ticker: "XIU" } });
    await act(async () => { fireEvent(view.getByTestId("etf-heatmap-tile-CGL"), "onLongPress"); });
    expect(view.getAllByText("N/D").length).toBeGreaterThan(0);
    await act(async () => view.unmount());
  });

  it("renders ETF X-Ray tabs from one holdings query and opens heatmap holdings in Focus", async () => {
    const view = await render(<EtfDetailScreen />);
    expect(mockUseQuery.mock.calls.map(([options]) => options.queryKey[0])).toEqual(expect.arrayContaining(["etf-holdings", "etf-history"]));
    expect(mockUseQuery.mock.calls.filter(([options]) => options.queryKey[0] === "etf-holdings")).toHaveLength(1);
    expect(await view.findByTestId("etf-chart")).toBeTruthy();
    expect(view.getByTestId("etf-section-overview").props.accessibilityState.selected).toBe(true);
    const user = userEvent.setup();
    await user.press(view.getByTestId("etf-section-xray"));
    expect(await view.findByTestId("etf-xray-panel")).toBeTruthy();
    expect(view.getByTestId("etf-holdings-heatmap")).toBeTruthy();
    expect(view.getByText("Exposition")).toBeTruthy();
    expect(view.getByText("Scores X-Ray")).toBeTruthy();
    expect(view.getByText("Secteurs")).toBeTruthy();
    expect(view.getByText("Catégories d’actifs")).toBeTruthy();
    expect(view.getAllByText("N/D").length).toBeGreaterThan(0);
    expect(view.queryByText("FAKE")).toBeNull();
    await user.press(view.getByTestId("etf-xray-tile-RY"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/stock/[ticker]", params: { ticker: "RY" } });
    await user.press(view.getByTestId("etf-section-risk"));
    expect(view.getByTestId("etf-risk-panel")).toBeTruthy();
    expect(view.getAllByText("N/D").length).toBeGreaterThan(0);
    await user.press(view.getByTestId("etf-section-holdings"));
    expect(await view.findByText("Composition")).toBeTruthy();
    expect(view.getByText("Principaux contributeurs")).toBeTruthy();
    await user.press(view.getByTestId("etf-holding-RY"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/stock/[ticker]", params: { ticker: "RY" } });
    await act(async () => view.unmount());
  });
});
