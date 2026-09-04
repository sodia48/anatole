import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AlertEvaluation, AlertRule } from "./api/types";

export const ALERT_STATE_KEY = "anatole.mobile.alert-state.v1";

export type PersistedAlertState = {
  last_triggered_at: string | null;
  last_event_fingerprint: string | null;
  last_event_value: string | null;
  condition_active: boolean;
};

export type AlertStateMap = Record<string, PersistedAlertState>;

const emptyState = (): PersistedAlertState => ({
  last_triggered_at: null,
  last_event_fingerprint: null,
  last_event_value: null,
  condition_active: false,
});

function cooldownExpired(state: PersistedAlertState, rule: AlertRule, now: Date): boolean {
  if (!state.last_triggered_at) return true;
  const last = new Date(state.last_triggered_at).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= (rule.cooldown_minutes ?? 1_440) * 60_000;
}

export function evaluateAlertTransitions(
  rules: readonly AlertRule[],
  evaluations: readonly AlertEvaluation[],
  previous: AlertStateMap,
  now: Date,
): { states: AlertStateMap; triggered: AlertEvaluation[] } {
  const byRule = new Map(rules.map((rule) => [rule.id, rule]));
  const states = { ...previous };
  const triggered: AlertEvaluation[] = [];
  const triggeredAt = now.toISOString();

  for (const evaluation of evaluations) {
    const rule = byRule.get(evaluation.id);
    if (!rule || !rule.enabled || evaluation.status === "disabled" || evaluation.status === "unavailable") continue;
    const current = states[rule.id] ?? emptyState();

    if ((rule.kind ?? "threshold") === "threshold") {
      const fires = evaluation.triggered && !current.condition_active && cooldownExpired(current, rule, now);
      states[rule.id] = {
        ...current,
        condition_active: evaluation.triggered ? (fires || current.condition_active) : false,
        last_event_value: evaluation.current_value == null ? current.last_event_value : String(evaluation.current_value),
        last_triggered_at: fires ? triggeredAt : current.last_triggered_at,
      };
      if (fires) {
        const fingerprint = `threshold:${rule.id}:${triggeredAt}`;
        triggered.push({ ...evaluation, event_fingerprint: fingerprint, last_triggered_at: triggeredAt });
      }
      continue;
    }

    if (rule.event_type === "terminal_regime") {
      const value = evaluation.event_value ?? null;
      if (!value) continue;
      const baselineOnly = current.last_event_value === null;
      const changed = !baselineOnly && current.last_event_value !== value;
      states[rule.id] = {
        ...current,
        condition_active: false,
        last_event_fingerprint: evaluation.event_fingerprint ?? `terminal-regime:${value}`,
        last_event_value: value,
        last_triggered_at: changed ? triggeredAt : current.last_triggered_at,
      };
      if (changed) {
        triggered.push({
          ...evaluation,
          triggered: true,
          status: "triggered",
          message: `Régime Terminal : ${current.last_event_value} → ${value}.`,
          last_triggered_at: triggeredAt,
        });
      }
      continue;
    }

    const fingerprint = evaluation.event_fingerprint ?? null;
    if (!evaluation.triggered) {
      states[rule.id] = { ...current, condition_active: false, last_event_value: evaluation.event_value ?? current.last_event_value };
      continue;
    }
    if (!fingerprint) continue;
    const newEvent = fingerprint !== current.last_event_fingerprint;
    const fires = newEvent || (!current.condition_active && cooldownExpired(current, rule, now));
    states[rule.id] = {
      ...current,
      condition_active: fires || current.condition_active,
      last_event_fingerprint: fingerprint,
      last_event_value: evaluation.event_value ?? current.last_event_value,
      last_triggered_at: fires ? triggeredAt : current.last_triggered_at,
    };
    if (fires) triggered.push({ ...evaluation, last_triggered_at: triggeredAt });
  }

  return { states, triggered };
}

export async function loadAlertStates(): Promise<AlertStateMap> {
  try {
    const raw = await AsyncStorage.getItem(ALERT_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as AlertStateMap : {};
  } catch {
    return {};
  }
}

export const persistAlertStates = (states: AlertStateMap) => AsyncStorage.setItem(ALERT_STATE_KEY, JSON.stringify(states));
