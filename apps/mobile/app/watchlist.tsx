import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StockRow } from "@/src/components/market";
import { Button, Card, Field, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import { normalizeTicker } from "@/src/lib/ticker";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function WatchlistScreen() {
  const { state, workspace, saveWorkspace } = useMobileAccount();
  const { pick } = useLocale();
  const [symbol, setSymbol] = useState("");
  const tickers = workspace.data.watchlist;
  const query = useQuery({ queryKey: ["watchlist", tickers], queryFn: () => marketApi.watchlist(tickers), enabled: tickers.length > 0 });
  async function add() { const clean = normalizeTicker(symbol); if (!clean || tickers.includes(clean)) return; await saveWorkspace({ ...workspace.data, watchlist: [...tickers, clean] }); setSymbol(""); }
  async function remove(target: string) { await saveWorkspace({ ...workspace.data, watchlist: tickers.filter((item) => item !== target) }); }
  return <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} testID="watchlist-screen"><ScreenHeader eyebrow={pick("Espace", "Workspace")} title="Watchlist" subtitle={pick("Même liste sur mobile et sur le web après connexion.", "The same list on mobile and web after sign-in.")} />{state !== "authenticated" ? <Card><Text style={styles.muted}>{pick("Les changements restent dans cette session découverte. Connectez-vous pour les synchroniser.", "Changes stay in this discovery session. Sign in to sync them.")}</Text><Button label={pick("Se connecter", "Sign in")} onPress={() => router.push("/(auth)/login")} /></Card> : null}<Card title={pick("Ajouter un titre", "Add a security")}><View style={styles.addRow}><View style={{ flex: 1 }}><Field label={pick("Symbole", "Symbol")} placeholder="CNR" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" onSubmitEditing={() => void add()} /></View><View style={styles.addButton}><Button label={pick("Ajouter", "Add")} onPress={() => void add()} disabled={!symbol.trim()} /></View></View></Card>{tickers.length === 0 ? <Card><Text style={styles.empty}>{pick("Aucun titre suivi.", "No security followed.")}</Text></Card> : null}<QueryState loading={query.isLoading} error={!query.data ? query.error : null} onRetry={() => void query.refetch()} />{query.data ? <Card title={`${query.data.items.length} ${pick("titres", "securities")}`}>{query.data.items.map((item) => <View key={item.ticker} style={styles.item}><View style={{ flex: 1 }}><StockRow quote={item} /></View><Pressable accessibilityRole="button" accessibilityLabel={`${pick("Retirer", "Remove")} ${item.ticker}`} onPress={() => void remove(normalizeTicker(item.ticker))}><Text style={styles.remove}>×</Text></Pressable></View>)}</Card> : null}</Screen>;
}
const styles = StyleSheet.create({ muted: { ...typography.body, color: colors.textMuted }, addRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }, addButton: { minWidth: 96, paddingBottom: 1 }, empty: { ...typography.body, color: colors.textMuted, textAlign: "center", padding: spacing.xl }, item: { flexDirection: "row", alignItems: "center" }, remove: { color: colors.negative, fontSize: 26, paddingHorizontal: spacing.sm } });
