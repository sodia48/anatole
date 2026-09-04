import { mobileAssistantHref } from "./routes";

describe("mobile assistant routes", () => {
  it("maps backend links to real mobile routes", () => {
    expect(mobileAssistantHref("/comparateur?symbols=RY,TD")).toEqual({ pathname: "/compare", params: { symbols: "RY,TD" } });
    expect(mobileAssistantHref("/portefeuille")).toBe("/(tabs)/portfolio");
    expect(mobileAssistantHref("/alertes?symbol=RY")).toEqual({ pathname: "/alerts", params: { symbol: "RY" } });
    expect(mobileAssistantHref("/focus/ry")).toEqual({ pathname: "/focus/[ticker]", params: { ticker: "RY" } });
  });

  it("does not expose an incompatible backend-only route", () => expect(mobileAssistantHref("/qualite")).toBeNull());
});
