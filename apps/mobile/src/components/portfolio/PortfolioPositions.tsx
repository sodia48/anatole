import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Change } from "@/src/components/ui";
import type { PortfolioPositionSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioMoney, formatPortfolioNumber } from "./model";

export function PortfolioPositions({ positions, onRemove }: { positions: PortfolioPositionSnapshot[]; onRemove: (symbol: string) => void }) {
  const { language, pick } = useLocale();
  return <Card title={pick("Positions", "Positions")} testID="portfolio-positions">{positions.map((item) => <View key={item.symbol} style={styles.row}><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/focus/[ticker]", params: { ticker: item.symbol } })} style={styles.copy}><Text style={styles.title}>{item.symbol} · {item.name}</Text><Text style={styles.meta}>{item.quantity} {pick("titres", "shares")} · {formatPortfolioMoney(item.market_value, language)} · {formatPortfolioNumber(item.weight_percent, language, " %")}</Text><Text style={styles.meta}>{pick("P/L latent", "Unrealized P/L")} · {formatPortfolioMoney(item.unrealized_pnl, language)} · {formatPortfolioNumber(item.unrealized_pnl_percent, language, " %")}</Text><Text style={styles.meta}>{item.delayed ? pick("Différé", "Delayed") : pick("Donnée courante", "Current data")} · {item.source ?? "N/D"}</Text></Pressable><View style={styles.actions}><Change value={item.day_change_percent} /><Pressable accessibilityLabel={`${pick("Retirer", "Remove")} ${item.symbol}`} accessibilityRole="button" onPress={() => onRemove(item.symbol)} style={styles.removeButton}><Text style={styles.remove}>{pick("Retirer", "Remove")}</Text></Pressable></View></View>)}</Card>;
}
const styles = StyleSheet.create({ row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, copy: { flex: 1, minHeight: 44, justifyContent: "center" }, title: { ...typography.body, color: colors.text, fontWeight: "800" }, meta: { ...typography.caption, color: colors.textMuted }, actions: { alignItems: "flex-end", gap: spacing.xs }, removeButton: { minHeight: 44, justifyContent: "center" }, remove: { ...typography.caption, color: colors.negative } });
