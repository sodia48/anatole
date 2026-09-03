import { router } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { MarketTile, NewsItem, Quote, StockNewsItem } from "@/src/lib/api/types";
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

export function NewsCard({
  item,
  compact = false,
  showRegion = false,
  showCategory = false,
  showTone = false,
  exploreLabel,
  onExplore,
}: {
  item: NewsItem | StockNewsItem;
  compact?: boolean;
  showRegion?: boolean;
  showCategory?: boolean;
  showTone?: boolean;
  exploreLabel?: string;
  onExplore?: () => void;
}) {
  const { language, pick } = useLocale();
  const economic = "source" in item ? item : null;
  const source = "source" in item ? item.source : item.publisher;
  const published = new Date(item.published_at);
  const date = Number.isNaN(published.getTime()) ? "N/D" : published.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" });
  const category = economic?.category;
  const regions = economic?.regions ?? [];
  const sentiment = economic?.sentiment.toLowerCase() ?? "";
  const tone = sentiment.includes("posit") ? "Positive"
    : sentiment.includes("négat") || sentiment.includes("negat") ? pick("Négative", "Negative")
      : pick("Neutre", "Neutral");
  const accessibility = [item.title, source, date, category].filter(Boolean).join(", ");
  return (
    <Pressable accessibilityLabel={accessibility} accessibilityRole="link" onPress={() => void Linking.openURL(item.url)} style={({ pressed }) => [styles.news, compact && styles.newsCompact, pressed && styles.pressed]}>
      <Text style={styles.newsTitle}>{item.title}</Text>
      {item.summary ? <Text numberOfLines={compact ? 2 : 4} style={styles.summary}>{item.summary}</Text> : null}
      {showCategory && category ? <Text style={styles.newsCategory}>{category}{showRegion && regions.length ? ` · ${regions.join(" · ")}` : ""}</Text> : showRegion && regions.length ? <Text style={styles.newsCategory}>{regions.join(" · ")}</Text> : null}
      <Text style={styles.meta}>{economic ? `${pick("Source officielle", "Official source")} · ${source}` : source || pick("Actualité", "News")} · {date}</Text>
      {showTone && economic ? <View style={styles.tone}><Text style={styles.toneLabel}>{pick("Tonalité lexicale", "Lexical tone")} · {tone}</Text><Text style={styles.toneHelp}>{pick("Analyse automatique du vocabulaire du titre et du résumé; elle ne mesure pas l’impact de marché.", "Automated analysis of title and summary wording; it does not measure market impact.")}</Text></View> : null}
      {onExplore && exploreLabel ? <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); onExplore(); }} style={styles.explore}><Text style={styles.exploreText}>{exploreLabel}</Text></Pressable> : null}
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
  newsCompact: { paddingVertical: spacing.sm },
  newsTitle: { ...typography.body, color: colors.text, fontWeight: "700" },
  summary: { ...typography.body, color: colors.textMuted },
  newsCategory: { ...typography.caption, color: colors.primary, fontWeight: "800" },
  tone: { gap: 3, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  toneLabel: { ...typography.caption, color: colors.text, fontWeight: "800" },
  toneHelp: { ...typography.caption, color: colors.textMuted },
  explore: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  exploreText: { ...typography.caption, color: colors.primary, fontWeight: "800" },
  pressed: { opacity: 0.7 },
});
