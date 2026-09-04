import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { Card } from "@/src/components/ui";
import type { PortfolioContributionResult, PortfolioHorizon } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioNumber, portfolioHorizonLabel } from "./model";

export function PortfolioContribution({ results = [] }: { results?: PortfolioContributionResult[] }) {
  const { language, pick } = useLocale();
  const [horizon, setHorizon] = useState<PortfolioHorizon["horizon"]>("1d");
  const selected = results.find((item) => item.horizon === horizon);
  return <Card title={pick("Contribution", "Contribution")} testID="portfolio-contribution"><View style={styles.filters}>{(["1d", "1w", "1m", "3m", "ytd", "1y"] as const).map((item) => <Pressable accessibilityState={{ selected: horizon === item }} key={item} onPress={() => setHorizon(item)} style={[styles.chip, horizon === item && styles.active]}><Text style={styles.chipText}>{portfolioHorizonLabel(item)}</Text></Pressable>)}</View><Text style={styles.note}>{horizon === "1d" ? pick("Contribution observée du jour", "Observed day contribution") : pick("Contribution reconstituée", "Reconstructed contribution")}</Text>{selected?.items.length ? selected.items.map((item) => <View key={item.symbol} style={styles.row}><Text style={styles.symbol}>{item.symbol}</Text><Text style={styles.meta}>{formatPortfolioNumber(item.security_return_percent, language, " %")} · {formatPortfolioNumber(item.current_weight_percent, language, " %")}</Text><Text style={styles.value}>{formatPortfolioNumber(item.contribution_percent, language, " %")}</Text></View>) : <Text style={styles.note}>N/D · {pick("couverture insuffisante", "insufficient coverage")}</Text>}</Card>;
}
const styles = StyleSheet.create({ filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, chip: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, chipText: { ...typography.label, color: colors.text }, note: { ...typography.caption, color: colors.textMuted }, row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm }, symbol: { width: 48, ...typography.label, color: colors.primary }, meta: { flex: 1, ...typography.caption, color: colors.textMuted }, value: { ...typography.label, color: colors.text } });
