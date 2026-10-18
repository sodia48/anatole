import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { peerExclusionReason, type PeerComparison, type PeerMeasureComparison, type PeerMeasureValue } from "@anatole/shared/fundamental-intelligence";
import { comparableDelta, exactFinancialNumber, formatFinancialNumber, signedBar } from "@anatole/shared/financial-display";
import { Card, QueryState } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { MobileFocusViewMode, useMobileFocusMode } from "./MobileFocusViewMode";

const modes = ["table", "cards", "charts"] as const;
const code = (ticker: string) => ticker.replace(/\.TO$/i, "").toUpperCase();

function display(value: number | null, unit: "percent" | "ratio", language: "fr" | "en") {
  return formatFinancialNumber(value, { language, unit });
}

function Source({ value }: { value: PeerMeasureValue }) {
  const label = `${value.source_name} · ${value.period_end.slice(0, 10)}`;
  if (!value.source_url?.startsWith("https://")) return <Text style={styles.note}>{label}</Text>;
  return <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(value.source_url!)}><Text style={styles.link}>{label}</Text></Pressable>;
}

function Metric({ measure, target, mode }: { measure: PeerMeasureComparison; target: string; mode: "cards" | "charts" }) {
  const { language, pick } = useLocale();
  const latest = measure.values.find(value => value.ticker === target);
  const bound = Math.max(1, ...measure.values.map(value => Math.abs(value.value)));
  const peer = measure.values.length === 2 ? measure.values.find(value => value.ticker !== target) : null;
  return <Card title={pick(measure.label_fr, measure.label_en)}>
    <Text style={styles.value}>{pick("Cible", "Target")} : {display(latest?.value ?? null, measure.unit, language)}</Text>
    {mode === "cards" ? measure.values.map(value => <Text key={value.ticker} style={styles.label}>{code(value.ticker)} · {display(value.value, measure.unit, language)} · {value.period_end.slice(0, 10)}</Text>) : null}
    {peer && latest ? <Text style={styles.note}>{pick("Écart cible – pair", "Target – peer difference")} : {comparableDelta(latest.value, peer.value, language, measure.unit)}</Text> : null}
    {measure.median !== null ? <Text style={styles.note}>{pick("Médiane", "Median")} : {display(measure.median, measure.unit, language)} · {pick("Rang", "Rank")} : {measure.rank}</Text> : null}
    <Text style={styles.note}>{measure.sample_size} {pick("sociétés avec cette donnée", "companies with this value")}</Text>
    <Text style={styles.note}>{pick(measure.explanation_fr, measure.explanation_en)}</Text>
    {mode === "charts" ? measure.values.map(value => <View key={value.ticker} style={styles.barRow}>
      <Text style={styles.label}>{code(value.ticker)} · {display(value.value, measure.unit, language)}</Text>
      <View style={styles.track} accessibilityLabel={`${code(value.ticker)} ${display(value.value, measure.unit, language)}`}><View style={styles.zero} /><View style={[styles.bar, value.value < 0 && styles.negative, signedBar(value.value, bound)]} /></View>
    </View>) : null}
  </Card>;
}

export function MobileFocusPeers({ comparison, loading, error, onRetry, selection, onSelect }: {
  comparison?: PeerComparison; loading: boolean; error: Error | null; onRetry: () => void;
  selection?: string[]; onSelect: (value: string[]) => void;
}) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [mode, choose] = useMobileFocusMode("anatole.focus.mobile.peers.view.v1", modes);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [keys, setKeys] = useState<string[]>(["revenue_growth", "net_margin", "cash_conversion"]);
  const selected = comparison?.selected.map(code) ?? [];
  const pending = loading && selection ? selection.filter(item => !selected.includes(item)) : [];
  const shown = comparison?.measures.filter(item => keys.includes(item.key)) ?? [];
  const toggle = (ticker: string) => {
    const next = selected.includes(ticker) ? selected.filter(item => item !== ticker) : [...selected, ticker];
    if (next.length <= 8) onSelect(next);
  };
  return <View style={styles.stack} testID="focus-peers-section">
    <QueryState error={!comparison ? error : null} loading={loading} onRetry={onRetry} />
    {comparison ? <>
      <Card title={pick("Comparateur sectoriel", "Sector peer comparison")}>
        <Text style={styles.note}>{pick(comparison.method_fr, comparison.method_en)}</Text>
        <Text style={styles.note}>{comparison.universe_source} · {comparison.universe_as_of ?? "N/D"}</Text>
      </Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.selector}>
        <Text style={styles.label}>{pick("Choisir ou remplacer les sociétés", "Choose or replace peers")} ({selected.length}/8)</Text>
      </Pressable>
      {open ? <Card title={pick("Pairs canadiens du même secteur", "Canadian peers in the same sector")}>
        <Text style={styles.note}>{pick("Pairs admissibles", "Eligible peers")} : {selected.join(", ") || pick("aucun", "none")}</Text>
        {pending.length ? <Text style={styles.note}>{pick("Validation en cours", "Validating")} : {pending.join(", ")}</Text> : null}
        <TextInput accessibilityLabel={pick("Rechercher un pair", "Search peers")} value={search} onChangeText={setSearch} style={styles.search} placeholder={pick("Rechercher", "Search")} />
        <View style={styles.candidates}>{comparison.candidates.filter(item => `${item.ticker} ${item.name} ${item.industry ?? ""}`.toLowerCase().includes(search.toLowerCase())).slice(0, 20).map((item, index, list) => <View key={item.ticker} style={styles.candidateRow}>
          {index === 0 || list[index - 1]?.comparability !== item.comparability ? <Text style={styles.label}>{pick(item.comparability === "direct" ? "Comparables directs" : item.comparability === "related" ? "Activités connexes" : "Autres entreprises du secteur",
            item.comparability === "direct" ? "Direct peers" : item.comparability === "related" ? "Related businesses" : "Other sector companies")}</Text> : null}
          <Pressable
          accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(code(item.ticker)), disabled: loading || (item.comparability !== "direct" && !selected.includes(code(item.ticker))) || (!selected.includes(code(item.ticker)) && selected.length >= 8) }}
          disabled={loading || (item.comparability !== "direct" && !selected.includes(code(item.ticker))) || (!selected.includes(code(item.ticker)) && selected.length >= 8)} onPress={() => toggle(code(item.ticker))} style={[styles.choice, selected.includes(code(item.ticker)) && styles.active]}>
          <Text style={styles.label}>{item.ticker} · {item.name}</Text>
          <Text style={styles.note}>{item.industry ?? pick("activité non vérifiée", "industry unverified")}</Text>
        </Pressable></View>)}</View>
      </Card> : null}
      {Object.entries(comparison.excluded).length ? <Card title={pick("Demandes exclues", "Excluded requests")}><Pressable accessibilityRole="button" onPress={() => setShowExcluded(!showExcluded)}><Text style={styles.link}>{showExcluded ? pick("Masquer", "Hide") : pick("Afficher les motifs", "Show reasons")} ({Object.keys(comparison.excluded).length})</Text></Pressable>
        {showExcluded ? Object.entries(comparison.excluded).map(([ticker, reason]) => <Text key={ticker} style={styles.note}>{ticker} : {peerExclusionReason(reason, language)}</Text>) : null}</Card> : null}
      <MobileFocusViewMode mode={mode} choose={choose} modes={modes} />
      <Card title={pick("Indicateurs affichés", "Visible metrics")}><View style={styles.candidates}>{comparison.measures.map(item => <Pressable key={item.key}
        accessibilityRole="checkbox" accessibilityState={{ checked: keys.includes(item.key) }}
        onPress={() => setKeys(previous => previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key])}
        style={[styles.choice, keys.includes(item.key) && styles.active]}><Text style={styles.label}>{pick(item.label_fr, item.label_en)}</Text></Pressable>)}</View></Card>
      {mode === "table" ? <Card title={pick("Comparaison des indicateurs sélectionnés", "Selected metric comparison")}>
        <ScrollView horizontal showsHorizontalScrollIndicator><View>
          <View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Indicateur", "Metric")}</Text>{[comparison.target, ...comparison.selected].map(item => <Text key={item} style={styles.tableCell}>{code(item)}</Text>)}<Text style={styles.tableCell}>{pick("Médiane", "Median")}</Text></View>
          {shown.map(item => <View key={item.key} style={styles.tableRow}><Text style={styles.tableLabel}>{pick(item.label_fr, item.label_en)}</Text>
            {[comparison.target, ...comparison.selected].map(ticker => <Text key={ticker} style={styles.tableCell}>{display(item.values.find(value => value.ticker === ticker)?.value ?? null, item.unit, language)}</Text>)}
            <Text style={styles.tableCell}>{display(item.median, item.unit, language)}</Text>
          </View>)}
        </View></ScrollView>
      </Card> : null}
      {mode === "cards" || mode === "charts" ? shown.map(item => <Metric key={item.key} measure={item} target={comparison.target} mode={mode} />) : null}
      <Card title={pick("Sources et valeurs exactes", "Sources and exact values")}><Pressable accessibilityRole="button" onPress={() => setShowSources(!showSources)}><Text style={styles.link}>{showSources ? pick("Masquer", "Hide") : pick("Voir les sources", "View sources")}</Text></Pressable>
        {showSources ? shown.flatMap(item => item.values.map(value => <View key={`${item.key}-${value.ticker}`}><Text style={styles.note}>{pick(item.label_fr, item.label_en)} · {code(value.ticker)} · {exactFinancialNumber(value.value, language)} · {value.source_confidence}</Text><Source value={value} /></View>)) : null}</Card>
    </> : null}
  </View>;
}

const styles = createThemedStyles(colors => ({
  stack: { gap: spacing.md }, note: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  label: { ...typography.label, color: colors.text }, value: { ...typography.body, color: colors.text, fontWeight: "700" },
  link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  selector: { minHeight: 44, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, justifyContent: "center" },
  candidates: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  candidateRow: { gap: spacing.xs, width: "100%" },
  choice: { minHeight: 44, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, justifyContent: "center" },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  search: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, paddingHorizontal: spacing.sm },
  barRow: { gap: spacing.xs, marginTop: spacing.sm }, track: { height: 9, backgroundColor: colors.border, borderRadius: radius.sm },
  zero: { position: "absolute", left: "50%", height: 14, borderLeftWidth: 1, borderLeftColor: colors.text },
  bar: { position: "absolute", height: 10, backgroundColor: colors.primary, borderRadius: radius.sm },
  negative: { backgroundColor: "#c66d61" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text },
  tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" },
}));
