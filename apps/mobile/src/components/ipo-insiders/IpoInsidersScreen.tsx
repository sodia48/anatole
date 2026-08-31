import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field, QueryState, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { InsiderTrade, InsiderTransactionType, IpoInstrumentType, IpoItem } from "@/src/lib/api/types";
import { useLocale, type Language } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import {
  filterInsiderTrades,
  dedupeInsiderTradesForRender,
  filterIpoItems,
  formatIpoPrice,
  insiderCoverageUnavailable,
  insiderPreviewScanLimit,
  ipoPriceCaption,
  type InsiderMarket,
  type InsiderTypeFilter,
  type IpoCountryFilter,
  type IpoTypeFilter,
} from "./model";

type MainTab = "ipo" | "insiders";
const EMPTY_IPO_ITEMS: IpoItem[] = [];

function FilterChip({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]} testID={testID}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function FilterRow({ children }: { children: ReactNode }) {
  return <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>{children}</ScrollView>;
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "positive" | "negative" }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, tone === "positive" && styles.positive, tone === "negative" && styles.negative]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function locale(language: Language): string { return language === "fr" ? "fr-CA" : "en-CA"; }
function formatDate(value: string | null, language: Language): string {
  if (!value) return language === "fr" ? "À confirmer" : "To be confirmed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale(language), { day: "numeric", month: "short", year: "numeric", timeZone: "America/Toronto" }).format(date);
}
function formatNumber(value: number | null, language: Language): string {
  return value === null || !Number.isFinite(value) ? "N/D" : new Intl.NumberFormat(locale(language), { maximumFractionDigits: 0 }).format(value);
}
function formatMoney(value: number, language: Language): string {
  return new Intl.NumberFormat(locale(language), { style: "currency", currency: "CAD", notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 2 : 0 }).format(value);
}

function IpoCard({ item }: { item: IpoItem }) {
  const { language, pick } = useLocale();
  return <View style={styles.card} testID={`ipo-card-${item.id}`}>
    <View style={styles.cardTop}><View style={styles.symbol}><Text style={styles.symbolText}>{item.symbol || "—"}</Text></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>{item.company}</Text><Text style={styles.meta}>{item.exchange || "—"} · {item.country} · {item.instrument_label}</Text></View>{item.official ? <Text style={styles.official}>{pick("Officiel", "Official")}</Text> : null}</View>
    <View style={styles.cardGrid}><View><Text style={styles.caption}>{item.event_type} · {item.status}</Text><Text style={styles.body}>{formatDate(item.event_date, language)}</Text></View><View style={styles.priceBlock}><Text style={styles.caption}>{ipoPriceCaption(item, language)}</Text><Text style={styles.price}>{formatIpoPrice(item, language)}</Text></View></View>
    <Text style={styles.meta}>{pick("Source", "Source")} : {item.source_name}</Text>
    <View style={styles.actions}>
      {item.focus_available && item.symbol ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/focus/[ticker]", params: { ticker: item.symbol } })} style={styles.action} testID={`ipo-focus-${item.symbol}`}><Text style={styles.actionText}>Focus</Text></Pressable> : null}
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.source_url)} style={styles.actionSecondary} testID={`ipo-source-${item.id}`}><Text style={styles.actionText}>{pick("Source officielle", "Official source")}</Text></Pressable>
    </View>
  </View>;
}

function IpoPanel() {
  const { pick } = useLocale();
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<IpoCountryFilter>("all");
  const [instrument, setInstrument] = useState<IpoTypeFilter>("all");
  const query = useQuery({ queryKey: ["ipo"], queryFn: ({ signal }) => marketApi.ipo(signal), staleTime: 30 * 60_000 });
  const items = query.data?.items ?? EMPTY_IPO_ITEMS;
  const filtered = useMemo(() => filterIpoItems(items, search, country, instrument), [country, instrument, items, search]);
  const summary = query.data?.summary;
  const header = <View style={styles.headerStack}>
    {query.data && query.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <View style={styles.metrics}>
      <Metric label={pick("Événements", "Events")} value={summary?.total ?? "—"} /><Metric label="Canada" value={summary?.canada ?? "—"} /><Metric label={pick("États-Unis", "United States")} value={summary?.united_states ?? "—"} />
      <Metric label={pick("Nouvelles inscriptions", "New listings")} value={summary?.newly_listed ?? "—"} /><Metric label={pick("Dépôts réglementaires", "Regulatory filings")} value={summary?.regulatory_filings ?? "—"} /><Metric label={pick("Sociétés", "Companies")} value={summary?.companies ?? "—"} />
    </View>
    <Field label={pick("Rechercher", "Search")} onChangeText={setSearch} placeholder={pick("Symbole ou société", "Symbol or company")} value={search} />
    <Text style={styles.filterLabel}>{pick("Pays", "Country")}</Text><FilterRow><FilterChip active={country === "all"} label={pick("Canada + États-Unis", "Canada + USA")} onPress={() => setCountry("all")} /><FilterChip active={country === "Canada"} label="Canada" onPress={() => setCountry("Canada")} /><FilterChip active={country === "États-Unis"} label={pick("États-Unis", "USA")} onPress={() => setCountry("États-Unis")} /></FilterRow>
    <Text style={styles.filterLabel}>{pick("Instruments", "Instruments")}</Text><FilterRow>{(["all", "company", "etf", "cdr", "fund", "other"] as ("all" | IpoInstrumentType)[]).map((value) => <FilterChip active={instrument === value} key={value} label={{ all: pick("Tous", "All"), company: pick("Sociétés", "Companies"), etf: "ETF", cdr: "CDR", fund: pick("Fonds", "Funds"), other: pick("Autres", "Other") }[value]} onPress={() => setInstrument(value)} />)}</FilterRow>
    <QueryState error={!query.data ? query.error : null} loading={query.isLoading} onRetry={() => void query.refetch()} />
  </View>;
  return <FlatList ListEmptyComponent={!query.isLoading && !query.error ? <Text style={styles.empty}>{pick("Aucun événement ne correspond aux filtres.", "No event matches these filters.")}</Text> : null} ListHeaderComponent={header} contentContainerStyle={styles.content} data={filtered} initialNumToRender={12} keyExtractor={(item) => item.id} maxToRenderPerBatch={16} refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />} removeClippedSubviews renderItem={({ item }) => <IpoCard item={item} />} windowSize={7} />;
}

function InsiderCard({ trade }: { trade: InsiderTrade }) {
  const { language, pick } = useLocale();
  const tone = trade.transaction_type === "buy" ? styles.positive : trade.transaction_type === "sell" ? styles.negative : styles.neutral;
  return <View style={styles.card} testID={`insider-card-${trade.id}`}>
    <View style={styles.cardTop}><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/focus/[ticker]", params: { ticker: trade.ticker } })} style={styles.symbol} testID={`insider-focus-${trade.ticker}`}><Text style={styles.symbolText}>{trade.ticker}</Text></Pressable><View style={styles.cardCopy}><Text style={styles.cardTitle}>{trade.company}</Text><Text style={styles.meta}>{trade.insider_name}{trade.role ? ` · ${trade.role}` : ""}</Text></View>{trade.unusual ? <Text style={styles.unusual}>{pick("Inhabituelle", "Unusual")}</Text> : null}</View>
    <View style={styles.cardGrid}><View><Text style={[styles.transaction, tone]}>{trade.transaction_label}</Text><Text style={styles.meta}>{pick("Transaction", "Trade")}: {formatDate(trade.trade_date, language)}</Text><Text style={styles.meta}>{pick("Dépôt", "Filing")}: {formatDate(trade.filing_date, language)}</Text></View><View style={styles.priceBlock}><Text style={styles.body}>{formatNumber(trade.shares, language)} {pick("actions", "shares")}</Text><Text style={styles.meta}>{pick("Prix", "Price")}: {trade.price === null ? "N/D" : formatMoney(trade.price, language)}</Text><Text style={styles.price}>{trade.value === null ? "N/D" : formatMoney(trade.value, language)}</Text></View></View>
    <Text style={styles.meta}>{pick("Détention après", "Holdings after")}: {formatNumber(trade.holdings_after, language)}</Text>
    <Text style={styles.meta}>{pick("Source", "Source")} : {trade.source_name}</Text>
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(trade.official_verification_url)} style={styles.actionSecondary} testID={`insider-source-${trade.id}`}><Text style={styles.actionText}>{pick("Vérification officielle", "Official verification")}</Text></Pressable>
  </View>;
}

function InsiderPanel() {
  const { language, pick } = useLocale();
  const queryClient = useQueryClient();
  const [market, setMarket] = useState<InsiderMarket>("canada");
  const [days, setDays] = useState(180);
  const [tickerInput, setTickerInput] = useState("");
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<InsiderTypeFilter>("all");
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [enabledEnrichmentKey, setEnabledEnrichmentKey] = useState<string | null>(null);
  const previewLimit = insiderPreviewScanLimit(market, ticker);
  const preview = useQuery({
    queryKey: ["insiders", "preview", market, days, ticker],
    queryFn: ({ signal }) => marketApi.insiders({ market, days, ticker: ticker || undefined, scanLimit: previewLimit }, signal),
    enabled: appActive,
    staleTime: 15 * 60_000,
  });

  const enrichmentKey = `${market}:${days}:${preview.dataUpdatedAt ?? 0}`;
  useEffect(() => {
    if (!appActive || ticker || !preview.data) return;
    const timer = setTimeout(() => setEnabledEnrichmentKey(enrichmentKey), 700);
    return () => clearTimeout(timer);
  }, [appActive, enrichmentKey, preview.data, ticker]);
  const enrichmentEnabled = appActive && !ticker && enabledEnrichmentKey === enrichmentKey;

  const enriched = useQuery({
    queryKey: ["insiders", "enriched", market, days],
    queryFn: ({ signal }) => marketApi.insiders({ market, days, scanLimit: 24 }, signal),
    enabled: enrichmentEnabled,
    staleTime: 15 * 60_000,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
      if (!active) void queryClient.cancelQueries({ queryKey: ["insiders"] });
    });
    return () => { subscription.remove(); void queryClient.cancelQueries({ queryKey: ["insiders"] }); };
  }, [queryClient]);

  useEffect(() => () => { void queryClient.cancelQueries({ queryKey: ["insiders"] }); }, [days, market, queryClient, ticker]);

  const snapshot = (!ticker && enriched.data) || preview.data;
  const trades = useMemo(() => filterInsiderTrades(dedupeInsiderTradesForRender(snapshot?.trades ?? []), type), [snapshot?.trades, type]);
  const unavailable = snapshot ? insiderCoverageUnavailable(snapshot, preview.isLoading || enriched.isLoading) : false;
  const stale = Boolean(snapshot && (preview.isError || enriched.isError));
  const summary = snapshot?.summary;
  const loading = !snapshot && preview.isLoading;
  const error = !snapshot ? preview.error : null;
  const progress = !ticker && enriched.isFetching ? pick("Analyse étendue en cours…", "Extended analysis in progress…") : preview.isFetching && snapshot ? pick("Actualisation en arrière-plan…", "Refreshing in the background…") : null;
  const header = <View style={styles.headerStack}>
    {stale ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <View style={styles.metrics}>
      <Metric label={pick("Transactions", "Transactions")} value={unavailable ? pick("Indisponible", "Unavailable") : summary?.transactions ?? "—"} /><Metric label={pick("Sociétés", "Companies")} value={unavailable ? "—" : summary?.companies ?? "—"} /><Metric label={pick("Achats", "Buys")} value={unavailable ? "—" : summary?.buys ?? "—"} tone="positive" /><Metric label={pick("Ventes", "Sells")} value={unavailable ? "—" : summary?.sells ?? "—"} tone="negative" />
      <Metric label={pick("Attributions/exercices", "Grants/exercises")} value={unavailable ? "—" : summary?.grants_and_exercises ?? "—"} /><Metric label={pick("Valeur achats", "Buy value")} value={unavailable || !summary ? "—" : formatMoney(summary.buy_value, language)} tone="positive" /><Metric label={pick("Valeur ventes", "Sell value")} value={unavailable || !summary ? "—" : formatMoney(summary.sell_value, language)} tone="negative" /><Metric label={pick("Valeur nette", "Net value")} value={unavailable || !summary ? "—" : formatMoney(summary.net_value, language)} />
      <Metric label={pick("Ratio achats", "Buy ratio")} value={unavailable || !summary ? "—" : `${summary.buy_ratio_percent.toFixed(1)} %`} /><Metric label={pick("Inhabituelles", "Unusual")} value={unavailable ? "—" : summary?.unusual_transactions ?? "—"} />
    </View>
    <Text style={styles.filterLabel}>{pick("Marché", "Market")}</Text><FilterRow><FilterChip active={market === "canada"} label="Canada" onPress={() => setMarket("canada")} testID="insider-market-canada" /><FilterChip active={market === "us"} label={pick("États-Unis", "USA")} onPress={() => setMarket("us")} testID="insider-market-us" /></FilterRow>
    <Text style={styles.filterLabel}>{pick("Période", "Period")}</Text><FilterRow>{[30, 90, 180, 365].map((value) => <FilterChip active={days === value} key={value} label={`${value} j`} onPress={() => setDays(value)} testID={`insider-days-${value}`} />)}</FilterRow>
    <Field autoCapitalize="characters" label={pick("Ticker (optionnel)", "Ticker (optional)")} onChangeText={setTickerInput} placeholder="RY" value={tickerInput} />
    <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => setTicker(tickerInput.trim().toUpperCase())} style={styles.action} testID="insider-ticker-submit"><Text style={styles.actionText}>{pick("Analyser", "Analyze")}</Text></Pressable>{ticker ? <Pressable accessibilityRole="button" onPress={() => { setTicker(""); setTickerInput(""); }} style={styles.actionSecondary}><Text style={styles.actionText}>{pick("Effacer", "Clear")}</Text></Pressable> : null}</View>
    <Text style={styles.filterLabel}>{pick("Transaction", "Transaction")}</Text><FilterRow>{(["all", "buy", "sell", "grant", "exercise", "tax", "other"] as ("all" | InsiderTransactionType)[]).map((value) => <FilterChip active={type === value} key={value} label={{ all: pick("Toutes", "All"), buy: pick("Achat", "Buy"), sell: pick("Vente", "Sell"), grant: pick("Attribution", "Grant"), exercise: pick("Exercice", "Exercise"), tax: pick("Impôt", "Tax"), other: pick("Autre", "Other") }[value]} onPress={() => setType(value)} testID={`insider-type-${value}`} />)}</FilterRow>
    {progress ? <Text style={styles.progress}>{progress}</Text> : null}
    <QueryState error={error} loading={loading} onRetry={() => void preview.refetch()} />
    {unavailable ? <Text accessibilityRole="alert" style={styles.unavailable}>{pick("Indisponible — les sources automatisées ne répondent pas.", "Unavailable — automated sources are not responding.")}</Text> : null}
  </View>;
  const refresh = () => { void preview.refetch(); if (enrichmentEnabled) void enriched.refetch(); };
  return <FlatList ListEmptyComponent={snapshot && !loading && !unavailable ? <Text style={styles.empty}>{pick("Aucune transaction observée pour ces critères.", "No transaction observed for these filters.")}</Text> : null} ListHeaderComponent={header} contentContainerStyle={styles.content} data={trades} initialNumToRender={14} keyExtractor={(trade) => trade.id} maxToRenderPerBatch={18} refreshControl={<RefreshControl onRefresh={refresh} refreshing={preview.isRefetching || enriched.isRefetching} tintColor={colors.primary} />} removeClippedSubviews renderItem={({ item }) => <InsiderCard trade={item} />} windowSize={7} />;
}

export function IpoInsidersScreen({ initialTab = "ipo" }: { initialTab?: MainTab } = {}) {
  const { pick } = useLocale();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MainTab>(initialTab);
  function activate(next: MainTab) {
    if (next === tab) return;
    if (tab === "insiders") void queryClient.cancelQueries({ queryKey: ["insiders"] });
    else void queryClient.cancelQueries({ queryKey: ["ipo"] });
    setTab(next);
  }
  return <SafeAreaView edges={["bottom"]} style={styles.safe} testID="ipo-insiders-screen">
    <View style={styles.top}><ScreenHeader eyebrow={pick("Marchés", "Markets")} title={pick("IPO & initiés", "IPOs & insiders")} subtitle={pick("Événements publics et déclarations réglementaires vérifiables.", "Verifiable public events and regulatory filings.")} /><View style={styles.tabs}><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "ipo" }} onPress={() => activate("ipo")} style={[styles.tab, tab === "ipo" && styles.tabActive]} testID="ipo-tab"><Text style={styles.tabText}>IPO</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "insiders" }} onPress={() => activate("insiders")} style={[styles.tab, tab === "insiders" && styles.tabActive]} testID="insiders-tab"><Text style={styles.tabText}>{pick("Initiés", "Insiders")}</Text></Pressable></View></View>
    {tab === "ipo" ? <IpoPanel /> : <InsiderPanel />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, top: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  tabs: { flexDirection: "row", padding: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, tab: { minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, tabActive: { backgroundColor: "#12588b" }, tabText: { ...typography.label, color: colors.text },
  content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md }, headerStack: { gap: spacing.md, marginBottom: spacing.md },
  stale: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm }, unavailable: { ...typography.body, color: colors.warning, padding: spacing.md, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md }, progress: { ...typography.caption, color: colors.primary },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { minWidth: "30%", flexGrow: 1, gap: 2, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, metricValue: { ...typography.section, color: colors.text }, metricLabel: { ...typography.caption, color: colors.textMuted }, positive: { color: colors.positive }, negative: { color: colors.negative }, neutral: { color: colors.textMuted },
  filterLabel: { ...typography.label, color: colors.textMuted, textTransform: "uppercase" }, chip: { minHeight: 44, justifyContent: "center", marginRight: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface }, chipActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, chipText: { ...typography.caption, color: colors.textMuted }, chipTextActive: { color: colors.text, fontWeight: "800" },
  card: { gap: spacing.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }, cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, cardCopy: { flex: 1, minWidth: 0 }, symbol: { minWidth: 58, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: "#103d6f" }, symbolText: { ...typography.label, color: "#8cc9ff" }, cardTitle: { ...typography.body, color: colors.text, fontWeight: "800" }, meta: { ...typography.caption, color: colors.textMuted }, official: { ...typography.caption, color: colors.positive }, unusual: { ...typography.caption, color: colors.warning },
  cardGrid: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }, caption: { ...typography.caption, color: colors.textMuted }, body: { ...typography.body, color: colors.text }, priceBlock: { flex: 1, alignItems: "flex-end" }, price: { ...typography.section, color: colors.text }, transaction: { ...typography.label },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, action: { minHeight: 44, minWidth: 100, flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary }, actionSecondary: { minHeight: 44, minWidth: 100, flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong }, actionText: { ...typography.label, color: colors.text },
  empty: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.xl, textAlign: "center" },
});
