import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/ui";
import type { PortfolioRisk as Risk } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioNumber } from "./model";

export function PortfolioRisk({ risk, reading = [] }: { risk?: Risk | null; reading?: string[] }) {
  const { language, pick } = useLocale();
  const rows = [
    [pick("Diversification", "Diversification"), risk?.diversification_score, "/100"], [pick("Niveau de risque", "Risk level"), risk?.risk_level, ""],
    [pick("Volatilité", "Volatility"), risk?.volatility_percent, " %"], ["Beta", risk?.beta, ""], [pick("Drawdown maximal", "Max drawdown"), risk?.max_drawdown_percent, " %"], ["Sharpe", risk?.sharpe_ratio, ""],
    [pick("Top position", "Top position"), risk?.top_position_percent, " %"], [pick("Top 3", "Top 3"), risk?.top_three_percent, " %"],
  ] as const;
  return <Card title={pick("Où est mon risque ?", "Where is my risk?")} testID="portfolio-risk">{risk ? <Text style={styles.coverage}>{pick("Couverture historique", "History coverage")} · {formatPortfolioNumber(risk.history_coverage_percent, language, " %")} · {risk.history_observations ?? 0} {pick("observations", "observations")}</Text> : null}<View style={styles.grid}>{rows.map(([label, value, suffix]) => <View key={label} style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{typeof value === "string" ? value : formatPortfolioNumber(value, language, suffix)}</Text></View>)}</View>{reading.map((item) => <Text key={item} style={styles.reading}>{item}</Text>)}</Card>;
}
const styles = StyleSheet.create({ coverage: { ...typography.caption, color: colors.primary, fontWeight: "800" }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { width: "47%", gap: 2 }, label: { ...typography.caption, color: colors.textMuted }, value: { ...typography.body, color: colors.text, fontWeight: "800" }, reading: { ...typography.body, color: colors.textMuted } });
