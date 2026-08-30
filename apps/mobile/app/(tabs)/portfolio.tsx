import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, Change, Field, QueryState, Screen, ScreenHeader, uiStyles } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { workspaceApi } from "@/src/lib/api/workspace";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export default function PortfolioScreen() {
  const { state, workspace, saveWorkspace } = useMobileAccount();
  const { language, pick } = useLocale();
  const [symbol, setSymbol] = useState(""); const [quantity, setQuantity] = useState(""); const [cost, setCost] = useState(""); const [saving, setSaving] = useState(false);
  const positions = workspace.data.portfolio;
  const query = useQuery({ queryKey: ["portfolio", positions], queryFn: () => workspaceApi.portfolio(positions), enabled: positions.length > 0 });
  const locale = language === "fr" ? "fr-CA" : "en-CA";
  const money = (value: number) => value.toLocaleString(locale, { style: "currency", currency: "CAD" });

  async function add() {
    const next = { symbol: normalizeTicker(symbol), quantity: Number(quantity), average_cost: Number(cost) };
    if (!next.symbol || next.quantity <= 0 || next.average_cost < 0) return;
    setSaving(true);
    try {
      await saveWorkspace({ ...workspace.data, portfolio: [...positions.filter((item) => item.symbol !== next.symbol), next] });
      setSymbol(""); setQuantity(""); setCost("");
    } finally { setSaving(false); }
  }
  async function remove(target: string) { await saveWorkspace({ ...workspace.data, portfolio: positions.filter((item) => item.symbol !== target) }); }

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} testID="portfolio-screen">
      <ScreenHeader eyebrow={pick("Espace", "Workspace")} title={pick("Portefeuille", "Portfolio")} subtitle={pick("Positions synchronisées avec votre compte Anatole.", "Positions synced with your Anatole account.")} />
      {state !== "authenticated" ? <Card><Text style={styles.muted}>{pick("Connectez-vous pour conserver et synchroniser ce portefeuille.", "Sign in to save and sync this portfolio.")}</Text><Button label={pick("Se connecter", "Sign in")} onPress={() => router.push("/(auth)/login")} /></Card> : null}
      <Card title={pick("Ajouter une position", "Add a position")}>
        <Field label={pick("Symbole", "Symbol")} value={symbol} onChangeText={setSymbol} autoCapitalize="characters" placeholder="RY" />
        <View style={styles.fields}><View style={{ flex: 1 }}><Field label={pick("Quantité", "Quantity")} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><Field label={pick("Coût moyen", "Average cost")} value={cost} onChangeText={setCost} keyboardType="decimal-pad" /></View></View>
        <Button label={pick("Ajouter", "Add")} onPress={() => void add()} disabled={saving || !symbol || !quantity || !cost} />
      </Card>
      {positions.length === 0 ? <Card><Text style={styles.empty}>{pick("Votre portefeuille est vide. Ajoutez une position pour calculer valeur, rendement et risque.", "Your portfolio is empty. Add a position to calculate value, return and risk.")}</Text></Card> : null}
      <QueryState loading={query.isLoading} error={!query.data ? query.error : null} onRetry={() => void query.refetch()} />
      {query.data ? (
        <>
          <Card title={pick("Valeur", "Value")} testID="portfolio-value"><View style={uiStyles.row}><View><Text style={uiStyles.label}>{pick("Valeur totale", "Total value")}</Text><Text style={uiStyles.value}>{money(query.data.total_market_value)}</Text></View><Change value={query.data.total_day_change_percent} /></View><Text style={styles.muted}>{pick("P/L latent", "Unrealized P/L")} {money(query.data.total_unrealized_pnl)}</Text></Card>
          <Card title={pick("Allocation sectorielle", "Sector allocation")} testID="portfolio-allocation">{query.data.sector_allocation.map((item) => <View key={item.key} style={styles.allocation}><View style={uiStyles.row}><Text style={styles.allocationLabel}>{item.label}</Text><Text style={styles.allocationValue}>{item.weight_percent.toFixed(1)} %</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(Math.max(item.weight_percent, 0), 100)}%` }]} /></View></View>)}</Card>
          <Card title={pick("Positions", "Positions")}>{query.data.positions.map((item) => <View key={item.symbol} style={styles.position}><Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: "/focus/[ticker]", params: { ticker: item.symbol } })}><Text style={styles.positionTitle}>{item.symbol} · {item.name}</Text><Text style={styles.muted}>{item.quantity} {pick("titres", "shares")} · {money(item.market_value)}</Text></Pressable><View style={{ alignItems: "flex-end", gap: 6 }}><Change value={item.unrealized_pnl_percent} /><Pressable accessibilityRole="button" accessibilityLabel={`${pick("Retirer", "Remove")} ${item.symbol}`} onPress={() => void remove(item.symbol)}><Text style={styles.remove}>{pick("Retirer", "Remove")}</Text></Pressable></View></View>)}</Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { ...typography.body, color: colors.textMuted }, fields: { flexDirection: "row", gap: spacing.md }, empty: { ...typography.body, color: colors.textMuted, textAlign: "center", padding: spacing.lg },
  allocation: { gap: spacing.xs }, allocationLabel: { ...typography.body, color: colors.text }, allocationValue: { ...typography.label, color: colors.cyan }, track: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  position: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, positionTitle: { ...typography.body, color: colors.text, fontWeight: "700" }, remove: { ...typography.caption, color: colors.negative },
});
