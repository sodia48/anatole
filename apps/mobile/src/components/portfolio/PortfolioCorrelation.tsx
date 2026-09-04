import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/ui";
import type { PortfolioCorrelation as Correlation } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioNumber } from "./model";

export function PortfolioCorrelation({ correlation }: { correlation?: Correlation | null }) {
  const { language, pick } = useLocale();
  if (!correlation?.symbols.length) return <Card title={pick("Corrélations", "Correlations")}><Text style={styles.muted}>N/D</Text></Card>;
  return <Card title={pick("Corrélations", "Correlations")} testID="portfolio-correlation"><Text style={styles.muted}>{pick("Rendements quotidiens, minimum 40 observations partagées. Aucune causalité n’est déduite.", "Daily returns, minimum 40 shared observations. No causality is inferred.")}</Text><Text style={styles.summary}>{pick("Corrélation moyenne", "Average correlation")} · {formatPortfolioNumber(correlation.average_correlation, language)}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><View>{correlation.symbols.map((symbol, row) => <View key={symbol} style={styles.row}><Text style={styles.symbol}>{symbol}</Text>{correlation.symbols.map((column, index) => <View key={column} style={styles.cell}><Text style={styles.cellText}>{formatPortfolioNumber(correlation.values[row]?.[index], language)}</Text></View>)}</View>)}</View></ScrollView></Card>;
}
const styles = StyleSheet.create({ muted: { ...typography.caption, color: colors.textMuted }, summary: { ...typography.body, color: colors.text, fontWeight: "700" }, row: { flexDirection: "row" }, symbol: { width: 56, padding: spacing.xs, ...typography.label, color: colors.primary }, cell: { width: 64, padding: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, cellText: { ...typography.caption, color: colors.text, textAlign: "center" } });
