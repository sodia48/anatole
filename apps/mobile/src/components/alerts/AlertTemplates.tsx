import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Card } from "@/src/components/ui";
import type { AlertRule } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { alertLabel, eventTypes } from "./model";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

const defaults: Record<string, number> = { fundamental_margin_drop: 3, fundamental_debt_rise: 0.25, fundamental_fcf_drop: 20 };

export function AlertTemplates({ symbol, onAdd }: { symbol: string; onAdd: (rule: AlertRule) => Promise<void> }) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [thresholds, setThresholds] = useState<Record<string, string>>({ fundamental_margin_drop: "3", fundamental_debt_rise: "0.25", fundamental_fcf_drop: "20" });
  const [cooldown, setCooldown] = useState(1_440);
  const add = (eventType: NonNullable<AlertRule["event_type"]>) => {
    const threshold = eventType in defaults ? Number(thresholds[eventType]) : undefined;
    if (threshold !== undefined && (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100)) return;
    const rule: AlertRule = { id: `${symbol}-${eventType}`, symbol, enabled: true, kind: "event", event_type: eventType, threshold, cooldown_minutes: cooldown };
    void onAdd(rule);
  };
  return <Card title={pick("Alertes événementielles", "Event alerts")}>
    <Text style={styles.note}>{pick("Ajout explicite seulement. Les alertes fondamentales exigent des exercices officiels datés et comparables.", "Explicit opt-in only. Fundamental alerts require dated, comparable official filings.")}</Text>
    <Text style={styles.note}>{pick("Rappel minimal", "Minimum reminder")}</Text>
    <View style={styles.frequency}>{([1_440, 10_080, 43_200] as const).map((minutes) => <Pressable accessibilityRole="button" key={minutes} onPress={() => setCooldown(minutes)} style={[styles.frequencyButton, cooldown === minutes && styles.selected]}><Text style={styles.text}>{minutes === 1_440 ? pick("1 jour", "1 day") : minutes === 10_080 ? pick("1 semaine", "1 week") : pick("30 jours", "30 days")}</Text></Pressable>)}</View>
    <View style={styles.wrap}>{eventTypes.map((eventType) => {
      const preview: AlertRule = { id: eventType, symbol, enabled: true, kind: "event", event_type: eventType };
      const fundamental = eventType in defaults;
      const value = thresholds[eventType] ?? "";
      const valid = !fundamental || (Number(value) > 0 && Number(value) <= 100);
      return <View key={eventType} style={styles.row}>
        {fundamental ? <TextInput accessibilityLabel={`${alertLabel(preview, language)} · ${pick("seuil", "threshold")}`} keyboardType="decimal-pad" onChangeText={(text) => setThresholds((current) => ({ ...current, [eventType]: text }))} style={styles.input} value={value} /> : null}
        <Pressable accessibilityRole="button" disabled={!symbol || !valid} onPress={() => add(eventType)} style={styles.chip}><Text style={styles.text}>+ {alertLabel(preview, language)}</Text></Pressable>
      </View>;
    })}</View>
  </Card>;
}
const styles = createThemedStyles((colors) => ({ note: { ...typography.caption, color: colors.textMuted }, wrap: { gap: spacing.xs }, row: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, chip: { minHeight: 44, flex: 1, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, input: { width: 72, minHeight: 44, paddingHorizontal: spacing.xs, color: colors.text, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, frequency: { flexDirection: "row", gap: spacing.xs }, frequencyButton: { flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, selected: { borderColor: colors.primary }, text: { ...typography.label, color: colors.primary } }));
