import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, InteractionManager, Pressable, Text, View } from "react-native";
import { MobileFocusActions } from "@/src/components/focus/MobileFocusActions";
import { MobileFocusAnalysts } from "@/src/components/focus/MobileFocusAnalysts";
import { MobileFocusEcosystem } from "@/src/components/focus/MobileFocusEcosystem";
import { MobileFocusDiagnostic } from "@/src/components/focus/MobileFocusDiagnostic";
import { MobileFocusFinancials } from "@/src/components/focus/MobileFocusFinancials";
import { MobileFocusFundamentals } from "@/src/components/focus/MobileFocusFundamentals";
import { MobileFocusFundamentalTabs, type MobileFundamentalView } from "@/src/components/focus/MobileFocusFundamentalTabs";
import { MobileFocusHeader } from "@/src/components/focus/MobileFocusHeader";
import { MobileFocusInsights } from "@/src/components/focus/MobileFocusInsights";
import { MobileFocusNavigation, type MobileFocusSection } from "@/src/components/focus/MobileFocusNavigation";
import { MobileFocusPeers } from "@/src/components/focus/MobileFocusPeers";
import { MobileFocusScenarios } from "@/src/components/focus/MobileFocusScenarios";
import { MobileFocusDocuments } from "@/src/components/focus/MobileFocusDocuments";
import { MobileFocusCapital } from "@/src/components/focus/MobileFocusCapital";
import { focusPeriods, MobileFocusOverview, type FocusPeriod } from "@/src/components/focus/MobileFocusOverview";
import { MobileFocusPro } from "@/src/components/focus/MobileFocusPro";
import { IntelligenceActions } from "@/src/components/search/IntelligenceActions";
import { QueryState, Screen } from "@/src/components/ui";
import { useLiveQuote } from "@/src/hooks/useLiveQuote";
import { marketApi } from "@/src/lib/api/market";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { defaultScenarioRequest, type ScenarioRequest } from "@anatole/shared/fundamental-scenarios";

export default function StockDetailScreen() {
  useMobileTheme();
  const params = useLocalSearchParams<{ ticker: string }>();
  const ticker = normalizeTicker(String(params.ticker ?? "RY"));
  const { language, pick } = useLocale();
  const { workspace, saveWorkspace } = useMobileAccount();
  const [section, setSection] = useState<MobileFocusSection>("overview");
  const [fundamentalView, setFundamentalView] = useState<MobileFundamentalView>("fundamentals");
  const [peerSelection, setPeerSelection] = useState<string[] | undefined>(undefined);
  const [scenarioRequest, setScenarioRequest] = useState<ScenarioRequest>(defaultScenarioRequest);
  const [documentQuery, setDocumentQuery] = useState("");
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
  const news = useQuery({ queryKey: ["stock-news", ticker, language], queryFn: ({ signal }) => marketApi.stockNews(ticker, company, language, signal), enabled: Boolean(focus.data) && section === "overview", staleTime: 300_000 });
  const needsFundamentals = section === "overview" || section === "fundamentals";
  const fundamentals = useQuery({ queryKey: ["fundamentals", ticker], queryFn: ({ signal }) => marketApi.fundamentals(ticker, signal), enabled: Boolean(focus.data) && needsFundamentals, staleTime: 10 * 60_000 });
  const diagnostic = useQuery({ queryKey: ["fundamental-diagnostic", ticker], queryFn: ({ signal }) => marketApi.fundamentalDiagnostic(ticker, signal), enabled: Boolean(focus.data) && section === "fundamentals" && fundamentalView === "diagnostic", staleTime: 10 * 60_000 });
  const peers = useQuery({ queryKey: ["fundamental-peers", ticker, peerSelection], queryFn: ({ signal }) => marketApi.fundamentalPeers(ticker, peerSelection, signal), enabled: Boolean(focus.data) && section === "fundamentals" && fundamentalView === "peers", staleTime: 10 * 60_000 });
  const scenarios = useQuery({ queryKey: ["fundamental-scenarios", ticker, scenarioRequest], queryFn: ({ signal }) => marketApi.fundamentalScenarios(ticker, scenarioRequest, signal), enabled: Boolean(focus.data) && section === "fundamentals" && fundamentalView === "scenarios", staleTime: 10 * 60_000 });
  const documents = useQuery({ queryKey: ["fundamental-documents", ticker, documentQuery], queryFn: ({ signal }) => marketApi.fundamentalDocuments(ticker, documentQuery, signal), enabled: Boolean(focus.data) && section === "fundamentals" && fundamentalView === "documents", staleTime: 10 * 60_000 });
  const capital = useQuery({ queryKey: ["fundamental-capital", ticker], queryFn: ({ signal }) => marketApi.fundamentalCapital(ticker, signal), enabled: Boolean(focus.data) && section === "fundamentals" && fundamentalView === "capital", staleTime: 10 * 60_000 });
  const live = useLiveQuote(ticker, focus.data?.quote);
  const followed = workspace.data.watchlist.includes(ticker);
  async function toggleWatchlist() { await saveWorkspace({ ...workspace.data, watchlist: followed ? workspace.data.watchlist.filter((item) => item !== ticker) : [...workspace.data.watchlist, ticker] }); }
  const refresh = () => { if (section === "overview") void Promise.all([focus.refetch(), news.refetch(), fundamentals.refetch()]); else if (fundamentalView === "diagnostic" && section === "fundamentals") void diagnostic.refetch(); else if (fundamentalView === "peers" && section === "fundamentals") void peers.refetch(); else if (fundamentalView === "scenarios" && section === "fundamentals") void scenarios.refetch(); else if (fundamentalView === "documents" && section === "fundamentals") void documents.refetch(); else if (fundamentalView === "capital" && section === "fundamentals") void capital.refetch(); else if (needsFundamentals) void fundamentals.refetch(); };
  const changeSection = (next: MobileFocusSection) => { if (next === "pro") setPreloadedProTicker(ticker); setSection(next); };
  return <Screen onRefresh={refresh} refreshing={focus.isRefetching || fundamentals.isRefetching || news.isRefetching} testID="stock-detail-screen">
    <QueryState error={!focus.data ? focus.error : null} loading={focus.isLoading} onRetry={() => void focus.refetch()} />
    {focus.data && live.quote ? <>
      <MobileFocusHeader company={company} followed={followed} liveState={live.state} onFollow={() => void toggleWatchlist()} quote={live.quote} />
      <MobileFocusNavigation onChange={changeSection} section={section} />
      <View style={{ alignItems: "flex-end" }}><IntelligenceActions symbol={ticker} /></View>
      <Pressable accessibilityRole="link" onPress={() => router.push("/terminal")} style={styles.terminalLink} testID="focus-open-terminal"><Text style={styles.terminalLinkText}>← Terminal Pro</Text></Pressable>
      {section === "overview" ? <><View style={styles.periods}>{focusPeriods.map((item) => <Pressable key={item.label} onPress={() => setPeriod(item)} style={[styles.period, period.label === item.label && styles.periodActive]}><Text style={[styles.periodText, period.label === item.label && styles.periodTextActive]}>{item.label}</Text></Pressable>)}</View><MobileFocusOverview
        fundamentals={fundamentals.data}
        fundamentalsError={!fundamentals.data ? fundamentals.error : null}
        fundamentalsLoading={fundamentals.isLoading}
        liveState={live.state}
        news={news.data}
        newsError={!news.data ? news.error : null}
        newsLoading={news.isLoading}
        onRetryFundamentals={() => void fundamentals.refetch()}
        period={period}
        snapshot={{ ...focus.data, quote: live.quote }}
        ticker={ticker}
      /></> : null}
      {section === "pro" || preloadedProTicker === ticker ? <View pointerEvents={section === "pro" ? "auto" : "none"} style={section === "pro" ? styles.proVisible : styles.proPreloaded} testID="focus-pro-persistent"><MobileFocusPro key={ticker} onOpenClassic={() => setSection("overview")} ticker={ticker} /></View> : null}
      {section === "fundamentals" ? <>
        <MobileFocusFundamentalTabs view={fundamentalView} onChange={setFundamentalView} />
        {fundamentalView === "diagnostic" ? <MobileFocusDiagnostic diagnostic={diagnostic.data} error={!diagnostic.data ? diagnostic.error : null} loading={diagnostic.isLoading} onRetry={() => void diagnostic.refetch()} /> : null}
        {fundamentalView === "peers" ? <MobileFocusPeers comparison={peers.data} error={!peers.data ? peers.error : null} loading={peers.isLoading} onRetry={() => void peers.refetch()} selection={peerSelection} onSelect={setPeerSelection} /> : null}
        {fundamentalView === "scenarios" ? <MobileFocusScenarios simulation={scenarios.data} error={!scenarios.data ? scenarios.error : null} loading={scenarios.isLoading} onRetry={() => void scenarios.refetch()} onCalculate={setScenarioRequest} /> : null}
        {fundamentalView === "documents" ? <MobileFocusDocuments research={documents.data} error={!documents.data ? documents.error : null} loading={documents.isLoading} onRetry={() => void documents.refetch()} onSearch={setDocumentQuery} /> : null}
        {fundamentalView === "capital" ? <MobileFocusCapital research={capital.data} error={!capital.data ? capital.error : null} loading={capital.isLoading} onRetry={() => void capital.refetch()} /> : null}
        {fundamentalView === "fundamentals" ? <MobileFocusFundamentals error={!fundamentals.data ? fundamentals.error : null} loading={fundamentals.isLoading} onRetry={() => void fundamentals.refetch()} snapshot={fundamentals.data} /> : null}
        {fundamentalView === "financials" ? <MobileFocusFinancials error={!fundamentals.data ? fundamentals.error : null} loading={fundamentals.isLoading} onRetry={() => void fundamentals.refetch()} snapshot={fundamentals.data} /> : null}
        {fundamentalView === "analysts" ? <MobileFocusAnalysts error={!fundamentals.data ? fundamentals.error : null} loading={fundamentals.isLoading} onRetry={() => void fundamentals.refetch()} snapshot={fundamentals.data} /> : null}
      </> : null}


      {section === "ecosystem" ? <MobileFocusEcosystem ticker={ticker} /> : null}
      {section === "insights" ? <MobileFocusInsights snapshot={focus.data} ticker={ticker} /> : null}
      <MobileFocusActions />
    </> : null}
    <Text style={styles.disclaimer}>{pick("Les données peuvent être différées. Information générale seulement; aucune recommandation de placement.", "Data may be delayed. General information only; not investment advice.")}</Text>
  </Screen>;
}
const styles = createThemedStyles((colors) => ({ terminalLink: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, terminalLinkText: { ...typography.label, color: colors.primary }, periods: { flexDirection: "row", gap: spacing.xs }, period: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, periodActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" }, periodText: { ...typography.label, color: colors.textMuted }, periodTextActive: { color: colors.text }, proVisible: { width: "100%" }, proPreloaded: { position: "absolute", top: 0, left: -10_000, width: 1, height: 1, opacity: 0, overflow: "hidden" }, disclaimer: { ...typography.caption, color: colors.textSubtle, textAlign: "center", padding: spacing.lg } }));
