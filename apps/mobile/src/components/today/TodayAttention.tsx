import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import type { TodayAttentionItem, TodayTarget } from "./model";

export function TodayAttention({ items, stale, onOpen }: { items: readonly TodayAttentionItem[]; stale: boolean; onOpen: (target: TodayTarget) => void }) {
  const { pick } = useLocale();
  return <Card title={pick("5 CHOSES À SURVEILLER", "5 THINGS TO WATCH")} testID="today-attention">
    {stale ? <Text style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    {items.length ? items.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => onOpen(item.target)} style={({ pressed }) => [styles.item, pressed && styles.pressed]} testID={`today-attention-${item.kind}`}>
      <View style={[styles.marker, item.tone === "positive" && styles.markerPositive, item.tone === "negative" && styles.markerNegative, item.tone === "watch" && styles.markerWatch]} />
      <View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text numberOfLines={3} style={styles.detail}>{item.detail}</Text>{item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}</View><Text style={styles.arrow}>›</Text>
    </Pressable>) : <View style={styles.empty}><Text style={styles.title}>{pick("Aucun élément prioritaire chargé.", "No priority item loaded.")}</Text><Text style={styles.detail}>{pick("Les alertes et observations apparaîtront progressivement.", "Alerts and observations will appear progressively.")}</Text></View>}
  </Card>;
}

const styles = StyleSheet.create({
  stale: { ...typography.caption, color: colors.warning }, item: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, pressed: { opacity: 0.72 }, marker: { width: 4, alignSelf: "stretch", borderRadius: radius.pill, backgroundColor: colors.textMuted }, markerPositive: { backgroundColor: colors.positive }, markerNegative: { backgroundColor: colors.negative }, markerWatch: { backgroundColor: colors.warning }, copy: { flex: 1, minWidth: 0, gap: 2 }, title: { ...typography.label, color: colors.text }, detail: { ...typography.caption, color: colors.textMuted }, badge: { ...typography.caption, color: colors.primary }, arrow: { fontSize: 24, color: colors.primary }, empty: { minHeight: 80, justifyContent: "center", gap: spacing.xs },
});
