import { act, fireEvent, render, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState } from "react-native";

import type { TerminalOpportunity, TerminalRadarItem, TerminalRadarPreset, TerminalSnapshot } from "@/src/lib/api/types";
import { TerminalScreen } from "./TerminalScreen";

const mockUseQuery = jest.fn();
const mockCancelQueries = jest.fn(async () => undefined);
const mockTerminal = jest.fn();
const mockSaveWorkspace = jest.fn(async () => undefined);
const mockUseLocale = jest.fn();
let appStateHandler: ((state: string) => void) | undefined;
let refreshError = false;
let mockTerminalPresets: TerminalRadarPreset[] = [];

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => mockUseLocale() }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { terminal: (...args: unknown[]) => mockTerminal(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options), useQueryClient: () => ({ cancelQueries: mockCancelQueries }) }));
jest.mock("@/src/providers/MobileAccountProvider", () => ({ useMobileAccount: () => ({ workspace: { data: { terminal_presets: mockTerminalPresets } }, saveWorkspace: mockSaveWorkspace }) }));

function item(overrides: Partial<TerminalOpportunity>): TerminalOpportunity {
  return { symbol: "RY", name: "Royal Bank", sector: "Financials", price: 200, change_percent: 1, momentum_20d: 5, rsi_14: 55, relative_volume: 1.4, score: 82, signal: "Constructif", opportunity_type: "Leadership", reasons: ["Score Anatole élevé"], ...overrides };
}

const lowRy = item({ score: 60 });
const ry = item({});
const shop = item({ symbol: "SHOP", name: "Shopify", sector: "Technology", score: 92, change_percent: 3, momentum_20d: 14, relative_volume: 0.8 });
const enb = item({ symbol: "ENB", name: "Enbridge", sector: "Energy", score: 45, change_percent: -2, momentum_20d: 20, relative_volume: 3, rsi_14: null, opportunity_type: "Sous pression" });

function radarItem(value: TerminalOpportunity, anomalyTypes: TerminalRadarItem["anomaly_types"] = []): TerminalRadarItem {
  return { ...value, volume: 1_000_000, average_volume_20d: 700_000, sma_20: 190, sma_50: 180, trend: "Haussière", source: "yahoo-public", delayed: true, anomaly_types: anomalyTypes };
}

const latest = Date.UTC(2026, 8, 1) / 1_000;

const terminalSnapshot = {
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
  data_quality: { expected_symbols: 60, real_symbols: 57, unavailable_symbols: ["X"], coverage_percent: 95, history_symbols: 55, history_coverage_percent: 91.7, warnings: ["Couverture affichée"], source_statuses: { yahoo: "available" } },
  regime_horizons: [
    { key: "session", label: "Séance", regime: "Constructif", score: 72, risk_level: "Modéré", change_percent: 0.7, breadth_percent: 63, above_sma20_percent: 61, above_sma50_percent: 58, average_momentum_percent: 4.5, coverage_percent: 95, as_of: "2026-09-01T12:00:00Z" },
    { key: "5d", label: "5J", regime: "Neutre", score: 56, risk_level: "Modéré", change_percent: 1.2, breadth_percent: 55, above_sma20_percent: 58, above_sma50_percent: 54, average_momentum_percent: 2.5, coverage_percent: 92, as_of: "2026-09-01T12:00:00Z" },
    { key: "20d", label: "20J", regime: "Haussier", score: 76, risk_level: "Faible", change_percent: 4.2, breadth_percent: 70, above_sma20_percent: 72, above_sma50_percent: 65, average_momentum_percent: 6.5, coverage_percent: 92, as_of: "2026-09-01T12:00:00Z" },
    { key: "3m", label: "3M", regime: "Fragile", score: 41, risk_level: "Élevé", change_percent: -2.1, breadth_percent: 42, above_sma20_percent: 45, above_sma50_percent: 40, average_momentum_percent: -1.5, coverage_percent: 90, as_of: "2026-09-01T12:00:00Z" },
  ],
  regime_history: [
    { timestamp: latest - 300 * 86_400, regime_score: 40, regime: "Fragile", benchmark_value: 100, breadth_percent: 42, coverage_percent: 90 },
    { timestamp: latest - 150 * 86_400, regime_score: 52, regime: "Neutre", benchmark_value: 105, breadth_percent: 51, coverage_percent: 92 },
    { timestamp: latest - 60 * 86_400, regime_score: 65, regime: "Constructif", benchmark_value: 110, breadth_percent: 61, coverage_percent: 94 },
    { timestamp: latest, regime_score: 72, regime: "Constructif", benchmark_value: 113, breadth_percent: 63, coverage_percent: 95 },
  ],
  breadth_pro: { advancers: 38, decliners: 20, unchanged: 2, advance_ratio: 63, above_sma20_percent: 61, above_sma50_percent: 58, above_sma200_percent: 52, new_highs_52w: 5, new_lows_52w: 1, up_volume: 9_000_000, down_volume: 4_000_000, neutral_volume: 100_000, up_volume_ratio_percent: 68.7, equal_weight_change_percent: 0.8, cap_weight_change_percent: 0.7, concentration_spread_percent_points: -0.1, positive_sectors: 7, negative_sectors: 4, positive_sectors_percent: 63.6, advance_decline_line: [{ timestamp: latest, value: 18 }], coverage_percent: 95, divergence: { active: true, severity: "watch", title: "Divergence", explanation: "Indice positif, largeur fragile." } },
  sector_rotation: [{ sector: "Financials", momentum_20d: 5, relative_strength_20d: 2, breadth_percent: 70, average_score: 72, relative_volume: 1.3, member_count: 10, x: 5, y: 2, previous_x: 3, previous_y: 1, quadrant: "LEADERSHIP", state: "Leadership", leadership_score: 84 }],
  anomalies: [{ id: "anomaly:RY", symbol: "RY", sector: "Financials", type: "volume_spike", severity: "high", direction: "positive", rarity_score: 91, z_score: 3.1, observed_value: 2.4, baseline_value: 1, unit: "x", title: "Volume inhabituel", detail: "Volume supérieur à la moyenne.", reasons: ["z-score 3,1"], source: "yahoo-public", generated_at: "2026-09-01T12:00:00Z" }],
  market_drivers: [
    { key: "wti", label: "WTI", category: "Commodité", value: 72.4, unit: "USD", change_1d: 1, change_5d: 2, change_20d: 4, change_unit: "%", correlation_60d_to_tsx: 0.5, relationship_label: "Corrélation récente positive avec le TSX", status: "available", source_name: "Yahoo", source_url: "https://example.com", delayed: true, as_of: "2026-09-01T12:00:00Z" },
    { key: "canada_10y", label: "Canada 10Y", category: "Taux", value: 3.7, unit: "%", change_1d: 2, change_5d: 8, change_20d: 12, change_unit: "bps", correlation_60d_to_tsx: null, relationship_label: null, status: "available", source_name: "Banque du Canada", source_url: "https://example.com", delayed: true, as_of: "2026-09-01T12:00:00Z" },
    { key: "vix", label: "VIX", category: "Volatilité", value: null, unit: "pts", change_1d: null, change_5d: null, change_20d: null, change_unit: "%", correlation_60d_to_tsx: null, relationship_label: null, status: "unavailable", source_name: "Yahoo", source_url: "https://example.com", delayed: true, as_of: null },
  ],
  radar_items: [radarItem(lowRy, ["volume_spike"]), radarItem(shop), radarItem(enb)],
  methodology_sections: [{ key: "regime", title: "Régime", description: "Formule déterministe." }],
  methodology: "Méthodologie complète du Terminal.", generated_at: "2026-09-01T12:00:00Z", refresh_after_seconds: 30,
} satisfies TerminalSnapshot;

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
    mockSaveWorkspace.mockClear();
    mockTerminalPresets = [];
    mockUseLocale.mockReturnValue({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key });
    jest.mocked(router.push).mockClear();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => jest.restoreAllMocks());

  it("uses one Terminal snapshot and renders multi-horizon, pulse, breadth, rotation, drivers, anomalies and radar", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
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
    expect(view.getByTestId("terminal-horizons")).toBeTruthy();
    expect(view.getByTestId("terminal-market-pulse")).toBeTruthy();
    expect(view.getByTestId("terminal-breadth-pro")).toBeTruthy();
    expect(view.getByTestId("terminal-rotation-matrix")).toBeTruthy();
    expect(view.getByTestId("terminal-drivers")).toBeTruthy();
    expect(view.getByTestId("terminal-anomalies")).toBeTruthy();
    expect(view.getAllByTestId("terminal-radar-RY")).toHaveLength(1);
    expect(view.getByText("Radar · 3/3")).toBeTruthy();
    expect(view.getByText(/8.*bps.*5J/)).toBeTruthy();
    expect(view.getAllByText("N/D").length).toBeGreaterThan(0);
    const ids = view.getByTestId("terminal-list").props.data.map((entry: { id: string }) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    await user.press(view.getByText("Royal Bank"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/stock/[ticker]", params: { ticker: "RY" } });
    await user.press(view.getByTestId("terminal-anomaly-anomaly:RY"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/stock/[ticker]", params: { ticker: "RY" } });
    fireEvent.press(view.getByTestId("terminal-rotation-Financials"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/(tabs)/markets", params: { universe: "tsx60", sector: "Financials" } });
    await user.press(view.getByTestId("terminal-open-psychology"));
    expect(router.push).toHaveBeenCalledWith("/psychology");
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/VirtualizedLists should never be nested|same key|duplicate key/i);
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

  it("changes Market Pulse ranges locally without a second backend request", async () => {
    const view = await render(<TerminalScreen />);
    const user = userEvent.setup();
    const calls = mockTerminal.mock.calls.length;
    await user.press(view.getByTestId("terminal-pulse-6m"));
    await user.press(view.getByTestId("terminal-pulse-1y"));
    await user.press(view.getByTestId("terminal-pulse-3m"));
    expect(mockTerminal.mock.calls.length).toBe(calls);
    expect(view.getByTestId("terminal-pulse-chart")).toBeTruthy();
    await view.unmount();
  });

  it("applies custom radar filters and saves, updates and deletes a workspace preset", async () => {
    mockTerminalPresets = [{ id: "custom", name: "Mon radar", filters: { score_min: 70 }, sort: "score_desc" }];
    const view = await render(<TerminalScreen />);
    const user = userEvent.setup();
    await user.press(view.getByTestId("terminal-preset-custom"));
    expect(view.queryByTestId("terminal-radar-RY")).toBeNull();
    expect(view.getByTestId("terminal-radar-SHOP")).toBeTruthy();
    fireEvent.changeText(view.getByLabelText("Score minimum"), "80");
    fireEvent.changeText(view.getByLabelText("Nom du preset"), "Radar modifié");
    await user.press(view.getByTestId("terminal-preset-save"));
    expect(mockSaveWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ terminal_presets: [expect.objectContaining({ id: "custom", name: "Radar modifié", filters: expect.objectContaining({ score_min: 80 }) })] }));
    await user.press(view.getByTestId("terminal-preset-delete"));
    expect(mockSaveWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ terminal_presets: [] }));
    await view.unmount();
  });

});
