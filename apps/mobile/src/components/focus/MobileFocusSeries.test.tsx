import { fireEvent, render } from "@testing-library/react-native";
import { MobileFocusSeries } from "./MobileFocusSeries";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

const periods = ["2015-12-31", "2018-12-31", "2020-12-31", "2022-12-31", "2024-12-31", "2025-12-31"];

it("selects multiple native metrics, an exact touch point, chart type and a real time window", async () => {
  const screen = await render(<MobileFocusSeries title="Historique" periods={periods} currency="CAD"
    source="Issuer fixture" sources={periods.map(period => `Issuer ${period}`)}
    series={[{ id: "revenue", fr: "Revenus", en: "Revenue", values: [40, 50, 70, 80, 100, 120] },
      { id: "income", fr: "Bénéfice net", en: "Net income", values: [4, 5, null, -2, 0, 10] }]} />);
  expect(screen.getByText("Courbe")).toBeTruthy();
  await fireEvent.press(screen.getByText("Aire"));
  await fireEvent.press(screen.getByText("1y"));
  await fireEvent.press(screen.getByTestId("focus-point-revenue-5"));
  expect(screen.getAllByText("2025-12-31").length).toBeGreaterThan(0);
  expect(screen.getByText("Source: Issuer 2025-12-31")).toBeTruthy();
  await fireEvent.press(screen.getAllByText("Bénéfice net")[0]!);
  await fireEvent.press(screen.getByText("Tout"));
  await fireEvent.press(screen.getByText("Base 100"));
  expect(screen.getByText(/Base 100 au 2015-12-31/)).toBeTruthy();
});
