import { fireEvent, render } from "@testing-library/react-native";

import type { AlertSnapshot, PortfolioSnapshot, TerminalSnapshot, WatchlistSnapshot } from "@/src/lib/api/types";
import { TodayPersonalBrief } from "./TodayPersonalBrief";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

const quote = (symbol: string, change: number) => ({ ticker: symbol, symbol, name: symbol, exchange: "TSX", price: 100, previous_close: 99, change: 1, change_percent: change, volume: 1_000, day_high: 101, day_low: 98, currency: "CAD", source: "public", delayed: true, timestamp: "2026-09-02T15:00:00Z" });
const watchlist = { tickers: ["RY", "TD", "CNQ", "SHOP"], items: [quote("RY", 1), quote("TD", -4), quote("CNQ", 3), quote("SHOP", 2)], summary: { advancers: 3, decliners: 1, unchanged: 0, average_change_percent: 0.5 }, generated_at: "2026-09-02", refresh_after_seconds: 30 } as WatchlistSnapshot;
const portfolio = {
  total_market_value: 100_000, total_day_pnl: 750, total_day_change_percent: 0.75, total_unrealized_pnl: 2_000,
  sector_allocation: [{ key: "Financials", label: "Financials", value: 40_000, weight_percent: 40 }], positions: [],
  contributors: [{ symbol: "RY", name: "Royal Bank", value: 500, value_percent: 0.5, kind: "day" }],
  detractors: [{ symbol: "TD", name: "TD Bank", value: -100, value_percent: -0.1, kind: "day" }],
  risk: { volatility_percent: 12, beta: 0.9, max_drawdown_percent: -8, sharpe_ratio: 1.1, concentration_hhi: 0.2, top_position_percent: 18, top_three_percent: 42, diversification_score: 82, risk_level: "Modéré" },
} as PortfolioSnapshot;
const alerts = { items: [{ id: "a", symbol: "RY", status: "triggered", message: "Seuil observé", current_value: 200, triggered: true }], triggered_count: 1, monitored_count: 1, unavailable_count: 0 } as AlertSnapshot;
const terminal = { sector_rotation: [{ sector: "Financials", state: "Leadership" }] } as unknown as TerminalSnapshot;

describe("Today personal briefing", () => {
  it("offers personalization when the workspace is empty", async () => {
    const onPersonalize = jest.fn();
    const view = await render(<TodayPersonalBrief hasWorkspace={false} onOpen={jest.fn()} onPersonalize={onPersonalize} personalNews={[]} stale={false} terminal={null} />);
    await fireEvent.press(view.getByTestId("today-personalize"));
    expect(onPersonalize).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("shows only the top three movers and real portfolio, rotation, risk and triggered-alert values", async () => {
    const onOpen = jest.fn();
    const view = await render(<TodayPersonalBrief alerts={alerts} hasWorkspace onOpen={onOpen} onPersonalize={jest.fn()} personalNews={[]} portfolio={portfolio} stale terminal={terminal} watchlist={watchlist} />);
    expect(view.getByTestId("today-personal-mover-TD")).toBeTruthy();
    expect(view.getByTestId("today-personal-mover-CNQ")).toBeTruthy();
    expect(view.getByTestId("today-personal-mover-SHOP")).toBeTruthy();
    expect(view.queryByTestId("today-personal-mover-RY")).toBeNull();
    expect(view.getByTestId("today-portfolio")).toHaveTextContent(/0,75/);
    expect(view.getByTestId("today-portfolio")).toHaveTextContent(/Financials.*40.*Leadership/);
    expect(view.getByTestId("today-portfolio")).toHaveTextContent(/RY.*0,50/);
    expect(view.getByTestId("today-portfolio")).toHaveTextContent(/TD.*-0,10/);
    expect(view.getByTestId("today-portfolio")).toHaveTextContent(/82\/100.*Modéré/);
    expect(view.getByText("Seuil observé")).toBeTruthy();
    expect(view.getByText("Dernières données disponibles")).toBeTruthy();
    await fireEvent.press(view.getByTestId("today-personal-mover-TD"));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "stock", ticker: "TD" });
    await view.unmount();
  });
});
