import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteTerminalPreset, filterTerminalRadar, isTerminalV2Snapshot, TERMINAL_RADAR_DEFAULT_PRESETS, upsertTerminalPreset } from "@anatole/shared";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { moneyOrNd, percentOrNd, valueOrNd } from "@/src/components/focus/format";
import { QueryState, ScreenHeader } from "@/src/components/ui";
import { apiBaseUrl } from "@/src/lib/api/base";
import { marketApi } from "@/src/lib/api/market";
import type { TerminalAlert, TerminalOpportunity, TerminalRadarFilters, TerminalRadarPreset, TerminalRadarSort, TerminalSector, TerminalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { alertCopy, opportunityLabel, regimeLabel, riskLabel, sectorStateLabel, type TerminalFeedMode } from "./model";
import { TerminalRadarFiltersModal, terminalFilterLabels } from "./TerminalRadarFiltersModal";
import { AnomaliesCard, BreadthCard, DriversCard, HorizonCards, PulseCard, RotationCard, type PulseRange } from "./TerminalV2Cards";

type TerminalEntry =
  | { id: string; kind: "heading"; title: string; subtitle: string }
  | { id: string; kind: "radar"; item: TerminalOpportunity }
  | { id: string; kind: "sector"; item: TerminalSector }
  | { id: string; kind: "alert"; item: TerminalAlert }
  | { id: string; kind: "horizons" | "pulse" | "breadth" | "rotation" | "drivers" | "anomalies" }
  | { id: string; kind: "details" };

type LegacyTerminalSummary = {
  universe: string | null;
  regime: string | null;
  regimeScore: number | null;
  riskLevel: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function legacyTerminalSummary(value: unknown): LegacyTerminalSummary | null {
  if (!isRecord(value) || isTerminalV2Snapshot(value)) return null;
  return {
    universe: typeof value.universe === "string" ? value.universe : null,
    regime: typeof value.regime === "string" ? value.regime : null,
    regimeScore: typeof value.regime_score === "number" && Number.isFinite(value.regime_score) ? value.regime_score : null,
    riskLevel: typeof value.risk_level === "string" ? value.risk_level : null,
  };
}

export function terminalRefreshSeconds(value: unknown): number {
  if (!isRecord(value) || typeof value.refresh_after_seconds !== "number" || !Number.isFinite(value.refresh_after_seconds)) return 60;
  return Math.max(60, value.refresh_after_seconds);
}

export function terminalApiHost(value = apiBaseUrl()): string {
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

function asOfLabel(value: string | null, language: "fr" | "en", dateOnly = false): string {
  if (!value) return "N/D";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return dateOnly
    ? date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA")
    : date.toLocaleTimeString(language === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" });
}

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
  const relativeVolume = valueOrNd(item.relative_volume, 1, language);
  return <View style={styles.card} testID={`terminal-sector-${item.sector}`}><View style={styles.cardTop}><Text style={styles.symbol}>{item.sector}</Text><Text style={styles.tag}>{sectorStateLabel(item.state, language)}</Text></View>{item.leadership_score != null ? <View style={styles.leadership} testID={`terminal-sector-bar-${item.sector}`}><View style={[styles.leadershipFill, { width: `${Math.max(0, Math.min(100, item.leadership_score))}%` }]} /></View> : null}<View style={styles.metrics}><Metric label={pick("Leadership", "Leadership")} value={scoreText(item.leadership_score)} /><Metric label={pick("Séance", "Session")} value={percentOrNd(item.change_percent, language)} /><Metric label="Momentum 20j" value={percentOrNd(item.momentum_20d, language)} /><Metric label={pick("Volume relatif", "Relative volume")} value={relativeVolume === "N/D" ? relativeVolume : `${relativeVolume}×`} /><Metric label={pick("Largeur", "Breadth")} value={`${item.advancers}↑ ${item.decliners}↓`} /><Metric label={pick("Score moyen", "Average score")} value={scoreText(item.average_score)} /></View></View>;
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
    {snapshot.components.map((component) => <View key={component.key} style={styles.component} testID={`terminal-component-${component.key}`}><View style={styles.cardTop}><Text style={styles.name}>{component.label}</Text><Text style={styles.symbol}>{scoreText(component.score)}</Text></View>{component.score != null ? <View style={styles.leadership} testID={`terminal-component-bar-${component.key}`}><View style={[styles.leadershipFill, { width: `${Math.max(0, Math.min(100, component.score))}%` }]} /></View> : null}<Text style={styles.meta}>{component.value}</Text><Text style={styles.body}>{component.description}</Text></View>)}
    <Text style={styles.detailHeading}>{pick("Leaders", "Leaders")}</Text>{snapshot.leaders.map((item) => <Text key={`leader-${item.symbol}`} style={styles.ranking}>{item.symbol} · {scoreText(item.score)}</Text>)}
    <Text style={styles.detailHeading}>{pick("Titres sous pression", "Securities under pressure")}</Text>{snapshot.laggards.map((item) => <Text key={`laggard-${item.symbol}`} style={styles.ranking}>{item.symbol} · {scoreText(item.score)}</Text>)}
    <Text style={styles.detailHeading}>{pick("Méthodologie", "Methodology")}</Text><Text style={styles.body}>{snapshot.methodology}</Text><Text style={styles.meta}>{new Date(snapshot.generated_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}</Text>
  </View> : null}</View>;
}

export function TerminalScreen() {
  const { language, pick } = useLocale();
  const { workspace, saveWorkspace } = useMobileAccount();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<TerminalFeedMode>("all");
  const [pulseRange, setPulseRange] = useState<PulseRange>("3m");
  const [filters, setFilters] = useState<TerminalRadarFilters>({});
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [radarSort, setRadarSort] = useState<TerminalRadarSort>("score_desc");
  const [activePreset, setActivePreset] = useState("");
  const [presetName, setPresetName] = useState("");
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
      if (!active) void queryClient.cancelQueries({ queryKey: ["terminal"] });
    });
    return () => { subscription.remove(); void queryClient.cancelQueries({ queryKey: ["terminal"] }); };
  }, [queryClient]);
  const query = useQuery<unknown>({ queryKey: ["terminal"], queryFn: ({ signal }) => marketApi.terminal(signal), staleTime: 60_000, refetchInterval: (current) => appActive ? terminalRefreshSeconds(current.state.data) * 1000 : false, refetchIntervalInBackground: false });
  const rawSnapshot = query.data;
  const snapshot = useMemo(() => isTerminalV2Snapshot(rawSnapshot) ? rawSnapshot : null, [rawSnapshot]);
  const legacySummary = useMemo(() => legacyTerminalSummary(rawSnapshot), [rawSnapshot]);
  const summary = snapshot ? {
    universe: snapshot.universe,
    regime: snapshot.regime,
    regimeScore: snapshot.regime_score,
    riskLevel: snapshot.risk_level,
  } : legacySummary;
  const radar = useMemo(() => snapshot?.radar_items ?? [], [snapshot]);
  const sectors = useMemo(() => [...new Set(radar.map((item) => item.sector))].sort(), [radar]);
  const visibleRadar = useMemo(() => filterTerminalRadar(radar, filters, radarSort), [filters, radar, radarSort]);
  const activeFilterLabels = useMemo(() => terminalFilterLabels(filters, language), [filters, language]);
  const entries = useMemo<TerminalEntry[]>(() => {
    if (!snapshot) return [];
    return [
      { id: "v2:horizons", kind: "horizons" },
      { id: "v2:pulse", kind: "pulse" },
      { id: "v2:breadth", kind: "breadth" },
      { id: "v2:rotation", kind: "rotation" },
      { id: "v2:drivers", kind: "drivers" },
      { id: "v2:anomalies", kind: "anomalies" },
      { id: "heading:radar", kind: "heading", title: pick("RADAR PRO", "PRO RADAR"), subtitle: pick("Signaux de recherche classés selon les données observées.", "Research signals ranked from observed data.") },
      ...visibleRadar.map((item) => ({ id: `radar:${item.symbol}`, kind: "radar" as const, item })),
      { id: "details", kind: "details" },
    ];
  }, [pick, snapshot, visibleRadar]);
  const presets = workspace.data.terminal_presets ?? [];
  const selectPreset = (preset: TerminalRadarPreset) => { setActivePreset(preset.id); setPresetName(preset.name); setFilters(preset.filters); setRadarSort(preset.sort); };
  const persistPreset = async () => {
    const name = presetName.trim(); if (!name) return;
    const id = activePreset && presets.some((item) => item.id === activePreset) ? activePreset : `terminal-${Date.now()}`;
    const now = new Date().toISOString();
    const next = upsertTerminalPreset(presets, { id, name: name.slice(0, 80), filters, sort: radarSort, created_at: now, updated_at: now });
    await saveWorkspace({ ...workspace.data, terminal_presets: next }); setActivePreset(id);
  };
  const removePreset = async () => { if (!activePreset) return; await saveWorkspace({ ...workspace.data, terminal_presets: deleteTerminalPreset(presets, activePreset) }); setActivePreset(""); setPresetName(""); };
  const clearFilter = (key: string) => {
    if (key.startsWith("anomaly:")) {
      const type = key.slice("anomaly:".length);
      setFilters((current) => ({ ...current, anomaly_types: (current.anomaly_types ?? []).filter((value) => value !== type) }));
      return;
    }
    setFilters((current) => ({ ...current, [key]: null }));
  };
  const header = <View style={styles.header}>
    <ScreenHeader eyebrow="ANATOLE" title="TERMINAL PRO" subtitle={pick("Lecture synthétique du marché canadien : régime, momentum, volume, rotation sectorielle et anomalies.", "A concise reading of the Canadian market: regime, momentum, volume, sector rotation, and anomalies.")} action={<Pressable accessibilityRole="button" onPress={() => router.push("/psychology" as Href)} style={styles.linkButton} testID="terminal-open-psychology"><Text style={styles.linkText}>{pick("Psychologie du marché", "Market psychology")}</Text></Pressable>} />
    {__DEV__ ? <View style={styles.devDiagnostic} testID="terminal-dev-diagnostic"><Text style={styles.devDiagnosticText}>API · {terminalApiHost()}</Text>{snapshot ? <Text style={styles.devDiagnosticText}>Schema · V2</Text> : null}</View> : null}
    {summary ? <View style={styles.regimeCard}><View><Text style={styles.scoreHero}>{scoreText(summary.regimeScore)}</Text><Text style={styles.metricLabel}>{pick("Score régime", "Regime score")}</Text></View><View style={styles.regimeCopy}><Text style={styles.regime}>{summary.regime ? regimeLabel(summary.regime, language) : "N/D"}</Text><Text style={styles.risk}>{pick("Risque", "Risk")} · {summary.riskLevel ? riskLabel(summary.riskLevel, language) : "N/D"}</Text><Text style={styles.universe}>{summary.universe ?? "N/D"}</Text></View></View> : null}
    {snapshot ? <><View style={styles.freshness} testID="terminal-freshness"><Text style={styles.freshnessText}>{pick("Données marché", "Market data")} : {asOfLabel(snapshot.data_quality.quotes_as_of, language)}</Text><Text style={styles.freshnessText}>{pick("Historique quotidien", "Daily history")} : {asOfLabel(snapshot.data_quality.history_as_of, language, true)}</Text>{snapshot.radar_items.some((item) => item.delayed) ? <Text style={styles.delayed}>{pick("Différé", "Delayed")}</Text> : null}</View><View style={styles.kpis}><Metric label={pick("Variation marché", "Market change")} value={percentOrNd(snapshot.weighted_change_percent, language)} /><Metric label={pick("Largeur", "Breadth")} value={percentOrNd(snapshot.advance_ratio, language)} /><Metric label={pick("Au-dessus MM20", "Above MA20")} value={percentOrNd(snapshot.above_sma20_percent, language)} /><Metric label={pick("Au-dessus MM50", "Above MA50")} value={percentOrNd(snapshot.above_sma50_percent, language)} /><Metric label={pick("Score Anatole moyen", "Average Anatole score")} value={scoreText(snapshot.average_anatole_score, "")} /><Metric label={pick("Momentum 20j moyen", "Average 20d momentum")} value={percentOrNd(snapshot.average_momentum_20d, language)} /><Metric label={pick("Volumes inhabituels", "Unusual volume")} value={valueOrNd(snapshot.high_relative_volume_count, 0, language)} /></View></> : null}
    {rawSnapshot && !snapshot ? <Text accessibilityRole="alert" style={styles.contractNotice} testID="terminal-v1-notice">{pick("Le backend connecté utilise une version antérieure du Terminal. Les modules Terminal Pro V2 nécessitent l’API V2.", "The connected backend uses an earlier Terminal version. Terminal Pro V2 modules require the V2 API.")}</Text> : null}
    {rawSnapshot && query.isError ? <Text accessibilityRole="alert" style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    <QueryState error={!rawSnapshot ? query.error : null} loading={!rawSnapshot && query.isLoading} onRetry={() => void query.refetch()} />
    {snapshot ? <><Text style={styles.filterLabel}>{pick("Radar", "Radar")} · {visibleRadar.length}/{radar.length}</Text><View style={styles.filters}>{[...TERMINAL_RADAR_DEFAULT_PRESETS, ...presets].map((preset) => <Pressable accessibilityRole="button" accessibilityState={{ selected: activePreset === preset.id }} key={preset.id} onPress={() => selectPreset(preset)} style={[styles.filter, activePreset === preset.id && styles.filterActive]} testID={`terminal-preset-${preset.id}`}><Text style={styles.filterText}>{preset.name}</Text></Pressable>)}<Pressable onPress={() => { setFilters({}); setRadarSort("score_desc"); setActivePreset(""); setPresetName(""); }} style={styles.filter} testID="terminal-preset-reset"><Text style={styles.filterText}>{pick("Réinitialiser", "Reset")}</Text></Pressable></View><View style={styles.filters}>{(["all", "volume", "momentum", "pressure"] as TerminalFeedMode[]).map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === value }} key={value} onPress={() => { setMode(value); setRadarSort(value === "volume" ? "volume_desc" : value === "momentum" ? "momentum_desc" : value === "pressure" ? "score_asc" : "score_desc"); }} style={[styles.filter, mode === value && styles.filterActive]} testID={`terminal-mode-${value}`}><Text style={styles.filterText}>{value === "all" ? pick("Tous", "All") : value === "pressure" ? pick("Sous pression", "Under pressure") : value[0]!.toUpperCase() + value.slice(1)}</Text></Pressable>)}</View><View style={styles.filters}><Pressable accessibilityRole="button" accessibilityState={{ selected: !filters.sector }} onPress={() => setFilters((current) => ({ ...current, sector: null }))} style={[styles.filter, !filters.sector && styles.filterActive]} testID="terminal-sector-all"><Text style={styles.filterText}>{pick("Tous secteurs", "All sectors")}</Text></Pressable>{sectors.map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: filters.sector === value }} key={value} onPress={() => setFilters((current) => ({ ...current, sector: value }))} style={[styles.filter, filters.sector === value && styles.filterActive]} testID={`terminal-filter-sector-${value}`}><Text style={styles.filterText}>{value}</Text></Pressable>)}</View><View style={styles.customFilters}><Pressable onPress={() => setAdvancedFiltersOpen(true)} style={[styles.filter, activeFilterLabels.length > 0 && styles.filterActive]} testID="terminal-advanced-filters-open"><Text style={styles.filterText}>{pick("Filtres avancés", "Advanced filters")} ({activeFilterLabels.length})</Text></Pressable><TextInput accessibilityLabel={pick("Nom du preset", "Preset name")} onChangeText={setPresetName} placeholder={pick("Nom du preset", "Preset name")} placeholderTextColor={colors.textMuted} style={styles.input} value={presetName} /><Pressable disabled={!presetName.trim() || (presets.length >= 10 && !presets.some((item) => item.id === activePreset))} onPress={() => void persistPreset()} style={styles.filter} testID="terminal-preset-save"><Text style={styles.filterText}>{pick("Enregistrer", "Save")}</Text></Pressable>{presets.some((item) => item.id === activePreset) ? <Pressable onPress={() => void removePreset()} style={styles.filter} testID="terminal-preset-delete"><Text style={styles.filterText}>{pick("Supprimer", "Delete")}</Text></Pressable> : null}</View>{activeFilterLabels.length ? <View style={styles.filters} testID="terminal-active-filters">{activeFilterLabels.map((item) => <Pressable accessibilityLabel={`${pick("Retirer", "Remove")} ${item.label}`} key={item.key} onPress={() => clearFilter(item.key)} style={styles.activeChip}><Text style={styles.filterText}>{item.label} ×</Text></Pressable>)}</View> : null}</> : null}
  </View>;
  return <SafeAreaView edges={["bottom"]} style={styles.safe} testID="terminal-screen"><FlatList ListHeaderComponent={header} contentContainerStyle={styles.content} data={entries} initialNumToRender={10} keyExtractor={(item) => item.id} maxToRenderPerBatch={12} refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />} removeClippedSubviews renderItem={({ item }) => item.kind === "heading" ? <View style={styles.heading}><Text style={styles.headingText}>{item.title}</Text><Text style={styles.sectionSubtitle}>{item.subtitle}</Text></View> : item.kind === "radar" ? <RadarCard item={item.item} /> : item.kind === "sector" ? <SectorCard item={item.item} /> : item.kind === "alert" ? <AlertCard raw={item.item} /> : snapshot && item.kind === "horizons" ? <HorizonCards snapshot={snapshot} /> : snapshot && item.kind === "pulse" ? <PulseCard onRange={setPulseRange} range={pulseRange} snapshot={snapshot} /> : snapshot && item.kind === "breadth" ? <BreadthCard snapshot={snapshot} /> : snapshot && item.kind === "rotation" ? <RotationCard snapshot={snapshot} /> : snapshot && item.kind === "drivers" ? <DriversCard snapshot={snapshot} /> : snapshot && item.kind === "anomalies" ? <AnomaliesCard snapshot={snapshot} /> : snapshot ? <DetailedAnalysis snapshot={snapshot} /> : null} testID="terminal-list" windowSize={7} /><TerminalRadarFiltersModal filters={filters} onChange={setFilters} onClose={() => setAdvancedFiltersOpen(false)} onReset={() => setFilters({})} sectors={sectors} visible={snapshot != null && advancedFiltersOpen} /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md }, header: { gap: spacing.md }, linkButton: { minHeight: 44, maxWidth: 128, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, linkText: { ...typography.caption, color: colors.primary, textAlign: "center", fontWeight: "800" },
  regimeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface }, scoreHero: { ...typography.hero, color: colors.positive }, regimeCopy: { flex: 1, alignItems: "flex-end" }, regime: { ...typography.title, color: colors.text }, risk: { ...typography.label, color: colors.warning }, universe: { ...typography.caption, color: colors.textMuted }, kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { minWidth: "30%", flexGrow: 1, gap: 2, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, metricValue: { ...typography.section, color: colors.text }, metricLabel: { ...typography.caption, color: colors.textMuted }, stale: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm },
  devDiagnostic: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, devDiagnosticText: { ...typography.caption, color: colors.textSubtle }, freshness: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface }, freshnessText: { ...typography.caption, color: colors.textMuted }, delayed: { ...typography.caption, color: colors.warning, paddingHorizontal: spacing.sm, paddingVertical: 3, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill }, contractNotice: { ...typography.body, color: colors.warning, padding: spacing.md, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, backgroundColor: "rgba(246,185,74,.08)" },
  filterLabel: { ...typography.label, color: colors.primary, textTransform: "uppercase" }, filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, filter: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, filterActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, filterText: { ...typography.caption, color: colors.text, fontWeight: "700" },
  customFilters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, input: { minWidth: "46%", flexGrow: 1, minHeight: 44, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, color: colors.text }, activeChip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, backgroundColor: "rgba(44,156,255,.12)" },
  heading: { gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, headingText: { ...typography.section, color: colors.primary, letterSpacing: 1 }, sectionTitle: { ...typography.section, color: colors.text }, sectionSubtitle: { ...typography.caption, color: colors.textMuted }, card: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, cardMain: { gap: spacing.md }, pressed: { opacity: 0.7 }, cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }, identity: { flex: 1, minWidth: 0 }, symbol: { ...typography.section, color: colors.text }, name: { ...typography.body, color: colors.text }, meta: { ...typography.caption, color: colors.textMuted }, quote: { alignItems: "flex-end" }, price: { ...typography.label, color: colors.text }, change: { ...typography.caption }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, tag: { ...typography.label, color: colors.primary }, signal: { ...typography.caption, color: colors.textMuted }, expand: { minHeight: 44, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, expandText: { ...typography.label, color: colors.primary }, reasons: { gap: spacing.xs }, reason: { ...typography.body, color: colors.textMuted },
  leadership: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, leadershipFill: { height: "100%", backgroundColor: colors.cyan }, alertTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, severity: { ...typography.label, color: colors.primary }, severityWatch: { color: colors.warning }, severityHigh: { color: colors.negative }, alertTitle: { ...typography.section, color: colors.text }, body: { ...typography.body, color: colors.textMuted },
  detailCard: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface }, detailToggle: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, padding: spacing.md }, detailChevron: { fontSize: 28, color: colors.primary }, detailBody: { gap: spacing.md, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, component: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, detailHeading: { ...typography.label, color: colors.primary, marginTop: spacing.sm, textTransform: "uppercase" }, ranking: { ...typography.body, color: colors.text },
});
