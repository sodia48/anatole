import { compactNumberOrNd, moneyOrNd, percentOrNd } from "./format";

describe("mobile financial formatting", () => {
  it("uses backend percentage points without multiplying by 100", () => {
    expect(percentOrNd(20.6669, "fr")).toBe("20,67 %");
    expect(percentOrNd(5.2298, "fr")).toBe("5,23 %");
    expect(percentOrNd(0.16, "fr")).toBe("0,16 %");
  });

  it("compacts large values deterministically in French", () => {
    expect(compactNumberOrNd(21_487_411_200, "fr")).toBe("21,49 G");
    expect(compactNumberOrNd(6_615_900_000, "fr")).toBe("6,62 G");
    expect(compactNumberOrNd(85_600_000, "fr")).toBe("85,6 M");
    expect(moneyOrNd(21_487_411_200, "CAD", true, "fr")).toBe("21,49 G CAD");
  });

  it("compacts large values deterministically in English and preserves missing values", () => {
    expect(compactNumberOrNd(21_487_411_200, "en")).toBe("21.49B");
    expect(compactNumberOrNd(6_615_900_000, "en")).toBe("6.62B");
    expect(compactNumberOrNd(85_600_000, "en")).toBe("85.6M");
    expect(moneyOrNd(21_487_411_200, "CAD", true, "en")).toBe("CAD 21.49B");
    expect(compactNumberOrNd(null, "fr")).toBe("N/D");
  });
});
