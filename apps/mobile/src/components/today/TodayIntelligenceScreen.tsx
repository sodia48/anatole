import { isTerminalV2Snapshot } from "@anatole/shared";
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View, type ViewToken } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NewsCard } from "@/src/components/market";
import { Card, QueryState, ScreenHeader } from "@/src/components/ui";
import { IntelligenceActions } from "@/src/components/search/IntelligenceActions";
import { marketApi } from "@/src/lib/api/market";
import type { StockNewsItem } from "@/src/lib/api/types";
import { workspaceApi } from "@/src/lib/api/workspace";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { TodayAttention } from "./TodayAttention";
import { TodayDrivers } from "./TodayDrivers";
import { TodayHeatmap } from "./TodayHeatmap";
import { TodayMarketBrief } from "./TodayMarketBrief";
import { TodayPersonalBrief } from "./TodayPersonalBrief";
import { TodayTimeline } from "./TodayTimeline";
import { buildTodayAttention, buildTodayTimeline, latestCockpitQuoteTime, personalNewsTargets, resolveTodayPhase, type TodayTarget, type TodayUniverse } from "./model";

type Section = "header" | "market" | "drivers" | "attention" | "heatmap" | "personal" | "timeline" | "news" | "links";
const SECTIONS: Section[] = ["header", "market", "drivers", "attention", "heatmap", "personal", "timeline", "news", "links"];
const TODAY_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 10 };

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || null;
}

export function TodayIntelligenceScreen() {
  const { language, pick } = useLocale();
  const { user, workspace } = useMobileAccount();
  const [universe, setUniverse] = useState<TodayUniverse>("composite");
  const [tier, setTier] = useState(1);
  const [appActive, setAppActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [now, setNow] = useState(() => new Date());
  const [visibleSections, setVisibleSections] = useState<ReadonlySet<Section>>(() => new Set(["header", "market"]));
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<Section>[] }) => {
    setVisibleSections(new Set(viewableItems.filter((item) => item.isViewable).map((item) => item.item)));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      if (!active) setTier(1);
      setAppActive(active);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!appActive) return;
    const timers = [
      setTimeout(() => setTier((value) => Math.max(value, 2)), 300),
      setTimeout(() => setTier((value) => Math.max(value, 3)), 800),
      setTimeout(() => setTier((value) => Math.max(value, 4)), 1_250),
      setTimeout(() => setTier((value) => Math.max(value, 5)), 1_850),
    ];
    const clock = setInterval(() => setNow(new Date()), 60_000);
    return () => { timers.forEach(clearTimeout); clearInterval(clock); };
  }, [appActive]);

  const cockpit = useQuery({ queryKey: ["cockpit", universe], queryFn: ({ signal }) => marketApi.cockpit(universe, signal), enabled: appActive, staleTime: 60_000 });
  const marketNear = visibleSections.has("market");
  const attentionNear = visibleSections.has("attention");
  const personalNear = visibleSections.has("personal");
  const timelineNear = visibleSections.has("timeline");
  const newsNear = visibleSections.has("news");
  const terminalNear = marketNear || visibleSections.has("drivers") || attentionNear || visibleSections.has("heatmap") || personalNear;
  const psychology = useQuery({ queryKey: ["psychology"], queryFn: ({ signal }) => marketApi.psychology(signal), enabled: appActive && tier >= 2 && marketNear, staleTime: 120_000 });
  const news = useQuery({ queryKey: ["news", language], queryFn: ({ signal }) => marketApi.news(language, signal), enabled: appActive && tier >= 2 && (newsNear || attentionNear), staleTime: 300_000 });
  const calendar = useQuery({ queryKey: ["calendar", language], queryFn: ({ signal }) => marketApi.calendar(language, signal), enabled: appActive && tier >= 2 && (timelineNear || attentionNear), staleTime: 600_000 });
  const earnings = useQuery({ queryKey: ["earnings", "composite"], queryFn: ({ signal }) => marketApi.earnings(signal), enabled: appActive && tier >= 3 && (timelineNear || attentionNear), staleTime: 600_000 });
  const watchlist = useQuery({ queryKey: ["watchlist", workspace.data.watchlist], queryFn: ({ signal }) => marketApi.watchlist(workspace.data.watchlist, signal), enabled: appActive && tier >= 3 && personalNear && workspace.data.watchlist.length > 0, staleTime: 30_000 });
  const alerts = useQuery({ queryKey: ["alerts", workspace.data.alerts], queryFn: ({ signal }) => workspaceApi.alerts(workspace.data.alerts, signal), enabled: appActive && tier >= 3 && attentionNear && workspace.data.alerts.length > 0, staleTime: 30_000 });
  const portfolio = useQuery({ queryKey: ["portfolio", "fast", workspace.data.portfolio], queryFn: ({ signal }) => workspaceApi.portfolio(workspace.data.portfolio, signal, true), enabled: appActive && tier >= 3 && personalNear && workspace.data.portfolio.length > 0, staleTime: 60_000 });
  const terminal = useQuery<unknown>({ queryKey: ["terminal"], queryFn: ({ signal }) => marketApi.terminal(signal), enabled: appActive && tier >= 4 && terminalNear, staleTime: 60_000 });
  const screener = useQuery({ queryKey: ["screener", universe], queryFn: ({ signal }) => marketApi.screener(universe, signal), enabled: appActive && tier >= 4 && attentionNear, staleTime: 180_000 });
  const insiders = useQuery({ queryKey: ["insiders", "preview", "canada", 30, ""], queryFn: ({ signal }) => marketApi.insiders({ market: "canada", days: 30, scanLimit: 8 }, signal), enabled: appActive && tier >= 5 && attentionNear, staleTime: 300_000 });

  const terminalV2 = useMemo(() => isTerminalV2Snapshot(terminal.data) ? terminal.data : null, [terminal.data]);
  const newsTargets = useMemo(() => personalNewsTargets(watchlist.data, portfolio.data), [portfolio.data, watchlist.data]);
  const firstTarget = newsTargets[0];
  const secondTarget = newsTargets[1];
  const personalNewsOne = useQuery({ queryKey: ["stock-news", firstTarget?.symbol ?? "", language], queryFn: ({ signal }) => marketApi.stockNews(firstTarget!.symbol, firstTarget!.company, language, signal), enabled: appActive && tier >= 3 && personalNear && Boolean(firstTarget), staleTime: 300_000 });
  const personalNewsTwo = useQuery({ queryKey: ["stock-news", secondTarget?.symbol ?? "", language], queryFn: ({ signal }) => marketApi.stockNews(secondTarget!.symbol, secondTarget!.company, language, signal), enabled: appActive && tier >= 3 && personalNear && Boolean(secondTarget), staleTime: 300_000 });

  const cockpitDelayed = cockpit.data?.constituents.some((item) => item.delayed) ?? false;
  const phase = resolveTodayPhase(now, latestCockpitQuoteTime(cockpit.data), language, cockpitDelayed);
  const sections = useMemo<Section[]>(() => {
    if (phase.phase === "pre_market" || phase.phase === "off_hours") return ["header", "market", "drivers", "timeline", "attention", "news", "heatmap", "personal", "links"];
    if (phase.phase === "post_market") return ["header", "market", "attention", "heatmap", "personal", "drivers", "timeline", "news", "links"];
    return SECTIONS;
  }, [phase.phase]);
  const attention = useMemo(() => buildTodayAttention({ alerts: alerts.data, terminal: terminalV2, calendar: calendar.data, earnings: earnings.data, screener: screener.data, insiders: insiders.data, news: news.data, watchlistSymbols: workspace.data.watchlist, portfolioSymbols: workspace.data.portfolio.map((item) => item.symbol), universe, language, now }), [alerts.data, calendar.data, earnings.data, insiders.data, language, news.data, now, screener.data, terminalV2, universe, workspace.data.portfolio, workspace.data.watchlist]);
  const timeline = useMemo(() => buildTodayTimeline(calendar.data, earnings.data, now, language), [calendar.data, earnings.data, language, now]);
  const personalNews = [personalNewsOne.data?.items[0], personalNewsTwo.data?.items[0]].filter((item): item is StockNewsItem => Boolean(item));
  const hasWorkspace = Boolean(workspace.data.watchlist.length || workspace.data.portfolio.length || workspace.data.alerts.length);
  const preferenceSummary = [...(workspace.data.preferences?.preferred_sectors ?? []).slice(0, 2), ...(workspace.data.preferences?.preferred_regions ?? []).slice(0, 2)].join(" · ");

  const openTarget = useCallback((target: TodayTarget) => {
    if (target.kind === "stock") router.push({ pathname: "/stock/[ticker]", params: { ticker: target.ticker } });
    else if (target.kind === "sector") router.push({ pathname: "/(tabs)/markets", params: { universe: target.universe, sector: target.sector } } as Href);
    else if (target.kind === "terminal") router.push({ pathname: "/terminal", params: { symbol: target.symbol, anomaly: target.anomaly } } as Href);
    else if (target.kind === "screener") router.push({ pathname: "/screener", params: { universe: target.universe, sector: target.sector, signal: target.signal } } as Href);
    else if (target.kind === "calendar") router.push({ pathname: "/(tabs)/markets", params: { hub: "calendar" } } as Href);
    else if (target.kind === "insider") router.push({ pathname: "/ipo-insiders", params: { tab: "insiders", ticker: target.ticker } } as Href);
    else void Linking.openURL(target.url);
  }, []);

  const refresh = useCallback(() => {
    const tasks: Promise<unknown>[] = [cockpit.refetch()];
    if (tier >= 2) tasks.push(psychology.refetch(), news.refetch(), calendar.refetch());
    if (tier >= 3) tasks.push(earnings.refetch());
    if (tier >= 3 && workspace.data.watchlist.length) tasks.push(watchlist.refetch());
    if (tier >= 3 && workspace.data.alerts.length) tasks.push(alerts.refetch());
    if (tier >= 3 && workspace.data.portfolio.length) tasks.push(portfolio.refetch());
    void Promise.allSettled(tasks);
  }, [alerts, calendar, cockpit, earnings, news, portfolio, psychology, tier, watchlist, workspace.data.alerts.length, workspace.data.portfolio.length, workspace.data.watchlist.length]);
  const refreshing = [cockpit, psychology, news, calendar, earnings, watchlist, alerts, portfolio].some((query) => query.isRefetching);

  const renderSection = ({ item }: { item: Section }) => {
    if (item === "header") return <View style={styles.header}><ScreenHeader action={<IntelligenceActions />} eyebrow={pick("AUJOURD’HUI 2.0 · DAILY INTELLIGENCE", "TODAY 2.0 · DAILY INTELLIGENCE")} title={`${phase.greeting}${firstName(user?.display_name) ? ` ${firstName(user?.display_name)}` : ""}`} subtitle={phase.title} /><Text style={[styles.marketStatus, phase.quoteIsCurrent && styles.current]}>{phase.marketStatus}</Text>{preferenceSummary ? <Text style={styles.preferences}>{pick("Vos préférences", "Your preferences")} · {preferenceSummary}</Text> : null}</View>;
    if (item === "market") return <TodayMarketBrief cockpit={cockpit.data} error={!cockpit.data && cockpit.error instanceof Error ? cockpit.error : null} loading={cockpit.isLoading} onPsychology={() => router.push("/psychology" as Href)} onRetry={() => void cockpit.refetch()} onTerminal={() => router.push("/terminal" as Href)} onUniverse={setUniverse} psychology={psychology.data} psychologyLoading={!psychology.data && appActive && marketNear && !psychology.error} terminal={terminalV2} terminalLoading={!terminal.data && appActive && terminalNear && !terminal.error} universe={universe} />;
    if (item === "drivers") return <TodayDrivers drivers={terminalV2?.market_drivers ?? []} loading={!terminal.data && appActive && terminalNear && !terminal.error} onOpenTerminal={() => router.push("/terminal" as Href)} stale={Boolean(terminal.data && terminal.isError)} />;
    if (item === "attention") return <TodayAttention items={attention} onOpen={openTarget} stale={Boolean((terminal.data && terminal.isError) || (news.data && news.isError) || (calendar.data && calendar.isError))} />;
    if (item === "heatmap") return <TodayHeatmap cockpit={cockpit.data} onOpen={openTarget} terminal={terminalV2} universe={universe} />;
    if (item === "personal") return <TodayPersonalBrief alerts={alerts.data} hasWorkspace={hasWorkspace} onOpen={openTarget} onPersonalize={() => router.push("/watchlist" as Href)} personalNews={personalNews} portfolio={portfolio.data} stale={Boolean((watchlist.data && watchlist.isError) || (portfolio.data && portfolio.isError) || (alerts.data && alerts.isError))} terminal={terminalV2} watchlist={watchlist.data} />;
    if (item === "timeline") return <TodayTimeline items={timeline} onCalendar={() => openTarget({ kind: "calendar" })} onOpen={openTarget} stale={Boolean((calendar.data && calendar.isError) || (earnings.data && earnings.isError))} />;
    if (item === "news") return <Card action={<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(tabs)/markets", params: { hub: "news" } } as Href)} style={styles.link}><Text style={styles.linkText}>{pick("Voir toutes", "View all")} →</Text></Pressable>} title={pick("NEWS ESSENTIELLES", "ESSENTIAL NEWS")} testID="today-news"><QueryState error={!news.data && news.error instanceof Error ? news.error : null} loading={!news.data && appActive && newsNear && !news.error} />{news.data ? news.data.items.slice(0, 3).map((entry) => <NewsCard compact item={entry} key={entry.id} />) : null}{news.data && news.isError ? <Text style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}</Card>;
    return <Card title={pick("EXPLORER ANATOLE", "EXPLORE ANATOLE")}><View style={styles.links}>{[["Terminal Pro", "/terminal"], [pick("Psychologie", "Psychology"), "/psychology"], ["Screener", "/screener"], [pick("Calendrier", "Calendar"), "/(tabs)/markets?hub=calendar"]].map(([label, route]) => <Pressable accessibilityRole="button" key={route} onPress={() => router.push(route as Href)} style={styles.nav}><Text style={styles.navText}>{label} →</Text></Pressable>)}</View></Card>;
  };

  return <SafeAreaView edges={["top"]} style={styles.safe} testID="today-intelligence-screen"><FlatList contentContainerStyle={styles.content} data={sections} initialNumToRender={4} keyExtractor={(item) => item} maxToRenderPerBatch={4} onViewableItemsChanged={onViewableItemsChanged} refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} tintColor={colors.primary} />} removeClippedSubviews={false} renderItem={renderSection} testID="today-sections" viewabilityConfig={TODAY_VIEWABILITY_CONFIG} windowSize={5} /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 }, header: { gap: spacing.sm }, marketStatus: { alignSelf: "flex-start", ...typography.caption, color: colors.warning, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill }, current: { color: colors.positive, borderColor: colors.positive }, preferences: { ...typography.caption, color: colors.textMuted }, link: { minHeight: 44, justifyContent: "center" }, linkText: { ...typography.caption, color: colors.primary, fontWeight: "800" }, muted: { ...typography.body, color: colors.textMuted }, stale: { ...typography.caption, color: colors.warning }, links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, nav: { minHeight: 44, minWidth: "46%", flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, navText: { ...typography.label, color: colors.primary },
});
