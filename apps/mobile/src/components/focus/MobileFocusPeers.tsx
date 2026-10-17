import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { peerExclusionReason, type PeerComparison, type PeerMeasureComparison, type PeerMeasureValue } from "@anatole/shared/fundamental-intelligence";
import { Card, QueryState } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { MobileFocusViewMode, useMobileFocusMode } from "./MobileFocusViewMode";

const modes = ["table", "cards", "charts"] as const;
const code = (ticker: string) => ticker.replace(/\.TO$/i, "").toUpperCase();

function display(value: number | null, unit: "percent" | "ratio", language: "fr" | "en") {
  if (value === null) return language === "fr" ? "N/D" : "N/A";
  const amount = new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value);
  return `${amount}${unit === "percent" ? " %" : "×"}`;
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
  return <Card title={pick(measure.label_fr, measure.label_en)}>
    <Text style={styles.value}>{pick("Cible", "Target")} : {display(latest?.value ?? null, measure.unit, language)}</Text>
    <Text style={styles.note}>{pick("Médiane", "Median")} : {display(measure.median, measure.unit, language)} · {pick("Rang", "Rank")} : {measure.rank ?? "N/D"}</Text>
    <Text style={styles.note}>{measure.sample_size} / {measure.minimum_sample_size} {pick("sociétés requises", "companies required")}</Text>
    <Text style={styles.note}>{pick(measure.explanation_fr, measure.explanation_en)}</Text>
    {mode === "charts" ? measure.values.map(value => <View key={value.ticker} style={styles.barRow}>
      <Text style={styles.label}>{code(value.ticker)} · {display(value.value, measure.unit, language)}</Text>
      <View style={styles.track}><View style={[styles.bar, { width: `${Math.abs(value.value) / bound * 100}%` }]} /></View>
      <Source value={value} />
    </View>) : latest ? <Source value={latest} /> : null}
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
  const [keys, setKeys] = useState<string[]>(["revenue_growth", "net_margin", "cash_conversion"]);
  const selected = selection ?? comparison?.selected.map(code) ?? [];
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
        <View style={styles.candidates}>{comparison.candidates.map(item => <Pressable key={item.ticker}
          accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.ticker), disabled: !selected.includes(item.ticker) && selected.length >= 8 }}
          disabled={!selected.includes(item.ticker) && selected.length >= 8} onPress={() => toggle(item.ticker)} style={[styles.choice, selected.includes(item.ticker) && styles.active]}>
          <Text style={styles.label}>{item.ticker} · {item.name}</Text>
        </Pressable>)}</View>
      </Card> : null}
      {Object.entries(comparison.excluded).length ? <Card title={pick("Pairs exclus", "Excluded peers")}>
        {Object.entries(comparison.excluded).map(([ticker, reason]) => <Text key={ticker} style={styles.note}>{ticker} : {peerExclusionReason(reason, language)}</Text>)}
      </Card> : null}
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
        {shown.flatMap(item => item.values).map((item, index) => <View key={`${item.ticker}-${item.period_end}-${index}`}><Source value={item} /></View>)}
      </Card> : null}
      {mode === "cards" || mode === "charts" ? shown.map(item => <Metric key={item.key} measure={item} target={comparison.target} mode={mode} />) : null}
    </> : null}
  </View>;
}

const styles = createThemedStyles(colors => ({
  stack: { gap: spacing.md }, note: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  label: { ...typography.label, color: colors.text }, value: { ...typography.body, color: colors.text, fontWeight: "700" },
  link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  selector: { minHeight: 44, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, justifyContent: "center" },
  candidates: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: { minHeight: 44, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, justifyContent: "center" },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  barRow: { gap: spacing.xs, marginTop: spacing.sm }, track: { height: 9, backgroundColor: colors.border, borderRadius: radius.sm },
  bar: { height: 9, backgroundColor: colors.primary, borderRadius: radius.sm },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text },
  tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" },
}));
