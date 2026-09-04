import { coverageIsSufficient, formatPortfolioNumber, portfolioHorizonLabel, topPortfolioMover } from "./model";

describe("portfolio intelligence model", () => {
  it("preserves unavailable values instead of manufacturing zero", () => {
    expect(formatPortfolioNumber(null, "fr", " %")).toBe("N/D");
    expect(formatPortfolioNumber(0, "fr", " %")).toBe("0 %");
  });

  it("uses the explicit 70 percent aggregate coverage threshold", () => {
    expect(coverageIsSufficient({ symbols_expected: 10, symbols_available: 6, coverage_percent: 60 })).toBe(false);
    expect(coverageIsSufficient({ symbols_expected: 10, symbols_available: 7, coverage_percent: 70 })).toBe(true);
  });

  it("labels every requested horizon", () => {
    expect(["1d", "1w", "1m", "3m", "ytd", "1y"].map((item) => portfolioHorizonLabel(item as never))).toEqual(["1J", "1S", "1M", "3M", "YTD", "1A"]);
  });

  it("selects the observed top contributor and detractor", () => {
    const positions = [
      { symbol: "RY", day_change_percent: 1.2 },
      { symbol: "TD", day_change_percent: -0.8 },
    ] as never;
    expect(topPortfolioMover(positions, "top")?.symbol).toBe("RY");
    expect(topPortfolioMover(positions, "bottom")?.symbol).toBe("TD");
  });
});
