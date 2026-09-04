import { StyleSheet, Text, View } from "react-native";

import { Card, Change, uiStyles } from "@/src/components/ui";
import type { PortfolioSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioMoney, formatPortfolioNumber, topPortfolioMover } from "./model";

export function PortfolioOverview({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const { language, pick } = useLocale();
  const top = topPortfolioMover(snapshot.positions, "top");
  const bottom = topPortfolioMover(snapshot.positions, "bottom");
  return <Card title={pick("Vue d’ensemble", "Overview")} testID="portfolio-value">
    <View style={styles.grid}>
      <View><Text style={uiStyles.label}>{pick("Valeur totale", "Total value")}</Text><Text style={uiStyles.value}>{formatPortfolioMoney(snapshot.total_market_value, language, snapshot.base_currency)}</Text></View>
      <View><Text style={uiStyles.label}>{pick("Variation du jour", "Day change")}</Text><Change value={snapshot.total_day_change_percent} /></View>
      <View><Text style={uiStyles.label}>{pick("P/L du jour", "Day P/L")}</Text><Text style={styles.value}>{formatPortfolioMoney(snapshot.total_day_pnl, language, snapshot.base_currency)}</Text></View>
      <View><Text style={uiStyles.label}>{pick("P/L latent", "Unrealized P/L")}</Text><Text style={styles.value}>{formatPortfolioMoney(snapshot.total_unrealized_pnl, language, snapshot.base_currency)}</Text></View>
    </View>
    <Text style={styles.copy}>{pick("Top contributeur", "Top contributor")} · {top ? `${top.symbol} ${formatPortfolioNumber(top.day_change_percent, language, " %")}` : "N/D"}</Text>
    <Text style={styles.copy}>{pick("Top détracteur", "Top detractor")} · {bottom ? `${bottom.symbol} ${formatPortfolioNumber(bottom.day_change_percent, language, " %")}` : "N/D"}</Text>
  </Card>;
}

const styles = StyleSheet.create({ grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }, value: { ...typography.body, color: colors.text, fontWeight: "800" }, copy: { ...typography.caption, color: colors.textMuted } });
