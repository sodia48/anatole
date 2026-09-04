import { alertLabel, appendAlertHistory, migrateAlertRule } from "./model";

describe("Alert Center Pro model", () => {
  it("migrates legacy price/change/RSI rules without changing their values", () => expect(migrateAlertRule({ id: "1", symbol: "RY", metric: "rsi_14", operator: "below", threshold: 30, enabled: true })).toMatchObject({ kind: "threshold", metric: "rsi_14", threshold: 30 }));
  it("supports momentum, relative volume and score labels", () => ["momentum_20d", "relative_volume", "score"].forEach((metric) => expect(alertLabel({ id: metric, symbol: "RY", metric: metric as never, operator: "above", threshold: 2, enabled: true }, "fr")).toContain(metric)));
  it("deduplicates history by rule and event fingerprint, not evaluation time", () => { const item = { id: "x", symbol: "RY", status: "triggered", message: "x", current_value: 2, triggered: true, event_fingerprint: "article-1", evaluated_at: "now" }; expect(appendAlertHistory([item], [{ ...item, evaluated_at: "later" }])).toHaveLength(1); });
  it("labels actual company-news events without claiming market impact", () => expect(alertLabel({ id: "n", symbol: "RY", enabled: true, kind: "event", event_type: "company_news" }, "fr")).toBe("Nouvelle de l’entreprise"));
});
