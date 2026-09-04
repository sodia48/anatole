import { navigateSearchCommand, parseSearchCommand } from "./commandParser";
describe("command parser", () => {
  it.each(["RSI < 30", "score > 80", "momentum > 5", "volume > 2x"])("parses %s", (query) => expect(parseSearchCommand(query)?.kind).toBe("screener"));
  it.each(["résultats demain", "earnings tomorrow"])("navigates %s to tomorrow's earnings calendar", (query) => {
    const command = parseSearchCommand(query)!; const navigate = jest.fn(); navigateSearchCommand(command, navigate);
    expect(navigate).toHaveBeenCalledWith({ pathname: "/(tabs)/markets", params: { hub: "calendar", kind: "earnings", dayOffset: "1" } });
  });
  it.each([["QC inflation", "QC", "inflation"], ["ON employment", "ON", "labour"], ["BC energy", "BC", "energy"]])("navigates %s to the exact regional news category", (query, region, category) => {
    const command = parseSearchCommand(query)!; const navigate = jest.fn(); navigateSearchCommand(command, navigate);
    expect(navigate).toHaveBeenCalledWith({ pathname: "/(tabs)/markets", params: { hub: "news", region, category } });
    expect(command.params.q).toBeUndefined();
  });
  it("parses bank ETFs", () => expect(parseSearchCommand("ETF banques")?.kind).toBe("etf"));
  it("rejects malformed numeric commands", () => expect(parseSearchCommand("RSI << nope")).toBeNull());
});
