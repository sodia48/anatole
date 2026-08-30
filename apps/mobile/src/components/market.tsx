import { router } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { MarketTile, NewsItem, Quote } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { Change } from "./ui";

export function StockRow({ quote }: { quote: Quote | MarketTile }) {
  const { language, pick } = useLocale();
  const ticker = normalizeTicker(quote.ticker || quote.symbol);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pick("Ouvrir", "Open")} ${ticker}`}
      onPress={() => router.push({ pathname: "/focus/[ticker]", params: { ticker } })}
      style={({ pressed }) => [styles.stockRow, pressed && styles.pressed]}
    >
      <View style={styles.tickerBadge}><Text style={styles.ticker}>{ticker}</Text></View>
      <View style={styles.stockCopy}><Text numberOfLines={1} style={styles.name}>{quote.name}</Text><Text style={styles.meta}>{"currency" in quote ? quote.currency : "CAD"} · {quote.delayed ? pick("différé", "delayed") : pick("marché", "market")}</Text></View>
      <View style={styles.price}><Text style={styles.priceText}>{quote.price.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text><Change value={quote.change_percent} /></View>
    </Pressable>
  );
}

export function NewsCard({ item }: { item: NewsItem }) {
  const { language, pick } = useLocale();
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.url)} style={({ pressed }) => [styles.news, pressed && styles.pressed]}>
      <Text style={styles.newsTitle}>{item.title}</Text>
      {item.summary ? <Text numberOfLines={3} style={styles.summary}>{item.summary}</Text> : null}
      <Text style={styles.meta}>{item.publisher ?? item.source ?? pick("Actualité", "News")} · {new Date(item.published_at).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stockRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tickerBadge: { minWidth: 54, paddingHorizontal: spacing.sm, paddingVertical: 7, alignItems: "center", backgroundColor: "#103d6f", borderRadius: radius.sm },
  ticker: { ...typography.label, color: "#8cc9ff" },
  stockCopy: { flex: 1, minWidth: 0 },
  name: { ...typography.body, color: colors.text, fontWeight: "700" },
  meta: { ...typography.caption, color: colors.textMuted },
  price: { alignItems: "flex-end", gap: 2 },
  priceText: { ...typography.body, color: colors.text, fontWeight: "700" },
  news: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  newsTitle: { ...typography.body, color: colors.text, fontWeight: "700" },
  summary: { ...typography.body, color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
