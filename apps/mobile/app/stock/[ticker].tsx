import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChartWebView } from "@/src/components/ChartWebView";
import { NewsCard } from "@/src/components/market";
import { Button, Card, Change, QueryState, Screen, ScreenHeader, uiStyles } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const periods = [
  { label: "LIVE", range: "1d", interval: "1m" }, { label: "1S", range: "5d", interval: "5m" },
  { label: "3M", range: "3mo", interval: "1d" }, { label: "6M", range: "6mo", interval: "1d" },
  { label: "1A", range: "1y", interval: "1d" }, { label: "5A", range: "5y", interval: "1wk" },
] as const;
type FocusSection = "chart" | "analysis" | "fundamentals" | "ecosystem";

export default function StockDetailScreen() {
  const params = useLocalSearchParams<{ ticker: string }>();
  const ticker = normalizeTicker(String(params.ticker ?? "RY"));
  const { language, pick } = useLocale();
  const { workspace, saveWorkspace } = useMobileAccount();
  const [period, setPeriod] = useState<(typeof periods)[number]>(periods[4]);
  const [section, setSection] = useState<FocusSection>("chart");
  const focus = useQuery({
    queryKey: ["focus", ticker, period.range, period.interval],
    queryFn: () => marketApi.focus(ticker, period.range, period.interval),
    refetchInterval: period.label === "LIVE" ? 15_000 : false,
  });
  const company = focus.data?.profile.name ?? ticker;
  const news = useQuery({ queryKey: ["stock-news", ticker, language], queryFn: () => marketApi.stockNews(ticker, company, language), enabled: Boolean(focus.data), staleTime: 300_000 });
  const followed = workspace.data.watchlist.includes(ticker);
  const performance = useMemo(() => {
    const rows = focus.data?.history ?? [];
    const first = rows[0]?.close; const last = rows.at(-1)?.close;
    return first && last ? ((last - first) / first) * 100 : null;
  }, [focus.data]);
  const technicals = Object.entries(focus.data?.technicals ?? {}).filter(([, value]) => typeof value === "string" || typeof value === "number").slice(0, 8);
  const sections: { id: FocusSection; fr: string; en: string }[] = [
    { id: "chart", fr: "Graphique", en: "Chart" }, { id: "analysis", fr: "Analyse", en: "Analysis" },
    { id: "fundamentals", fr: "Fondamentaux", en: "Fundamentals" }, { id: "ecosystem", fr: "Écosystème", en: "Ecosystem" },
  ];

  async function toggleWatchlist() {
    await saveWorkspace({ ...workspace.data, watchlist: followed ? workspace.data.watchlist.filter((item) => item !== ticker) : [...workspace.data.watchlist, ticker] });
  }

  return (
    <Screen refreshing={focus.isRefetching || news.isRefetching} onRefresh={() => void Promise.all([focus.refetch(), news.refetch()])} testID="stock-detail-screen">
      <ScreenHeader eyebrow="Focus mobile" title={ticker} subtitle={company} action={<Pressable accessibilityRole="button" onPress={() => void toggleWatchlist()} style={[styles.follow, followed && styles.followed]}><Text style={styles.followText}>{followed ? pick("★ Suivi", "★ Following") : pick("☆ Suivre", "☆ Follow")}</Text></Pressable>} />
      <QueryState loading={focus.isLoading} error={!focus.data ? focus.error : null} onRetry={() => void focus.refetch()} />
      {focus.data ? (
        <>
          <Card>
            <View style={uiStyles.row}><View><Text style={styles.price}>{focus.data.quote.price.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {focus.data.quote.currency}</Text><Text style={styles.meta}>{focus.data.quote.delayed ? pick("Donnée potentiellement différée", "Potentially delayed data") : pick("Donnée en temps réel", "Real-time data")}</Text></View><Change value={focus.data.quote.change_percent} /></View>
          </Card>
          <View style={styles.sections}>{sections.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} key={item.id} onPress={() => setSection(item.id)} style={[styles.section, section === item.id && styles.sectionActive]}><Text style={[styles.sectionText, section === item.id && styles.sectionTextActive]}>{pick(item.fr, item.en)}</Text></Pressable>)}</View>
          {section === "chart" ? <Card testID="focus-chart-section"><View style={styles.periods}>{periods.map((item) => <Pressable key={item.label} onPress={() => setPeriod(item)} style={[styles.period, item.label === period.label && styles.periodActive]}><Text style={[styles.periodText, item.label === period.label && styles.periodTextActive]}>{item.label}</Text></Pressable>)}</View>{performance !== null ? <View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Variation", "Change")} {period.label}</Text><Change value={performance} /></View> : null}<ChartWebView candles={focus.data.history} label={`${ticker} ${period.label}`} ticker={ticker} timeframe={`${period.range}:${period.interval}`} /></Card> : null}
          {section === "analysis" ? <Card title={pick("Indicateurs disponibles", "Available indicators")} testID="focus-analysis-section">{technicals.length ? technicals.map(([key, value]) => <View key={key} style={uiStyles.row}><Text style={uiStyles.label}>{key.replaceAll("_", " ")}</Text><Text style={styles.metric}>{String(value)}</Text></View>) : <Text style={styles.meta}>{pick("Aucun indicateur n’est disponible pour ce titre.", "No indicator is available for this security.")}</Text>}</Card> : null}
          {section === "fundamentals" ? <Card title={pick("Données clés", "Key data")} testID="focus-fundamentals-section"><View style={uiStyles.row}><Text style={uiStyles.label}>Volume</Text><Text style={styles.metric}>{focus.data.quote.volume.toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Secteur", "Sector")}</Text><Text style={styles.metric}>{focus.data.profile.sector ?? "—"}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Plus haut", "Day high")}</Text><Text style={styles.metric}>{focus.data.quote.day_high.toFixed(2)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Plus bas", "Day low")}</Text><Text style={styles.metric}>{focus.data.quote.day_low.toFixed(2)}</Text></View></Card> : null}
          {section === "ecosystem" ? <Card title={pick("Écosystème d’entreprise", "Company ecosystem")} testID="focus-ecosystem-section"><Text style={styles.meta}>{pick("Cette section native est préparée pour une prochaine étape. Aucune relation n’est déduite ou inventée.", "This native section is prepared for a later phase. No relationship is inferred or fabricated.")}</Text></Card> : null}
          <View style={styles.actions}><View style={{ flex: 1 }}><Button label={pick("Créer une alerte", "Create alert")} variant="secondary" onPress={() => router.push("/alerts")} /></View><View style={{ flex: 1 }}><Button label={pick("Portefeuille", "Portfolio")} variant="secondary" onPress={() => router.push("/(tabs)/portfolio")} /></View></View>
        </>
      ) : null}
      <Card title={pick("Dernières nouvelles", "Latest news")}><QueryState loading={news.isLoading} error={!news.data ? news.error : null} empty={Boolean(news.data && news.data.items.length === 0)} onRetry={() => void news.refetch()} />{news.data?.items.slice(0, 10).map((item) => <NewsCard key={item.id} item={item} />)}</Card>
      <Text style={styles.disclaimer}>{pick("Les données peuvent être différées. Information générale seulement; aucune recommandation de placement.", "Data may be delayed. General information only; not investment advice.")}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  follow: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong }, followed: { backgroundColor: "rgba(44,156,255,0.18)" }, followText: { ...typography.label, color: colors.text },
  price: { ...typography.hero, color: colors.text }, meta: { ...typography.caption, color: colors.textMuted },
  sections: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, section: { minHeight: 44, flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }, sectionActive: { backgroundColor: "rgba(44,156,255,0.2)", borderColor: colors.primary }, sectionText: { ...typography.caption, color: colors.textMuted }, sectionTextActive: { color: colors.text, fontWeight: "800" },
  periods: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, period: { minWidth: 46, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, periodActive: { backgroundColor: colors.primary }, periodText: { ...typography.label, color: colors.textMuted }, periodTextActive: { color: colors.text },
  actions: { flexDirection: "row", gap: spacing.sm }, metric: { ...typography.body, color: colors.text, fontWeight: "700" }, disclaimer: { ...typography.caption, color: colors.textSubtle, textAlign: "center", padding: spacing.lg },
});
