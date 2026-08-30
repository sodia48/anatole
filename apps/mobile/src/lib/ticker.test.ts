import { normalizeTicker } from "./ticker";

describe("normalizeTicker", () => {
  it.each([
    [" ry.to ", "RY"],
    ["shop.TO", "SHOP"],
    ["vzca.v", "VZCA"],
    ["CNR", "CNR"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeTicker(input)).toBe(expected);
  });
});
