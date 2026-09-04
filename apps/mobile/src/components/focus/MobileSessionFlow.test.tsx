import { render } from "@testing-library/react-native";

import type { FocusSnapshot } from "@/src/lib/api/types";
import { MobileSessionFlow, sessionFlowForFocus } from "./MobileSessionFlow";
import { focusPeriods } from "./MobileFocusOverview";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

function snapshot(history: FocusSnapshot["history"]): FocusSnapshot {
  return {
    quote: { ticker: "RY", symbol: "RY.TO", name: "Royal Bank", exchange: "TOR", price: 200, previous_close: 198, change: 2, change_percent: 1, volume: 1_000, day_high: 202, day_low: 197, currency: "CAD", source: "Yahoo public chart", delayed: true, timestamp: "2026-08-30T14:00:00Z" },
    history,
    technicals: {},
    profile: { name: "Royal Bank", sector: "Financials" },
    generated_at: "2026-08-30T14:00:00Z",
  };
}

describe("mobile Focus session flow", () => {
  it("keeps volume, delta and fractional ratios mathematically coherent", () => {
    const flow = sessionFlowForFocus("RY", snapshot([
      { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 700 },
      { time: 2, open: 11, high: 12, low: 9, close: 10, volume: 200 },
      { time: 3, open: 10, high: 10, low: 10, close: 10, volume: 100 },
    ]), focusPeriods[0]);

    expect(flow.total_volume).toBe(1_000);
    expect((flow.buy_volume ?? 0) + (flow.sell_volume ?? 0) + (flow.neutral_volume ?? 0)).toBeLessThanOrEqual(flow.total_volume ?? 0);
    expect(flow.volume_delta).toBe(500);
    expect(flow.buy_ratio).toBeCloseTo(700 / 900);
    expect(flow.sell_ratio).toBeCloseTo(200 / 900);
    expect(flow.buy_ratio).toBeLessThanOrEqual(1);
    expect(flow.classification).toBe("candle_estimate");
    expect(flow.estimated).toBe(true);
  });

  it("returns N/D-compatible nulls instead of fake zeroes without valid volume", () => {
    const flow = sessionFlowForFocus("RY", snapshot([
      { time: 1, open: 10, high: 11, low: 9, close: 11, volume: Number.NaN },
    ]), focusPeriods[0]);
    expect(flow).toMatchObject({ total_volume: null, buy_volume: null, sell_volume: null, neutral_volume: null, volume_delta: null, buy_ratio: null, sell_ratio: null, classification: "unavailable", estimated: false });
  });

  it("renders the estimated disclosure and recalculates for the selected Focus period", async () => {
    const live = snapshot([{ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 }]);
    const week = snapshot([{ time: 1, open: 10, high: 12, low: 8, close: 9, volume: 400 }]);
    const quarter = snapshot([{ time: 1, open: 10, high: 11, low: 9, close: 10, volume: 900 }]);
    expect(sessionFlowForFocus("RY", live, focusPeriods[0]).buy_volume).toBe(100);
    expect(sessionFlowForFocus("RY", week, focusPeriods[1]).sell_volume).toBe(400);
    expect(sessionFlowForFocus("RY", quarter, focusPeriods[2]).neutral_volume).toBe(900);
    expect(sessionFlowForFocus("RY", quarter, focusPeriods[2]).range).toBe("3mo");

    const view = await render(<MobileSessionFlow period={focusPeriods[0]} snapshot={live} ticker="RY" />);
    expect(view.getByText("ESTIMÉ")).toBeTruthy();
    expect(view.getByText("Classification estimée à partir des mouvements de prix et du volume.")).toBeTruthy();
    expect(view.getAllByText("100").length).toBeGreaterThan(0);
  });
});
