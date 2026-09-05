import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { compactNumberOrNd, moneyOrNd, percentOrNd, valueOrNd } from "@/src/components/focus/format";
import { Button, Field, QueryState, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { ScreenerRow, ScreenerUniverse } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { DEFAULT_SCREENER_FILTERS, filterAndSortScreenerRows, screenerSignalLabel, type ScreenerFilters, type ScreenerSort } from "./model";

const SCORE_STEPS = Array.from({ length: 19 }, (_, index) => index * 5);
const SORTS: ScreenerSort[] = ["score", "change", "momentum", "volume"];

function Chip({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]} testID={testID}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function ResultRow({ item }: { item: ScreenerRow }) {
  const { language, pick } = useLocale();
  const positive = (value: number | null) => ({ color: value === null ? colors.textMuted : value >= 0 ? colors.positive : colors.negative });
  return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: item.ticker } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={`screener-row-${item.ticker}`}>
    <View style={styles.rowHeader}><View style={styles.identity}><Text style={styles.ticker}>{item.ticker}</Text><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text numberOfLines={1} style={styles.sector}>{item.sector}</Text></View><Text style={styles.price}>{moneyOrNd(item.price, "CAD", false, language)}</Text></View>
    <View style={styles.metrics}>
      <View style={styles.metric}><Text style={styles.metricLabel}>{pick("Jour", "Day")}</Text><Text style={[styles.metricValue, positive(item.change_percent)]}>{percentOrNd(item.change_percent, language)}</Text></View>
      <View style={styles.metric}><Text style={styles.metricLabel}>{pick("Momentum 20j", "20d momentum")}</Text><Text style={[styles.metricValue, positive(item.momentum_20d)]}>{percentOrNd(item.momentum_20d, language)}</Text></View>
      <View style={styles.metric}><Text style={styles.metricLabel}>RSI</Text><Text style={styles.metricValue}>{valueOrNd(item.rsi_14, 1, language)}</Text></View>
      <View style={styles.metric}><Text style={styles.metricLabel}>{pick("Vol. rel.", "Rel. vol.")}</Text><Text style={styles.metricValue}>{item.relative_volume === null ? "N/D" : `${valueOrNd(item.relative_volume, 2, language)}×`}</Text></View>
    </View>
    <View style={styles.rowFooter}><View style={styles.score}><Text style={styles.scoreLabel}>Score</Text><Text style={styles.scoreValue}>{item.score === null ? "N/D" : Math.round(item.score)}</Text></View><Text style={styles.signal}>{item.signal === null ? "N/D" : screenerSignalLabel(item.signal, language)}</Text><Text style={styles.source}>{item.source}{item.delayed ? <Text testID={`screener-delayed-${item.ticker}`}> · {pick("Différé", "Delayed")}</Text> : null} · {pick("Vol.", "Vol.")} {compactNumberOrNd(item.volume, language)}</Text></View>
  </Pressable>;
}

function FiltersModal({ filters, sectors, signals, visible, onChange, onClose, onReset }: { filters: ScreenerFilters; sectors: string[]; signals: string[]; visible: boolean; onChange: (next: ScreenerFilters) => void; onClose: () => void; onReset: () => void }) {
  const { language, pick } = useLocale();
  const sortLabel = (sort: ScreenerSort) => ({ score: "Score Anatole", change: pick("Variation du jour", "Daily change"), momentum: pick("Momentum 20 jours", "20-day momentum"), volume: pick("Volume relatif", "Relative volume") })[sort];
  return <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
    <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe} testID="screener-filters-modal">
      <View style={styles.modalHeader}><Text style={styles.modalTitle}>{pick("Filtres", "Filters")}</Text><Pressable accessibilityLabel={pick("Fermer", "Close")} accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.modalContent}>
        <Text style={styles.filterTitle}>{pick("Secteur", "Sector")}</Text><View style={styles.wrap}><Chip active={filters.sector === "all"} label={pick("Tous", "All")} onPress={() => onChange({ ...filters, sector: "all" })} testID="screener-sector-all" />{sectors.map((sector) => <Chip active={filters.sector === sector} key={sector} label={sector} onPress={() => onChange({ ...filters, sector })} testID={`screener-sector-${sector}`} />)}</View>
        <Text style={styles.filterTitle}>{pick("Signal", "Signal")}</Text><View style={styles.wrap}><Chip active={filters.signal === "all"} label={pick("Tous", "All")} onPress={() => onChange({ ...filters, signal: "all" })} testID="screener-signal-all" />{signals.map((signal) => <Chip active={filters.signal === signal} key={signal} label={screenerSignalLabel(signal, language)} onPress={() => onChange({ ...filters, signal })} testID={`screener-signal-${signal}`} />)}</View>
        <Text style={styles.filterTitle}>{pick("Score minimum", "Minimum score")} · {filters.minimumScore}</Text><View style={styles.wrap}>{SCORE_STEPS.map((score) => <Chip active={filters.minimumScore === score} key={score} label={String(score)} onPress={() => onChange({ ...filters, minimumScore: score })} testID={`screener-min-score-${score}`} />)}</View>
        <Text style={styles.filterTitle}>{pick("Trier", "Sort")}</Text><View style={styles.wrap}>{SORTS.map((sort) => <Chip active={filters.sort === sort} key={sort} label={sortLabel(sort)} onPress={() => onChange({ ...filters, sort })} testID={`screener-sort-${sort}`} />)}</View>
        <Button label={pick("Réinitialiser", "Reset")} onPress={onReset} variant="secondary" />
        <Button label={pick("Afficher les résultats", "Show results")} onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

export function ScreenerScreen() {
  const params = useLocalSearchParams<{ universe?: string | string[]; sector?: string | string[]; signal?: string | string[] }>();
  const { pick } = useLocale();
  const [universe, setUniverse] = useState<ScreenerUniverse>("composite");
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_SCREENER_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const requestedSector = Array.isArray(params.sector) ? params.sector[0] : params.sector;
  const requestedUniverse = Array.isArray(params.universe) ? params.universe[0] : params.universe;
  const requestedSignal = Array.isArray(params.signal) ? params.signal[0] : params.signal;
  useEffect(() => {
    const timer = setTimeout(() => {
      if (requestedUniverse === "tsx60" || requestedUniverse === "composite") setUniverse(requestedUniverse);
      if (requestedSector) setFilters((current) => ({ ...current, sector: requestedSector }));
      if (requestedSignal) setFilters((current) => ({ ...current, signal: requestedSignal }));
    }, 0);
    return () => clearTimeout(timer);
  }, [requestedSector, requestedSignal, requestedUniverse]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => subscription.remove();
  }, []);
  const query = useQuery({
    queryKey: ["screener", universe],
    queryFn: ({ signal }) => marketApi.screener(universe, signal),
    staleTime: universe === "composite" ? 180_000 : 45_000,
    refetchInterval: (current) => appActive ? universe === "composite" ? 180_000 : Math.max(45_000, (current.state.data?.refresh_after_seconds ?? 45) * 1000) : false,
    refetchIntervalInBackground: false,
  });
  const data = query.data;
  const signals = useMemo(() => [...new Set(data?.items.map((item) => item.signal).filter((item): item is string => item !== null) ?? [])].sort(), [data]);
  const rows = useMemo(() => filterAndSortScreenerRows(data?.items ?? [], filters), [data, filters]);
  const reset = () => setFilters(DEFAULT_SCREENER_FILTERS);
  const changeUniverse = (next: ScreenerUniverse) => {
    setUniverse(next);
    setFilters((current) => ({ ...current, sector: "all", signal: "all" }));
  };
  const activeChips = [
    filters.query ? { id: "query", label: filters.query, clear: () => setFilters((current) => ({ ...current, query: "" })) } : null,
    filters.sector !== "all" ? { id: "sector", label: filters.sector, clear: () => setFilters((current) => ({ ...current, sector: "all" })) } : null,
    filters.signal !== "all" ? { id: "signal", label: filters.signal, clear: () => setFilters((current) => ({ ...current, signal: "all" })) } : null,
    filters.minimumScore > 0 ? { id: "score", label: `Score ≥ ${filters.minimumScore}`, clear: () => setFilters((current) => ({ ...current, minimumScore: 0 })) } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const header = <View style={styles.header}>
    <ScreenHeader eyebrow={pick("Marchés", "Markets")} title="Screener" subtitle={pick("Repère rapidement les titres canadiens selon momentum, tendance, RSI et activité du volume.", "Quickly find Canadian securities by momentum, trend, RSI, and volume activity.")} />
    <View style={styles.summary}><View><Text style={styles.visible}>{data ? rows.length : "…"}</Text><Text style={styles.summaryLabel}>{pick("titres visibles", "securities shown")}</Text></View><View style={styles.summaryDetail}>{data ? <><Text style={styles.summaryText}>{data.live_items} live</Text><Text style={styles.summaryText}>{data.fallback_items} fallback</Text></> : <Text style={styles.refreshing}>{pick("Chargement…", "Loading…")}</Text>}{query.isFetching && data ? <Text style={styles.refreshing}>{pick("Actualisation…", "Refreshing…")}</Text> : null}</View></View>
    {data && query.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <View style={styles.segment}>{(["composite", "tsx60"] as ScreenerUniverse[]).map((value) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: universe === value }} key={value} onPress={() => changeUniverse(value)} style={[styles.segmentButton, universe === value && styles.segmentActive]} testID={`screener-universe-${value}`}><Text style={[styles.segmentText, universe === value && styles.segmentTextActive]}>{value === "composite" ? "TSX Composite" : "TSX 60"}</Text></Pressable>)}</View>
    <Field autoCapitalize="characters" label={pick("Rechercher", "Search")} onChangeText={(queryText) => setFilters((current) => ({ ...current, query: queryText }))} placeholder={pick("Ticker ou entreprise", "Ticker or company")} testID="screener-search" value={filters.query} />
    <View style={styles.filterBar}><Pressable accessibilityRole="button" onPress={() => setFiltersOpen(true)} style={styles.filterButton} testID="screener-open-filters"><Text style={styles.filterButtonText}>{pick("Filtres", "Filters")}</Text></Pressable>{activeChips.length ? <Pressable accessibilityRole="button" onPress={reset} style={styles.reset}><Text style={styles.resetText}>{pick("Réinitialiser", "Reset")}</Text></Pressable> : null}</View>
    {activeChips.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{activeChips.map((chip) => <Chip active key={chip.id} label={`${chip.label} ×`} onPress={chip.clear} testID={`screener-active-${chip.id}`} />)}</ScrollView> : null}
    <QueryState error={!data ? query.error : null} loading={!data && query.isLoading} onRetry={() => void query.refetch()} />
  </View>;

  return <SafeAreaView edges={["bottom"]} style={styles.safe} testID="screener-screen">
    <FlatList
      ListEmptyComponent={data && !query.isLoading ? <View style={styles.empty}><Text style={styles.emptyTitle}>{pick("Aucun titre ne correspond aux filtres.", "No securities match these filters.")}</Text><Button label={pick("Réinitialiser les filtres", "Reset filters")} onPress={reset} variant="secondary" /></View> : null}
      ListHeaderComponent={header}
      contentContainerStyle={styles.content}
      data={rows}
      initialNumToRender={14}
      keyExtractor={(item) => item.ticker}
      maxToRenderPerBatch={18}
      refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />}
      removeClippedSubviews
      renderItem={({ item }) => <ResultRow item={item} />}
      testID="screener-results"
      windowSize={7}
    />
    <FiltersModal filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} onReset={reset} sectors={data?.sectors ?? []} signals={signals} visible={filtersOpen} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: 100 }, header: { gap: spacing.md, marginBottom: spacing.md },
  summary: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, visible: { ...typography.hero, color: colors.text }, summaryLabel: { ...typography.caption, color: colors.textMuted }, summaryDetail: { alignItems: "flex-end", gap: 2 }, summaryText: { ...typography.caption, color: colors.textMuted }, refreshing: { ...typography.caption, color: colors.primary },
  stale: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm },
  segment: { flexDirection: "row", padding: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, segmentActive: { backgroundColor: "#12588b" }, segmentText: { ...typography.label, color: colors.textMuted }, segmentTextActive: { color: colors.text },
  filterBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, filterButton: { minHeight: 44, minWidth: 112, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, backgroundColor: "rgba(44,156,255,.16)" }, filterButtonText: { ...typography.label, color: colors.text }, reset: { minHeight: 44, justifyContent: "center" }, resetText: { ...typography.label, color: colors.primary },
  chip: { minHeight: 44, justifyContent: "center", marginRight: spacing.xs, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, chipActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, chipText: { ...typography.caption, color: colors.textMuted }, chipTextActive: { color: colors.text, fontWeight: "800" },
  row: { minHeight: 178, gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, pressed: { opacity: 0.7 }, rowHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }, identity: { flex: 1, minWidth: 0 }, ticker: { ...typography.section, color: colors.text }, name: { ...typography.body, color: colors.textMuted }, sector: { ...typography.caption, color: colors.textSubtle }, price: { ...typography.section, color: colors.text, textAlign: "right" }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { minWidth: "46%", flexGrow: 1, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, metricLabel: { ...typography.caption, color: colors.textSubtle }, metricValue: { ...typography.label, color: colors.text }, rowFooter: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }, score: { minWidth: 70, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.primary }, scoreLabel: { ...typography.caption, color: colors.text }, scoreValue: { fontSize: 20, fontWeight: "900", color: colors.text }, signal: { ...typography.label, color: colors.text, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, source: { flexGrow: 1, ...typography.caption, color: colors.textSubtle, textAlign: "right" },
  empty: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: spacing.md }, emptyTitle: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  modalSafe: { flex: 1, backgroundColor: colors.background }, modalHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, modalTitle: { ...typography.title, color: colors.text }, close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 30, color: colors.text }, modalContent: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl * 2 }, filterTitle: { ...typography.label, color: colors.primary, textTransform: "uppercase" }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
});
