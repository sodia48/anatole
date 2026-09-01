import { act, render, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState } from "react-native";

import type { TerminalOpportunity, TerminalSnapshot } from "@/src/lib/api/types";
import { TerminalScreen } from "./TerminalScreen";

const mockUseQuery = jest.fn();
const mockCancelQueries = jest.fn(async () => undefined);
const mockTerminal = jest.fn();
let appStateHandler: ((state: string) => void) | undefined;
let refreshError = false;

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { terminal: (...args: unknown[]) => mockTerminal(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options), useQueryClient: () => ({ cancelQueries: mockCancelQueries }) }));

function item(overrides: Partial<TerminalOpportunity>): TerminalOpportunity {
  return { symbol: "RY", name: "Royal Bank", sector: "Financials", price: 200, change_percent: 1, momentum_20d: 5, rsi_14: 55, relative_volume: 1.4, score: 82, signal: "Constructif", opportunity_type: "Leadership", reasons: ["Score Anatole élevé"], ...overrides };
}

const lowRy = item({ score: 60 });
const ry = item({});
const shop = item({ symbol: "SHOP", name: "Shopify", sector: "Technology", score: 92, change_percent: 3, momentum_20d: 14, relative_volume: 0.8 });
const enb = item({ symbol: "ENB", name: "Enbridge", sector: "Energy", score: 45, change_percent: -2, momentum_20d: 20, relative_volume: 3, rsi_14: null, opportunity_type: "Sous pression" });

const terminalSnapshot: TerminalSnapshot = {
  universe: "S&P/TSX 60", regime: "Constructif", regime_score: 72, risk_level: "Modéré", weighted_change_percent: 0.7,
  advance_ratio: 63, average_anatole_score: 68, average_momentum_20d: 4.5, above_sma20_percent: 61,
  above_sma50_percent: 58, high_relative_volume_count: 4,
  components: [{ key: "breadth", label: "Largeur du marché", score: 70, value: "38 hausses", description: "38 hausses contre 22 baisses." }],
  sectors: [
    { sector: "Financials", change_percent: 1, momentum_20d: 5, average_score: 72, relative_volume: 1.3, advancers: 8, decliners: 2, leadership_score: 84, state: "Leadership" },
    { sector: "Technology", change_percent: -0.5, momentum_20d: 2, average_score: 60, relative_volume: 0.9, advancers: 2, decliners: 3, leadership_score: 55, state: "Neutre" },
  ],
  opportunities: [lowRy, shop], leaders: [ry], laggards: [enb],
  alerts: [
    { id: "volume:RY", severity: "high", category: "Prix-volume", symbol: "RY", title: "Activité inhabituelle", detail: "Volume relatif élevé." },
    { id: "market-breadth", severity: "watch", category: "Marché", symbol: null, title: "Largeur fragile", detail: "Largeur à surveiller." },
  ],
  methodology: "Méthodologie complète du Terminal.", generated_at: "2026-09-01T12:00:00Z", refresh_after_seconds: 30,
};

function queryResult() {
  return { data: terminalSnapshot, isLoading: false, isError: refreshError, isRefetching: false, error: refreshError ? new Error("offline") : null, refetch: jest.fn(async () => ({ data: terminalSnapshot })) };
}

describe("mobile Pro Terminal", () => {
  beforeEach(() => {
    refreshError = false;
    mockUseQuery.mockReset();
    mockUseQuery.mockImplementation(queryResult);
    mockTerminal.mockResolvedValue(terminalSnapshot);
    mockCancelQueries.mockClear();
    jest.mocked(router.push).mockClear();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => jest.restoreAllMocks());

  it("uses the Terminal endpoint and renders backend regime, risk, KPI, radar, rotation and alerts", async () => {
    const view = await render(<TerminalScreen />);
    const user = userEvent.setup();
    const options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.queryKey).toEqual(["terminal"]);
    const controller = new AbortController();
    await options.queryFn({ signal: controller.signal });
    expect(mockTerminal).toHaveBeenCalledWith(controller.signal);
    expect(view.getAllByText("72/100").length).toBeGreaterThan(0);
    expect(view.getAllByText("Constructif").length).toBeGreaterThan(0);
    expect(view.getByText("Risque · Modéré")).toBeTruthy();
    expect(view.getByText("S&P/TSX 60")).toBeTruthy();
    expect(view.getByText("Au-dessus MM20")).toBeTruthy();
    expect(view.getAllByTestId("terminal-radar-RY")).toHaveLength(1);
    expect(view.getByTestId("terminal-sector-Financials")).toBeTruthy();
    expect(view.getAllByText("Leadership").length).toBeGreaterThan(0);
    expect(view.getByTestId("terminal-alert-volume:RY")).toBeTruthy();
    expect(view.getByText("HIGH")).toBeTruthy();
    const ids = view.getByTestId("terminal-list").props.data.map((entry: { id: string }) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    await user.press(view.getByText("Royal Bank"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/stock/[ticker]", params: { ticker: "RY" } });
    await user.press(view.getByTestId("terminal-alert-volume:RY"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/stock/[ticker]", params: { ticker: "RY" } });
    await user.press(view.getByTestId("terminal-open-psychology"));
    expect(router.push).toHaveBeenCalledWith("/psychology");
    await view.unmount();
  });

  it("filters the radar by sector and reveals reasons, components and methodology", async () => {
    const view = await render(<TerminalScreen />);
    const user = userEvent.setup();
    await user.press(view.getByTestId("terminal-filter-sector-Financials"));
    expect(view.getByTestId("terminal-radar-RY")).toBeTruthy();
    expect(view.queryByTestId("terminal-radar-SHOP")).toBeNull();
    await user.press(view.getByTestId("terminal-reasons-RY"));
    expect(view.getByText(/Score Anatole élevé/)).toBeTruthy();
    expect(view.queryByTestId("terminal-component-breadth")).toBeNull();
    await user.press(view.getByTestId("terminal-details-toggle"));
    expect(view.getByTestId("terminal-component-breadth")).toBeTruthy();
    expect(view.getByText("Méthodologie complète du Terminal.")).toBeTruthy();
    await view.unmount();
  });

  it("keeps stale data, enforces the 60-second minimum and cancels in background", async () => {
    refreshError = true;
    const view = await render(<TerminalScreen />);
    expect(view.getByText("Dernières données disponibles")).toBeTruthy();
    let options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.refetchInterval({ state: { data: terminalSnapshot } })).toBe(60_000);
    await act(async () => { appStateHandler?.("background"); });
    options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.refetchInterval({ state: { data: terminalSnapshot } })).toBe(false);
    expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ["terminal"] });
    expect(view.getByTestId("terminal-radar-RY")).toBeTruthy();
    await view.unmount();
  });
});
