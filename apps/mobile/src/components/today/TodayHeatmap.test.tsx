import { fireEvent, render } from "@testing-library/react-native";

import type { CockpitSnapshot, TerminalSnapshot } from "@/src/lib/api/types";
import { TodayHeatmap } from "./TodayHeatmap";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

const ry = { ticker: "RY", symbol: "RY", name: "Royal Bank", sector: "Financials", weight: 8, price: 200, change: 2, change_percent: 1, volume: 100, source: "public", delayed: true, timestamp: "2026-09-02T15:00:00Z" };
const cnq = { ...ry, ticker: "CNQ", symbol: "CNQ", name: "Canadian Natural", sector: "Energy", weight: 5, change: -1, change_percent: -0.5 };
const cockpit = {
  universe: "S&P/TSX Composite",
  weighted_change_percent: 0.2,
  breadth: { advancers: 1, decliners: 1, unchanged: 0, advance_ratio: 50 },
  sectors: [
    { sector: "Financials", change_percent: 1, weight: 31, advancers: 1, decliners: 0, unchanged: 0 },
    { sector: "Energy", change_percent: -0.5, weight: 17, advancers: 0, decliners: 1, unchanged: 0 },
  ],
  constituents: [ry, cnq], top_gainers: [ry], top_losers: [cnq], generated_at: "2026-09-02T15:00:00Z", refresh_after_seconds: 60,
} as CockpitSnapshot;
const terminal = {
  anomalies: [
    { id: "a1", type: "volume_spike", symbol: "RY", title: "Volume", detail: "Volume relatif observé", severity: "high", direction: "positive" },
    { id: "a2", type: "price_move", symbol: "BMO", title: "Prix", detail: "Variation observée", severity: "watch", direction: "negative" },
  ],
} as unknown as TerminalSnapshot;

describe("Today compact heatmap", () => {
  it("opens a stock, a filtered sector and a Terminal anomaly from the three modes", async () => {
    const onOpen = jest.fn();
    const view = await render(<TodayHeatmap cockpit={cockpit} onOpen={onOpen} terminal={terminal} universe="composite" />);
    await fireEvent.press(view.getByTestId("today-heatmap-node-RY"));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "stock", ticker: "RY" });

    await fireEvent.press(view.getByTestId("today-heatmap-sectors"));
    await fireEvent.press(view.getByTestId("today-heatmap-node-Financials"));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "sector", universe: "composite", sector: "Financials" });

    await fireEvent.press(view.getByTestId("today-heatmap-anomalies"));
    await fireEvent.press(view.getByTestId("today-heatmap-node-a1"));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "terminal", symbol: "RY", anomaly: "volume_spike" });
    expect(view.getByTestId("today-unmapped-a2")).toHaveTextContent(/N\/D heatmap/);
    await fireEvent.press(view.getByTestId("today-unmapped-a2"));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "terminal", symbol: "BMO", anomaly: "price_move" });
    await view.unmount();
  });
});
