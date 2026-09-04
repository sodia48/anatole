import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, Field, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import { parseSearchCommand } from "@/src/components/search/commandParser";
import { intelligenceApi } from "@/src/lib/api/intelligence";
import { useLocale } from "@/src/lib/i18n";
import { anatoleRoutes } from "@/src/lib/routes";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, spacing, typography } from "@/src/theme/tokens";
const RECENT_KEY = "anatole.mobile.recent-searches.v1";

export default function GlobalSearchScreen() {
  const { pick } = useLocale(); const { workspace } = useMobileAccount(); const [query, setQuery] = useState(""); const [recent, setRecent] = useState<string[]>([]); const command = parseSearchCommand(query);
  useEffect(() => { void AsyncStorage.getItem(RECENT_KEY).then((value) => setRecent(value ? JSON.parse(value) : [])); }, []);
  const results = useQuery({ queryKey: ["symbol-search", query], queryFn: ({ signal }) => intelligenceApi.search(query, signal), enabled: query.trim().length >= 2, staleTime: 30 * 60_000 });
  const remember = async (value: string) => { const next = [value, ...recent.filter((item) => item !== value)].slice(0, 10); setRecent(next); await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)); };
  const runCommand = () => { if (!command) return; void remember(query); router.push({ pathname: command.route, params: command.params } as never); };
  const preferredSectors = workspace.data.preferences?.preferred_sectors ?? [];
  return <Screen testID="global-search-screen"><ScreenHeader eyebrow="COMMAND CENTER" title={pick("Recherche universelle", "Universal search")} subtitle={pick("Titres, ETF, secteurs et commandes déterministes.", "Securities, ETFs, sectors and deterministic commands.")} />{preferredSectors.length ? <View style={styles.suggestions}>{preferredSectors.map((sector) => <Pressable key={sector} onPress={() => setQuery(sector)} style={styles.suggestion}><Text style={styles.meta}>{sector}</Text></Pressable>)}</View> : null}<Field autoFocus label={pick("Rechercher ou commander", "Search or command")} onChangeText={setQuery} placeholder="RY · Royal Bank · RSI < 30 · ETF banques" value={query} />{command ? <Pressable onPress={runCommand} style={styles.result}><Text style={styles.title}>↗ {command.label}</Text><Text style={styles.meta}>{command.route}</Text></Pressable> : null}<QueryState error={!results.data ? results.error : null} loading={results.isLoading} />{results.data?.items.map((item) => <Pressable accessibilityRole="link" key={`${item.instrument_type}-${item.symbol}`} onPress={() => { void remember(item.symbol); router.push(item.instrument_type === "etf" ? ({ pathname: "/etf/[ticker]", params: { ticker: item.symbol } } as never) : anatoleRoutes.focus(item.symbol)); }} style={styles.result}><View style={styles.body}><Text style={styles.title}>{item.symbol} · {item.name}</Text><Text style={styles.meta}>{item.sector} · {item.universe}</Text></View></Pressable>)}{recent.length ? <Card title={pick("Récentes", "Recent")}>{recent.map((item) => <Text accessibilityRole="button" key={item} onPress={() => setQuery(item)} style={styles.recent}>{item}</Text>)}<Button label={pick("Effacer", "Clear")} onPress={() => { setRecent([]); void AsyncStorage.removeItem(RECENT_KEY); }} variant="secondary" /></Card> : null}</Screen>;
}
const styles = StyleSheet.create({ suggestions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, suggestion: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }, result: { minHeight: 56, justifyContent: "center", paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, body: { flex: 1 }, title: { ...typography.body, color: colors.text, fontWeight: "800" }, meta: { ...typography.caption, color: colors.textMuted }, recent: { minHeight: 44, textAlignVertical: "center", ...typography.body, color: colors.primary } });
