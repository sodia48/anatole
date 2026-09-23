import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Change } from "@/src/components/ui";
import type { PortfolioPositionInput, PortfolioPositionSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { spacing, typography } from "@/src/theme/tokens";
import { formatPortfolioMoney, formatPortfolioNumber } from "./model";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

function normalizeSymbol(value: string): string {
  return value.replace(/\.TO$/i, "").toUpperCase();
}

export function PortfolioPositions({ positions, requestedPositions = [], onRemove }: { positions: PortfolioPositionSnapshot[]; requestedPositions?: PortfolioPositionInput[]; onRemove: (symbol: string) => void }) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const rows = requestedPositions.length
    ? requestedPositions.map((requested) => ({ requested, item: positions.find((candidate) => normalizeSymbol(candidate.symbol) === normalizeSymbol(requested.symbol)) }))
    : positions.map((item) => ({ requested: item, item }));
  return <Card title={pick("Positions", "Positions")} testID="portfolio-positions">{rows.map(({ requested, item }) => {
    const symbol = normalizeSymbol(requested.symbol);
    return <View key={symbol} style={styles.row}>{item ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/focus/[ticker]", params: { ticker: item.symbol } })} style={styles.copy}><Text style={styles.title}>{item.symbol} · {item.name}</Text><Text style={styles.meta}>{item.market ?? "CA"} · {item.native_currency ?? item.currency ?? "CAD"} · {item.quantity} {pick("titres", "shares")} · {formatPortfolioMoney(item.market_value, language)} · {formatPortfolioNumber(item.weight_percent, language, " %")}</Text><Text style={styles.meta}>{pick("P/L latent", "Unrealized P/L")} · {formatPortfolioMoney(item.unrealized_pnl, language)} · {formatPortfolioNumber(item.unrealized_pnl_percent, language, " %")}</Text><Text style={styles.meta}>{item.delayed ? pick("Différé", "Delayed") : pick("Donnée courante", "Current data")} · {item.source ?? "N/D"}</Text></Pressable> : <View style={styles.copy}><Text style={styles.title}>{symbol}</Text><Text style={styles.unavailable}>{pick("Données temporairement indisponibles", "Data temporarily unavailable")}</Text></View>}<View style={styles.actions}>{item ? <Change value={item.day_change_percent} /> : <Text style={styles.unavailable}>N/D</Text>}<Pressable accessibilityLabel={`${pick("Retirer", "Remove")} ${symbol}`} accessibilityRole="button" onPress={() => onRemove(symbol)} style={styles.removeButton}><Text style={styles.remove}>{pick("Retirer", "Remove")}</Text></Pressable></View></View>;
  })}</Card>;
}
const styles = createThemedStyles((colors) => ({ row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, copy: { flex: 1, minHeight: 44, justifyContent: "center" }, title: { ...typography.body, color: colors.text, fontWeight: "800" }, meta: { ...typography.caption, color: colors.textMuted }, unavailable: { ...typography.caption, color: colors.warning }, actions: { alignItems: "flex-end", gap: spacing.xs }, removeButton: { minHeight: 44, justifyContent: "center" }, remove: { ...typography.caption, color: colors.negative } }));
