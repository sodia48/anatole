import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import type { EconomicCalendarItem } from "./model";

export function CalendarEventModal({ item, onClose }: { item: EconomicCalendarItem | null; onClose: () => void }) {
  const { language, pick } = useLocale();
  if (!item) return null;
  const date = new Date(item.startsAt);
  const when = Number.isNaN(date.getTime()) ? "N/D" : date.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto", timeZoneName: "short" });
  return <Modal accessibilityViewIsModal animationType="slide" onRequestClose={onClose} transparent visible><View style={styles.backdrop}><SafeAreaView edges={["bottom"]} style={styles.sheet} testID="calendar-event-modal"><View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{item.title}</Text><Pressable accessibilityLabel={pick("Fermer", "Close")} accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View><Text style={styles.when}>{when}</Text><View style={styles.details}><Text style={styles.detail}>{pick("Importance", "Importance")} · {item.event.importance}</Text><Text style={styles.detail}>{item.category} · {item.regions.join(" · ")}</Text><Text style={styles.detail}>{item.event.currency} · {item.source}</Text></View>{item.event.description ? <Text style={styles.description}>{item.event.description}</Text> : null}{item.url ? <Button label={pick("Source officielle", "Official source")} onPress={() => void Linking.openURL(item.url!)} /> : null}</SafeAreaView></View></Modal>;
}

const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.58)" }, sheet: { gap: spacing.md, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, title: { ...typography.title, color: colors.text, flex: 1 }, close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 30, color: colors.text }, when: { ...typography.body, color: colors.primary, fontWeight: "800" }, details: { gap: spacing.xs }, detail: { ...typography.caption, color: colors.textMuted }, description: { ...typography.body, color: colors.text } });
