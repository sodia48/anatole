import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { TerminalAnomalyType, TerminalRadarFilters } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const ANOMALIES: TerminalAnomalyType[] = ["volume_spike", "gap", "momentum_acceleration", "rsi_extreme", "sma_cross", "price_volume_divergence", "sector_dislocation", "score_shift"];
const TRENDS = ["Haussière", "Mixte", "Baissière", "Indéterminée"];
const SIGNALS = ["Momentum fort", "Constructif", "Neutre", "Fragile", "Sous pression"];

const ANOMALY_LABELS: Record<TerminalAnomalyType, readonly [string, string]> = {
  volume_spike: ["Pic de volume", "Volume spike"], gap: ["Gap", "Gap"], momentum_acceleration: ["Accélération momentum", "Momentum acceleration"],
  rsi_extreme: ["RSI extrême", "RSI extreme"], sma_cross: ["Croisement MM", "MA cross"], price_volume_divergence: ["Divergence prix-volume", "Price-volume divergence"],
  sector_dislocation: ["Dislocation sectorielle", "Sector dislocation"], score_shift: ["Variation du score", "Score shift"],
};

function trendLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ Haussière: "Bullish", Mixte: "Mixed", Baissière: "Bearish", Indéterminée: "Undetermined" } as Record<string, string>)[value] ?? value;
}

function signalLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ "Momentum fort": "Strong momentum", Constructif: "Constructive", Neutre: "Neutral", Fragile: "Fragile", "Sous pression": "Under pressure" } as Record<string, string>)[value] ?? value;
}

type NumericKey = "score_min" | "score_max" | "momentum_20d_min" | "momentum_20d_max" | "relative_volume_min" | "rsi_min" | "rsi_max" | "change_percent_min" | "change_percent_max";

function FilterChip({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]} testID={testID}><Text style={styles.chipText}>{label}</Text></Pressable>;
}

export function terminalFilterLabels(filters: TerminalRadarFilters, language: "fr" | "en"): { key: string; label: string }[] {
  const labels: { key: string; label: string }[] = [];
  const add = (key: NumericKey, fr: string, en: string, op: "≥" | "≤") => { const value = filters[key]; if (value != null) labels.push({ key, label: `${language === "fr" ? fr : en} ${op} ${value}` }); };
  add("score_min", "Score", "Score", "≥"); add("score_max", "Score", "Score", "≤");
  add("momentum_20d_min", "Momentum 20j", "20d momentum", "≥"); add("momentum_20d_max", "Momentum 20j", "20d momentum", "≤");
  add("relative_volume_min", "Volume relatif", "Relative volume", "≥"); add("rsi_min", "RSI", "RSI", "≥"); add("rsi_max", "RSI", "RSI", "≤");
  add("change_percent_min", "Séance", "Session", "≥"); add("change_percent_max", "Séance", "Session", "≤");
  if (filters.sector) labels.push({ key: "sector", label: filters.sector });
  if (filters.trend) labels.push({ key: "trend", label: trendLabel(filters.trend, language) });
  if (filters.signal) labels.push({ key: "signal", label: signalLabel(filters.signal, language) });
  for (const type of filters.anomaly_types ?? []) labels.push({ key: `anomaly:${type}`, label: language === "fr" ? ANOMALY_LABELS[type][0] : ANOMALY_LABELS[type][1] });
  return labels;
}

export function TerminalRadarFiltersModal({ filters, sectors, visible, onChange, onClose, onReset }: { filters: TerminalRadarFilters; sectors: string[]; visible: boolean; onChange: (filters: TerminalRadarFilters) => void; onClose: () => void; onReset: () => void }) {
  const { language, pick } = useLocale();
  const numeric: { key: NumericKey; label: string }[] = [
    { key: "score_min", label: "Score min" }, { key: "score_max", label: "Score max" },
    { key: "momentum_20d_min", label: "Momentum 20j min" }, { key: "momentum_20d_max", label: "Momentum 20j max" },
    { key: "relative_volume_min", label: pick("Volume relatif min", "Relative volume min") },
    { key: "rsi_min", label: "RSI min" }, { key: "rsi_max", label: "RSI max" },
    { key: "change_percent_min", label: pick("Variation séance min", "Session change min") }, { key: "change_percent_max", label: pick("Variation séance max", "Session change max") },
  ];
  const setNumber = (key: NumericKey, raw: string) => { const value = Number(raw.replace(",", ".")); onChange({ ...filters, [key]: raw.trim() !== "" && Number.isFinite(value) ? value : null }); };
  const toggleAnomaly = (type: TerminalAnomalyType) => {
    const current = filters.anomaly_types ?? [];
    onChange({ ...filters, anomaly_types: current.includes(type) ? current.filter((value) => value !== type) : [...current, type] });
  };
  return <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe} testID="terminal-advanced-filters-modal">
      <View style={styles.header}><Text style={styles.title}>{pick("Filtres avancés", "Advanced filters")}</Text><Pressable accessibilityLabel={pick("Fermer", "Close")} onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.numberGrid}>{numeric.map((item) => <View key={item.key} style={styles.field}><Text style={styles.label}>{item.label}</Text><TextInput accessibilityLabel={item.label} keyboardType="numbers-and-punctuation" onChangeText={(value) => setNumber(item.key, value)} placeholder="N/D" placeholderTextColor={colors.textSubtle} style={styles.input} testID={`terminal-filter-${item.key}`} value={filters[item.key]?.toString() ?? ""} /></View>)}</View>
        <Text style={styles.section}>{pick("Secteur", "Sector")}</Text><View style={styles.wrap}><FilterChip active={!filters.sector} label={pick("Tous", "All")} onPress={() => onChange({ ...filters, sector: null })} />{sectors.map((sector) => <FilterChip active={filters.sector === sector} key={sector} label={sector} onPress={() => onChange({ ...filters, sector })} testID={`terminal-advanced-sector-${sector}`} />)}</View>
        <Text style={styles.section}>{pick("Tendance", "Trend")}</Text><View style={styles.wrap}><FilterChip active={!filters.trend} label={pick("Toutes", "All")} onPress={() => onChange({ ...filters, trend: null })} />{TRENDS.map((trend) => <FilterChip active={filters.trend === trend} key={trend} label={trendLabel(trend, language)} onPress={() => onChange({ ...filters, trend })} testID={`terminal-filter-trend-${trend}`} />)}</View>
        <Text style={styles.section}>{pick("Signal", "Signal")}</Text><View style={styles.wrap}><FilterChip active={!filters.signal} label={pick("Tous", "All")} onPress={() => onChange({ ...filters, signal: null })} />{SIGNALS.map((signal) => <FilterChip active={filters.signal === signal} key={signal} label={signalLabel(signal, language)} onPress={() => onChange({ ...filters, signal })} testID={`terminal-filter-signal-${signal}`} />)}</View>
        <Text style={styles.section}>{pick("Anomalies", "Anomalies")}</Text><View style={styles.wrap}>{ANOMALIES.map((type) => <FilterChip active={(filters.anomaly_types ?? []).includes(type)} key={type} label={language === "fr" ? ANOMALY_LABELS[type][0] : ANOMALY_LABELS[type][1]} onPress={() => toggleAnomaly(type)} testID={`terminal-filter-anomaly-${type}`} />)}</View>
        <View style={styles.footer}><Pressable onPress={onReset} style={styles.secondary}><Text style={styles.buttonText}>{pick("Réinitialiser", "Reset")}</Text></Pressable><Pressable onPress={onClose} style={styles.primary} testID="terminal-advanced-filters-apply"><Text style={styles.buttonText}>{pick("Afficher les résultats", "Show results")}</Text></Pressable></View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, header: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, title: { ...typography.title, color: colors.text }, close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 30, color: colors.text },
  content: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xl * 2 }, numberGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, field: { minWidth: "46%", flexGrow: 1, gap: spacing.xs }, label: { ...typography.caption, color: colors.textMuted }, input: { minHeight: 48, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, color: colors.text }, section: { ...typography.section, color: colors.text }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, chipActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.2)" }, chipText: { ...typography.caption, color: colors.text }, footer: { flexDirection: "row", gap: spacing.sm }, primary: { minHeight: 48, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary }, secondary: { minHeight: 48, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md }, buttonText: { ...typography.label, color: colors.text },
});
