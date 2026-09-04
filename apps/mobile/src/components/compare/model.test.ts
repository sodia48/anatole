import { comparisonDatesAreAligned, comparisonValue, normalizeComparisonSymbols } from "./model";
describe("mobile comparator", () => {
  it("deduplicates and caps selection at five", () => expect(normalizeComparisonSymbols(["RY", "RY.TO", "TD", "BMO", "XIU", "SHOP", "CNR"])).toEqual(["RY", "TD", "BMO", "XIU", "SHOP"]));
  it("preserves unsupported metrics as N/D", () => { expect(comparisonValue(null)).toBe("N/D"); expect(comparisonValue(0)).toBe("0.00"); });
  it("detects unmatched calendars without forward fill", () => expect(comparisonDatesAreAligned({ series: [{ points: [{ time: 1 }] }, { points: [{ time: 2 }] }] } as never)).toBe(false));
});
