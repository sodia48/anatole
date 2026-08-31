import { act, render } from "@testing-library/react-native";

import { ChartWebView, chartHtml } from "./ChartWebView";

jest.mock("@/src/lib/i18n", () => ({ useLocale: () => ({ language: "fr", pick: (fr: string) => fr }) }));

const candles = [{ time: "2026-08-29T14:35:00-04:00", open: 58.1, high: 58.52, low: 58.02, close: 58.46, volume: 1_240_000 }];

describe("mobile Focus price chart", () => {
  it("reserves a price gutter and renders the price axis, last-price marker and volume pane", () => {
    expect(chartHtml).toContain("const PRICE_GUTTER=64");
    expect(chartHtml).toContain("function drawPriceAxis");
    expect(chartHtml).toContain("function drawLastPrice");
    expect(chartHtml).toContain("function drawVolumePane");
    expect(chartHtml).toContain("point-selected");
  });

  it("keeps the complete OHLCV selection through the native bridge", async () => {
    const view = await render(<ChartWebView candles={candles} currency="CAD" label="RY LIVE" ticker="RY" timeframe="1d:1m" />);
    await act(async () => view.getByTestId("focus-chart-webview").props.onMessage({ nativeEvent: { data: JSON.stringify({ type: "point-selected", ...candles[0] }) } }));
    expect(view.getByText(/O 58\.10/)).toBeTruthy();
    expect(view.getByText(/H 58\.52/)).toBeTruthy();
    expect(view.getByText(/Vol 1,24 M/)).toBeTruthy();
  });
});
