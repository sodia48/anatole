import { Pressable, StyleSheet, Text, View } from "react-native";

import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { formatEstimate, type CalendarIntelligenceItem } from "./model";

function eventTime(value: string, language: "fr" | "en") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/D" : date.toLocaleTimeString(language === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto", timeZoneName: "short" });
}

export function CalendarEventCard({ item, onPress }: { item: CalendarIntelligenceItem; onPress: () => void }) {
  const { language, pick } = useLocale();
  const time = eventTime(item.startsAt, language);
  const meta = item.kind === "economic" ? `${item.category} · ${item.regions.join(" · ")}` : `${item.event.sector ?? pick("Secteur N/D", "Sector N/A")} · ${item.ticker}`;
  return <Pressable accessibilityLabel={`${item.title}, ${time}, ${meta}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]} testID={`calendar-event-${item.kind}`}>
    <View style={styles.time}><Text style={styles.timeText}>{time}</Text>{item.kind === "earnings" ? <Text style={item.timeIsEstimated ? styles.estimated : styles.confirmed}>{item.timeIsEstimated ? pick("Heure indicative", "Estimated time") : pick("Heure confirmée", "Confirmed time")}</Text> : null}</View>
    <View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.meta}>{meta}</Text>{item.kind === "earnings" ? <Text style={styles.estimates}>EPS {formatEstimate(item.event.eps_estimate, item.event.estimate_currency, language)} · {pick("Revenu", "Revenue")} {formatEstimate(item.event.revenue_estimate, item.event.estimate_currency, language)}</Text> : <Text style={styles.importance}>{pick("Importance", "Importance")} · {item.event.importance}</Text>}</View>
    <Text style={styles.arrow}>›</Text>
  </Pressable>;
}

const styles = StyleSheet.create({ card: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, pressed: { opacity: .72 }, time: { width: 86, gap: 2 }, timeText: { ...typography.caption, color: colors.primary, fontWeight: "800" }, estimated: { ...typography.caption, color: colors.warning }, confirmed: { ...typography.caption, color: colors.positive }, copy: { flex: 1, minWidth: 0, gap: 3 }, title: { ...typography.body, color: colors.text, fontWeight: "800" }, meta: { ...typography.caption, color: colors.textMuted }, estimates: { ...typography.caption, color: colors.text }, importance: { ...typography.caption, color: colors.textMuted }, arrow: { fontSize: 24, color: colors.primary } });
