import { render } from "@testing-library/react-native";

import MarketsScreen from "@/app/(tabs)/markets";
import PortfolioScreen from "@/app/(tabs)/portfolio";
import NotificationsScreen from "@/app/notifications";
import StockDetailScreen from "@/app/stock/[ticker]";
import WatchlistScreen from "@/app/watchlist";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({ ticker: "RY" }) }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }) }));
jest.mock("@/src/components/ChartWebView", () => {
  const { View } = jest.requireActual("react-native");
  return { ChartWebView: () => <View testID="focus-chart-webview" /> };
});
jest.mock("@/src/providers/MobileAccountProvider", () => ({
  useMobileAccount: () => ({
    state: "authenticated", user: { email: "mobile@example.com" }, saveWorkspace: jest.fn(),
    workspace: { revision: 1, data: { watchlist: ["RY"], portfolio: [{ symbol: "RY", quantity: 2, average_cost: 100 }], alerts: [], preferences: {}, comparator_symbols: [], focus_layouts: [], focus_scripts: [] } },
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

jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: mockQueryData[String(queryKey[0])], isLoading: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() }),
}));

describe("critical native screens", () => {
  it("renders the Cockpit mobile sector map", async () => {
    const view = await render(<MarketsScreen />);
    expect(view.getByTestId("cockpit-sector-map")).toBeTruthy();
    await view.unmount();
  }, 30_000);

  it("renders the native Focus shell with its specialized chart", async () => {
    const view = await render(<StockDetailScreen />);
    expect(view.getByTestId("focus-chart-section")).toBeTruthy();
    expect(view.getByTestId("focus-chart-webview")).toBeTruthy();
    await view.unmount();
  }, 30_000);

  it("renders portfolio value and allocation", async () => {
    const view = await render(<PortfolioScreen />);
    expect(view.getByTestId("portfolio-value")).toBeTruthy();
    expect(view.getByTestId("portfolio-allocation")).toBeTruthy();
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
