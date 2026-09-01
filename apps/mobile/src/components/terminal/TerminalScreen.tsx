import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { moneyOrNd, percentOrNd, valueOrNd } from "@/src/components/focus/format";
import { QueryState, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { TerminalAlert, TerminalOpportunity, TerminalSector, TerminalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { alertCopy, filterAndSortRadar, opportunityLabel, regimeLabel, riskLabel, sectorStateLabel, uniqueRadarItems, type TerminalFeedMode } from "./model";

type TerminalEntry =
  | { id: string; kind: "heading"; title: string; subtitle: string }
  | { id: string; kind: "radar"; item: TerminalOpportunity }
  | { id: string; kind: "sector"; item: TerminalSector }
  | { id: string; kind: "alert"; item: TerminalAlert }
  | { id: string; kind: "details" };

function scoreText(value: number | null | undefined, suffix = "/100"): string {
  const formatted = valueOrNd(value, 0);
  return formatted === "N/D" ? formatted : `${formatted}${suffix}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function RadarCard({ item }: { item: TerminalOpportunity }) {
  const { language, pick } = useLocale();
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.card} testID={`terminal-radar-${item.symbol}`}>
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: item.symbol } })} style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}>
      <View style={styles.cardTop}><View style={styles.identity}><Text style={styles.symbol}>{item.symbol}</Text><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text style={styles.meta}>{item.sector}</Text></View><View style={styles.quote}><Text style={styles.price}>{moneyOrNd(item.price, "CAD", false, language)}</Text><Text style={[styles.change, { color: item.change_percent >= 0 ? colors.positive : colors.negative }]}>{percentOrNd(item.change_percent, language)}</Text></View></View>
      <View style={styles.metrics}><Metric label="Momentum 20j" value={percentOrNd(item.momentum_20d, language)} /><Metric label={pick("Volume relatif", "Relative volume")} value={`${valueOrNd(item.relative_volume, 1, language)}×`} /><Metric label="RSI" value={valueOrNd(item.rsi_14, 1, language)} /><Metric label="Score Anatole" value={scoreText(item.score)} /></View>
      <View style={styles.cardFooter}><Text style={styles.tag}>{opportunityLabel(item.opportunity_type, language)}</Text><Text style={styles.signal}>{item.signal}</Text></View>
    </Pressable>
    {item.reasons.length ? <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={styles.expand} testID={`terminal-reasons-${item.symbol}`}><Text style={styles.expandText}>{expanded ? pick("Masquer les raisons", "Hide reasons") : pick("Afficher les raisons", "Show reasons")}</Text></Pressable> : null}
    {expanded ? <View style={styles.reasons}>{item.reasons.map((reason) => <Text key={reason} style={styles.reason}>• {reason}</Text>)}</View> : null}
  </View>;
}

function SectorCard({ item }: { item: TerminalSector }) {
  const { language, pick } = useLocale();
  return <View style={styles.card} testID={`terminal-sector-${item.sector}`}><View style={styles.cardTop}><Text style={styles.symbol}>{item.sector}</Text><Text style={styles.tag}>{sectorStateLabel(item.state, language)}</Text></View><View style={styles.leadership}><View style={[styles.leadershipFill, { width: `${Math.max(0, Math.min(100, item.leadership_score))}%` }]} /></View><View style={styles.metrics}><Metric label={pick("Leadership", "Leadership")} value={scoreText(item.leadership_score)} /><Metric label={pick("Séance", "Session")} value={percentOrNd(item.change_percent, language)} /><Metric label="Momentum 20j" value={percentOrNd(item.momentum_20d, language)} /><Metric label={pick("Volume relatif", "Relative volume")} value={`${valueOrNd(item.relative_volume, 1, language)}×`} /><Metric label={pick("Largeur", "Breadth")} value={`${item.advancers}↑ ${item.decliners}↓`} /><Metric label={pick("Score moyen", "Average score")} value={scoreText(item.average_score)} /></View></View>;
}

function AlertCard({ raw }: { raw: TerminalAlert }) {
  const { language } = useLocale();
  const item = alertCopy(raw, language);
  const content = <><View style={styles.alertTop}><Text style={[styles.severity, item.severity === "high" ? styles.severityHigh : item.severity === "watch" ? styles.severityWatch : undefined]}>{item.severity.toUpperCase()}</Text><Text style={styles.meta}>{item.category}{item.symbol ? ` · ${item.symbol}` : ""}</Text></View><Text style={styles.alertTitle}>{item.title}</Text><Text style={styles.body}>{item.detail}</Text></>;
  return item.symbol ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: item.symbol! } })} style={styles.card} testID={`terminal-alert-${item.id}`}>{content}</Pressable> : <View style={styles.card} testID={`terminal-alert-${item.id}`}>{content}</View>;
}

function DetailedAnalysis({ snapshot }: { snapshot: TerminalSnapshot }) {
  const { language, pick } = useLocale();
  const [open, setOpen] = useState(false);
  return <View style={styles.detailCard} testID="terminal-details"><Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)} style={styles.detailToggle} testID="terminal-details-toggle"><View><Text style={styles.sectionTitle}>{pick("Analyse détaillée", "Detailed analysis")}</Text><Text style={styles.sectionSubtitle}>{pick("Composantes, leaders, pression et méthodologie", "Components, leaders, pressure, and methodology")}</Text></View><Text style={styles.detailChevron}>{open ? "−" : "+"}</Text></Pressable>{open ? <View style={styles.detailBody}>
    {snapshot.components.map((component) => <View key={component.key} style={styles.component} testID={`terminal-component-${component.key}`}><View style={styles.cardTop}><Text style={styles.name}>{component.label}</Text><Text style={styles.symbol}>{scoreText(component.score)}</Text></View><View style={styles.leadership}><View style={[styles.leadershipFill, { width: `${Math.max(0, Math.min(100, component.score ?? 0))}%` }]} /></View><Text style={styles.meta}>{component.value}</Text><Text style={styles.body}>{component.description}</Text></View>)}
    <Text style={styles.detailHeading}>{pick("Leaders", "Leaders")}</Text>{snapshot.leaders.map((item) => <Text key={`leader-${item.symbol}`} style={styles.ranking}>{item.symbol} · {scoreText(item.score)}</Text>)}
    <Text style={styles.detailHeading}>{pick("Titres sous pression", "Securities under pressure")}</Text>{snapshot.laggards.map((item) => <Text key={`laggard-${item.symbol}`} style={styles.ranking}>{item.symbol} · {scoreText(item.score)}</Text>)}
    <Text style={styles.detailHeading}>{pick("Méthodologie", "Methodology")}</Text><Text style={styles.body}>{snapshot.methodology}</Text><Text style={styles.meta}>{new Date(snapshot.generated_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}</Text>
  </View> : null}</View>;
}

export function TerminalScreen() {
  const { language, pick } = useLocale();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<TerminalFeedMode>("all");
  const [sector, setSector] = useState("all");
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
      if (!active) void queryClient.cancelQueries({ queryKey: ["terminal"] });
    });
    return () => { subscription.remove(); void queryClient.cancelQueries({ queryKey: ["terminal"] }); };
  }, [queryClient]);
  const query = useQuery({ queryKey: ["terminal"], queryFn: ({ signal }) => marketApi.terminal(signal), staleTime: 60_000, refetchInterval: (current) => appActive ? Math.max(60, current.state.data?.refresh_after_seconds ?? 60) * 1000 : false, refetchIntervalInBackground: false });
  const snapshot = query.data;
  const radar = useMemo(() => snapshot ? uniqueRadarItems(snapshot) : [], [snapshot]);
  const sectors = useMemo(() => [...new Set(radar.map((item) => item.sector))].sort(), [radar]);
  const visibleRadar = useMemo(() => filterAndSortRadar(radar, mode, sector), [mode, radar, sector]);
  const entries = useMemo<TerminalEntry[]>(() => {
    if (!snapshot) return [];
    const alerts = [...new Map(snapshot.alerts.map((item) => [item.id, item])).values()];
    const rotations = [...new Map(snapshot.sectors.map((item) => [item.sector, item])).values()];
    return [
      { id: "heading:radar", kind: "heading", title: pick("RADAR PRO", "PRO RADAR"), subtitle: pick("Signaux de recherche classés selon les données observées.", "Research signals ranked from observed data.") },
      ...visibleRadar.map((item) => ({ id: `radar:${item.symbol}`, kind: "radar" as const, item })),
      { id: "heading:rotation", kind: "heading", title: pick("ROTATION SECTORIELLE", "SECTOR ROTATION"), subtitle: pick("Force, momentum, volume et largeur par secteur.", "Strength, momentum, volume, and breadth by sector.") },
      ...rotations.map((item) => ({ id: `sector:${item.sector}`, kind: "sector" as const, item })),
      { id: "heading:alerts", kind: "heading", title: pick("ALERTES & DISLOCATIONS", "ALERTS & DISLOCATIONS"), subtitle: pick("Signaux de recherche à vérifier dans Focus, pas des recommandations.", "Research signals to verify in Focus, not recommendations.") },
      ...alerts.map((item) => ({ id: `alert:${item.id}`, kind: "alert" as const, item })),
      { id: "details", kind: "details" },
    ];
  }, [pick, snapshot, visibleRadar]);
  const header = <View style={styles.header}>
    <ScreenHeader eyebrow="ANATOLE" title="TERMINAL PRO" subtitle={pick("Lecture synthétique du marché canadien : régime, momentum, volume, rotation sectorielle et anomalies.", "A concise reading of the Canadian market: regime, momentum, volume, sector rotation, and anomalies.")} action={<Pressable accessibilityRole="button" onPress={() => router.push("/psychology" as Href)} style={styles.linkButton} testID="terminal-open-psychology"><Text style={styles.linkText}>{pick("Psychologie du marché", "Market psychology")}</Text></Pressable>} />
    {snapshot ? <><View style={styles.regimeCard}><View><Text style={styles.scoreHero}>{scoreText(snapshot.regime_score)}</Text><Text style={styles.metricLabel}>{pick("Score régime", "Regime score")}</Text></View><View style={styles.regimeCopy}><Text style={styles.regime}>{snapshot.regime ? regimeLabel(snapshot.regime, language) : "N/D"}</Text><Text style={styles.risk}>{pick("Risque", "Risk")} · {snapshot.risk_level ? riskLabel(snapshot.risk_level, language) : "N/D"}</Text><Text style={styles.universe}>{snapshot.universe}</Text></View></View><View style={styles.kpis}><Metric label={pick("Variation marché", "Market change")} value={percentOrNd(snapshot.weighted_change_percent, language)} /><Metric label={pick("Largeur", "Breadth")} value={percentOrNd(snapshot.advance_ratio, language)} /><Metric label={pick("Au-dessus MM20", "Above MA20")} value={percentOrNd(snapshot.above_sma20_percent, language)} /><Metric label={pick("Au-dessus MM50", "Above MA50")} value={percentOrNd(snapshot.above_sma50_percent, language)} /><Metric label={pick("Score Anatole moyen", "Average Anatole score")} value={scoreText(snapshot.average_anatole_score, "")} /><Metric label={pick("Momentum 20j moyen", "Average 20d momentum")} value={percentOrNd(snapshot.average_momentum_20d, language)} /><Metric label={pick("Volumes inhabituels", "Unusual volume")} value={valueOrNd(snapshot.high_relative_volume_count, 0, language)} /></View></> : null}
    {snapshot && query.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <QueryState error={!snapshot ? query.error : null} loading={!snapshot && query.isLoading} onRetry={() => void query.refetch()} />
    {snapshot ? <><Text style={styles.filterLabel}>{pick("Radar", "Radar")}</Text><View style={styles.filters}>{(["all", "volume", "momentum", "pressure"] as TerminalFeedMode[]).map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === value }} key={value} onPress={() => setMode(value)} style={[styles.filter, mode === value && styles.filterActive]} testID={`terminal-mode-${value}`}><Text style={styles.filterText}>{value === "all" ? pick("Tous", "All") : value === "pressure" ? pick("Sous pression", "Under pressure") : value[0]!.toUpperCase() + value.slice(1)}</Text></Pressable>)}</View><View style={styles.filters}><Pressable accessibilityRole="button" accessibilityState={{ selected: sector === "all" }} onPress={() => setSector("all")} style={[styles.filter, sector === "all" && styles.filterActive]} testID="terminal-sector-all"><Text style={styles.filterText}>{pick("Tous secteurs", "All sectors")}</Text></Pressable>{sectors.map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: sector === value }} key={value} onPress={() => setSector(value)} style={[styles.filter, sector === value && styles.filterActive]} testID={`terminal-filter-sector-${value}`}><Text style={styles.filterText}>{value}</Text></Pressable>)}</View></> : null}
  </View>;
  return <SafeAreaView edges={["bottom"]} style={styles.safe} testID="terminal-screen"><FlatList ListHeaderComponent={header} contentContainerStyle={styles.content} data={entries} initialNumToRender={12} keyExtractor={(item) => item.id} maxToRenderPerBatch={14} refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />} removeClippedSubviews renderItem={({ item }) => item.kind === "heading" ? <View style={styles.heading}><Text style={styles.headingText}>{item.title}</Text><Text style={styles.sectionSubtitle}>{item.subtitle}</Text></View> : item.kind === "radar" ? <RadarCard item={item.item} /> : item.kind === "sector" ? <SectorCard item={item.item} /> : item.kind === "alert" ? <AlertCard raw={item.item} /> : snapshot ? <DetailedAnalysis snapshot={snapshot} /> : null} testID="terminal-list" windowSize={7} /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md }, header: { gap: spacing.md }, linkButton: { minHeight: 44, maxWidth: 128, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, linkText: { ...typography.caption, color: colors.primary, textAlign: "center", fontWeight: "800" },
  regimeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface }, scoreHero: { ...typography.hero, color: colors.positive }, regimeCopy: { flex: 1, alignItems: "flex-end" }, regime: { ...typography.title, color: colors.text }, risk: { ...typography.label, color: colors.warning }, universe: { ...typography.caption, color: colors.textMuted }, kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { minWidth: "30%", flexGrow: 1, gap: 2, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, metricValue: { ...typography.section, color: colors.text }, metricLabel: { ...typography.caption, color: colors.textMuted }, stale: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm },
  filterLabel: { ...typography.label, color: colors.primary, textTransform: "uppercase" }, filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, filter: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, filterActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, filterText: { ...typography.caption, color: colors.text, fontWeight: "700" },
  heading: { gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, headingText: { ...typography.section, color: colors.primary, letterSpacing: 1 }, sectionTitle: { ...typography.section, color: colors.text }, sectionSubtitle: { ...typography.caption, color: colors.textMuted }, card: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, cardMain: { gap: spacing.md }, pressed: { opacity: 0.7 }, cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }, identity: { flex: 1, minWidth: 0 }, symbol: { ...typography.section, color: colors.text }, name: { ...typography.body, color: colors.text }, meta: { ...typography.caption, color: colors.textMuted }, quote: { alignItems: "flex-end" }, price: { ...typography.label, color: colors.text }, change: { ...typography.caption }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, tag: { ...typography.label, color: colors.primary }, signal: { ...typography.caption, color: colors.textMuted }, expand: { minHeight: 44, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, expandText: { ...typography.label, color: colors.primary }, reasons: { gap: spacing.xs }, reason: { ...typography.body, color: colors.textMuted },
  leadership: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, leadershipFill: { height: "100%", backgroundColor: colors.cyan }, alertTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, severity: { ...typography.label, color: colors.primary }, severityWatch: { color: colors.warning }, severityHigh: { color: colors.negative }, alertTitle: { ...typography.section, color: colors.text }, body: { ...typography.body, color: colors.textMuted },
  detailCard: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface }, detailToggle: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, padding: spacing.md }, detailChevron: { fontSize: 28, color: colors.primary }, detailBody: { gap: spacing.md, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, component: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, detailHeading: { ...typography.label, color: colors.primary, marginTop: spacing.sm, textTransform: "uppercase" }, ranking: { ...typography.body, color: colors.text },
});
