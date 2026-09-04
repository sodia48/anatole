import { act, render, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState } from "react-native";

import type { PsychologySnapshot } from "@/src/lib/api/types";
import { PsychologyScreen } from "./PsychologyScreen";

const mockUseQuery = jest.fn();
const mockCancelQueries = jest.fn(async () => undefined);
const mockPsychology = jest.fn();
let appStateHandler: ((state: string) => void) | undefined;
let mockLanguage: "fr" | "en" = "fr";
let refreshError = false;

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: mockLanguage, pick: (fr: string, en: string) => mockLanguage === "fr" ? fr : en, t: (key: string) => key }) }));
jest.mock("@/src/lib/api/market", () => ({ marketApi: { psychology: (...args: unknown[]) => mockPsychology(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => mockUseQuery(options), useQueryClient: () => ({ cancelQueries: mockCancelQueries }) }));

const psychologySnapshot: PsychologySnapshot = {
  score: 67, label: "Confiance", change_20d: 3.5, change_50d: 8.2, volatility_20d: 16.4, advance_ratio: 62,
  components: [
    { key: "breadth", label: "Largeur du marché", score: 70, description: "31 hausses contre 19 baisses." },
    { key: "momentum", label: "Momentum de l’indice", score: 65, description: "Variation observable sur 20 et 50 séances." },
  ],
  generated_at: "2026-09-01T12:00:00Z", refresh_after_seconds: 45, source: "S&P/TSX Composite + largeur du TSX 60",
};

function queryResult() {
  return { data: psychologySnapshot, isLoading: false, isError: refreshError, isRefetching: false, error: refreshError ? new Error("offline") : null, refetch: jest.fn(async () => ({ data: psychologySnapshot })) };
}

describe("mobile market psychology", () => {
  beforeEach(() => {
    mockLanguage = "fr";
    refreshError = false;
    mockUseQuery.mockReset();
    mockUseQuery.mockImplementation(queryResult);
    mockPsychology.mockResolvedValue(psychologySnapshot);
    mockCancelQueries.mockClear();
    jest.mocked(router.push).mockClear();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => jest.restoreAllMocks());

  it("uses the psychology endpoint and preserves the backend score, label, KPI, components and source", async () => {
    const view = await render(<PsychologyScreen />);
    const user = userEvent.setup();
    const options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.queryKey).toEqual(["psychology"]);
    const controller = new AbortController();
    await options.queryFn({ signal: controller.signal });
    expect(mockPsychology).toHaveBeenCalledWith(controller.signal);
    expect(view.getByTestId("psychology-gauge")).toBeTruthy();
    expect(view.getByText("67")).toBeTruthy();
    expect(view.getByText("Confiance")).toBeTruthy();
    expect(view.getByText("3,50 %")).toBeTruthy();
    expect(view.getByText("8,20 %")).toBeTruthy();
    expect(view.getByText("16,40 %")).toBeTruthy();
    expect(view.getByText("62,00 %")).toBeTruthy();
    expect(view.getByTestId("psychology-component-breadth")).toBeTruthy();
    expect(view.getByText("31 hausses contre 19 baisses.")).toBeTruthy();
    expect(view.getByText(/S&P\/TSX Composite \+ largeur du TSX 60/)).toBeTruthy();
    await user.press(view.getByTestId("psychology-open-terminal"));
    expect(router.push).toHaveBeenCalledWith("/terminal");
    await view.unmount();
  });

  it("renders deterministic English UI while keeping the backend index semantics", async () => {
    mockLanguage = "en";
    const view = await render(<PsychologyScreen />);
    expect(view.getByText("MARKET PSYCHOLOGY")).toBeTruthy();
    expect(view.getByText("ANATOLE CANADA INDEX")).toBeTruthy();
    expect(view.getByText("Confidence")).toBeTruthy();
    expect(view.getByText("Market breadth")).toBeTruthy();
    expect(view.getByText("62% of TSX 60 securities are advancing.")).toBeTruthy();
    await view.unmount();
  });

  it("keeps stale data and cancels refresh in background", async () => {
    refreshError = true;
    const view = await render(<PsychologyScreen />);
    expect(view.getByText("Dernières données disponibles")).toBeTruthy();
    expect(view.getByText("Confiance")).toBeTruthy();
    let options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.refetchInterval({ state: { data: psychologySnapshot } })).toBe(45_000);
    await act(async () => { appStateHandler?.("background"); });
    options = mockUseQuery.mock.calls.at(-1)?.[0];
    expect(options.refetchInterval({ state: { data: psychologySnapshot } })).toBe(false);
    expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ["psychology"] });
    await view.unmount();
  });
});
