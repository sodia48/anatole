import { Pressable, StyleSheet, Text, View } from "react-native";

import { valueOrNd } from "@/src/components/focus/format";
import { Card } from "@/src/components/ui";
import type { TerminalMarketDriver } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { driverMove, driverRelationship, selectTodayDrivers } from "./model";

export function TodayDrivers({ drivers, stale, onOpenTerminal }: { drivers: readonly TerminalMarketDriver[]; stale: boolean; onOpenTerminal: () => void }) {
  const { language, pick } = useLocale();
  const selected = selectTodayDrivers(drivers);
  const status = (value: TerminalMarketDriver["status"]) => value === "available" ? pick("À jour", "Up to date") : value === "stale" ? pick("Dernières données", "Latest available") : pick("Indisponible", "Unavailable");
  return <Card action={<Pressable accessibilityRole="button" onPress={onOpenTerminal} style={styles.link}><Text style={styles.linkText}>Terminal Pro →</Text></Pressable>} title={pick("DRIVERS DU JOUR", "TODAY’S DRIVERS")} testID="today-drivers">
    {stale ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    {selected.length ? selected.map((driver) => {
      const relationship = driverRelationship(driver, language);
      return <View key={driver.key} style={styles.driver} testID={`today-driver-${driver.key}`}>
        <View style={styles.top}><View style={styles.identity}><Text style={styles.name}>{driver.label}</Text><Text style={styles.category}>{driver.category}</Text></View><Text style={[styles.status, driver.status === "stale" && styles.statusStale]}>{status(driver.status)}</Text></View>
        <View style={styles.values}><Text style={styles.value}>{driver.value == null ? "N/D" : `${valueOrNd(driver.value, 3, language)} ${driver.unit}`}</Text><Text style={[styles.move, { color: driver.change_1d == null ? colors.textMuted : driver.change_1d >= 0 ? colors.positive : colors.negative }]}>{driverMove(driver, language)}</Text></View>
        {relationship ? <Text style={styles.relationship}>{relationship}</Text> : null}
      </View>;
    }) : <Pressable accessibilityRole="button" onPress={onOpenTerminal} style={styles.empty}><Text style={styles.emptyTitle}>N/D</Text><Text style={styles.emptyText}>{pick("Ouvrir Terminal Pro pour vérifier la disponibilité des drivers.", "Open Pro Terminal to check driver availability.")}</Text></Pressable>}
  </Card>;
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: "center" }, linkText: { ...typography.caption, color: colors.primary, fontWeight: "800" }, stale: { ...typography.caption, color: colors.warning }, driver: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }, identity: { flex: 1 }, name: { ...typography.section, color: colors.text }, category: { ...typography.caption, color: colors.textMuted }, status: { ...typography.caption, color: colors.positive }, statusStale: { color: colors.warning }, values: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md }, value: { ...typography.section, color: colors.text }, move: { ...typography.label }, relationship: { ...typography.caption, color: colors.textMuted }, empty: { minHeight: 88, justifyContent: "center", gap: spacing.xs }, emptyTitle: { ...typography.section, color: colors.text }, emptyText: { ...typography.body, color: colors.textMuted },
});
