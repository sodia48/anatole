import { render, userEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import MarketsScreen from "@/app/(tabs)/markets";
import PortfolioScreen from "@/app/(tabs)/portfolio";
import TodayScreen from "@/app/(tabs)/today";
import NotificationsScreen from "@/app/notifications";
import { PsychologyScreen } from "@/src/components/psychology/PsychologyScreen";
import StockDetailScreen from "@/app/stock/[ticker]";
import WatchlistScreen from "@/app/watchlist";
import { marketApi } from "@/src/lib/api/market";
import { workspaceApi } from "@/src/lib/api/workspace";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({ ticker: "RY" }) }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }) }));
jest.mock("@/src/components/ChartWebView", () => {
  const { View } = jest.requireActual("react-native");
  return { ChartWebView: () => <View testID="focus-chart-webview" /> };
});
jest.mock("@/src/hooks/useLiveQuote", () => ({ useLiveQuote: (_ticker: string, quote: unknown) => ({ quote, state: "live" }) }));
jest.mock("@/src/providers/MobileAccountProvider", () => ({
  useMobileAccount: () => ({
    state: "authenticated", user: { email: "mobile@example.com" }, saveWorkspace: jest.fn(),
    workspace: { revision: 1, data: { watchlist: ["RY"], portfolio: [{ symbol: "RY", quantity: 2, average_cost: 100 }], alerts: [], preferences: {}, comparator_symbols: [], focus_layouts: [], focus_scripts: [], terminal_presets: [] } },
  }),
}));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { cockpit: jest.fn(), focus: jest.fn(), stockNews: jest.fn(), watchlist: jest.fn() } }));
jest.mock("@/src/lib/api/workspace", () => ({ workspaceApi: { portfolio: jest.fn() } }));
jest.mock("@/src/lib/api/notifications", () => ({ notificationApi: { feed: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() } }));

const tile = { ticker: "RY", symbol: "RY.TO", name: "Royal Bank", sector: "Financials", weight: 1, price: 200, change: 2, change_percent: 1, volume: 100, source: "demo", delayed: false, timestamp: "2026-08-30T00:00:00Z" };
const mockQueryData: Record<string, unknown> = {
  cockpit: { universe: "tsx60", weighted_change_percent: 0.5, breadth: { advancers: 35, decliners: 20, unchanged: 5, advance_ratio: 0.64 }, sectors: [{ sector: "Financials", change_percent: 1, weight: 1, advancers: 1, decliners: 0, unchanged: 0 }], constituents: [tile], top_gainers: [tile], top_losers: [], generated_at: "2026-08-30T00:00:00Z", refresh_after_seconds: 45 },
  focus: { quote: { ...tile, currency: "CAD", previous_close: 198, day_high: 202, day_low: 197 }, history: [{ time: "2026-08-29", open: 198, high: 202, low: 197, close: 200, volume: 100 }], technicals: { rsi_14: 55 }, profile: { name: "Royal Bank", sector: "Financials" }, generated_at: "2026-08-30T00:00:00Z" },
  "stock-news": { ticker: "RY", company: "Royal Bank", items: [], status: "ok", detail: null, generated_at: "2026-08-30T00:00:00Z" },
  portfolio: { total_market_value: 400, total_day_pnl: 4, total_day_change_percent: 1, total_unrealized_pnl: 200, sector_allocation: [{ key: "Financials", label: "Financials", value: 400, weight_percent: 100 }], positions: [{ symbol: "RY", ticker: "RY", name: "Royal Bank", quantity: 2, average_cost: 100, price: 200, market_value: 400, unrealized_pnl: 200, unrealized_pnl_percent: 100, day_change_percent: 1 }] },
  notifications: { unread_count: 1, generated_at: "2026-08-30T00:00:00Z", items: [{ id: "n1", kind: "alert", title: "RY", message: "Seuil atteint", severity: "important", symbol: "RY", route: null, created_at: "2026-08-30T00:00:00Z", read_at: null }] },
  watchlist: { tickers: ["RY"], items: [{ ...tile, currency: "CAD", previous_close: 198, day_high: 202, day_low: 197 }], summary: { advancers: 1, decliners: 0, unchanged: 0, average_change_percent: 1 }, generated_at: "2026-08-30T00:00:00Z", refresh_after_seconds: 45 },
};
const mockObservedQueries: { queryKey: unknown[]; enabled?: boolean; queryFn?: (context: { signal: AbortSignal }) => unknown }[] = [];

jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled, queryFn }: { queryKey: unknown[]; enabled?: boolean; queryFn?: (context: { signal: AbortSignal }) => unknown }) => {
    mockObservedQueries.push({ queryKey, enabled, queryFn });
    return { data: mockQueryData[String(queryKey[0])], isLoading: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
  useQueryClient: () => ({ cancelQueries: jest.fn() }),
}));

describe("critical native screens", () => {
  beforeEach(() => mockObservedQueries.splice(0));

  it("keeps the staged Terminal query disabled on initial Today render and absent elsewhere", async () => {
    const today = await render(<TodayScreen />);
    expect(mockObservedQueries.find(({ queryKey }) => queryKey[0] === "terminal")?.enabled).toBe(false);
    await today.unmount();
    mockObservedQueries.splice(0);
    const markets = await render(<MarketsScreen />);
    expect(mockObservedQueries.some(({ queryKey }) => queryKey[0] === "terminal")).toBe(false);
    await markets.unmount();
    mockObservedQueries.splice(0);
    const psychology = await render(<PsychologyScreen />);
    expect(mockObservedQueries.map(({ queryKey }) => queryKey[0])).toEqual(["psychology"]);
    await psychology.unmount();
  });

  it("renders the Cockpit mobile heatmap", async () => {
    const view = await render(<MarketsScreen />);
    expect(view.getByTestId("cockpit-heatmap")).toBeTruthy();
    expect(view.getByTestId("market-heatmap-svg")).toBeTruthy();
    await view.unmount();
  }, 30_000);

  it("opens the active Screener, Terminal and Psychology routes from Markets", async () => {
    jest.mocked(router.push).mockClear();
    const view = await render(<MarketsScreen />);
    const user = userEvent.setup();
    await user.press(view.getByText("Screener"));
    expect(router.push).toHaveBeenCalledWith("/screener");
    await user.press(view.getByText("Terminal Pro"));
    expect(router.push).toHaveBeenCalledWith("/terminal");
    await user.press(view.getByText("Psychologie"));
    expect(router.push).toHaveBeenCalledWith("/psychology");
    expect(view.queryByText("Bientôt sur mobile. La migration utilisera le même backend que le web.")).toBeNull();
    await view.unmount();
  }, 30_000);

  it("renders the native Focus shell with its specialized chart", async () => {
    const view = await render(<StockDetailScreen />);
    expect(view.getByTestId("focus-overview-section")).toBeTruthy();
    expect(view.getByTestId("focus-chart-webview")).toBeTruthy();
    expect(view.getByText("RY · LIVE")).toBeTruthy();
    await view.unmount();
  }, 30_000);

  it("forwards React Query cancellation to stock news", async () => {
    const view = await render(<StockDetailScreen />);
    const stockNews = mockObservedQueries.find(({ queryKey }) => queryKey[0] === "stock-news");
    const controller = new AbortController();

    await stockNews?.queryFn?.({ signal: controller.signal });

    expect(marketApi.stockNews).toHaveBeenCalledWith("RY", "Royal Bank", "fr", controller.signal);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
    await view.unmount();
  }, 30_000);

  it("preloads Focus Pro once and keeps its bridge state across section switches", async () => {
    const view = await render(<StockDetailScreen />);
    await waitFor(() => expect(view.getAllByTestId("focus-pro-webview")).toHaveLength(1));
    const webview = view.getByTestId("focus-pro-webview");
    const user = userEvent.setup();
    await user.press(view.getByText("Pro"));
    await user.press(view.getByText("Fondamentaux"));
    await user.press(view.getByText("Pro"));
    expect(view.getAllByTestId("focus-pro-webview")).toHaveLength(1);
    expect(view.getByTestId("focus-pro-webview")).toBe(webview);
    await view.unmount();
  }, 30_000);

  it("renders portfolio value and allocation", async () => {
    const view = await render(<PortfolioScreen />);
    expect(view.getByTestId("portfolio-value")).toBeTruthy();
    expect(view.getByTestId("portfolio-allocation")).toBeTruthy();
    const portfolioQueries = mockObservedQueries.filter(({ queryKey }) => queryKey[0] === "portfolio");
    expect(portfolioQueries.map(({ queryKey }) => queryKey[1])).toEqual(["fast", "full"]);
    const controller = new AbortController();
    await portfolioQueries[0]?.queryFn?.({ signal: controller.signal });
    expect(workspaceApi.portfolio).toHaveBeenCalledWith(
      [{ symbol: "RY", quantity: 2, average_cost: 100 }],
      controller.signal,
      true,
    );
    await view.unmount();
  }, 30_000);

  it("renders the account notification feed", async () => {
    const view = await render(<NotificationsScreen />);
    expect(view.getByTestId("notifications-screen")).toBeTruthy();
    expect(view.getByText("Seuil atteint")).toBeTruthy();
    await view.unmount();
  }, 30_000);

  it("renders the synchronized native watchlist", async () => {
    const view = await render(<WatchlistScreen />);
    expect(view.getByTestId("watchlist-screen")).toBeTruthy();
    expect(view.getByText("Royal Bank")).toBeTruthy();
    await view.unmount();
  }, 30_000);
});
