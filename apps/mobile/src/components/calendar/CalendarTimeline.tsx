import type { ReactElement } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";

import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { CalendarEventCard } from "./CalendarEventCard";
import type { CalendarIntelligenceItem, CalendarSection } from "./model";

export function CalendarTimeline({ sections, header, footer, refreshing, onRefresh, onReset, onOpen }: { sections: readonly CalendarSection[]; header: ReactElement; footer?: ReactElement | null; refreshing: boolean; onRefresh: () => void; onReset: () => void; onOpen: (item: CalendarIntelligenceItem) => void }) {
  const { pick } = useLocale();
  return <SectionList
    contentContainerStyle={styles.content}
    initialNumToRender={10}
    keyExtractor={(item) => item.id}
    ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{pick("Aucun événement prévu dans cette fenêtre.", "No event is scheduled in this window.")}</Text><Pressable accessibilityRole="button" onPress={onReset} style={styles.reset}><Text style={styles.resetText}>{pick("Réinitialiser les filtres", "Reset filters")}</Text></Pressable></View>}
    ListFooterComponent={footer ?? null}
    ListHeaderComponent={<View style={styles.header}>{header}</View>}
    maxToRenderPerBatch={12}
    onRefresh={onRefresh}
    refreshing={refreshing}
    renderItem={({ item }) => <CalendarEventCard item={item} onPress={() => onOpen(item)} />}
    renderSectionHeader={({ section }) => <View style={styles.section}><Text style={styles.sectionTitle}>{section.title}</Text></View>}
    sections={sections as CalendarSection[]}
    stickySectionHeadersEnabled={false}
    testID="calendar-timeline"
    windowSize={7}
  />;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 120, backgroundColor: colors.background, flexGrow: 1 }, header: { gap: spacing.md }, section: { paddingTop: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.background }, sectionTitle: { ...typography.label, color: colors.primary, letterSpacing: 1 }, empty: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg }, emptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" }, reset: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong }, resetText: { ...typography.label, color: colors.primary } });
