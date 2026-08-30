import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StockRow } from "@/src/components/market";
import { Card, Field, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const hubs = [
  { id: "cockpit", fr: "Cockpit", en: "Cockpit" }, { id: "screener", fr: "Screener", en: "Screener" },
  { id: "etf", fr: "ETF", en: "ETF" }, { id: "institutions", fr: "Institutions", en: "Institutions" },
  { id: "ipo", fr: "IPO & initiés", en: "IPOs & insiders" }, { id: "news", fr: "Actualités", en: "News" },
  { id: "calendar", fr: "Calendrier", en: "Calendar" },
] as const;

export default function MarketsScreen() {
  const { pick } = useLocale();
  const [universe, setUniverse] = useState<"tsx60" | "composite">("tsx60");
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["cockpit", universe], queryFn: () => marketApi.cockpit(universe) });
  const rows = useMemo(() => (query.data?.constituents ?? [])
    .filter((item) => `${item.ticker} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 25), [query.data, search]);

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} testID="markets-screen">
      <ScreenHeader eyebrow="Cockpit" title={pick("Marchés canadiens", "Canadian markets")} subtitle={pick("Largeur, secteurs et leaders du TSX.", "TSX breadth, sectors and leaders.")} />
      <Card title={pick("Explorer", "Explore")}>
        <View style={styles.hubs}>
          {hubs.map((hub) => (
            <Pressable
              accessibilityRole="button"
              key={hub.id}
              onPress={() => { if (hub.id === "news") router.push("/(tabs)/today"); }}
              style={[styles.hub, hub.id === "cockpit" && styles.hubActive]}
            >
              <Text style={[styles.hubText, hub.id === "cockpit" && styles.hubTextActive]}>{pick(hub.fr, hub.en)}</Text>
              <Text style={styles.phase}>{hub.id === "cockpit" ? pick("Actif", "Live") : pick("Prochaine étape", "Next phase")}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <View style={styles.segment}>
        {(["tsx60", "composite"] as const).map((value) => (
          <Pressable key={value} onPress={() => setUniverse(value)} style={[styles.segmentButton, universe === value && styles.segmentActive]}>
            <Text style={[styles.segmentText, universe === value && styles.segmentTextActive]}>{value === "tsx60" ? "TSX 60" : "TSX Composite"}</Text>
          </Pressable>
        ))}
      </View>
      <QueryState loading={query.isLoading} error={!query.data ? query.error : null} onRetry={() => void query.refetch()} />
      {query.data ? (
        <>
          <Card title={pick("Carte sectorielle", "Sector map")} testID="cockpit-sector-map">
            <View style={styles.heatmap}>{query.data.sectors.map((sector) => <View key={sector.sector} style={[styles.sector, { backgroundColor: sector.change_percent >= 0 ? "rgba(0,215,173,0.16)" : "rgba(255,54,95,0.16)", borderColor: sector.change_percent >= 0 ? colors.positive : colors.negative }]}><Text numberOfLines={1} style={styles.sectorName}>{sector.sector}</Text><Text style={[styles.sectorChange, { color: sector.change_percent >= 0 ? colors.positive : colors.negative }]}>{sector.change_percent >= 0 ? "+" : ""}{sector.change_percent.toFixed(2)} %</Text></View>)}</View>
          </Card>
          <Card title={pick("Leaders", "Leaders")}>
            <Text style={styles.subhead}>{pick("Hausses", "Gainers")}</Text>
            {query.data.top_gainers.slice(0, 5).map((item) => <StockRow key={item.ticker} quote={item} />)}
            <Text style={styles.subhead}>{pick("Baisses", "Losers")}</Text>
            {query.data.top_losers.slice(0, 5).map((item) => <StockRow key={item.ticker} quote={item} />)}
          </Card>
          <Card title={pick("Composants", "Constituents")}>
            <Field label={pick("Filtrer", "Filter")} placeholder={pick("RY, banque, énergie…", "RY, bank, energy…")} value={search} onChangeText={setSearch} autoCapitalize="characters" />
            {rows.map((item) => <StockRow key={item.ticker} quote={item} />)}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hubs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  hub: { minHeight: 48, minWidth: "47%", flexGrow: 1, justifyContent: "center", gap: 2, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  hubActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,0.16)" },
  hubText: { ...typography.label, color: colors.textMuted }, hubTextActive: { color: colors.text }, phase: { ...typography.caption, color: colors.textSubtle },
  segment: { flexDirection: "row", padding: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, segmentActive: { backgroundColor: "#12588b" },
  segmentText: { ...typography.label, color: colors.textMuted }, segmentTextActive: { color: colors.text }, heatmap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sector: { width: "48%", minHeight: 76, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, justifyContent: "space-between" }, sectorName: { ...typography.label, color: colors.text }, sectorChange: { ...typography.section },
  subhead: { ...typography.label, color: colors.primary, marginTop: spacing.sm, textTransform: "uppercase", letterSpacing: 1 },
});
