import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { InstitutionsMobileScreen } from "./InstitutionsMobileScreen";

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      report_period: "2026-06-30",
      institutions: [{ cik: "0000315066", name: "FMR LLC", report_period: "2026-06-30" }],
      institutions_reporting: 1,
      institutions_expected: 2,
      partial_report_period: "2026-09-30",
      partial_institutions_reporting: 1,
      last_sync_at: "2026-11-23T09:17:00Z",
      next_check_at: "2026-11-24T09:17:00Z",
      sources: [{ status: "partial" }],
      collection_error: null,
    },
    error: null, isLoading: false, isRefetching: false, refetch: jest.fn(),
  }),
}));
jest.mock("@/src/lib/i18n", () => ({
  useLocale: () => ({ pick: (fr: string) => fr, t: (key: string) => key }),
}));

it("shows the validated quarter separately from the SEC collection", async () => {
  const view = await render(<InstitutionsMobileScreen header={<Text>Navigation</Text>} />);
  expect(view.getByTestId("institutions-mobile-screen")).toBeTruthy();
  expect(view.getByText(/Dernier trimestre validé : T2 2026/)).toBeTruthy();
  expect(view.getByText(/Trimestre en cours de collecte : T3 2026/)).toBeTruthy();
  expect(view.getByText("FMR LLC")).toBeTruthy();
  expect(view.queryByText(/FMR LLC.*T3 2026/)).toBeNull();
  await view.unmount();
});
