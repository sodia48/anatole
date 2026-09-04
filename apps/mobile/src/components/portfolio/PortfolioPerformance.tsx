import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/ui";
import type { PortfolioHorizon } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioNumber, portfolioHorizonLabel } from "./model";

export function PortfolioPerformance({ horizons = [] }: { horizons?: PortfolioHorizon[] }) {
  const { language, pick } = useLocale();
  return <Card title={pick("Performance", "Performance")} testID="portfolio-performance"><Text style={styles.note}>{pick("Performance reconstituée des positions actuelles; les quantités sont supposées constantes sur la période.", "Reconstructed performance of current positions; quantities are assumed constant over the period.")}</Text><View style={styles.row}>{horizons.map((item) => <View key={item.horizon} style={styles.metric}><Text style={styles.label}>{portfolioHorizonLabel(item.horizon)}</Text><Text style={styles.value}>{formatPortfolioNumber(item.return_percent, language, " %")}</Text><Text style={styles.coverage}>{pick("Couverture", "Coverage")} · {formatPortfolioNumber(item.coverage.coverage_percent, language, " %")}</Text></View>)}</View></Card>;
}
const styles = StyleSheet.create({ note: { ...typography.caption, color: colors.textMuted }, row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { minWidth: 96, flexGrow: 1, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, label: { ...typography.label, color: colors.primary }, value: { ...typography.section, color: colors.text }, coverage: { ...typography.caption, color: colors.textSubtle } });
