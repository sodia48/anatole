import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Button, Card, Field } from "@/src/components/ui";
import type { OptionContract, OptionSide } from "@/src/lib/api/options";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";

import { heatmapScale, screenLoadedContracts, type ScreenerSort } from "./optionScreenerLogic";

function minimum(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function metric(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) || value < 0 ? "N/D" : Math.round(value).toLocaleString("fr-CA");
}

function barWidth(value: number | null | undefined, maximum: number): number {
  return value == null || !Number.isFinite(value) || value < 0 || maximum <= 0 ? 0 :
    Math.max(0, Math.min(112, value / maximum * 112));
}

export function NativeOptionScreener({ contracts, stale, canAdd, onAdd, defaultOpen = false }: {
  contracts: OptionContract[];
  stale: boolean;
  canAdd: boolean;
  onAdd: (contract: OptionContract) => void;
  defaultOpen?: boolean;
}) {
  useMobileTheme();
  const { pick } = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<"both" | OptionSide>("both");
  const [expiration, setExpiration] = useState("");
  const [volume, setVolume] = useState("");
  const [interest, setInterest] = useState("");
  const [sort, setSort] = useState<ScreenerSort>("expiration");
  const [page, setPage] = useState(0);

  const expirations = useMemo(() => [...new Set(contracts.map((item) => item.expiration).filter((value): value is string => Boolean(value)))].sort(), [contracts]);
  const valid = /^\d*$/.test(volume.trim()) && /^\d*$/.test(interest.trim());
  const results = useMemo(() => open && valid ? screenLoadedContracts(contracts, {
    query, side, expiration, minVolume: minimum(volume), minOpenInterest: minimum(interest), sort,
  }) : [], [open, contracts, query, side, expiration, volume, interest, sort, valid]);
  const pageCount = Math.max(1, Math.ceil(results.length / 25));
  const visiblePage = Math.min(page, pageCount - 1);
  const visible = results.slice(visiblePage * 25, (visiblePage + 1) * 25);
  const maxVolume = heatmapScale(results, "volume");
  const maxInterest = heatmapScale(results, "open_interest");

  return <Card title={pick("Screener et heatmap", "Screener and heatmap")}>
    <Text style={styles.hint}>{pick("Recherche dans la chaîne chargée uniquement. Données de marché observées ; aucun résultat n'est créé pour compléter la couverture.",
      "Searches the loaded chain only. Observed market data; no results are generated to fill coverage gaps.")}</Text>
    <Button label={open ? pick("Masquer le screener", "Hide screener") : pick("Ouvrir le screener", "Open screener")}
      variant="secondary" onPress={() => setOpen((current) => !current)} />
    {open ? <>
      <Field label={pick("Rechercher symbole, contrat ou strike", "Search symbol, contract or strike")}
        accessibilityLabel={pick("Rechercher symbole, contrat ou strike", "Search symbol, contract or strike")}
        value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="characters" />
      <ScrollView horizontal contentContainerStyle={styles.controls} showsHorizontalScrollIndicator={false}>
        {(["both", "call", "put"] as const).map((value) => <Pressable key={value} accessibilityRole="button"
          accessibilityLabel={`${pick("Type", "Side")}: ${value}`} accessibilityState={{ selected: side === value }}
          onPress={() => setSide(value)} style={[styles.choice, side === value && styles.active]}>
          <Text style={styles.choiceText}>{value === "both" ? "Call + Put" : value.toUpperCase()}</Text>
        </Pressable>)}
      </ScrollView>
      <ScrollView horizontal contentContainerStyle={styles.controls} showsHorizontalScrollIndicator={false}>
        {["", ...expirations].map((value) => <Pressable key={value || "all"} accessibilityRole="button"
          accessibilityLabel={`${pick("Échéance", "Expiry")}: ${value || pick("Toutes", "All")}`}
          accessibilityState={{ selected: expiration === value }} onPress={() => setExpiration(value)}
          style={[styles.choice, expiration === value && styles.active]}>
          <Text style={styles.choiceText}>{value || pick("Toutes les échéances", "All expiries")}</Text>
        </Pressable>)}
      </ScrollView>
      <View style={styles.minimums}>
        <Field label={pick("Volume minimum du screener", "Screener minimum volume")}
          accessibilityLabel={pick("Volume minimum du screener", "Screener minimum volume")}
          value={volume} onChangeText={setVolume} keyboardType="number-pad" />
        <Field label={pick("Intérêt ouvert minimum du screener", "Screener minimum open interest")}
          accessibilityLabel={pick("Intérêt ouvert minimum du screener", "Screener minimum open interest")}
          value={interest} onChangeText={setInterest} keyboardType="number-pad" />
      </View>
      {!valid ? <Text accessibilityRole="alert" style={styles.hint}>{pick("Saisissez des nombres entiers positifs.", "Enter nonnegative whole numbers.")}</Text> : null}
      <ScrollView horizontal contentContainerStyle={styles.controls} showsHorizontalScrollIndicator={false}>
        {(["expiration", "volume", "open_interest"] as const).map((value) => <Pressable key={value}
          accessibilityRole="button" accessibilityLabel={`${pick("Trier par", "Sort by")}: ${value}`}
          accessibilityState={{ selected: sort === value }} onPress={() => setSort(value)}
          style={[styles.choice, sort === value && styles.active]}>
          <Text style={styles.choiceText}>{value === "expiration" ? pick("Échéance", "Expiry") : value === "volume" ? "Volume" : "OI"}</Text>
        </Pressable>)}
      </ScrollView>
      <Text style={styles.hint}>{results.length} {pick("contrats correspondants", "matching contracts")}
        {results.length > 25 ? ` · ${pick("25 par page", "25 per page")}` : ""}
        {stale ? ` · ${pick("instantané périmé", "stale snapshot")}` : ""}</Text>
      {valid && results.length === 0 ? <Text style={styles.hint}>{pick("Aucun contrat correspondant dans la chaîne chargée.", "No matching contract in the loaded chain.")}</Text> : null}
      <ScrollView style={styles.results} nestedScrollEnabled>{visible.map((item) => <View key={JSON.stringify([item.market, item.symbol, item.contract, item.side, item.expiration, item.strike])} style={styles.row}>
        <Text style={styles.contract}>{item.symbol} · {item.side.toUpperCase()} {item.strike} · {item.expiration ?? "N/D"}</Text>
        <Text style={styles.hint}>{item.source} · {item.delayed ? pick("différé", "delayed") : pick("délai non indiqué", "delay unspecified")}</Text>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>Vol {metric(item.volume)}</Text>
          <View style={styles.barTrack}><View style={[styles.volumeBar, { width: barWidth(item.volume, maxVolume) }]} /></View>
        </View>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>OI {metric(item.open_interest)}</Text>
          <View style={styles.barTrack}><View style={[styles.interestBar, { width: barWidth(item.open_interest, maxInterest) }]} /></View>
        </View>
        <Button label={`${pick("Ajouter au constructeur", "Add to builder")} ${item.symbol} ${item.side.toUpperCase()} ${item.strike}`}
          variant="secondary" disabled={!canAdd} onPress={() => onAdd(item)} />
      </View>)}</ScrollView>
      {results.length > 25 ? <View style={styles.pageRow}>
        <Button label={pick("Précédent", "Previous")} variant="secondary" disabled={visiblePage === 0} onPress={() => setPage(visiblePage - 1)} />
        <Text style={styles.hint}>{visiblePage + 1} / {pageCount}</Text>
        <Button label={pick("Suivant", "Next")} variant="secondary" disabled={visiblePage + 1 >= pageCount} onPress={() => setPage(visiblePage + 1)} />
      </View> : null}
      {!canAdd ? <Text style={styles.hint}>{pick("Maximum de 20 jambes atteint.", "Maximum of 20 legs reached.")}</Text> : null}
    </> : null}
  </Card>;
}

const styles = createThemedStyles((colors) => ({
  results: { maxHeight: 560 },
  pageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted },
  controls: { gap: spacing.xs, paddingVertical: spacing.xs },
  choice: { minHeight: 40, paddingHorizontal: spacing.sm, justifyContent: "center", borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.sm },
  active: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  choiceText: { ...typography.caption, color: colors.text },
  minimums: { gap: spacing.sm },
  row: { gap: spacing.xs, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  contract: { ...typography.label, color: colors.text },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { ...typography.caption, color: colors.text, minWidth: 80 },
  barTrack: { width: 112, height: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  volumeBar: { height: 8, backgroundColor: colors.primary },
  interestBar: { height: 8, backgroundColor: colors.positive },
}));
