import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState, View } from "react-native";

import { marketApi } from "@/src/lib/api/market";
import type { CockpitSnapshot } from "@/src/lib/api/types";
import { TodayIntelligenceScreen } from "./TodayIntelligenceScreen";

let appStateHandler: ((state: string) => void) | undefined;

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({
  useLocale: () => ({ language: "fr", pick: (fr: string) => fr, t: (key: string) => key }),
}));
jest.mock("@/src/providers/MobileAccountProvider", () => ({
  useMobileAccount: () => ({
    user: null,
    workspace: { data: { watchlist: [], portfolio: [], alerts: [], preferences: {} } },
  }),
}));
jest.mock("@/src/lib/api/market", () => ({
  marketApi: {
    cockpit: jest.fn(), psychology: jest.fn(), news: jest.fn(), calendar: jest.fn(), earnings: jest.fn(),
    watchlist: jest.fn(), terminal: jest.fn(), screener: jest.fn(), insiders: jest.fn(), stockNews: jest.fn(),
  },
}));
jest.mock("@/src/lib/api/workspace", () => ({
  workspaceApi: { alerts: jest.fn(), portfolio: jest.fn() },
}));

const snapshot = {
  universe: "S&P/TSX Composite",
  weighted_change_percent: 0,
  breadth: { advancers: 0, decliners: 0, unchanged: 0, advance_ratio: 0 },
  sectors: [], constituents: [], top_gainers: [], top_losers: [],
  generated_at: "2026-09-05T14:00:00Z",
  refresh_after_seconds: 90,
} satisfies CockpitSnapshot;

function MarketsCockpitObserver() {
  useQuery({
    queryKey: ["cockpit", "composite"],
    queryFn: ({ signal }) => marketApi.cockpit("composite", signal),
    staleTime: 60_000,
  });
  return <View testID="markets-cockpit-observer" />;
}

describe("Today shared query ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => jest.restoreAllMocks());

  it("does not cancel the shared Cockpit request on inactive or Today navigation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    let requestSignal: AbortSignal | undefined;
    let resolveCockpit: ((value: CockpitSnapshot) => void) | undefined;
    jest.mocked(marketApi.cockpit).mockImplementation((_universe, signal) => {
      requestSignal = signal;
      return new Promise<CockpitSnapshot>((resolve) => { resolveCockpit = resolve; });
    });

    const view = await render(
      <QueryClientProvider client={client}>
        <TodayIntelligenceScreen />
        <MarketsCockpitObserver />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(marketApi.cockpit).toHaveBeenCalledTimes(1));

    await act(async () => appStateHandler?.("inactive"));
    expect(requestSignal?.aborted).toBe(false);
    await act(async () => appStateHandler?.("active"));

    await view.rerender(
      <QueryClientProvider client={client}>
        <MarketsCockpitObserver />
      </QueryClientProvider>,
    );
    expect(view.getByTestId("markets-cockpit-observer")).toBeTruthy();
    expect(requestSignal?.aborted).toBe(false);

    await act(async () => resolveCockpit?.(snapshot));
    await waitFor(() => expect(client.getQueryData(["cockpit", "composite"])).toEqual(snapshot));
    await view.unmount();
    client.clear();
  });
});
