import type { AlertRule, AlertSnapshot } from "@/src/lib/api/types";

export const thresholdMetrics: NonNullable<AlertRule["metric"]>[] = ["price", "change_percent", "rsi_14", "momentum_20d", "relative_volume", "score"];
export const eventTypes: NonNullable<AlertRule["event_type"]>[] = ["terminal_anomaly", "terminal_regime", "earnings_upcoming", "insider_unusual", "company_news"];

export function migrateAlertRule(rule: AlertRule): AlertRule {
  return { ...rule, kind: rule.kind ?? "threshold", cooldown_minutes: rule.cooldown_minutes ?? 1_440 };
}

export function alertLabel(rule: AlertRule, language: "fr" | "en"): string {
  if ((rule.kind ?? "threshold") === "event") {
    const labels: Record<string, [string, string]> = { terminal_anomaly: ["Anomalie Terminal", "Terminal anomaly"], terminal_regime: ["Régime Terminal", "Terminal regime"], earnings_upcoming: ["Résultats à venir", "Upcoming earnings"], insider_unusual: ["Transaction d’initié inhabituelle", "Unusual insider trade"], company_news: ["Nouvelle de l’entreprise", "Company news"] };
    return labels[rule.event_type ?? ""]?.[language === "fr" ? 0 : 1] ?? "N/D";
  }
  const metric = rule.metric ?? "N/D";
  return `${metric} ${rule.operator === "above" ? ">" : "<"} ${rule.threshold ?? "N/D"}`;
}

export function appendAlertHistory(history: AlertSnapshot["items"], incoming: AlertSnapshot["items"]): AlertSnapshot["items"] {
  const seen = new Set<string>();
  return [...incoming, ...history].filter((item) => {
    const key = `${item.id}|${item.event_fingerprint ?? item.last_triggered_at ?? "transition"}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 100);
}
