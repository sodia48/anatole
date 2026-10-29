import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { OptionsScreen } from "./OptionsScreen";
import { OPTION_FILTERS_STORAGE_KEY } from "./optionFilters";

let mockChainError: Error | null = null;
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ pick: (fr: string) => fr }) }));
jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const market = queryKey[1];
    const universe = queryKey[0] === "options-universe";
    return {
      isLoading: false, isRefetching: false, error: universe ? null : mockChainError, refetch: jest.fn(),
      data: universe ? { items: [] } : {
        symbol: market === "commodities" ? "GC" : "RY", name: "Fixture", generated_at: "2026-10-27T12:00:00Z",
        stale: market === "commodities", source_statuses: [], analytics: { contract_count: 3 }, expirations: ["2027-11-25"],
        contracts: market === "commodities" ? [{ symbol: "fixture", underlying: "GC", market: "commodities", contract: "GCZ27", side: "call", strike: 2.5,
          expiration: null, bid: null, ask: null, last: 0, volume: null, open_interest: 0,
          implied_volatility: null },
        { symbol: "fixture-c", underlying: "GC", market: "commodities", contract: "GCZ27", side: "call", strike: 3,
          expiration: "2027-11-25", bid: 1, ask: 2, last: 1.5, volume: 10, open_interest: 5, implied_volatility: null },
        { symbol: "fixture-p", underlying: "GC", market: "commodities", contract: "GCZ27", side: "put", strike: 3,
          expiration: "2027-11-25", bid: 1, ask: 2, last: 1.5, volume: 10, open_interest: 5, implied_volatility: null }] : [],
      },
    };
  },
}));

beforeEach(async () => { mockChainError = null; await AsyncStorage.clear(); });

test("commodity snapshots identify stale and unknown data without hiding published zero", async () => {
  const view = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(view.getByText("Matières")); });
  expect(view.getByText(/instantané périmé/)).toBeTruthy();
  expect(view.getByText(/fraîcheur des cotations à confirmer/)).toBeTruthy();
  expect(view.getByText("Vol N/D · OI 0")).toBeTruthy();
  expect(view.getByText("N/D · GCZ27")).toBeTruthy();
  await act(async () => { fireEvent.press(view.getByLabelText("CALL 2.50 N/D fixture")); });
  expect(view.getByText("fixture · CALL")).toBeTruthy();
  await act(async () => { fireEvent.press(view.getByText("2027-11-25")); });
  expect(view.queryByLabelText("CALL 2.50 N/D fixture")).toBeNull();
  expect(view.getByLabelText("CALL 3.00 2027-11-25 fixture-c")).toBeTruthy();
  expect(view.getByLabelText("PUT 3.00 2027-11-25 fixture-p")).toBeTruthy();
  await view.unmount();
});

test("mobile filters retain preferences across screen remount and exclude missing volume", async () => {
  const view = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(view.getByText("Matières")); });
  await waitFor(() => expect(view.getByLabelText("Filtres avancés").props.accessibilityState?.disabled).not.toBe(true));
  await act(async () => { fireEvent.press(view.getByLabelText("Filtres avancés")); });
  await act(async () => { fireEvent.changeText(view.getByLabelText("Volume minimum"), "0"); });
  expect(view.queryByLabelText("CALL 2.50 N/D fixture")).toBeNull();
  expect(view.getByLabelText("CALL 3.00 2027-11-25 fixture-c")).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(OPTION_FILTERS_STORAGE_KEY)) ?? "{}").volume).toBe("0"));
  await view.unmount();
  const reopened = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(reopened.getByText("Matières")); });
  await waitFor(() => expect(reopened.queryByLabelText("CALL 2.50 N/D fixture")).toBeNull());
  await act(async () => { fireEvent.press(reopened.getByLabelText("Filtres avancés")); });
  expect(reopened.getByLabelText("Volume minimum").props.value).toBe("0");
  await reopened.unmount();
});

test("a failed refresh warns when cached chain data remains available", async () => {
  mockChainError = new Error("upstream error");
  const view = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(view.getByText("Matières")); });
  expect(view.getByText("Actualisation impossible : les données affichées peuvent être périmées.")).toBeTruthy();
  expect(view.queryByText("upstream error")).toBeNull();
  await view.unmount();
});
