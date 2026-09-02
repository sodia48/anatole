import { act, fireEvent, render, userEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState } from "react-native";

import type { ScreenerRow, ScreenerSnapshot } from "@/src/lib/api/types";
import { ScreenerScreen } from "./ScreenerScreen";

const mockUseQuery = jest.fn();
const mockScreener = jest.fn();
let appStateHandler: ((state: string) => void) | undefined;
let forceRefreshError = false;
let mockRouteParams: { universe?: string; sector?: string } = {};

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => mockRouteParams }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { screener: (...args: unknown[]) => mockScreener(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options) }));

function row(overrides: Partial<ScreenerRow>): ScreenerRow {
  return {
    ticker: "RY", symbol: "RY.TO", name: "Royal Bank of Canada", sector: "Financials", price: 284.17,
    change_percent: 0.25, volume: 1_000_000, average_volume_20d: 900_000, relative_volume: 1.32,
    momentum_20d: 4.12, rsi_14: 58.4, sma_20: 280, sma_50: 270, trend: "bullish", score: 74,
    signal: "Constructif", source: "yahoo-public", delayed: true, ...overrides,
  };
}

const screenerRows = [
  row({}),
  row({ ticker: "SHOP", symbol: "SHOP.TO", name: "Shopify", sector: "Technology", score: 90, signal: "Momentum fort", change_percent: 3, momentum_20d: 12, relative_volume: 0.7, delayed: false }),
  row({ ticker: "ENB", symbol: "ENB.TO", name: "Enbridge", sector: "Energy", score: 42, signal: "Fragile", change_percent: -1, momentum_20d: 20, relative_volume: 3, rsi_14: null }),
  row({ score: 99 }),
];

function snapshot(universe: string): ScreenerSnapshot {
  return { universe, items: screenerRows, sectors: ["Energy", "Financials", "Technology"], generated_at: "2026-08-31T12:00:00Z", refresh_after_seconds: 60, live_items: 3, fallback_items: 1 };
}

function queryResult(options: { queryKey: unknown[] }) {
  const data = snapshot(String(options.queryKey[1]));
  return { data, isLoading: false, isFetching: false, isRefetching: false, isError: forceRefreshError, error: forceRefreshError ? new Error("offline") : null, refetch: jest.fn(async () => ({ data })) };
}

describe("mobile TSX screener", () => {
  beforeEach(() => {
    mockRouteParams = {};
    forceRefreshError = false;
    mockUseQuery.mockReset();
    mockUseQuery.mockImplementation(queryResult);
    mockScreener.mockResolvedValue(snapshot("composite"));
    jest.mocked(router.push).mockClear();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => jest.restoreAllMocks());

  it("opens on Composite, loads TSX60 separately and uses the existing endpoint client", async () => {
    const view = await render(<ScreenerScreen />);
    const user = userEvent.setup();
    expect(view.getByTestId("screener-universe-composite").props.accessibilityState.selected).toBe(true);
    expect(mockUseQuery.mock.calls.at(-1)?.[0].queryKey).toEqual(["screener", "composite"]);
    const options = mockUseQuery.mock.calls.at(-1)?.[0];
    const controller = new AbortController();
    await options.queryFn({ signal: controller.signal });
    expect(mockScreener).toHaveBeenCalledWith("composite", controller.signal);
    await user.press(view.getByTestId("screener-universe-tsx60"));
    expect(mockUseQuery.mock.calls.at(-1)?.[0].queryKey).toEqual(["screener", "tsx60"]);
    expect(view.getByTestId("screener-universe-tsx60").props.accessibilityState.selected).toBe(true);
    await view.unmount();
  });

  it("filters locally, combines modal filters, sorts locally and resets", async () => {
    const view = await render(<ScreenerScreen />);
    const user = userEvent.setup();
    await act(async () => { fireEvent.changeText(view.getByTestId("screener-search"), "shopify"); });
    expect(view.getByTestId("screener-row-SHOP")).toBeTruthy();
    expect(view.queryByTestId("screener-row-RY")).toBeNull();
    await act(async () => { fireEvent.changeText(view.getByTestId("screener-search"), ""); });
    await user.press(view.getByTestId("screener-open-filters"));
    await user.press(view.getByTestId("screener-sector-Financials"));
    await user.press(view.getByTestId("screener-signal-Constructif"));
    await user.press(view.getByTestId("screener-min-score-65"));
    await user.press(view.getByText("Afficher les résultats"));
    expect(view.getByTestId("screener-row-RY")).toBeTruthy();
    expect(view.queryByTestId("screener-row-SHOP")).toBeNull();
    expect(view.getByTestId("screener-active-sector")).toBeTruthy();
    await user.press(view.getByText("Réinitialiser"));
    expect(view.getByTestId("screener-row-SHOP")).toBeTruthy();
    await user.press(view.getByTestId("screener-open-filters"));
    await user.press(view.getByTestId("screener-sort-volume"));
    await user.press(view.getByText("Afficher les résultats"));
    expect(view.getByTestId("screener-results").props.data.map((item: ScreenerRow) => item.ticker)).toEqual(["ENB", "RY", "SHOP"]);
    await view.unmount();
  });

  it("renders N/D, delayed data, unique keys and opens Focus", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const view = await render(<ScreenerScreen />);
    const user = userEvent.setup();
    expect(view.getAllByTestId("screener-row-RY")).toHaveLength(1);
    expect(view.getAllByText("N/D").length).toBeGreaterThan(0);
    expect(view.getByTestId("screener-delayed-RY")).toBeTruthy();
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/same key|duplicate key/i);
    await user.press(view.getByTestId("screener-row-RY"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/stock/[ticker]", params: { ticker: "RY" } });
    await view.unmount();
  });

  it("keeps stale rows and suspends polling while the app is in background", async () => {
    forceRefreshError = true;
    const view = await render(<ScreenerScreen />);
    expect(view.getByText("Dernières données disponibles")).toBeTruthy();
    expect(view.getByTestId("screener-row-RY")).toBeTruthy();
    let options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.refetchInterval({ state: { data: snapshot("composite") } })).toBe(180_000);
    await act(async () => { appStateHandler?.("background"); });
    options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.refetchInterval({ state: { data: snapshot("composite") } })).toBe(false);
    await view.unmount();
  });

  it("restores a TSX60 sector filter from a reloadable deep link", async () => {
    mockRouteParams = { universe: "tsx60", sector: "Financials" };
    const view = await render(<ScreenerScreen />);
    await waitFor(() => expect(view.getByTestId("screener-universe-tsx60").props.accessibilityState.selected).toBe(true));
    expect(view.getByTestId("screener-active-sector")).toBeTruthy();
    expect(view.getByTestId("screener-row-RY")).toBeTruthy();
    expect(view.queryByTestId("screener-row-SHOP")).toBeNull();
    await view.unmount();
  });
});
