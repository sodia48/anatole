import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import type { AlertRule, AlertSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { alertLabel } from "./model";

export function AlertRuleCard({ rule, evaluation, onToggle, onRemove }: { rule: AlertRule; evaluation?: AlertSnapshot["items"][number]; onToggle: (enabled: boolean) => void; onRemove: () => void }) {
  const { language, pick } = useLocale();
  return <View style={styles.card}><View style={styles.body}><Text style={styles.title}>{rule.symbol} · {alertLabel(rule, language)}</Text><Text style={[styles.status, evaluation?.triggered && styles.triggered]}>{rule.enabled ? evaluation?.message ?? pick("Évaluation en attente", "Evaluation pending") : pick("Désactivée", "Disabled")}</Text><Text style={styles.meta}>{evaluation?.source ?? pick("Source en attente", "Source pending")} · {evaluation?.evaluated_at ? new Date(evaluation.evaluated_at).toLocaleString() : "N/D"}</Text></View><Switch accessibilityLabel={pick("Activer l’alerte", "Enable alert")} onValueChange={onToggle} value={rule.enabled} /><Pressable accessibilityRole="button" onPress={onRemove} style={styles.remove}><Text style={styles.removeText}>{pick("Retirer", "Remove")}</Text></Pressable></View>;
}
const styles = StyleSheet.create({ card: { minHeight: 80, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, body: { flex: 1, gap: spacing.xs }, title: { ...typography.body, color: colors.text, fontWeight: "800" }, status: { ...typography.caption, color: colors.textMuted }, triggered: { color: colors.warning }, meta: { ...typography.caption, color: colors.textSubtle }, remove: { minHeight: 44, justifyContent: "center" }, removeText: { ...typography.caption, color: colors.negative } });
