import { act, cleanup, render, userEvent, waitFor } from "@testing-library/react-native";
import { AppState, Linking } from "react-native";

import { CalendarIntelligenceScreen } from "@/src/components/calendar/CalendarIntelligenceScreen";
import { NewsCard } from "@/src/components/market";
import { NewsIntelligenceScreen } from "@/src/components/news/NewsIntelligenceScreen";

const mockPush = jest.fn();
const mockCancelQueries = jest.fn();
const mockQueryClient = { cancelQueries: mockCancelQueries };
const errorRoots = new Set<string>();
let mockLanguage: "fr" | "en" = "fr";
let mockAppStateHandler: ((state: "active" | "background") => void) | undefined;

jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: mockLanguage, pick: (fr: string, en: string) => mockLanguage === "fr" ? fr : en, t: (key: string) => key }) }));
jest.mock("@/src/providers/MobileAccountProvider", () => ({ useMobileAccount: () => ({ workspace: { data: { portfolio: [{ symbol: "RY", quantity: 1, average_cost: 100 }], watchlist: ["TD", "CNQ", "SHOP", "BMO", "AEM", "BNS"] } } }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { news: jest.fn(), stockNews: jest.fn(), calendar: jest.fn(), earnings: jest.fn() } }));

const newsItems = [
  { id: "ca", title: "Décision de la Banque du Canada", summary: "La banque publie sa décision.", url: "https://example.com/ca", source: "Banque du Canada", category: "Politique monétaire", published_at: "2026-09-03T13:00:00Z", sentiment: "Neutre", sentiment_score: 0, regions: ["CA"] },
  { id: "qc", title: "Emploi au Québec", summary: "Nouvelles données régionales.", url: "https://example.com/qc", source: "Gouvernement du Québec", category: "Travail", published_at: "2026-09-03T12:00:00Z", sentiment: "Positive", sentiment_score: 12, regions: ["QC"] },
];
const economic = { id: "jobs", title: "Enquête sur la population active", country: "Canada", currency: "CAD", category: "Travail", importance: "high", starts_at: "2026-09-03T14:30:00Z", source: "Statistique Canada", url: "https://example.com/jobs", description: "Publication officielle.", regions: ["QC", "ON"] };
const earnings = [
  { ticker: "RY", symbol: "RY", company: "Royal Bank", sector: "Financials", weight: 6, starts_at: "2026-09-04T12:00:00Z", window_start: "2026-09-04T12:00:00Z", window_end: "2026-09-04T13:00:00Z", time_is_estimated: true, eps_estimate: null, revenue_estimate: null, estimate_currency: "CAD", eps_analyst_count: null, revenue_analyst_count: null, source: "Public", url: "https://example.com/ry" },
  { ticker: "BCE", symbol: "BCE", company: "BCE", sector: "Communication", weight: 1, starts_at: "2026-09-04T13:00:00Z", window_start: "2026-09-04T13:00:00Z", window_end: "2026-09-04T14:00:00Z", time_is_estimated: false, eps_estimate: 0.8, revenue_estimate: 6200, estimate_currency: "CAD", eps_analyst_count: 5, revenue_analyst_count: 4, source: "Public", url: "https://example.com/bce" },
];

const dataByRoot: Record<string, unknown> = {
  news: { items: newsItems, source_statuses: [{ source: "Banque du Canada", status: "ok", detail: null }, { source: "BC Finance", status: "error", detail: "ConnectTimeout" }], generated_at: "2026-09-03T13:05:00Z", refresh_after_seconds: 900 },
  calendar: { events: [economic], source_statuses: [{ source: "Statistique Canada", status: "ok", detail: null }], generated_at: "2026-09-03T13:05:00Z", refresh_after_seconds: 1800 },
  earnings: { universe: "composite", universe_as_of: null, constituent_count: 2, companies_with_dates: 2, events: earnings, source_statuses: [{ source: "Public earnings", status: "ok", detail: null }], generated_at: "2026-09-03T13:05:00Z", refresh_after_seconds: 10800 },
};

const mockUseQuery = jest.fn(({ queryKey }: { queryKey: unknown[] }) => {
  const root = String(queryKey[0]);
  return { data: dataByRoot[root], isLoading: false, isError: errorRoots.has(root), isRefetching: false, error: errorRoots.has(root) ? new Error("network") : null, refetch: jest.fn() };
});
const mockUseQueries = jest.fn(({ queries }: { queries: { queryKey: unknown[]; enabled: boolean }[] }) => queries.map((query) => ({
  data: query.enabled ? { ticker: query.queryKey[1], symbol: query.queryKey[1], company: query.queryKey[1], status: "ok", detail: null, generated_at: "2026-09-03T13:00:00Z", refresh_after_seconds: 900, items: [{ id: `story-${query.queryKey[1]}`, title: `News ${query.queryKey[1]}`, summary: "Summary", url: `https://example.com/${query.queryKey[1]}`, publisher: "Publisher", published_at: "2026-09-03T13:00:00Z", related_tickers: [query.queryKey[1]] }] } : undefined,
  isLoading: false, isError: false, isRefetching: false, error: null, refetch: jest.fn(),
})));

jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options as { queryKey: unknown[] }), useQueries: (options: unknown) => mockUseQueries(options as { queries: { queryKey: unknown[]; enabled: boolean }[] }), useQueryClient: () => mockQueryClient }));

describe("mobile news and calendar intelligence", () => {
  beforeEach(() => {
    errorRoots.clear();
    mockPush.mockClear();
    mockCancelQueries.mockClear();
    mockUseQueries.mockClear();
    mockLanguage = "fr";
    mockAppStateHandler = undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_event: string, callback: (state: "active" | "background") => void) => {
      mockAppStateHandler = callback;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders ranked news, preserves provincial regions and handles local filters and empty results", async () => {
    const view = await render(<NewsIntelligenceScreen />);
    const user = userEvent.setup();
    expect(view.getByTestId("news-hero")).toBeTruthy();
    expect(view.getByText("Toutes régions")).toBeTruthy();
    expect(view.getByTestId("news-region-CA")).toBeTruthy();
    expect(view.getAllByText(/QC/).length).toBeGreaterThan(0);
    await user.press(view.getByTestId("news-region-QC"));
    expect(view.getAllByText("Emploi au Québec").length).toBeGreaterThan(0);
    await user.press(view.getByTestId("news-category-energy"));
    expect(view.getByText("Aucune actualité ne correspond à ces filtres.")).toBeTruthy();
    await user.press(view.getByText("Réinitialiser les filtres"));
    expect(view.getAllByText("Décision de la Banque du Canada").length).toBeGreaterThan(0);
    await view.unmount();
  });

  it("hides My regions without preferences and treats a deep link only as a regional filter", async () => {
    const view = await render(<NewsIntelligenceScreen initialRegion="QC" />);
    expect(view.queryByTestId("news-primary-my-regions")).toBeNull();
    await waitFor(() => expect(view.getByTestId("news-region-QC").props.accessibilityState.selected).toBe(true));
    expect(view.getAllByText("Emploi au Québec")).toHaveLength(2);
    expect(view.getAllByText("Décision de la Banque du Canada")).toHaveLength(1);
    await view.unmount();
  });

  it("shows My regions only with explicit preferences and filters to them", async () => {
    const view = await render(<NewsIntelligenceScreen preferredRegions={["QC"]} />);
    const user = userEvent.setup();
    await user.press(view.getByTestId("news-primary-my-regions"));
    expect(view.getAllByText("Emploi au Québec")).toHaveLength(2);
    expect(view.getAllByText("Décision de la Banque du Canada")).toHaveLength(1);
    await view.unmount();
  });

  it("keeps cached news on a refetch error and presents clean source health", async () => {
    errorRoots.add("news");
    const view = await render(<NewsIntelligenceScreen />);
    const user = userEvent.setup();
    expect(view.getByText("Dernières données disponibles")).toBeTruthy();
    expect(view.getAllByText("Emploi au Québec").length).toBeGreaterThan(0);
    await user.press(view.getByText("SOURCES"));
    expect(view.getByText("Indisponible")).toBeTruthy();
    expect(view.queryByText("ConnectTimeout")).toBeNull();
    await view.unmount();
  });

  it("cancels background work without clearing the last valid news snapshot", async () => {
    const view = await render(<NewsIntelligenceScreen />);
    await act(async () => mockAppStateHandler?.("background"));
    expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ["news"] });
    expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ["stock-news"] });
    expect(view.getAllByText("Décision de la Banque du Canada").length).toBeGreaterThan(0);
    await view.unmount();
  });

  it("limits personal stock-news queries to five and routes a ticker to Focus", async () => {
    const view = await render(<NewsIntelligenceScreen />);
    const user = userEvent.setup();
    await user.press(view.getByTestId("news-primary-personal"));
    const call = mockUseQueries.mock.calls.at(-1)?.[0] as { queries: { enabled: boolean }[] };
    expect(call.queries).toHaveLength(5);
    expect(call.queries.every((query) => query.enabled)).toBe(true);
    await user.press(view.getByText("Ouvrir Focus · RY"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/focus/[ticker]", params: { ticker: "RY" } });
    await view.unmount();
  });

  it("opens the actual article URL and labels lexical tone without claiming market impact", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await render(<NewsCard item={newsItems[1]!} showCategory showRegion showTone />);
    const user = userEvent.setup();
    expect(view.getByText(/Tonalité lexicale/)).toBeTruthy();
    expect(view.getByText(/ne mesure pas l’impact de marché/)).toBeTruthy();
    await user.press(view.getByText("Emploi au Québec"));
    expect(open).toHaveBeenCalledWith("https://example.com/qc");
    open.mockRestore();
    await view.unmount();
  });

  it("renders merged calendar items, N/D estimates and estimated-time labels", async () => {
    const view = await render(<CalendarIntelligenceScreen referenceNow={new Date("2026-09-03T13:30:00Z")} />);
    expect(view.getByTestId("calendar-next-major")).toBeTruthy();
    expect(view.getAllByText("Enquête sur la population active").length).toBeGreaterThan(0);
    expect(view.getByText("RY · Royal Bank")).toBeTruthy();
    expect(view.getByText("EPS N/D · Revenu N/D")).toBeTruthy();
    expect(view.getByText("Heure indicative")).toBeTruthy();
    expect(view.getByText("Heure confirmée")).toBeTruthy();
    await view.unmount();
  });

  it("does not start a real clock when a deterministic reference time is supplied", async () => {
    const setIntervalSpy = jest.spyOn(globalThis, "setInterval");
    const view = await render(<CalendarIntelligenceScreen referenceNow={new Date("2026-09-03T13:30:00Z")} />);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("advances the countdown every minute while the app is active", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-03T13:30:00Z"));
    const setIntervalSpy = jest.spyOn(globalThis, "setInterval");
    const view = await render(<CalendarIntelligenceScreen />);
    expect(view.getByText(/dans 1 h 0 min/)).toBeTruthy();
    const tick = setIntervalSpy.mock.calls.find((call) => call[1] === 60_000)?.[0] as (() => void) | undefined;
    expect(tick).toBeDefined();
    jest.setSystemTime(new Date("2026-09-03T13:31:00Z"));
    await act(async () => tick?.());
    expect(view.getByText(/dans 0 h 59 min/)).toBeTruthy();
    await view.unmount();
  });

  it("stops the clock in background and refreshes it immediately on foreground", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-03T13:30:00Z"));
    const setIntervalSpy = jest.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = jest.spyOn(globalThis, "clearInterval");
    const view = await render(<CalendarIntelligenceScreen />);
    expect(view.getByText(/dans 1 h 0 min/)).toBeTruthy();
    await act(async () => mockAppStateHandler?.("background"));
    expect(clearIntervalSpy).toHaveBeenCalled();
    jest.setSystemTime(new Date("2026-09-03T13:32:00Z"));
    expect(view.getByText(/dans 1 h 0 min/)).toBeTruthy();
    await act(async () => mockAppStateHandler?.("active"));
    expect(view.getByText(/dans 0 h 58 min/)).toBeTruthy();
    const ticks = setIntervalSpy.mock.calls.filter((call) => call[1] === 60_000);
    expect(ticks).toHaveLength(2);
    jest.setSystemTime(new Date("2026-09-03T13:33:00Z"));
    await act(async () => (ticks[1]?.[0] as (() => void) | undefined)?.());
    expect(view.getByText(/dans 0 h 57 min/)).toBeTruthy();
    await view.unmount();
  });

  it("opens an accessible event modal and only opens the official source on button press", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await render(<CalendarIntelligenceScreen referenceNow={new Date("2026-09-03T13:30:00Z")} />);
    const user = userEvent.setup();
    await user.press(view.getByTestId("calendar-event-economic"));
    expect(view.getByTestId("calendar-event-modal")).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    await user.press(view.getByText("Source officielle"));
    expect(open).toHaveBeenCalledWith("https://example.com/jobs");
    open.mockRestore();
    await view.unmount();
  });

  it("keeps the economic calendar usable when earnings fail and filters personal earnings", async () => {
    errorRoots.add("earnings");
    const view = await render(<CalendarIntelligenceScreen referenceNow={new Date("2026-09-03T13:30:00Z")} />);
    const user = userEvent.setup();
    expect(view.getAllByText("Enquête sur la population active").length).toBeGreaterThan(0);
    expect(view.getByText("Dernières données disponibles")).toBeTruthy();
    errorRoots.delete("earnings");
    await user.press(view.getByTestId("calendar-personal"));
    expect(view.getByText("RY · Royal Bank")).toBeTruthy();
    expect(view.queryByText("BCE · BCE")).toBeNull();
    await view.unmount();
  });

  it("renders English labels without leaking French data labels", async () => {
    mockLanguage = "en";
    const view = await render(<CalendarIntelligenceScreen referenceNow={new Date("2026-09-03T13:30:00Z")} />);
    expect(view.getByText("Next 7 days")).toBeTruthy();
    expect(view.getByText("Estimated time")).toBeTruthy();
    expect(view.queryByText("Heure indicative")).toBeNull();
    await view.unmount();
  });
});
