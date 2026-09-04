import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FeedStatus } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { sourceHealthLabel } from "./model";

export function NewsSourceHealth({ statuses }: { statuses: readonly FeedStatus[] }) {
  const { language, pick } = useLocale();
  const [open, setOpen] = useState(false);
  if (!statuses.length) return null;
  return <View style={styles.panel} testID="news-source-health"><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.toggle}><Text style={styles.title}>{pick("SOURCES", "SOURCES")}</Text><Text style={styles.arrow}>{open ? "−" : "+"}</Text></Pressable>{open ? statuses.map((status) => <View key={status.source} style={styles.row}><Text numberOfLines={1} style={styles.source}>{status.source}</Text><Text style={styles.status}>{sourceHealthLabel(status, language)}</Text></View>) : null}</View>;
}

const styles = StyleSheet.create({ panel: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, toggle: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md }, title: { ...typography.label, color: colors.text }, arrow: { fontSize: 22, color: colors.primary }, row: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, source: { ...typography.caption, color: colors.text, flex: 1 }, status: { ...typography.caption, color: colors.textMuted, textAlign: "right" } });
