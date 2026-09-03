import { Pressable, StyleSheet, Text, View } from "react-native";

import { percentOrNd, valueOrNd } from "@/src/components/focus/format";
import { Card, QueryState } from "@/src/components/ui";
import type { CockpitSnapshot, PsychologySnapshot, TerminalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { buildTodayMarketReading, classifyTrailingSector, latestCockpitQuoteTime, type TodayUniverse } from "./model";

function Metric({ label, value, onPress, testID }: { label: string; value: string; onPress?: () => void; testID?: string }) {
  const content = <><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></>;
  return onPress
    ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.metric} testID={testID}>{content}</Pressable>
    : <View style={styles.metric} testID={testID}>{content}</View>;
}

function time(value: string | null, language: "fr" | "en") {
  if (!value) return "N/D";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/D" : date.toLocaleTimeString(language === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
}

export function TodayMarketBrief({
  universe,
  cockpit,
  terminal,
  psychology,
  loading,
  error,
  onRetry,
  onUniverse,
  onTerminal,
  onPsychology,
}: {
  universe: TodayUniverse;
  cockpit?: CockpitSnapshot;
  terminal: TerminalSnapshot | null;
  psychology?: PsychologySnapshot;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onUniverse: (universe: TodayUniverse) => void;
  onTerminal: () => void;
  onPsychology: () => void;
}) {
  const { language, pick } = useLocale();
  const reading = buildTodayMarketReading({ cockpit, terminal, psychology, universe, language });
  const sectors = [...(cockpit?.sectors ?? [])].sort((left, right) => right.change_percent - left.change_percent);
  const leader = sectors[0];
  const pressure = sectors.at(-1);
  const trailingClassification = classifyTrailingSector(pressure, language);
  const delayed = cockpit?.constituents.some((item) => item.delayed) ?? false;
  const quoteTime = latestCockpitQuoteTime(cockpit);
  return <View style={styles.stack}>
    <Card title={pick("LE MARCHÉ EN 15 SECONDES", "THE MARKET IN 15 SECONDS")} testID="today-market-brief">
      <View style={styles.segment}>{(["composite", "tsx60"] as TodayUniverse[]).map((value) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: universe === value }} key={value} onPress={() => onUniverse(value)} style={[styles.segmentButton, universe === value && styles.segmentActive]} testID={`today-universe-${value}`}><Text style={[styles.segmentText, universe === value && styles.segmentTextActive]}>{value === "composite" ? "Composite" : "TSX 60"}</Text></Pressable>)}</View>
      <QueryState error={!cockpit ? error : null} loading={!cockpit && loading} onRetry={onRetry} />
      {cockpit ? <>
        <View style={styles.hero}><View><Text style={styles.marketName}>{universe === "composite" ? "S&P/TSX Composite" : "S&P/TSX 60"}</Text><Text style={styles.asOf}>{pick("Données marché", "Market data")} · {time(quoteTime, language)}{delayed ? ` · ${pick("Différé", "Delayed")}` : ""}</Text></View><Text style={[styles.change, { color: cockpit.weighted_change_percent >= 0 ? colors.positive : colors.negative }]}>{percentOrNd(cockpit.weighted_change_percent, language)}</Text></View>
        <View style={styles.grid}>
          <Metric label={pick("Largeur", "Breadth")} value={`${cockpit.breadth.advancers}↑ · ${cockpit.breadth.decliners}↓`} />
          <Metric label={pick("Ratio de hausse", "Advance ratio")} value={valueOrNd(cockpit.breadth.advance_ratio, 1, language) === "N/D" ? "N/D" : `${valueOrNd(cockpit.breadth.advance_ratio, 1, language)} %`} />
          <Metric label={pick("Régime Terminal · TSX 60", "Terminal regime · TSX 60")} onPress={onTerminal} testID="today-open-terminal" value={terminal?.regime && terminal.regime_score != null ? `${terminal.regime} · ${Math.round(terminal.regime_score)}/100` : "N/D"} />
          <Metric label={pick("Psychologie", "Psychology")} onPress={onPsychology} testID="today-open-psychology" value={psychology ? `${psychology.label} · ${Math.round(psychology.score)}/100` : "N/D"} />
          <Metric label={pick("Secteur leader", "Leading sector")} value={leader ? `${leader.sector} · ${percentOrNd(leader.change_percent, language)}` : "N/D"} />
          <Metric label={trailingClassification?.label ?? pick("Secteur le moins fort", "Least strong sector")} value={pressure ? `${pressure.sector} · ${percentOrNd(pressure.change_percent, language)}` : "N/D"} />
          <Metric label="MM50 · TSX 60" value={percentOrNd(terminal?.above_sma50_percent, language)} />
          <Metric label={pick("Risque Terminal", "Terminal risk")} value={terminal?.risk_level ?? "N/D"} />
        </View>
      </> : null}
    </Card>
    <Card title={pick("LECTURE ANATOLE", "ANATOLE READING")} testID="today-market-reading">
      <Text style={[styles.readingHeadline, reading.tone === "positive" && styles.positive, reading.tone === "negative" && styles.negative]}>{reading.headline}</Text>
      <Text style={styles.readingDetail}>{reading.detail}</Text>
      <Text style={styles.disclaimer}>{pick("Lecture descriptive fondée sur les données observées. Ce n’est pas une recommandation.", "Descriptive reading based on observed data. This is not a recommendation.")}</Text>
    </Card>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md }, segment: { flexDirection: "row", padding: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceRaised }, segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, segmentActive: { backgroundColor: "rgba(44,156,255,.25)", borderWidth: 1, borderColor: colors.primary }, segmentText: { ...typography.label, color: colors.textMuted }, segmentTextActive: { color: colors.text },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, marketName: { ...typography.section, color: colors.text }, asOf: { ...typography.caption, color: colors.textMuted }, change: { ...typography.title }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { minWidth: "46%", flexGrow: 1, minHeight: 66, justifyContent: "center", gap: 2, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, metricValue: { ...typography.label, color: colors.text }, metricLabel: { ...typography.caption, color: colors.textMuted },
  readingHeadline: { ...typography.section, color: colors.text }, readingDetail: { ...typography.body, color: colors.textMuted }, disclaimer: { ...typography.caption, color: colors.textSubtle }, positive: { color: colors.positive }, negative: { color: colors.negative },
});
