import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";

import TodayScreen from "@/app/(tabs)/today";

const mockUseQuery = jest.fn();
const mockCancelQueries = jest.fn(async () => undefined);
let appStateHandler: ((state: string) => void) | undefined;
let mockWorkspace = { data: { watchlist: [] as string[], portfolio: [] as { symbol: string; quantity: number; average_cost: number }[], alerts: [] as unknown[] } };
const mockErrorRoots = new Set<string>();
let preserveCachedData = false;

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }) }));
jest.mock("@/src/providers/MobileAccountProvider", () => ({ useMobileAccount: () => ({ user: { display_name: "Ana" }, workspace: mockWorkspace }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { cockpit: jest.fn(), psychology: jest.fn(), news: jest.fn(), calendar: jest.fn(), earnings: jest.fn(), watchlist: jest.fn(), terminal: jest.fn(), screener: jest.fn(), insiders: jest.fn(), stockNews: jest.fn() } }));
jest.mock("@/src/lib/api/workspace", () => ({ workspaceApi: { alerts: jest.fn(), portfolio: jest.fn() } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options), useQueryClient: () => ({ cancelQueries: mockCancelQueries }) }));

const quote = { ticker: "RY", symbol: "RY", name: "Royal Bank", sector: "Financials", weight: 6, price: 200, change: 2, change_percent: 1, volume: 100, source: "public", delayed: true, timestamp: "2026-09-02T15:00:00Z" };
const cockpit = { universe: "S&P/TSX Composite", weighted_change_percent: 0.5, breadth: { advancers: 120, decliners: 80, unchanged: 5, advance_ratio: 60 }, sectors: [{ sector: "Financials", change_percent: 1, weight: 31, advancers: 20, decliners: 10, unchanged: 1 }], constituents: [quote], top_gainers: [quote], top_losers: [], generated_at: "2026-09-02T15:00:00Z", refresh_after_seconds: 60 };
const terminal = {
  schema_version: 2, universe: "S&P/TSX 60", regime: "Constructif", regime_score: 70, risk_level: "Modéré", above_sma50_percent: 58,
  data_quality: { expected_symbols: 60, real_symbols: 58, history_symbols: 56, warnings: [] }, breadth_pro: { divergence: { active: false } },
  components: [], sectors: [], opportunities: [], alerts: [], leaders: [], laggards: [], regime_horizons: [], regime_history: [], sector_rotation: [], market_drivers: [], anomalies: [], radar_items: [], methodology_sections: [],
};
const terminalWithDriver = { ...terminal, market_drivers: [{ key: "wti", label: "WTI", category: "commodity", value: 70, unit: "USD", change_1d: 1.2, change_5d: 2, change_20d: 3, change_unit: "%", correlation_60d_to_tsx: 0.5, relationship_label: null, status: "available", source_name: "public", source_url: "https://example.com", delayed: true, as_of: "2026-09-02T15:00:00Z" }] };
const dataByRoot: Record<string, unknown> = {
  cockpit,
  psychology: { score: 61, label: "Optimiste", components: [], generated_at: "2026-09-02", refresh_after_seconds: 120 },
  news: { items: [], generated_at: "2026-09-02" },
  calendar: { events: [], generated_at: "2026-09-02" },
  earnings: { events: [], companies_with_dates: 0, generated_at: "2026-09-02" },
  terminal: terminalWithDriver,
  screener: { items: [], sectors: [], universe: "Composite", generated_at: "2026-09-02", refresh_after_seconds: 180, live_items: 0, fallback_items: 0 },
  insiders: { trades: [], summary: {}, sources: [], generated_at: "2026-09-02" },
  watchlist: { tickers: ["TD", "CNQ", "RY"], items: [
    { ...quote, ticker: "TD", symbol: "TD", name: "TD Bank", change_percent: -4 },
    { ...quote, ticker: "CNQ", symbol: "CNQ", name: "Canadian Natural", change_percent: 3 },
    { ...quote, ticker: "RY", symbol: "RY", name: "Royal Bank", change_percent: 1 },
  ], summary: { advancers: 2, decliners: 1, unchanged: 0, average_change_percent: 0 }, generated_at: "2026-09-02", refresh_after_seconds: 30 },
  portfolio: { total_market_value: 100, total_day_pnl: 1, total_day_change_percent: 1, total_unrealized_pnl: 2, sector_allocation: [], positions: [{ symbol: "RY", ticker: "RY", name: "Royal Bank", quantity: 1, average_cost: 90, price: 100, market_value: 100, unrealized_pnl: 10, unrealized_pnl_percent: 11, day_change_percent: 1 }] },
  alerts: { items: [{ id: "a", symbol: "RY", status: "triggered", message: "Seuil", current_value: 100, triggered: true }], triggered_count: 1, monitored_count: 1, unavailable_count: 0 },
  "stock-news": { ticker: "TD", company: "TD Bank", items: [], status: "ok", detail: null, generated_at: "2026-09-02" },
};

function result(options: { queryKey: unknown[]; enabled?: boolean }) {
  const root = String(options.queryKey[0]);
  const enabled = options.enabled !== false;
  return { data: enabled || preserveCachedData ? dataByRoot[root] : undefined, isLoading: enabled && dataByRoot[root] == null, isError: enabled && mockErrorRoots.has(root), isRefetching: false, error: mockErrorRoots.has(root) ? new Error("offline") : null, refetch: jest.fn(async () => undefined) };
}

function latest(root: string) {
  return mockUseQuery.mock.calls.map(([options]) => options).filter((options) => options.queryKey[0] === root).at(-1);
}

async function showSections(view: Awaited<ReturnType<typeof render>>, ...sections: string[]) {
  await act(async () => view.getByTestId("today-sections").props.onViewableItemsChanged({
    viewableItems: sections.map((item) => ({ item, isViewable: true })),
  }));
}

describe("Today 2.0 screen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-02T15:00:00Z"));
    mockUseQuery.mockReset();
    mockUseQuery.mockImplementation(result);
    mockCancelQueries.mockClear();
    mockErrorRoots.clear();
    preserveCachedData = false;
    dataByRoot.terminal = terminalWithDriver;
    dataByRoot.psychology = { score: 61, label: "Optimiste", components: [], generated_at: "2026-09-02", refresh_after_seconds: 120 };
    mockWorkspace = { data: { watchlist: [], portfolio: [], alerts: [] } };
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders the Composite briefing immediately without a full-screen loader", async () => {
    const view = await render(<TodayScreen />);
    expect(view.getByTestId("today-intelligence-screen")).toBeTruthy();
    expect(view.getByTestId("today-market-brief")).toBeTruthy();
    expect(view.getByText("S&P/TSX Composite")).toBeTruthy();
    expect(view.getByText("120↑ · 80↓")).toBeTruthy();
    expect(view.getByText("Données de séance différées")).toBeTruthy();
    expect(view.getByText("Secteur le moins fort")).toBeTruthy();
    expect(view.getByText(/^(Bonjour|Bon après-midi|Bonsoir) Ana$/)).toBeTruthy();
    await view.unmount();
  });

  it("stages context, personal, Terminal/Screener and insiders instead of firing them together", async () => {
    const view = await render(<TodayScreen />);
    expect(latest("cockpit").enabled).toBe(true);
    expect(latest("psychology").enabled).toBe(false);
    expect(latest("terminal").enabled).toBe(false);
    expect(latest("screener").enabled).toBe(false);
    expect(latest("insiders").enabled).toBe(false);
    await act(async () => jest.advanceTimersByTime(350));
    expect(latest("psychology").enabled).toBe(true);
    expect(latest("terminal").enabled).toBe(false);
    await act(async () => jest.advanceTimersByTime(950));
    expect(latest("terminal").enabled).toBe(true);
    expect(latest("screener").enabled).toBe(false);
    expect(latest("insiders").enabled).toBe(false);
    await showSections(view, "attention");
    expect(latest("screener").enabled).toBe(true);
    await act(async () => jest.advanceTimersByTime(600));
    expect(latest("insiders").enabled).toBe(true);
    expect(latest("insiders").queryKey).toEqual(["insiders", "preview", "canada", 30, ""]);
    await view.unmount();
  });

  it("does not enable empty workspace or stock-news requests", async () => {
    const view = await render(<TodayScreen />);
    await act(async () => jest.advanceTimersByTime(900));
    expect(latest("watchlist").enabled).toBe(false);
    expect(latest("portfolio").enabled).toBe(false);
    expect(latest("alerts").enabled).toBe(false);
    expect(mockUseQuery.mock.calls.map(([options]) => options).filter((options) => options.queryKey[0] === "stock-news").every((options) => options.enabled === false)).toBe(true);
    await view.unmount();
  });

  it("loads conditional personal data and caps stock-news requests at two symbols", async () => {
    mockWorkspace = { data: { watchlist: ["TD", "CNQ", "RY"], portfolio: [{ symbol: "RY", quantity: 1, average_cost: 90 }], alerts: [{ id: "a" }] } };
    const view = await render(<TodayScreen />);
    await showSections(view, "personal", "attention");
    await act(async () => jest.advanceTimersByTime(900));
    expect(latest("watchlist").enabled).toBe(true);
    expect(latest("portfolio").enabled).toBe(true);
    expect(latest("alerts").enabled).toBe(true);
    const stockNews = mockUseQuery.mock.calls.map(([options]) => options).filter((options) => options.queryKey[0] === "stock-news" && options.enabled);
    expect(new Set(stockNews.map((options) => options.queryKey[1]))).toEqual(new Set(["TD", "CNQ"]));
    await view.unmount();
  });

  it("restarts tier scheduling after background while preserving cached content", async () => {
    const view = await render(<TodayScreen />);
    await showSections(view, "market", "attention");
    await act(async () => jest.advanceTimersByTime(1_900));
    expect(latest("terminal").enabled).toBe(true);
    expect(latest("screener").enabled).toBe(true);
    expect(latest("insiders").enabled).toBe(true);
    preserveCachedData = true;
    await act(async () => appStateHandler?.("background"));
    expect(latest("terminal").enabled).toBe(false);
    expect(latest("screener").enabled).toBe(false);
    expect(latest("insiders").enabled).toBe(false);
    expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ["terminal"] });
    expect(view.getByTestId("today-market-brief")).toHaveTextContent(/Constructif.*70\/100/);
    expect(view.getByTestId("today-drivers")).toHaveTextContent(/WTI/);

    await act(async () => appStateHandler?.("active"));
    expect(latest("cockpit").enabled).toBe(true);
    expect(latest("terminal").enabled).toBe(false);
    expect(latest("screener").enabled).toBe(false);
    expect(latest("insiders").enabled).toBe(false);
    expect(view.getByTestId("today-market-brief")).toHaveTextContent(/Constructif.*70\/100/);
    await act(async () => jest.advanceTimersByTime(350));
    expect(latest("psychology").enabled).toBe(true);
    expect(latest("terminal").enabled).toBe(false);
    await act(async () => jest.advanceTimersByTime(950));
    expect(latest("terminal").enabled).toBe(true);
    expect(latest("screener").enabled).toBe(true);
    expect(latest("insiders").enabled).toBe(false);
    await act(async () => jest.advanceTimersByTime(600));
    expect(latest("insiders").enabled).toBe(true);
    await view.unmount();
  });

  it("rejects a Terminal V1 payload without breaking the rest of Today", async () => {
    dataByRoot.terminal = { regime: "Constructif" };
    const view = await render(<TodayScreen />);
    await act(async () => jest.advanceTimersByTime(1_300));
    expect(view.getByTestId("today-market-brief")).toBeTruthy();
    expect(view.getByTestId("today-drivers")).toHaveTextContent(/N\/D/);
    await view.unmount();
    dataByRoot.terminal = terminalWithDriver;
  });

  it("renders pending metrics as loading instead of unavailable N/D", async () => {
    const savedTerminal = dataByRoot.terminal;
    const savedPsychology = dataByRoot.psychology;
    dataByRoot.terminal = undefined;
    dataByRoot.psychology = undefined;
    const view = await render(<TodayScreen />);
    await act(async () => jest.advanceTimersByTime(1_300));
    expect(view.getByTestId("today-open-terminal")).toHaveTextContent(/Chargement/);
    expect(view.getByTestId("today-open-terminal")).not.toHaveTextContent("N/D");
    expect(view.getByTestId("today-open-psychology")).toHaveTextContent(/Chargement/);
    await view.unmount();
    dataByRoot.terminal = savedTerminal;
    dataByRoot.psychology = savedPsychology;
  });

  it("keeps Cockpit usable with cached Terminal, news and calendar data after refresh errors", async () => {
    mockErrorRoots.add("terminal");
    mockErrorRoots.add("news");
    mockErrorRoots.add("calendar");
    const view = await render(<TodayScreen />);
    await act(async () => jest.advanceTimersByTime(1_300));
    expect(view.getByTestId("today-market-brief")).toHaveTextContent(/S&P\/TSX Composite/);
    expect(view.getByTestId("today-drivers")).toHaveTextContent(/WTI/);
    expect(view.getByTestId("today-attention")).toHaveTextContent(/Dernières données disponibles/);
    await view.unmount();
  });
});
