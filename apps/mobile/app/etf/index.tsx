import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field, QueryState, ScreenHeader } from "@/src/components/ui";
import { EtfHeatmap } from "@/src/components/etf/EtfHeatmap";
import { marketApi } from "@/src/lib/api/market";
import type { EtfDirectoryItem } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { compactNumberOrNd, moneyOrNd } from "@/src/components/focus/format";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const EMPTY_ETF_ITEMS: EtfDirectoryItem[] = [];

export function filterEtfDirectory(items: EtfDirectoryItem[], search: string, category: string, provider: string): EtfDirectoryItem[] {
  const needle = search.trim().toLowerCase();
  return items.filter((item) => category === "all" || item.category === category)
    .filter((item) => provider === "all" || item.provider === provider)
    .filter((item) => !needle || `${item.ticker} ${item.symbol} ${item.name} ${item.provider} ${item.category} ${item.exposure}`.toLowerCase().includes(needle));
}

function EtfRow({ item }: { item: EtfDirectoryItem }) {
  const { language, pick } = useLocale();
  const quoteAvailable = item.source.toLowerCase() !== "unavailable" && Number.isFinite(item.price) && item.price > 0;
  const change = quoteAvailable && Number.isFinite(item.change_percent) ? item.change_percent : null;
  return <Pressable
    accessibilityLabel={`${pick("Ouvrir", "Open")} ${item.ticker}`}
    accessibilityRole="button"
    onPress={() => router.push({ pathname: "/etf/[ticker]", params: { ticker: item.ticker } })}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    testID={`etf-row-${item.ticker}`}
  >
    <View style={styles.badge}><Text style={styles.badgeText}>{item.ticker}</Text></View>
    <View style={styles.rowCopy}>
      <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
      <Text numberOfLines={1} style={styles.meta}>{item.provider} · {item.category}</Text>
      <Text numberOfLines={1} style={styles.exposure}>{item.exposure}</Text>
    </View>
    <View style={styles.quote}>
      <Text style={styles.price}>{quoteAvailable ? moneyOrNd(item.price, item.currency, false, language) : "N/D"}</Text>
      <Text style={[styles.change, change !== null ? { color: change >= 0 ? colors.positive : colors.negative } : undefined]}>{change === null ? "N/D" : `${change >= 0 ? "+" : ""}${change.toFixed(2)} %`}</Text>
      <Text style={styles.volume}>{pick("Vol.", "Vol.")} {compactNumberOrNd(item.volume, language)}</Text>
    </View>
  </Pressable>;
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

export default function EtfDirectoryScreen() {
  const { pick } = useLocale();
  const [view, setView] = useState<"map" | "list">("map");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [provider, setProvider] = useState("all");
  const query = useQuery({ queryKey: ["etf-directory"], queryFn: ({ signal }) => marketApi.etfDirectory(signal), staleTime: 300_000 });
  const items = query.data?.items ?? EMPTY_ETF_ITEMS;
  const categories = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))].sort(), [items]);
  const providers = useMemo(() => [...new Set(items.map((item) => item.provider).filter(Boolean))].sort(), [items]);
  const rows = useMemo(() => filterEtfDirectory(items, search, category, provider), [category, items, provider, search]);
  const activeQuotes = items.filter((item) => item.source.toLowerCase() !== "unavailable" && item.price > 0).length;

  const header = <View style={styles.header}>
    <ScreenHeader eyebrow="ETF" title={pick("ETF canadiens", "Canadian ETFs")} subtitle={pick(`${items.length} ETF suivis · ${activeQuotes} cotations actives`, `${items.length} tracked ETFs · ${activeQuotes} active quotes`)} />
    {query.data && query.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <View style={styles.viewSwitch}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "map" }} onPress={() => setView("map")} style={[styles.viewButton, view === "map" && styles.viewButtonActive]} testID="etf-view-map"><Text style={[styles.viewText, view === "map" && styles.viewTextActive]}>{pick("Carte", "Map")}</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "list" }} onPress={() => setView("list")} style={[styles.viewButton, view === "list" && styles.viewButtonActive]} testID="etf-view-list"><Text style={[styles.viewText, view === "list" && styles.viewTextActive]}>{pick("Liste", "List")}</Text></Pressable>
    </View>
    {view === "list" ? <>
      <Field autoCapitalize="characters" label={pick("Rechercher", "Search")} onChangeText={setSearch} placeholder={pick("Ticker, nom, exposition…", "Ticker, name, exposure…")} value={search} />
      <Text style={styles.filterLabel}>{pick("Catégorie", "Category")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><Chip active={category === "all"} label={pick("Tous", "All")} onPress={() => setCategory("all")} />{categories.map((value) => <Chip active={category === value} key={value} label={value} onPress={() => setCategory(value)} />)}</ScrollView>
      <Text style={styles.filterLabel}>{pick("Fournisseur", "Provider")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><Chip active={provider === "all"} label={pick("Tous", "All")} onPress={() => setProvider("all")} />{providers.map((value) => <Chip active={provider === value} key={value} label={value} onPress={() => setProvider(value)} />)}</ScrollView>
    </> : null}
    <QueryState error={!query.data ? query.error : null} loading={query.isLoading} onRetry={() => void query.refetch()} />
    {view === "map" && items.length > 0 ? <EtfHeatmap items={items} onOpen={(ticker) => router.push({ pathname: "/etf/[ticker]", params: { ticker } })} /> : null}
  </View>;

  return <SafeAreaView edges={["bottom"]} style={styles.safe} testID="etf-directory-screen">
    <FlatList
      ListEmptyComponent={view === "list" && !query.isLoading && !query.error ? <Text style={styles.empty}>{pick("Aucun ETF ne correspond aux filtres.", "No ETF matches these filters.")}</Text> : null}
      ListHeaderComponent={header}
      contentContainerStyle={styles.content}
      data={view === "list" ? rows : EMPTY_ETF_ITEMS}
      initialNumToRender={16}
      keyExtractor={(item) => item.ticker}
      maxToRenderPerBatch={20}
      refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />}
      removeClippedSubviews
      renderItem={({ item }) => <EtfRow item={item} />}
      windowSize={7}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 80 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  stale: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm },
  viewSwitch: { flexDirection: "row", padding: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  viewButton: { minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  viewButtonActive: { backgroundColor: "#12588b" }, viewText: { ...typography.label, color: colors.textMuted }, viewTextActive: { color: colors.text },
  filterLabel: { ...typography.label, color: colors.textMuted, textTransform: "uppercase" },
  chip: { minHeight: 40, justifyContent: "center", marginRight: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" },
  chipText: { ...typography.caption, color: colors.textMuted },
  chipTextActive: { color: colors.text, fontWeight: "800" },
  row: { minHeight: 90, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.7 },
  badge: { minWidth: 58, alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: "#103d6f" },
  badgeText: { ...typography.label, color: "#8cc9ff" },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { ...typography.body, color: colors.text, fontWeight: "700" },
  meta: { ...typography.caption, color: colors.textMuted },
  exposure: { ...typography.caption, color: colors.textSubtle },
  quote: { alignItems: "flex-end", gap: 2 },
  price: { ...typography.label, color: colors.text },
  change: { ...typography.caption, color: colors.textMuted },
  volume: { ...typography.caption, color: colors.textSubtle },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.xl, textAlign: "center" },
});
