import { render } from "@testing-library/react-native";

import { PortfolioPositions } from "./PortfolioPositions";
import type { PortfolioPositionSnapshot } from "@/src/lib/api/types";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

const royalBank: PortfolioPositionSnapshot = {
  symbol: "RY",
  ticker: "RY.TO",
  name: "Royal Bank of Canada",
  sector: "Financials",
  quantity: 12,
  average_cost: 122,
  price: 200,
  market_value: 2400,
  unrealized_pnl: 936,
  unrealized_pnl_percent: 63.93,
  day_change_percent: 0.5,
  weight_percent: 100,
};

describe("PortfolioPositions", () => {
  it("keeps successful positions and marks a failed quote unavailable", async () => {
    const view = await render(<PortfolioPositions
      onRemove={jest.fn()}
      positions={[royalBank]}
      requestedPositions={[
        { symbol: "RY", quantity: 12, average_cost: 122 },
        { symbol: "TD", quantity: 18, average_cost: 78 },
      ]}
    />);

    expect(view.getByText("RY · Royal Bank of Canada")).toBeTruthy();
    expect(view.getByText("TD")).toBeTruthy();
    expect(view.getByText("Données temporairement indisponibles")).toBeTruthy();
    expect(view.getByText("N/D")).toBeTruthy();
    await view.unmount();
  });
});
