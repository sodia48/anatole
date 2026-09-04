import { useQuery } from "@tanstack/react-query";
import { calculateEtfXRay } from "@anatole/shared/etf-xray";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChartWebView } from "@/src/components/ChartWebView";
import { EtfRiskPanel, EtfXRay } from "@/src/components/etf/EtfXRay";
import { compactNumberOrNd, moneyOrNd, percentOrNd, valueOrNd } from "@/src/components/focus/format";
import { Card, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { EtfHistoryRange, EtfHoldingDriver } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const ranges: { key: EtfHistoryRange; label: string }[] = [
  { key: "5d", label: "1S" },
  { key: "1mo", label: "1M" },
  { key: "ytd", label: "YTD" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1A" },
  { key: "5y", label: "5A" },
  { key: "10y", label: "10A" },
];
type DetailSection = "overview" | "xray" | "holdings" | "risk";

function Holding({ item }: { item: EtfHoldingDriver }) {
  const { language, pick } = useLocale();
  return <Pressable
    accessibilityLabel={`${pick("Ouvrir Focus", "Open Focus")} ${item.display_symbol}`}
    accessibilityRole="button"
    onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: item.display_symbol } })}
    style={({ pressed }) => [styles.holding, pressed && styles.pressed]}
    testID={`etf-holding-${item.display_symbol}`}
  >
    <View style={styles.holdingRank}><Text style={styles.rank}>{item.rank}</Text></View>
    <View style={styles.holdingCopy}><Text style={styles.itemName}>{item.display_symbol} · {item.name}</Text><Text style={styles.itemMeta}>{percentOrNd(item.weight_percent, language)} {pick("du fonds", "of fund")}</Text></View>
    <View style={styles.holdingQuote}><Text style={styles.itemValue}>{item.price === null ? "N/D" : moneyOrNd(item.price, item.currency ?? "CAD", false, language)}</Text><Text style={[styles.itemMeta, item.change_percent !== null ? { color: item.change_percent >= 0 ? colors.positive : colors.negative } : undefined]}>{item.change_percent === null ? "N/D" : `${item.change_percent >= 0 ? "+" : ""}${percentOrNd(item.change_percent, language)}`}</Text></View>
  </Pressable>;
}

export default function EtfDetailScreen() {
  const params = useLocalSearchParams<{ ticker?: string | string[] }>();
  const rawTicker = Array.isArray(params.ticker) ? params.ticker[0] : params.ticker;
  const ticker = (rawTicker ?? "").trim().toUpperCase();
  const { language, pick } = useLocale();
  const { workspace, saveWorkspace } = useMobileAccount();
  const [range, setRange] = useState<EtfHistoryRange>("1y");
  const [section, setSection] = useState<DetailSection>("overview");
  const holdings = useQuery({ queryKey: ["etf-holdings", ticker], queryFn: ({ signal }) => marketApi.etfHoldings(ticker, 25, signal), enabled: Boolean(ticker), staleTime: 600_000 });
  const history = useQuery({ queryKey: ["etf-history", ticker, range], queryFn: ({ signal }) => marketApi.etfHistory(ticker, range, signal), enabled: Boolean(ticker), staleTime: 60_000 });
  const snapshot = holdings.data;
  const chartCandles = useMemo(() => history.data?.points.map((point) => ({ time: point.timestamp, open: point.open, high: point.high, low: point.low, close: point.close, volume: point.volume })) ?? [], [history.data]);
  const price = snapshot?.price ?? history.data?.last_close ?? null;
  const change = snapshot?.change_percent ?? null;
  const watched = workspace.data.watchlist.includes(ticker);
  const contributors = snapshot?.holdings.filter((item) => item.contribution_percent_points !== null).sort((left, right) => Math.abs(right.contribution_percent_points ?? 0) - Math.abs(left.contribution_percent_points ?? 0)) ?? [];
  const analytics = useMemo(() => snapshot ? calculateEtfXRay(snapshot, history.data?.points ?? []) : null, [history.data?.points, snapshot]);
  const status = history.data ? (history.data.delayed ? pick("DIFFÉRÉ", "DELAYED") : "LIVE") : "N/D";

  async function toggleWatchlist() {
    const watchlist = watched ? workspace.data.watchlist.filter((item) => item !== ticker) : [...workspace.data.watchlist, ticker];
    await saveWorkspace({ ...workspace.data, watchlist });
  }

  return <Screen onRefresh={() => { void holdings.refetch(); void history.refetch(); }} refreshing={holdings.isRefetching || history.isRefetching} testID="etf-detail-screen">
    <ScreenHeader
      action={<Pressable accessibilityLabel={watched ? pick("Retirer de la Watchlist", "Remove from Watchlist") : pick("Ajouter à la Watchlist", "Add to Watchlist")} accessibilityRole="button" onPress={() => void toggleWatchlist()} style={styles.star}><Text style={styles.starText}>{watched ? "★" : "☆"}</Text></Pressable>}
      eyebrow={`${snapshot?.provider ?? "ETF"} · ${status}`}
      subtitle={snapshot ? `${snapshot.category} · ${snapshot.exposure}` : undefined}
      title={`${ticker}${snapshot?.name ? ` · ${snapshot.name}` : ""}`}
    />
    <QueryState error={!snapshot ? holdings.error : null} loading={holdings.isLoading} onRetry={() => void holdings.refetch()} />
    {snapshot && holdings.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    {snapshot ? <Card>
      <View style={styles.quoteHeader}><Text style={styles.heroPrice}>{moneyOrNd(price, snapshot.currency, false, language)}</Text><Text style={[styles.heroChange, change !== null ? { color: change >= 0 ? colors.positive : colors.negative } : undefined]}>{change === null ? "N/D" : `${change >= 0 ? "+" : ""}${percentOrNd(change, language)}`}</Text></View>
      {snapshot.description ? <Text style={styles.description}>{snapshot.description}</Text> : null}
      {snapshot.message ? <Text style={styles.message}>{snapshot.message}</Text> : null}
    </Card> : null}

    <Card title={pick("Performance", "Performance")}>
      <View style={styles.ranges}>{ranges.map((item) => <Pressable accessibilityState={{ selected: range === item.key }} key={item.key} onPress={() => setRange(item.key)} style={[styles.range, range === item.key && styles.rangeActive]}><Text style={[styles.rangeText, range === item.key && styles.rangeTextActive]}>{item.label}</Text></Pressable>)}</View>
      {history.data && history.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
      <QueryState empty={Boolean(history.data && chartCandles.length === 0)} error={!history.data ? history.error : null} loading={history.isLoading} onRetry={() => void history.refetch()} />
      {history.data && chartCandles.length > 0 ? <>
        <View style={styles.periodStats}><Text style={styles.itemMeta}>{pick("Variation", "Change")} <Text style={styles.itemValue}>{history.data.change_percent === null ? "N/D" : `${history.data.change_percent >= 0 ? "+" : ""}${percentOrNd(history.data.change_percent, language)}`}</Text></Text><Text style={styles.itemMeta}>{pick("Volume", "Volume")} {compactNumberOrNd(chartCandles.reduce((sum, candle) => sum + candle.volume, 0), language)}</Text></View>
        <ChartWebView candles={chartCandles} currency={history.data.currency} label={`${ticker} ${range}`} ticker={ticker} timeframe={`${range}:${history.data.interval}`} />
      </> : null}
    </Card>

    {snapshot ? <>
      <View accessibilityRole="tablist" style={styles.sectionTabs}>
        {([
          ["overview", pick("Aperçu", "Overview")],
          ["xray", "X-Ray"],
          ["holdings", "Holdings"],
          ["risk", pick("Risque", "Risk")],
        ] as [DetailSection, string][]).map(([key, label]) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === key }} key={key} onPress={() => setSection(key)} style={[styles.sectionTab, section === key && styles.sectionTabActive]} testID={`etf-section-${key}`}><Text style={[styles.sectionTabText, section === key && styles.sectionTabTextActive]}>{label}</Text></Pressable>)}
      </View>

      {section === "overview" ? <Card title={pick("Informations", "Information")}><View style={styles.infoGrid}><View><Text style={styles.itemMeta}>{pick("Fournisseur", "Provider")}</Text><Text style={styles.itemValue}>{snapshot.provider}</Text></View><View><Text style={styles.itemMeta}>{pick("Catégorie", "Category")}</Text><Text style={styles.itemValue}>{snapshot.category}</Text></View><View><Text style={styles.itemMeta}>{pick("Exposition", "Exposure")}</Text><Text style={styles.itemValue}>{snapshot.exposure}</Text></View><View><Text style={styles.itemMeta}>{pick("Poids des principales positions", "Top holdings weight")}</Text><Text style={styles.itemValue}>{percentOrNd(snapshot.top_holdings_weight_percent, language)}</Text></View></View></Card> : null}

      {section === "xray" && analytics ? <EtfXRay analytics={analytics} onOpen={(symbol) => router.push({ pathname: "/stock/[ticker]", params: { ticker: symbol } })} snapshot={snapshot} /> : null}

      {section === "holdings" ? <>
        {snapshot.holdings.length ? <Card title={pick("Composition", "Holdings")}><Text style={styles.sectionNote}>{snapshot.total_holdings_returned} {pick("positions retournées", "holdings returned")} · {snapshot.quoted_holdings} {pick("cotées", "quoted")}</Text>{snapshot.holdings.map((item) => <Holding item={item} key={`${item.rank}-${item.symbol}`} />)}</Card> : <Card title="Holdings"><Text style={styles.sectionNote}>N/D</Text></Card>}
        {contributors.length ? <Card title={pick("Principaux contributeurs", "Top contributors")}><Text style={styles.sectionNote}>{pick("Contribution calculée comme poids × variation avec les cotations déjà disponibles.", "Contribution calculated as weight × change from already available quotes.")}</Text>{contributors.map((item) => <View key={item.symbol} style={styles.contributor}><View><Text style={styles.itemName}>{item.display_symbol}</Text><Text style={styles.itemMeta}>{percentOrNd(item.weight_percent, language)} {pick("poids", "weight")} · {item.change_percent === null ? "N/D" : percentOrNd(item.change_percent, language)}</Text></View><Text style={[styles.contribution, { color: (item.contribution_percent_points ?? 0) >= 0 ? colors.positive : colors.negative }]}>{(item.contribution_percent_points ?? 0) >= 0 ? "+" : ""}{valueOrNd(item.contribution_percent_points, 3, language)} pt</Text></View>)}</Card> : null}
      </> : null}

      {section === "risk" && analytics ? <EtfRiskPanel analytics={analytics} /> : null}
    </> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  star: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  starText: { fontSize: 26, color: colors.primary },
  stale: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm },
  quoteHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md },
  heroPrice: { ...typography.hero, color: colors.text },
  heroChange: { ...typography.section, color: colors.textMuted },
  description: { ...typography.body, color: colors.textMuted },
  message: { ...typography.caption, color: colors.warning },
  ranges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  range: { minWidth: 44, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  rangeActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" },
  rangeText: { ...typography.caption, color: colors.textMuted },
  rangeTextActive: { color: colors.text, fontWeight: "800" },
  periodStats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  sectionTabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, padding: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  sectionTab: { minWidth: 70, minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  sectionTabActive: { backgroundColor: "#12588b" }, sectionTabText: { ...typography.caption, color: colors.textMuted, fontWeight: "700" }, sectionTabTextActive: { color: colors.text },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  sectionNote: { ...typography.caption, color: colors.textMuted },
  holding: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.7 },
  holdingRank: { width: 26, alignItems: "center" },
  rank: { ...typography.caption, color: colors.textSubtle },
  holdingCopy: { flex: 1, minWidth: 0 },
  holdingQuote: { alignItems: "flex-end" },
  itemName: { ...typography.body, color: colors.text, fontWeight: "700" },
  itemMeta: { ...typography.caption, color: colors.textMuted },
  itemValue: { ...typography.label, color: colors.text },
  contributor: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  contribution: { ...typography.label },
});
