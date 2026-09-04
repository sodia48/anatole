import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/ui";
import type { PortfolioAllocation as Allocation } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioNumber } from "./model";

function AllocationRows({ items }: { items: Allocation[] }) {
  const { language } = useLocale();
  return <>{items.map((item) => <View key={item.key} style={styles.item}><View style={styles.row}><Text style={styles.label}>{item.label}</Text><Text style={styles.value}>{formatPortfolioNumber(item.weight_percent, language, " %")}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, item.weight_percent))}%` }]} /></View></View>)}</>;
}

export function PortfolioAllocation({ sectors, currencies = [] }: { sectors: Allocation[]; currencies?: Allocation[] }) {
  const { pick } = useLocale();
  return <Card title={pick("Allocations", "Allocations")} testID="portfolio-allocation"><Text style={styles.heading}>{pick("Secteurs", "Sectors")}</Text><AllocationRows items={sectors} /><Text style={styles.heading}>{pick("Devises", "Currencies")}</Text>{currencies.length ? <AllocationRows items={currencies} /> : <Text style={styles.muted}>N/D</Text>}</Card>;
}
const styles = StyleSheet.create({ item: { gap: spacing.xs }, row: { flexDirection: "row", justifyContent: "space-between" }, label: { ...typography.body, color: colors.text }, value: { ...typography.label, color: colors.cyan }, heading: { ...typography.label, color: colors.primary, textTransform: "uppercase", marginTop: spacing.xs }, track: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary }, muted: { ...typography.body, color: colors.textMuted } });
