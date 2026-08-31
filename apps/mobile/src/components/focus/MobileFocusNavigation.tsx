import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export type MobileFocusSection = "overview" | "pro" | "fundamentals" | "financials" | "analysts" | "ecosystem";
const sections: { id: MobileFocusSection; fr: string; en: string }[] = [
  { id: "overview", fr: "Cours", en: "Price" }, { id: "pro", fr: "Pro", en: "Pro" },
  { id: "fundamentals", fr: "Fondamentaux", en: "Fundamentals" }, { id: "financials", fr: "Résultats", en: "Financials" },
  { id: "analysts", fr: "Analystes", en: "Analysts" }, { id: "ecosystem", fr: "Écosystème", en: "Ecosystem" },
];

export function MobileFocusNavigation({ section, onChange }: { section: MobileFocusSection; onChange: (section: MobileFocusSection) => void }) {
  const { pick } = useLocale();
  return <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>{sections.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} key={item.id} onPress={() => onChange(item.id)} style={[styles.tab, section === item.id && styles.active]}><Text style={[styles.text, section === item.id && styles.activeText]}>{pick(item.fr, item.en)}</Text></Pressable>)}</ScrollView>;
}
const styles = StyleSheet.create({ row: { gap: spacing.xs }, tab: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" }, text: { ...typography.label, color: colors.textMuted }, activeText: { color: colors.text } });
