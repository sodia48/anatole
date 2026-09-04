import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { percentOrNd, valueOrNd } from "@/src/components/focus/format";
import { QueryState, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { PsychologyComponent, PsychologySnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { psychologyComponentCopy, psychologyLabel } from "./model";

function Gauge({ score, label }: { score: number; label: string }) {
  const radiusValue = 54;
  const circumference = 2 * Math.PI * radiusValue;
  const visualScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return <View style={styles.gauge} testID="psychology-gauge"><Svg height={132} width={132}><Circle cx={66} cy={66} fill="none" r={radiusValue} stroke={colors.surfaceRaised} strokeWidth={12} /><Circle cx={66} cy={66} fill="none" r={radiusValue} rotation={-90} origin="66,66" stroke={colors.cyan} strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - visualScore / 100)} strokeLinecap="round" strokeWidth={12} /></Svg><View style={styles.gaugeCopy}><Text style={styles.gaugeScore}>{valueOrNd(score, 0)}</Text><Text numberOfLines={2} style={styles.gaugeLabel}>{label}</Text></View></View>;
}

function PsychologyCard({ item, snapshot }: { item: PsychologyComponent; snapshot: PsychologySnapshot }) {
  const { language } = useLocale();
  const copy = psychologyComponentCopy(item, snapshot, language);
  return <View style={styles.component} testID={`psychology-component-${item.key}`}><View style={styles.componentTop}><Text style={styles.componentTitle}>{copy.label}</Text><Text style={styles.componentScore}>{valueOrNd(item.score, 0)}/100</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, item.score))}%` }]} /></View><Text style={styles.body}>{copy.description}</Text></View>;
}

export function PsychologyScreen() {
  const { language, pick } = useLocale();
  const queryClient = useQueryClient();
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
      if (!active) void queryClient.cancelQueries({ queryKey: ["psychology"] });
    });
    return () => { subscription.remove(); void queryClient.cancelQueries({ queryKey: ["psychology"] }); };
  }, [queryClient]);
  const query = useQuery({ queryKey: ["psychology"], queryFn: ({ signal }) => marketApi.psychology(signal), staleTime: 45_000, refetchInterval: (current) => appActive ? Math.max(45, current.state.data?.refresh_after_seconds ?? 45) * 1000 : false, refetchIntervalInBackground: false });
  const snapshot = query.data;
  const components = useMemo(() => snapshot ? [...new Map(snapshot.components.map((item) => [item.key, item])).values()] : [], [snapshot]);
  const header = <View style={styles.header}>
    <ScreenHeader eyebrow={pick("PSYCHOLOGIE DU MARCHÉ", "MARKET PSYCHOLOGY")} title={pick("INDICE ANATOLE CANADA", "ANATOLE CANADA INDEX")} subtitle={pick("Un indice explicable fondé sur des mesures observables du marché canadien.", "An explainable index based on observable Canadian market measures.")} action={<Pressable accessibilityRole="button" onPress={() => router.push("/terminal" as Href)} style={styles.linkButton} testID="psychology-open-terminal"><Text style={styles.linkText}>{pick("Ouvrir Terminal Pro", "Open Pro Terminal")}</Text></Pressable>} />
    {snapshot ? <><View style={styles.overview}><Gauge label={psychologyLabel(snapshot.label, language)} score={snapshot.score} /><View style={styles.scale}><Text style={styles.scaleText}>0–20 · {pick("Peur extrême", "Extreme fear")}</Text><Text style={styles.scaleText}>20–40 · {pick("Peur", "Fear")}</Text><Text style={styles.scaleText}>40–60 · {pick("Neutre", "Neutral")}</Text><Text style={styles.scaleText}>60–80 · {pick("Confiance", "Confidence")}</Text><Text style={styles.scaleText}>80–100 · {pick("Confiance extrême", "Extreme confidence")}</Text></View></View><View style={styles.kpis}><View style={styles.kpi}><Text style={styles.kpiValue}>{percentOrNd(snapshot.change_20d, language)}</Text><Text style={styles.kpiLabel}>{pick("20 séances", "20 sessions")}</Text></View><View style={styles.kpi}><Text style={styles.kpiValue}>{percentOrNd(snapshot.change_50d, language)}</Text><Text style={styles.kpiLabel}>{pick("50 séances", "50 sessions")}</Text></View><View style={styles.kpi}><Text style={styles.kpiValue}>{percentOrNd(snapshot.volatility_20d, language)}</Text><Text style={styles.kpiLabel}>{pick("Volatilité 20j", "20d volatility")}</Text></View><View style={styles.kpi}><Text style={styles.kpiValue}>{percentOrNd(snapshot.advance_ratio, language)}</Text><Text style={styles.kpiLabel}>{pick("Largeur", "Breadth")}</Text></View></View></> : null}
    {snapshot && query.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <QueryState error={!snapshot ? query.error : null} loading={!snapshot && query.isLoading} onRetry={() => void query.refetch()} />
    {snapshot ? <><Text style={styles.heading}>{pick("COMPOSANTES EXPLICABLES", "EXPLAINABLE COMPONENTS")}</Text><Text style={styles.source}>{snapshot.source} · {new Date(snapshot.generated_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}</Text></> : null}
  </View>;
  const footer = snapshot ? <View style={styles.notice}><Text style={styles.body}>{pick("L’indice Anatole combine plusieurs mesures observables du marché canadien. Il ne constitue pas un indicateur prédictif garanti ni une recommandation.", "The Anatole Index combines several observable measures of the Canadian market. It is neither a guaranteed predictive indicator nor a recommendation.")}</Text></View> : null;
  return <SafeAreaView edges={["bottom"]} style={styles.safe} testID="psychology-screen"><FlatList ListFooterComponent={footer} ListHeaderComponent={header} contentContainerStyle={styles.content} data={components} initialNumToRender={8} keyExtractor={(item) => item.key} refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />} renderItem={({ item }) => snapshot ? <PsychologyCard item={item} snapshot={snapshot} /> : null} testID="psychology-list" /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md }, header: { gap: spacing.md }, linkButton: { minHeight: 44, maxWidth: 120, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, linkText: { ...typography.caption, color: colors.primary, textAlign: "center", fontWeight: "800" }, overview: { flexDirection: "row", alignItems: "center", gap: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface }, gauge: { width: 132, height: 132, alignItems: "center", justifyContent: "center" }, gaugeCopy: { position: "absolute", width: 94, alignItems: "center" }, gaugeScore: { ...typography.hero, color: colors.text }, gaugeLabel: { ...typography.caption, color: colors.primary, textAlign: "center", fontWeight: "800" }, scale: { flex: 1, gap: spacing.xs }, scaleText: { ...typography.caption, color: colors.textMuted }, kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, kpi: { minWidth: "46%", flexGrow: 1, gap: spacing.xs, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, kpiValue: { ...typography.section, color: colors.text }, kpiLabel: { ...typography.caption, color: colors.textMuted }, stale: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm }, heading: { ...typography.section, color: colors.primary, letterSpacing: 1 }, source: { ...typography.caption, color: colors.textSubtle }, component: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, componentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, componentTitle: { ...typography.section, color: colors.text }, componentScore: { ...typography.label, color: colors.primary }, track: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, fill: { height: "100%", backgroundColor: colors.cyan }, body: { ...typography.body, color: colors.textMuted }, notice: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
});
