import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, InteractionManager, Pressable, StyleSheet, Text, View } from "react-native";

import { MobileFocusActions } from "@/src/components/focus/MobileFocusActions";
import { MobileFocusAnalysts } from "@/src/components/focus/MobileFocusAnalysts";
import { MobileFocusEcosystem } from "@/src/components/focus/MobileFocusEcosystem";
import { MobileFocusFinancials } from "@/src/components/focus/MobileFocusFinancials";
import { MobileFocusFundamentals } from "@/src/components/focus/MobileFocusFundamentals";
import { MobileFocusHeader } from "@/src/components/focus/MobileFocusHeader";
import { MobileFocusInsights } from "@/src/components/focus/MobileFocusInsights";
import { MobileFocusNavigation, type MobileFocusSection } from "@/src/components/focus/MobileFocusNavigation";
import { focusPeriods, MobileFocusOverview, type FocusPeriod } from "@/src/components/focus/MobileFocusOverview";
import { MobileFocusPro } from "@/src/components/focus/MobileFocusPro";
import { QueryState, Screen } from "@/src/components/ui";
import { useLiveQuote } from "@/src/hooks/useLiveQuote";
import { marketApi } from "@/src/lib/api/market";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export default function StockDetailScreen() {
  const params = useLocalSearchParams<{ ticker: string }>();
  const ticker = normalizeTicker(String(params.ticker ?? "RY"));
  const { language, pick } = useLocale();
  const { workspace, saveWorkspace } = useMobileAccount();
  const [section, setSection] = useState<MobileFocusSection>("overview");
  const [preloadedProTicker, setPreloadedProTicker] = useState<string | null>(null);
  const [period, setPeriod] = useState<FocusPeriod>(focusPeriods[0]);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => subscription.remove();
  }, []);
  const focus = useQuery({ queryKey: ["focus", ticker, period.range, period.interval], queryFn: ({ signal }) => marketApi.focus(ticker, period.range, period.interval, signal), refetchInterval: appActive && section === "overview" && period.label === "LIVE" ? 15_000 : false, refetchIntervalInBackground: false });
  const company = focus.data?.profile.name ?? ticker;
  useEffect(() => {
    if (!focus.data) return;
    const task = InteractionManager.runAfterInteractions(() => setPreloadedProTicker(ticker));
    return () => task.cancel();
  }, [focus.data, ticker]);
  const news = useQuery({ queryKey: ["stock-news", ticker, language], queryFn: () => marketApi.stockNews(ticker, company, language), enabled: Boolean(focus.data) && section === "overview", staleTime: 300_000 });
  const needsFundamentals = ["fundamentals", "financials", "analysts"].includes(section);
  const fundamentals = useQuery({ queryKey: ["fundamentals", ticker], queryFn: ({ signal }) => marketApi.fundamentals(ticker, signal), enabled: needsFundamentals, staleTime: 10 * 60_000 });
  const live = useLiveQuote(ticker, focus.data?.quote);
  const followed = workspace.data.watchlist.includes(ticker);
  async function toggleWatchlist() { await saveWorkspace({ ...workspace.data, watchlist: followed ? workspace.data.watchlist.filter((item) => item !== ticker) : [...workspace.data.watchlist, ticker] }); }
  const refresh = () => { if (section === "overview") void Promise.all([focus.refetch(), news.refetch()]); else if (needsFundamentals) void fundamentals.refetch(); };
  const changeSection = (next: MobileFocusSection) => { if (next === "pro") setPreloadedProTicker(ticker); setSection(next); };
  return <Screen onRefresh={refresh} refreshing={focus.isRefetching || fundamentals.isRefetching || news.isRefetching} testID="stock-detail-screen">
    <QueryState error={!focus.data ? focus.error : null} loading={focus.isLoading} onRetry={() => void focus.refetch()} />
    {focus.data && live.quote ? <>
      <MobileFocusHeader company={company} followed={followed} liveState={live.state} onFollow={() => void toggleWatchlist()} quote={live.quote} />
      <MobileFocusNavigation onChange={changeSection} section={section} />
      <Pressable accessibilityRole="link" onPress={() => router.push("/terminal")} style={styles.terminalLink} testID="focus-open-terminal"><Text style={styles.terminalLinkText}>← Terminal Pro</Text></Pressable>
      {section === "overview" ? <><View style={styles.periods}>{focusPeriods.map((item) => <Pressable key={item.label} onPress={() => setPeriod(item)} style={[styles.period, period.label === item.label && styles.periodActive]}><Text style={[styles.periodText, period.label === item.label && styles.periodTextActive]}>{item.label}</Text></Pressable>)}</View><MobileFocusOverview liveState={live.state} news={news.data} newsError={!news.data ? news.error : null} newsLoading={news.isLoading} period={period} snapshot={{ ...focus.data, quote: live.quote }} ticker={ticker} /></> : null}
      {section === "pro" || preloadedProTicker === ticker ? <View pointerEvents={section === "pro" ? "auto" : "none"} style={section === "pro" ? styles.proVisible : styles.proPreloaded} testID="focus-pro-persistent"><MobileFocusPro key={ticker} onOpenClassic={() => setSection("overview")} ticker={ticker} /></View> : null}
      {section === "fundamentals" ? <MobileFocusFundamentals error={!fundamentals.data ? fundamentals.error : null} loading={fundamentals.isLoading} onRetry={() => void fundamentals.refetch()} snapshot={fundamentals.data} /> : null}
      {section === "financials" ? <MobileFocusFinancials error={!fundamentals.data ? fundamentals.error : null} loading={fundamentals.isLoading} onRetry={() => void fundamentals.refetch()} snapshot={fundamentals.data} /> : null}
      {section === "analysts" ? <MobileFocusAnalysts error={!fundamentals.data ? fundamentals.error : null} loading={fundamentals.isLoading} onRetry={() => void fundamentals.refetch()} snapshot={fundamentals.data} /> : null}
      {section === "ecosystem" ? <MobileFocusEcosystem ticker={ticker} /> : null}
      {section === "insights" ? <MobileFocusInsights snapshot={focus.data} ticker={ticker} /> : null}
      <MobileFocusActions />
    </> : null}
    <Text style={styles.disclaimer}>{pick("Les données peuvent être différées. Information générale seulement; aucune recommandation de placement.", "Data may be delayed. General information only; not investment advice.")}</Text>
  </Screen>;
}
const styles = StyleSheet.create({ terminalLink: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, terminalLinkText: { ...typography.label, color: colors.primary }, periods: { flexDirection: "row", gap: spacing.xs }, period: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, periodActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" }, periodText: { ...typography.label, color: colors.textMuted }, periodTextActive: { color: colors.text }, proVisible: { width: "100%" }, proPreloaded: { position: "absolute", top: 0, left: -10_000, width: 1, height: 1, opacity: 0, overflow: "hidden" }, disclaimer: { ...typography.caption, color: colors.textSubtle, textAlign: "center", padding: spacing.lg } });
