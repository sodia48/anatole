import { StyleSheet, Text, View } from "react-native";

import { NewsCard } from "@/src/components/market";
import type { NewsItem } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export function NewsHero({ items }: { items: readonly NewsItem[] }) {
  const { pick } = useLocale();
  if (!items.length) return null;
  return <View style={styles.hero} testID="news-hero"><Text style={styles.eyebrow}>{pick("À LA UNE", "TOP STORIES")}</Text>{items.slice(0, 3).map((item) => <NewsCard compact item={item} key={item.id} showCategory showRegion />)}</View>;
}

const styles = StyleSheet.create({ hero: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, eyebrow: { ...typography.label, color: colors.primary, letterSpacing: 1.2 } });
