import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, Field } from "@/src/components/ui";
import type { AlertRule } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { thresholdMetrics } from "./model";

export function AlertBuilder({ onAdd }: { onAdd: (rule: AlertRule) => Promise<void> }) {
  const { pick } = useLocale(); const [symbol, setSymbol] = useState(""); const [threshold, setThreshold] = useState(""); const [metric, setMetric] = useState<NonNullable<AlertRule["metric"]>>("price"); const [operator, setOperator] = useState<"above" | "below">("above");
  const add = async () => { const value = Number(threshold); const clean = normalizeTicker(symbol); if (!clean || !Number.isFinite(value)) return; await onAdd({ id: `${clean}-${metric}-${Date.now()}`, symbol: clean, metric, operator, threshold: value, enabled: true, kind: "threshold", cooldown_minutes: 1_440 }); setSymbol(""); setThreshold(""); };
  return <Card title={pick("Nouvelle alerte de seuil", "New threshold alert")}><Field autoCapitalize="characters" label={pick("Symbole", "Symbol")} onChangeText={setSymbol} placeholder="RY" value={symbol} /><View style={styles.wrap}>{thresholdMetrics.map((item) => <Pressable accessibilityState={{ selected: item === metric }} key={item} onPress={() => setMetric(item)} style={[styles.chip, item === metric && styles.active]}><Text style={styles.text}>{item.replaceAll("_", " ")}</Text></Pressable>)}</View><View style={styles.row}>{(["above", "below"] as const).map((item) => <Pressable accessibilityState={{ selected: item === operator }} key={item} onPress={() => setOperator(item)} style={[styles.chip, item === operator && styles.active]}><Text style={styles.text}>{item === "above" ? pick("Au-dessus", "Above") : pick("Au-dessous", "Below")}</Text></Pressable>)}</View><Field keyboardType="decimal-pad" label={pick("Seuil", "Threshold")} onChangeText={setThreshold} value={threshold} /><Button disabled={!symbol.trim() || !threshold.trim()} label={pick("Créer l’alerte", "Create alert")} onPress={() => void add()} /></Card>;
}
const styles = StyleSheet.create({ wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, row: { flexDirection: "row", gap: spacing.xs }, chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.2)" }, text: { ...typography.caption, color: colors.text } });
