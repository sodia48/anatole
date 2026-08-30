import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { Button, Card, Field, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import type { AlertRule } from "@/src/lib/api/types";
import { workspaceApi } from "@/src/lib/api/workspace";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const metrics: AlertRule["metric"][] = ["price", "change_percent", "rsi_14"];

export default function AlertsScreen() {
  const { state, workspace, saveWorkspace } = useMobileAccount();
  const { pick } = useLocale();
  const [symbol, setSymbol] = useState(""); const [threshold, setThreshold] = useState("");
  const [operator, setOperator] = useState<"above" | "below">("above"); const [metric, setMetric] = useState<AlertRule["metric"]>("price");
  const rules = workspace.data.alerts;
  const query = useQuery({ queryKey: ["alerts", rules], queryFn: () => workspaceApi.alerts(rules), enabled: rules.length > 0, refetchInterval: 60_000 });
  const metricLabel = (value: AlertRule["metric"]) => value === "price" ? pick("Prix", "Price") : value === "change_percent" ? pick("Variation", "Change") : "RSI 14";

  async function add() {
    const clean = normalizeTicker(symbol); const value = Number(threshold);
    if (!clean || !Number.isFinite(value)) return;
    const next: AlertRule = { id: `${clean}-${metric}-${Date.now()}`, symbol: clean, metric, operator, threshold: value, enabled: true, label: `${clean} ${metricLabel(metric)} ${operator === "above" ? ">" : "<"} ${value}` };
    await saveWorkspace({ ...workspace.data, alerts: [...rules, next] }); setSymbol(""); setThreshold("");
  }
  async function remove(id: string) { await saveWorkspace({ ...workspace.data, alerts: rules.filter((rule) => rule.id !== id) }); }
  async function toggle(id: string, enabled: boolean) { await saveWorkspace({ ...workspace.data, alerts: rules.map((rule) => rule.id === id ? { ...rule, enabled } : rule) }); }

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} testID="alerts-screen">
      <ScreenHeader eyebrow={pick("Surveillance", "Monitoring")} title={pick("Alertes", "Alerts")} subtitle={pick("Créez, activez et consultez vos règles Anatole.", "Create, enable and review your Anatole rules.")} />
      {state !== "authenticated" ? <Card><Text style={styles.muted}>{pick("Connectez-vous pour synchroniser et recevoir ces alertes sur tous vos appareils.", "Sign in to sync and receive these alerts on all your devices.")}</Text><Button label={pick("Se connecter", "Sign in")} onPress={() => router.push("/(auth)/login")} /></Card> : null}
      <Card title={pick("Nouvelle alerte", "New alert")}>
        <Field label={pick("Symbole", "Symbol")} value={symbol} onChangeText={setSymbol} placeholder="RY" autoCapitalize="characters" />
        <View style={styles.segment}>{metrics.map((value) => <Pressable key={value} onPress={() => setMetric(value)} style={[styles.segmentButton, metric === value && styles.segmentActive]}><Text style={styles.segmentText}>{metricLabel(value)}</Text></Pressable>)}</View>
        <View style={styles.segment}>{(["above", "below"] as const).map((value) => <Pressable key={value} onPress={() => setOperator(value)} style={[styles.segmentButton, operator === value && styles.segmentActive]}><Text style={styles.segmentText}>{value === "above" ? pick("Au-dessus", "Above") : pick("Au-dessous", "Below")}</Text></Pressable>)}</View>
        <Field label={`${metricLabel(metric)} · ${pick("seuil", "threshold")}${metric === "change_percent" ? " (%)" : metric === "price" ? " (CAD)" : ""}`} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder={metric === "rsi_14" ? "70" : "150"} />
        <Button label={pick("Créer l’alerte", "Create alert")} onPress={() => void add()} disabled={!symbol || !threshold} />
      </Card>
      {rules.length === 0 ? <Card><Text style={styles.empty}>{pick("Aucune alerte active.", "No active alert.")}</Text></Card> : null}
      <QueryState loading={query.isLoading} error={!query.data ? query.error : null} onRetry={() => void query.refetch()} />
      {rules.length ? <Card title={`${rules.length} ${pick("alertes", "alerts")}`}>{rules.map((rule) => { const evaluation = query.data?.items.find((item) => item.id === rule.id); return <View key={rule.id} style={styles.rule}><View style={{ flex: 1 }}><Text style={styles.ruleTitle}>{rule.symbol} · {metricLabel(rule.metric)} {rule.operator === "above" ? ">" : "<"} {rule.threshold.toFixed(2)}</Text><Text style={[styles.status, evaluation?.triggered && styles.triggered]}>{rule.enabled ? evaluation?.message ?? pick("Évaluation en attente", "Evaluation pending") : pick("Désactivée", "Disabled")}</Text></View><Switch accessibilityLabel={`${rule.enabled ? pick("Désactiver", "Disable") : pick("Activer", "Enable")} ${rule.symbol}`} value={rule.enabled} onValueChange={(enabled) => void toggle(rule.id, enabled)} trackColor={{ false: colors.surfaceRaised, true: colors.primary }} /><Pressable accessibilityRole="button" onPress={() => void remove(rule.id)}><Text style={styles.remove}>{pick("Retirer", "Remove")}</Text></Pressable></View>; })}</Card> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { ...typography.body, color: colors.textMuted }, segment: { flexDirection: "row", gap: spacing.sm }, segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }, segmentActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,0.18)" }, segmentText: { ...typography.label, color: colors.text },
  empty: { ...typography.body, color: colors.textMuted, textAlign: "center", padding: spacing.xl }, rule: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, ruleTitle: { ...typography.body, color: colors.text, fontWeight: "700" }, status: { ...typography.caption, color: colors.textMuted }, triggered: { color: colors.warning }, remove: { ...typography.caption, color: colors.negative },
});
