import { act, fireEvent, render } from "@testing-library/react-native";

import { OptionsScreen } from "./OptionsScreen";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ pick: (fr: string) => fr }) }));
jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const market = queryKey[1];
    const universe = queryKey[0] === "options-universe";
    return {
      isLoading: false, isRefetching: false, error: null, refetch: jest.fn(),
      data: universe ? { items: [] } : {
        symbol: market === "commodities" ? "GC" : "RY", name: "Fixture", generated_at: "2026-10-27T12:00:00Z",
        stale: market === "commodities", source_statuses: [], analytics: { contract_count: 1 },
        contracts: market === "commodities" ? [{ symbol: "fixture", side: "call", strike: 2.5,
          expiration: "2027-11-25", bid: null, ask: null, last: 0, volume: null, open_interest: 0,
          implied_volatility: null }] : [],
      },
    };
  },
}));

test("commodity snapshots identify stale and unknown data without hiding published zero", async () => {
  const view = await render(<OptionsScreen />);
  await act(async () => { fireEvent.press(view.getByText("Matières")); });
  expect(view.getByText(/instantané périmé/)).toBeTruthy();
  expect(view.getByText(/fraîcheur des cotations à confirmer/)).toBeTruthy();
  expect(view.getByText("Vol séance N/D")).toBeTruthy();
  expect(view.getByText("OI 0")).toBeTruthy();
  await view.unmount();
});
