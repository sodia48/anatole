import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/src/components/ui";
import type { PortfolioStressTest } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioNumber } from "./model";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

export function PortfolioStressTests({ items = [] }: { items?: PortfolioStressTest[] }) {
  useMobileTheme();
  const { language, pick } = useLocale();
  return <Card title={pick("Stress tests", "Stress tests")} testID="portfolio-stress"><Text style={styles.note}>{pick("Estimations fondées sur les sensibilités historiques; ces scénarios ne sont pas des prévisions.", "Estimates based on historical sensitivities; these scenarios are not forecasts.")}</Text>{items.map((item) => <View key={item.key} style={styles.row}><View style={styles.copy}><Text style={styles.title}>{item.label}</Text><Text style={styles.meta}>{pick("Couverture", "Coverage")} · {formatPortfolioNumber(item.coverage.coverage_percent, language, " %")}</Text></View><Text style={styles.value}>{formatPortfolioNumber(item.estimated_portfolio_change_percent, language, " %")}</Text></View>)}</Card>;
}
const styles = createThemedStyles((colors) => ({ note: { ...typography.caption, color: colors.textMuted }, row: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, copy: { flex: 1 }, title: { ...typography.body, color: colors.text, fontWeight: "700" }, meta: { ...typography.caption, color: colors.textMuted }, value: { ...typography.section, color: colors.text } }));
