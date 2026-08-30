import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, Field, Screen, ScreenHeader } from "@/src/components/ui";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function FocusHubScreen() {
  const [ticker, setTicker] = useState("");
  const { workspace } = useMobileAccount();
  const { pick } = useLocale();
  const open = (value: string) => { const clean = normalizeTicker(value); if (clean) router.push({ pathname: "/focus/[ticker]", params: { ticker: clean } }); };
  return <Screen testID="focus-screen"><ScreenHeader eyebrow="Focus" title={pick("Analyse d’un titre", "Security analysis")} subtitle={pick("Cours, performance, graphique spécialisé et nouvelles.", "Price, performance, specialized chart and news.")} /><Card><Field label={pick("Symbole TSX", "TSX symbol")} placeholder="Ex. RY, CNR, SHOP" value={ticker} onChangeText={setTicker} autoCapitalize="characters" returnKeyType="search" onSubmitEditing={() => open(ticker)} /><Button label={pick("Ouvrir Focus", "Open Focus")} onPress={() => open(ticker)} disabled={!ticker.trim()} /></Card><Card title={pick("Accès rapide", "Quick access")}>{(workspace.data.watchlist.length ? workspace.data.watchlist : ["RY", "TD", "CNR", "SHOP"]).slice(0, 8).map((symbol) => <Text accessibilityRole="button" key={symbol} onPress={() => open(symbol)} style={styles.quick}>{symbol}<Text style={styles.arrow}>  →</Text></Text>)}</Card><View style={styles.note}><Text style={styles.noteTitle}>{pick("Phase mobile", "Mobile phase")}</Text><Text style={styles.noteText}>{pick("Le shell et les données sont natifs. Seul le moteur graphique interactif vit dans une WebView spécialisée, avec un contrat postMessage isolé.", "The shell and data are native. Only the interactive chart engine uses a specialized WebView with an isolated postMessage contract.")}</Text></View></Screen>;
}
const styles = StyleSheet.create({ quick: { ...typography.section, color: colors.text, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, arrow: { color: colors.primary }, note: { gap: spacing.xs, padding: spacing.lg }, noteTitle: { ...typography.label, color: colors.primary }, noteText: { ...typography.body, color: colors.textMuted } });
