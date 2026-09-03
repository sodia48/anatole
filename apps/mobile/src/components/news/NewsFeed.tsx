import type { ReactElement } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { NewsCard } from "@/src/components/market";
import type { NewsItem, StockNewsItem } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export type NewsFeedEntry = { id: string; item: NewsItem | StockNewsItem; ticker?: string };

export function NewsFeed({ entries, header, footer, refreshing, onRefresh, onReset, onTicker }: {
  entries: readonly NewsFeedEntry[];
  header: ReactElement;
  footer?: ReactElement | null;
  refreshing: boolean;
  onRefresh: () => void;
  onReset: () => void;
  onTicker: (ticker: string) => void;
}) {
  const { pick } = useLocale();
  return <FlatList
    contentContainerStyle={styles.content}
    data={entries}
    initialNumToRender={10}
    keyExtractor={(entry) => entry.id}
    ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{pick("Aucune actualité ne correspond à ces filtres.", "No news matches these filters.")}</Text><Pressable accessibilityRole="button" onPress={onReset} style={styles.reset}><Text style={styles.resetText}>{pick("Réinitialiser les filtres", "Reset filters")}</Text></Pressable></View>}
    ListFooterComponent={footer ?? null}
    ListHeaderComponent={<View style={styles.header}>{header}</View>}
    maxToRenderPerBatch={12}
    onRefresh={onRefresh}
    refreshing={refreshing}
    removeClippedSubviews
    renderItem={({ item: entry }) => <View style={styles.card}><NewsCard exploreLabel={entry.ticker ? `${pick("Ouvrir Focus", "Open Focus")} · ${entry.ticker}` : undefined} item={entry.item} onExplore={entry.ticker ? () => onTicker(entry.ticker!) : undefined} showCategory showRegion showTone={"source" in entry.item} /></View>}
    testID="news-feed"
    windowSize={7}
  />;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 120, backgroundColor: colors.background, flexGrow: 1 }, header: { gap: spacing.md, marginBottom: spacing.sm }, card: { paddingHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, empty: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg }, emptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" }, reset: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong }, resetText: { ...typography.label, color: colors.primary } });
