import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import type { TodayTarget, TodayTimelineItem } from "./model";

function eventTime(value: string, language: "fr" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return date.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
}

export function TodayTimeline({ items, stale, onOpen, onCalendar }: { items: readonly TodayTimelineItem[]; stale: boolean; onOpen: (target: TodayTarget) => void; onCalendar: () => void }) {
  const { language, pick } = useLocale();
  return <Card action={<Pressable accessibilityRole="button" onPress={onCalendar} style={styles.link} testID="today-calendar-all"><Text style={styles.linkText}>{pick("Voir tout", "View all")} →</Text></Pressable>} title={pick("AGENDA DU JOUR", "TODAY’S AGENDA")} testID="today-timeline">
    {stale ? <Text style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    {items.length ? items.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => onOpen(item.target)} style={styles.item} testID={`today-timeline-${item.kind}`}>
      <View style={styles.time}><Text style={styles.timeText}>{eventTime(item.startsAt, language)}</Text></View><View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.meta}>{item.importance}{item.region ? ` · ${item.region}` : ""}{item.ticker ? ` · ${item.ticker}` : ""}</Text></View><Text style={styles.arrow}>›</Text>
    </Pressable>) : <View style={styles.empty}><Text style={styles.meta}>{pick("Aucun événement imminent chargé.", "No upcoming event loaded.")}</Text></View>}
  </Card>;
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: "center" }, linkText: { ...typography.caption, color: colors.primary, fontWeight: "800" }, stale: { ...typography.caption, color: colors.warning }, item: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, time: { width: 64 }, timeText: { ...typography.caption, color: colors.primary, fontWeight: "800" }, copy: { flex: 1, minWidth: 0, gap: 2 }, title: { ...typography.label, color: colors.text }, meta: { ...typography.caption, color: colors.textMuted }, arrow: { fontSize: 22, color: colors.primary }, empty: { minHeight: 72, justifyContent: "center" },
});
