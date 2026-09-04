import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/ui";
import type { AlertRule } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { alertLabel, eventTypes } from "./model";

export function AlertTemplates({ symbol, onAdd }: { symbol: string; onAdd: (rule: AlertRule) => Promise<void> }) {
  const { language, pick } = useLocale();
  return <Card title={pick("Alertes événementielles", "Event alerts")}><Text style={styles.note}>{pick("Ajout explicite seulement. Les événements proviennent des moteurs Anatole sourcés.", "Explicit opt-in only. Events come from sourced Anatole engines.")}</Text><View style={styles.wrap}>{eventTypes.map((eventType) => { const rule: AlertRule = { id: `${symbol}-${eventType}-${Date.now()}`, symbol, enabled: true, kind: "event", event_type: eventType, cooldown_minutes: 1_440 }; return <Pressable disabled={!symbol} key={eventType} onPress={() => void onAdd(rule)} style={styles.chip}><Text style={styles.text}>+ {alertLabel(rule, language)}</Text></Pressable>; })}</View></Card>;
}
const styles = StyleSheet.create({ note: { ...typography.caption, color: colors.textMuted }, wrap: { gap: spacing.xs }, chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, text: { ...typography.label, color: colors.primary } });
