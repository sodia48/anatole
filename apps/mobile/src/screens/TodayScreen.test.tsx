import { render } from "@testing-library/react-native";

import TodayScreen from "@/app/(tabs)/today";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => ({ greeting: "Bonjour", marketPulse: "Pouls du marché", watchlist: "Watchlist", seeAll: "Tout voir", gainers: "Meilleures hausses", losers: "Plus fortes baisses", earnings: "Résultats à venir", calendar: "Calendrier économique", news: "Dernières nouvelles", loading: "Chargement…", retry: "Réessayer", noData: "Aucune donnée", offline: "Hors ligne" } as Record<string, string>)[key] ?? key }) }));
jest.mock("@/src/providers/MobileAccountProvider", () => ({ useMobileAccount: () => ({ user: { display_name: "Ana" }, workspace: { data: { watchlist: [], alerts: [] } } }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { cockpit: jest.fn(), news: jest.fn(), earnings: jest.fn(), calendar: jest.fn(), watchlist: jest.fn() } }));
jest.mock("@/src/lib/api/workspace", () => ({ workspaceApi: { alerts: jest.fn() } }));

const mockQuote = { ticker: "RY", symbol: "RY.TO", name: "Royal Bank", sector: "Financials", weight: 1, price: 200, change: 2, change_percent: 1, volume: 100, source: "demo", delayed: false, timestamp: "2026-08-30T00:00:00Z" };
const mockCockpit = { universe: "tsx60", weighted_change_percent: 0.5, breadth: { advancers: 35, decliners: 20, unchanged: 5, advance_ratio: 0.64 }, sectors: [], constituents: [mockQuote], top_gainers: [mockQuote], top_losers: [{ ...mockQuote, ticker: "BMO", symbol: "BMO.TO", name: "BMO", change_percent: -1 }], generated_at: "2026-08-30T00:00:00Z", refresh_after_seconds: 45 };

jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0];
    const data = key === "cockpit" ? mockCockpit : key === "news" ? { items: [], generated_at: "2026-08-30T00:00:00Z" } : key === "earnings" ? { events: [], companies_with_dates: 0, generated_at: "2026-08-30T00:00:00Z" } : key === "calendar" ? { events: [], generated_at: "2026-08-30T00:00:00Z" } : undefined;
    return { data, isLoading: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
}));

describe("Today screen", () => {
  it("renders market pulse and movers from FastAPI snapshots", async () => {
    const view = await render(<TodayScreen />);
    expect(view.getByTestId("market-pulse")).toBeTruthy();
    expect(view.getByText("Royal Bank")).toBeTruthy();
    expect(view.getByText("35 ↑ · 20 ↓")).toBeTruthy();
    await view.unmount();
  }, 30_000);
});
