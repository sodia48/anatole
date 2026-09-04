import { parseSearchCommand } from "./commandParser";
describe("command parser", () => {
  it.each(["RSI < 30", "score > 80", "momentum > 5", "volume > 2x"])("parses %s", (query) => expect(parseSearchCommand(query)?.kind).toBe("screener"));
  it("parses earnings tomorrow", () => expect(parseSearchCommand("earnings tomorrow")?.kind).toBe("calendar"));
  it("parses QC inflation", () => expect(parseSearchCommand("QC inflation")?.params.region).toBe("QC"));
  it("parses bank ETFs", () => expect(parseSearchCommand("ETF banques")?.kind).toBe("etf"));
  it("rejects malformed numeric commands", () => expect(parseSearchCommand("RSI << nope")).toBeNull());
});
