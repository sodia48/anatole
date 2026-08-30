import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NewsCard, StockRow } from "@/src/components/market";
import { Card, Change, QueryState, Screen, ScreenHeader, uiStyles } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import { workspaceApi } from "@/src/lib/api/workspace";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export default function TodayScreen() {
  const { language, t, pick } = useLocale();
  const { user, workspace } = useMobileAccount();
  const cockpit = useQuery({ queryKey: ["cockpit", "tsx60"], queryFn: () => marketApi.cockpit("tsx60") });
  const news = useQuery({ queryKey: ["news", language], queryFn: () => marketApi.news(language) });
  const earnings = useQuery({ queryKey: ["earnings", "composite"], queryFn: marketApi.earnings });
  const calendar = useQuery({ queryKey: ["calendar", language], queryFn: () => marketApi.calendar(language) });
  const watchlist = useQuery({ queryKey: ["watchlist", workspace.data.watchlist], queryFn: () => marketApi.watchlist(workspace.data.watchlist), enabled: workspace.data.watchlist.length > 0 });
  const alerts = useQuery({ queryKey: ["alerts", workspace.data.alerts], queryFn: () => workspaceApi.alerts(workspace.data.alerts), enabled: workspace.data.alerts.length > 0 });
  const queries = [cockpit, news, earnings, calendar, watchlist, alerts];
  const refreshing = queries.some((query) => query.isRefetching);
  const hasStaleError = queries.some((query) => query.isError && query.data);
  const refresh = () => void Promise.all(queries.map((query) => query.refetch()));
  const upcomingEarnings = (earnings.data?.events ?? []).filter((item) => new Date(item.starts_at) >= new Date()).slice(0, 4);
  const upcomingCalendar = (calendar.data?.events ?? []).filter((item) => new Date(item.starts_at) >= new Date()).slice(0, 4);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} testID="today-screen">
      <ScreenHeader eyebrow="Anatole" title={`${t("greeting")}${user?.display_name ? `, ${user.display_name}` : ""}`} subtitle={pick("Le marché canadien, en un coup d’œil.", "The Canadian market at a glance.")} />
      {hasStaleError ? <Text style={styles.offline}>{t("offline")}</Text> : null}
      <Card title={t("marketPulse")} testID="market-pulse">
        <QueryState loading={cockpit.isLoading} error={!cockpit.data ? cockpit.error : null} onRetry={() => void cockpit.refetch()} />
        {cockpit.data ? <><View style={uiStyles.row}><View><Text style={styles.pulseLabel}>S&P/TSX 60</Text><Text style={styles.pulseValue}>{cockpit.data.breadth.advancers} ↑ · {cockpit.data.breadth.decliners} ↓</Text></View><Change value={cockpit.data.weighted_change_percent} /></View><View style={styles.breadth}><View style={[styles.advance, { flex: Math.max(cockpit.data.breadth.advancers, 1) }]} /><View style={[styles.decline, { flex: Math.max(cockpit.data.breadth.decliners, 1) }]} /></View></> : null}
      </Card>

      <Card title={t("watchlist")} action={<Pressable onPress={() => router.push("/watchlist")}><Text style={styles.link}>{t("seeAll")}</Text></Pressable>}>
        {workspace.data.watchlist.length === 0 ? <Text style={styles.muted}>{pick("Ajoutez vos premiers titres pour les suivre ici.", "Add your first securities to track them here.")}</Text> : null}
        <QueryState loading={watchlist.isLoading} error={!watchlist.data ? watchlist.error : null} onRetry={() => void watchlist.refetch()} />
        {watchlist.data?.items.slice(0, 4).map((item) => <StockRow key={item.ticker} quote={item} />)}
      </Card>

      <Card title={pick("Alertes récentes", "Recent alerts")} action={<Pressable onPress={() => router.push("/alerts")}><Text style={styles.link}>{t("seeAll")}</Text></Pressable>}>
        {workspace.data.alerts.length === 0 ? <Text style={styles.muted}>{pick("Aucune alerte configurée.", "No alerts configured.")}</Text> : null}
        <QueryState loading={alerts.isLoading} error={!alerts.data ? alerts.error : null} onRetry={() => void alerts.refetch()} />
        {alerts.data?.items.slice(0, 3).map((item) => <View key={item.id} style={styles.event}><View style={{ flex: 1 }}><Text style={styles.eventTitle}>{item.symbol}</Text><Text style={styles.muted}>{item.message}</Text></View><View style={[styles.importance, item.triggered && styles.importanceHigh]}><Text style={styles.importanceText}>{item.triggered ? pick("Déclenchée", "Triggered") : pick("Surveillée", "Watching")}</Text></View></View>)}
      </Card>

      <Card title={t("gainers")}>
        {cockpit.data?.top_gainers.slice(0, 3).map((item) => <StockRow key={item.ticker} quote={item} />)}
      </Card>
      <Card title={t("losers")}>
        {cockpit.data?.top_losers.slice(0, 3).map((item) => <StockRow key={item.ticker} quote={item} />)}
      </Card>

      <Card title={t("earnings")}>
        <QueryState loading={earnings.isLoading} error={!earnings.data ? earnings.error : null} empty={Boolean(earnings.data && upcomingEarnings.length === 0)} onRetry={() => void earnings.refetch()} />
        {upcomingEarnings.map((item) => <Pressable key={`${item.ticker}-${item.starts_at}`} onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: item.ticker } })} style={styles.event}><View><Text style={styles.eventTitle}>{item.ticker} · {item.company}</Text><Text style={styles.muted}>{new Date(item.starts_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}</Text></View><Text style={styles.eventMetric}>EPS {item.eps_estimate?.toFixed(2) ?? "—"}</Text></Pressable>)}
      </Card>

      <Card title={t("calendar")}>
        <QueryState loading={calendar.isLoading} error={!calendar.data ? calendar.error : null} empty={Boolean(calendar.data && upcomingCalendar.length === 0)} onRetry={() => void calendar.refetch()} />
        {upcomingCalendar.map((item) => <View key={item.id} style={styles.event}><View style={{ flex: 1 }}><Text style={styles.eventTitle}>{item.title}</Text><Text style={styles.muted}>{item.category} · {new Date(item.starts_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}</Text></View><View style={[styles.importance, item.importance === "high" && styles.importanceHigh]}><Text style={styles.importanceText}>{item.importance}</Text></View></View>)}
      </Card>

      <Card title={t("news")}>
        <QueryState loading={news.isLoading} error={!news.data ? news.error : null} empty={Boolean(news.data && news.data.items.length === 0)} onRetry={() => void news.refetch()} />
        {news.data?.items.slice(0, 5).map((item) => <NewsCard key={item.id} item={item} />)}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  offline: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: "rgba(246,185,74,0.1)" },
  pulseLabel: { ...typography.label, color: colors.textMuted }, pulseValue: { ...typography.section, color: colors.text },
  breadth: { height: 5, flexDirection: "row", overflow: "hidden", borderRadius: radius.pill }, advance: { backgroundColor: colors.positive }, decline: { backgroundColor: colors.negative },
  link: { ...typography.label, color: colors.primary }, muted: { ...typography.caption, color: colors.textMuted },
  event: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  eventTitle: { ...typography.body, color: colors.text, fontWeight: "700" }, eventMetric: { ...typography.label, color: colors.cyan },
  importance: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, importanceHigh: { backgroundColor: "rgba(255,54,95,0.18)" }, importanceText: { ...typography.caption, color: colors.textMuted },
});
