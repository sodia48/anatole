import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MarketHeatmap } from "@/src/components/cockpit/MarketHeatmap";
import { NewsCard, StockRow } from "@/src/components/market";
import { Card, Change, Field, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { MarketTile } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const hubs = [
  { id: "cockpit", fr: "Cockpit", en: "Cockpit" },
  { id: "screener", fr: "Screener", en: "Screener" },
  { id: "etf", fr: "ETF", en: "ETF" },
  { id: "institutions", fr: "Institutions", en: "Institutions" },
  { id: "ipo", fr: "IPO & initiés", en: "IPOs & insiders" },
  { id: "news", fr: "Actualités", en: "News" },
  { id: "calendar", fr: "Calendrier", en: "Calendar" },
] as const;
type Hub = (typeof hubs)[number]["id"];

function ConstituentsModal({ visible, onClose, items }: { visible: boolean; onClose: () => void; items: MarketTile[] }) {
  const { pick } = useLocale();
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const sectors = useMemo(() => [...new Set(items.map((item) => item.sector).filter(Boolean))].sort(), [items]);
  const rows = useMemo(() => items
    .filter((item) => sector === "all" || item.sector === sector)
    .filter((item) => `${item.ticker} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) => right.weight - left.weight), [items, search, sector]);
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.listSafe}>
        <View style={styles.listHeader}><Text style={styles.listTitle}>{pick("Constituants", "Constituents")}</Text><Pressable onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
        <View style={styles.filters}>
          <Field autoCapitalize="characters" label={pick("Rechercher", "Search")} onChangeText={setSearch} placeholder="RY, SHOP, énergie…" value={search} />
          <FlatList horizontal data={["all", ...sectors]} keyExtractor={(item) => item} renderItem={({ item }) => <Pressable onPress={() => setSector(item)} style={[styles.filter, sector === item && styles.filterActive]}><Text style={styles.filterText}>{item === "all" ? pick("Tous", "All") : item}</Text></Pressable>} showsHorizontalScrollIndicator={false} />
        </View>
        <FlatList contentContainerStyle={styles.listContent} data={rows} initialNumToRender={14} keyExtractor={(item) => item.ticker} maxToRenderPerBatch={18} removeClippedSubviews renderItem={({ item }) => <StockRow quote={item} />} windowSize={7} />
      </SafeAreaView>
    </Modal>
  );
}

export default function MarketsScreen() {
  const { language, pick } = useLocale();
  const { workspace, saveWorkspace } = useMobileAccount();
  const [hub, setHub] = useState<Hub>("cockpit");
  const [universe, setUniverse] = useState<"tsx60" | "composite">("tsx60");
  const [constituentsOpen, setConstituentsOpen] = useState(false);
  const cockpit = useQuery({ queryKey: ["cockpit", universe], queryFn: () => marketApi.cockpit(universe), staleTime: 20_000 });
  const news = useQuery({ queryKey: ["news", language], queryFn: () => marketApi.news(language), enabled: hub === "news", staleTime: 300_000 });
  const calendar = useQuery({ queryKey: ["calendar", language], queryFn: () => marketApi.calendar(language), enabled: hub === "calendar", staleTime: 300_000 });

  async function addWatchlist(ticker: string) {
    if (workspace.data.watchlist.includes(ticker)) return;
    await saveWorkspace({ ...workspace.data, watchlist: [...workspace.data.watchlist, ticker] });
  }

  const refreshing = hub === "cockpit" ? cockpit.isRefetching : hub === "news" ? news.isRefetching : calendar.isRefetching;
  const refresh = () => void (hub === "cockpit" ? cockpit.refetch() : hub === "news" ? news.refetch() : calendar.refetch());
  const unavailable = !["cockpit", "news", "calendar"].includes(hub);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} testID="markets-screen">
      <ScreenHeader eyebrow={pick("Marchés", "Markets")} title={pick("Marchés canadiens", "Canadian markets")} subtitle={pick("La même donnée et les mêmes calculs que le Cockpit web.", "The same data and calculations as the web Cockpit.")} />
      <View style={styles.hubs}>
        {hubs.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: hub === item.id }} key={item.id} onPress={() => item.id === "etf" ? router.push("/etf" as Href) : item.id === "ipo" ? router.push("/ipo-insiders" as Href) : setHub(item.id)} style={[styles.hub, hub === item.id && styles.hubActive]}><Text style={[styles.hubText, hub === item.id && styles.hubTextActive]}>{pick(item.fr, item.en)}</Text></Pressable>)}
      </View>

      {hub === "cockpit" ? <>
        <View style={styles.segment}>{(["tsx60", "composite"] as const).map((value) => <Pressable key={value} onPress={() => setUniverse(value)} style={[styles.segmentButton, universe === value && styles.segmentActive]}><Text style={[styles.segmentText, universe === value && styles.segmentTextActive]}>{value === "tsx60" ? "TSX 60" : "TSX Composite"}</Text></Pressable>)}</View>
        <QueryState error={!cockpit.data ? cockpit.error : null} loading={cockpit.isLoading} onRetry={() => void cockpit.refetch()} />
        {cockpit.data ? <>
          <Card action={<Pressable onPress={() => setConstituentsOpen(true)} style={styles.link}><Text style={styles.linkText}>{pick("Voir les constituants", "View constituents")}</Text></Pressable>} title={pick("Carte du marché", "Market map")} testID="cockpit-heatmap">
            <MarketHeatmap
              onAlert={() => router.push("/alerts")}
              onOpen={(ticker) => router.push({ pathname: "/focus/[ticker]", params: { ticker } })}
              onWatchlist={(ticker) => void addWatchlist(ticker)}
              tiles={cockpit.data.constituents}
            />
          </Card>
          <Card title={pick("Largeur du marché", "Market breadth")}>
            <View style={styles.breadth}><View><Text style={styles.breadthValue}>{cockpit.data.breadth.advancers}</Text><Text style={styles.positive}>{pick("Hausses", "Advancers")}</Text></View><View><Text style={styles.breadthValue}>{cockpit.data.breadth.unchanged}</Text><Text style={styles.neutral}>{pick("Inchangés", "Unchanged")}</Text></View><View><Text style={styles.breadthValue}>{cockpit.data.breadth.decliners}</Text><Text style={styles.negative}>{pick("Baisses", "Decliners")}</Text></View><Change value={cockpit.data.weighted_change_percent} /></View>
          </Card>
          <Card title={pick("Leaders", "Movers")}><Text style={styles.subhead}>{pick("Principales hausses", "Top gainers")}</Text>{cockpit.data.top_gainers.slice(0, 5).map((item) => <StockRow key={item.ticker} quote={item} />)}<Text style={styles.subhead}>{pick("Principales baisses", "Top losers")}</Text>{cockpit.data.top_losers.slice(0, 5).map((item) => <StockRow key={item.ticker} quote={item} />)}</Card>
          <ConstituentsModal items={cockpit.data.constituents} onClose={() => setConstituentsOpen(false)} visible={constituentsOpen} />
        </> : null}
      </> : null}

      {hub === "news" ? <Card title={pick("Actualités de marché", "Market news")}><QueryState empty={Boolean(news.data && news.data.items.length === 0)} error={!news.data ? news.error : null} loading={news.isLoading} onRetry={() => void news.refetch()} />{news.data?.items.slice(0, 20).map((item) => <NewsCard item={item} key={item.id} />)}</Card> : null}
      {hub === "calendar" ? <Card title={pick("Calendrier économique", "Economic calendar")}><QueryState empty={Boolean(calendar.data && calendar.data.events.length === 0)} error={!calendar.data ? calendar.error : null} loading={calendar.isLoading} onRetry={() => void calendar.refetch()} />{calendar.data?.events.slice(0, 30).map((event) => <View key={event.id} style={styles.event}><View><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{event.category} · {event.country}</Text></View><Text style={styles.eventDate}>{new Date(event.starts_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" })}</Text></View>)}</Card> : null}
      {unavailable ? <Card title={hubs.find((item) => item.id === hub)?.[language] ?? hub}><Text style={styles.coming}>{pick("Bientôt sur mobile. La migration utilisera le même backend que le web.", "Coming soon to mobile. The migration will use the same backend as the web.")}</Text></Card> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hubs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, hub: { minHeight: 44, flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised }, hubActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, hubText: { ...typography.caption, color: colors.textMuted, textAlign: "center" }, hubTextActive: { color: colors.text, fontWeight: "800" },
  segment: { flexDirection: "row", padding: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, segmentActive: { backgroundColor: "#12588b" }, segmentText: { ...typography.label, color: colors.textMuted }, segmentTextActive: { color: colors.text },
  link: { minHeight: 44, justifyContent: "center" }, linkText: { ...typography.caption, color: colors.primary, fontWeight: "800" },
  breadth: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.md }, breadthValue: { ...typography.section, color: colors.text }, positive: { ...typography.caption, color: colors.positive }, negative: { ...typography.caption, color: colors.negative }, neutral: { ...typography.caption, color: colors.textMuted }, subhead: { ...typography.label, color: colors.primary, marginTop: spacing.sm, textTransform: "uppercase" },
  event: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, eventTitle: { ...typography.body, color: colors.text, fontWeight: "700" }, eventMeta: { ...typography.caption, color: colors.textMuted }, eventDate: { ...typography.caption, color: colors.primary, maxWidth: "40%", textAlign: "right" }, coming: { ...typography.body, color: colors.textMuted },
  listSafe: { flex: 1, backgroundColor: colors.background }, listHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, listTitle: { ...typography.title, color: colors.text }, close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 30, color: colors.text }, filters: { gap: spacing.sm, padding: spacing.lg }, filter: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md, marginRight: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }, filterActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, filterText: { ...typography.caption, color: colors.text }, listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
