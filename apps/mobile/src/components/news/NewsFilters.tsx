import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import type { NewsCategoryFilter, NewsFiltersState, NewsPrimaryFilter, NewsRegionFilter } from "./model";

const primaryOptions: { id: NewsPrimaryFilter; fr: string; en: string }[] = [
  { id: "all", fr: "Tout", en: "All" },
  { id: "canada", fr: "Canada", en: "Canada" },
  { id: "provinces", fr: "Provinces", en: "Provinces" },
  { id: "boc", fr: "Banque du Canada", en: "Bank of Canada" },
  { id: "statcan", fr: "Statistique Canada", en: "Statistics Canada" },
];

const regionOptions: { id: NewsRegionFilter; fr: string; en: string }[] = [
  { id: "all", fr: "Toutes régions", en: "All regions" }, { id: "CA", fr: "Canada", en: "Canada" },
  { id: "QC", fr: "QC", en: "QC" }, { id: "ON", fr: "ON", en: "ON" },
  { id: "BC", fr: "BC", en: "BC" }, { id: "AB", fr: "AB", en: "AB" },
  { id: "prairies", fr: "Prairies", en: "Prairies" }, { id: "atlantic", fr: "Atlantique", en: "Atlantic" },
];

const categoryOptions: { id: NewsCategoryFilter; fr: string; en: string }[] = [
  { id: "all", fr: "Toutes catégories", en: "All categories" },
  { id: "monetary", fr: "Politique monétaire", en: "Monetary policy" },
  { id: "inflation", fr: "Inflation", en: "Inflation" },
  { id: "labour", fr: "Travail", en: "Labour" },
  { id: "growth", fr: "Croissance", en: "Growth" },
  { id: "trade", fr: "Commerce", en: "Trade" },
  { id: "energy", fr: "Énergie", en: "Energy" },
  { id: "public-finance", fr: "Finances publiques", en: "Public finance" },
  { id: "investment", fr: "Investissement", en: "Investment" },
  { id: "housing", fr: "Logement", en: "Housing" },
  { id: "other", fr: "Autres", en: "Other" },
];

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.selected]} testID={testID}><Text style={[styles.chipText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}

export function NewsFilters({ filters, hasPersonal, onChange, preferredRegions = [] }: { filters: NewsFiltersState; hasPersonal: boolean; onChange: (next: NewsFiltersState) => void; preferredRegions?: string[] }) {
  const { language, pick } = useLocale();
  const primary = [
    ...primaryOptions,
    ...(preferredRegions.length > 0 ? [{ id: "my-regions" as const, fr: "Mes régions", en: "My regions" }] : []),
    ...(hasPersonal ? [{ id: "personal" as const, fr: "Mes titres", en: "My securities" }] : []),
  ];
  return <View style={styles.container} testID="news-filters">
    <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
      {primary.map((item) => <Chip key={item.id} label={language === "fr" ? item.fr : item.en} onPress={() => onChange({ ...filters, primary: item.id })} selected={filters.primary === item.id} testID={`news-primary-${item.id}`} />)}
    </ScrollView>
    <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
      {regionOptions.map((item) => <Chip key={item.id} label={language === "fr" ? item.fr : item.en} onPress={() => onChange({ ...filters, region: item.id })} selected={filters.region === item.id} testID={`news-region-${item.id}`} />)}
    </ScrollView>
    <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
      {categoryOptions.map((item) => <Chip key={item.id} label={language === "fr" ? item.fr : item.en} onPress={() => onChange({ ...filters, category: item.id })} selected={filters.category === item.id} testID={`news-category-${item.id}`} />)}
    </ScrollView>
    <TextInput accessibilityLabel={pick("Rechercher dans les actualités", "Search news")} onChangeText={(search) => onChange({ ...filters, search })} placeholder={pick("Titre, résumé, source ou catégorie", "Title, summary, source or category")} placeholderTextColor={colors.textSubtle} style={styles.search} value={filters.search} />
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm }, row: { gap: spacing.xs, paddingRight: spacing.lg },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  selected: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, chipText: { ...typography.caption, color: colors.textMuted, fontWeight: "700" }, selectedText: { color: colors.text },
  search: { minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceRaised },
});
