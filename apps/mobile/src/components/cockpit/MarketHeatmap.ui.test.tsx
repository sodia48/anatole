import { render, userEvent, waitFor } from "@testing-library/react-native";

import type { MarketTile } from "@/src/lib/api/types";
import { MarketHeatmap } from "./MarketHeatmap";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

function tile(symbol: string, sector: string): MarketTile {
  return { ticker: `${symbol}.TO`, symbol, name: symbol, sector, weight: 5, price: 100, change: 1, change_percent: 1, volume: 10_000, timestamp: "2026-09-01T12:00:00Z", source: "yahoo-public", delayed: true };
}

describe("mobile cockpit sector deep link", () => {
  it("opens the requested sector and forwards it to the Screener", async () => {
    const onOpenSector = jest.fn();
    const view = await render(<MarketHeatmap initialSector="Financials" onAlert={jest.fn()} onOpen={jest.fn()} onOpenSector={onOpenSector} onWatchlist={jest.fn()} tiles={[tile("RY", "Financials"), tile("ENB", "Energy")]} />);
    await waitFor(() => expect(view.getByText(/Financials/)).toBeTruthy());
    await userEvent.setup().press(view.getByTestId("heatmap-open-sector-screener"));
    expect(onOpenSector).toHaveBeenCalledWith("Financials");
    await view.unmount();
  });
});
