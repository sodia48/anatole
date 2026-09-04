import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AlertEvaluation, AlertRule } from "./api/types";
import { ALERT_STATE_KEY, evaluateAlertTransitions, loadAlertStates, persistAlertStates } from "./alertState";

const thresholdRule: AlertRule = { id: "threshold", symbol: "RY", enabled: true, kind: "threshold", metric: "price", operator: "above", threshold: 100, cooldown_minutes: 5 };
const threshold = (triggered: boolean): AlertEvaluation => ({ id: "threshold", symbol: "RY", status: triggered ? "triggered" : "monitoring", message: "price", current_value: triggered ? 101 : 99, triggered });
const eventRule = (id: string, event_type: NonNullable<AlertRule["event_type"]>): AlertRule => ({ id, symbol: "RY", enabled: true, kind: "event", event_type, cooldown_minutes: 5 });
const event = (id: string, event_type: NonNullable<AlertRule["event_type"]>, fingerprint: string | null, value: string | null, triggered = true): AlertEvaluation => ({ id, symbol: "RY", event_type, event_fingerprint: fingerprint, event_value: value, status: triggered ? "triggered" : "monitoring", message: value ?? "none", triggered });

beforeEach(async () => AsyncStorage.clear());

describe("persistent alert transitions", () => {
  it("triggers threshold only on false-to-true and honors cooldown after rearming", () => {
    const start = new Date("2026-09-04T12:00:00Z");
    let result = evaluateAlertTransitions([thresholdRule], [threshold(false)], {}, start);
    expect(result.triggered).toHaveLength(0);
    result = evaluateAlertTransitions([thresholdRule], [threshold(true)], result.states, start);
    expect(result.triggered).toHaveLength(1);
    result = evaluateAlertTransitions([thresholdRule], [threshold(true)], result.states, new Date("2026-09-04T12:01:00Z"));
    expect(result.triggered).toHaveLength(0);
    result = evaluateAlertTransitions([thresholdRule], [threshold(false)], result.states, new Date("2026-09-04T12:02:00Z"));
    result = evaluateAlertTransitions([thresholdRule], [threshold(true)], result.states, new Date("2026-09-04T12:03:00Z"));
    expect(result.triggered).toHaveLength(0);
    result = evaluateAlertTransitions([thresholdRule], [threshold(true)], result.states, new Date("2026-09-04T12:05:00Z"));
    expect(result.triggered).toHaveLength(1);
  });

  it("uses the first terminal regime as baseline and only triggers a real change", () => {
    const rule = eventRule("regime", "terminal_regime");
    let result = evaluateAlertTransitions([rule], [event("regime", "terminal_regime", "terminal-regime:Constructif", "Constructif", false)], {}, new Date("2026-09-04T12:00:00Z"));
    expect(result.triggered).toHaveLength(0);
    result = evaluateAlertTransitions([rule], [event("regime", "terminal_regime", "terminal-regime:Neutre", "Neutre", false)], result.states, new Date("2026-09-04T12:01:00Z"));
    expect(result.triggered[0]?.message).toContain("Constructif → Neutre");
    result = evaluateAlertTransitions([rule], [event("regime", "terminal_regime", "terminal-regime:Neutre", "Neutre", false)], result.states, new Date("2026-09-04T12:02:00Z"));
    expect(result.triggered).toHaveLength(0);
  });

  it.each([
    ["earnings", "earnings_upcoming", "RY:earnings:2026-09-05T12:00:00Z"],
    ["insider", "insider_unusual", "RY:insider:trade-1"],
    ["news", "company_news", "RY:news:article-1"],
  ] as const)("does not repeat the same %s event", (id, type, fingerprint) => {
    const rule = eventRule(id, type);
    const evaluation = event(id, type, fingerprint, fingerprint);
    const first = evaluateAlertTransitions([rule], [evaluation], {}, new Date("2026-09-04T12:00:00Z"));
    expect(first.triggered).toHaveLength(1);
    const second = evaluateAlertTransitions([rule], [evaluation], first.states, new Date("2026-09-04T12:01:00Z"));
    expect(second.triggered).toHaveLength(0);
  });

  it("persists only versioned trigger state fields", async () => {
    const states = evaluateAlertTransitions([thresholdRule], [threshold(true)], {}, new Date("2026-09-04T12:00:00Z")).states;
    await persistAlertStates(states);
    expect(await loadAlertStates()).toEqual(states);
    expect(await AsyncStorage.getItem(ALERT_STATE_KEY)).not.toContain("token");
  });
});
