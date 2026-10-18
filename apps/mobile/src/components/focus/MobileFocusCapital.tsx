import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import type { CapitalMetricKey, CapitalValue, FundamentalCapitalResearch } from "@anatole/shared/fundamental-capital";
import { analystRecommendation, exactFinancialNumber, formatFinancialNumber, signedBar } from "@anatole/shared/financial-display";
import { Card, QueryState } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { MobileFocusViewMode, useMobileFocusMode } from "./MobileFocusViewMode";

const modes = ["table", "cards", "charts"] as const;
const metrics: { key: CapitalMetricKey; fr: string; en: string; percent?: boolean }[] = [
  { key: "operating_cash_flow", fr: "Flux opérationnel", en: "Operating cash flow" },
  { key: "capital_expenditure", fr: "Investissements", en: "Capital expenditure" },
  { key: "dividends", fr: "Dividendes", en: "Dividends" },
  { key: "repurchases", fr: "Rachats d’actions", en: "Share repurchases" },
  { key: "free_cash_flow", fr: "Flux disponible publié", en: "Published free cash flow" },
  { key: "cash_after_allocations", fr: "Solde après allocations", en: "Cash after allocations" },
  { key: "capex_share_of_known_uses", fr: "Part des investissements", en: "Capex share of known uses", percent: true },
  { key: "earnings_cash_conversion", fr: "Conversion bénéfice-trésorerie", en: "Earnings cash conversion", percent: true },
  { key: "debt_change", fr: "Variation de la dette", en: "Debt change" },
];

function formatted(value: CapitalValue, currency: string | null, language: "fr" | "en", percent = false) {
  return formatFinancialNumber(value.value, { language, unit: percent ? "percent" : "money", currency: percent ? null : currency });
}

export function MobileFocusCapital({ research, loading, error, onRetry }: {
  research?: FundamentalCapitalResearch; loading: boolean; error: Error | null; onRetry: () => void;
}) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [mode, choose] = useMobileFocusMode("anatole.focus.mobile.capital.view.v1", modes);
  const [selected, setSelected] = useState<CapitalMetricKey[]>(["operating_cash_flow", "capital_expenditure", "dividends", "repurchases", "cash_after_allocations"]);
  const [showLimits, setShowLimits] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [showExact, setShowExact] = useState(false);
  const unavailable = research ? metrics.filter(item => research.periods.every(period => period[item.key].value === null)) : [];
  const shown = metrics.filter(item => selected.includes(item.key) && (showMissing || !unavailable.includes(item)));
  const latest = research?.periods[0];
  const previous = research?.periods[1];
  const comparable = latest && previous && latest.currency === previous.currency &&
    Math.abs((new Date(latest.period_end).getTime() - new Date(previous.period_end).getTime()) / 86400000 - 365) <= 65;
  return <View style={styles.stack} testID="focus-capital-section">
    <QueryState error={!research ? error : null} loading={loading} onRetry={onRetry} />
    <Card title={pick("Allocation du capital et analystes", "Capital allocation and analysts")}>
      <Text style={styles.note}>{pick("Exercices publiés et calculs explicités; consensus actuel séparé de l’historique.",
        "Published fiscal years and explicit calculations; current consensus separate from history.")}</Text>
    </Card>
    {research ? <>
      {research.stale ? <Text style={styles.note}>{pick("Instantané périmé : vérifiez les dates.", "Stale snapshot: check dates.")}</Text> : null}
      {research.periods.length ? <>
        <Card title={pick("Dernier exercice", "Latest fiscal year")}><View style={styles.kpis}>{metrics.filter(item => ["operating_cash_flow", "capital_expenditure", "free_cash_flow", "dividends", "repurchases", "earnings_cash_conversion"].includes(item.key) && latest?.[item.key].value !== null).map(item => {
          const current = latest![item.key].value!;
          const prior = comparable ? previous![item.key].value : null;
          return <View key={item.key} style={styles.kpi}><Text style={styles.note}>{pick(item.fr, item.en)}</Text><Text style={styles.value}>{formatted(latest![item.key], latest!.currency, language, item.percent)}</Text>
            {prior !== null && prior !== undefined ? <Text style={styles.note}>{pick("Variation annuelle", "Yearly change")} : {formatFinancialNumber(current - prior, { language, unit: item.percent ? "percent" : "money", currency: item.percent ? null : latest!.currency })}</Text> : null}</View>;
        })}</View></Card>
        {unavailable.length ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: showMissing }} onPress={() => setShowMissing(!showMissing)}><Text style={styles.link}>{pick("Afficher les indicateurs indisponibles", "Show unavailable metrics")} ({unavailable.length})</Text></Pressable> : null}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: showExact }} onPress={() => setShowExact(!showExact)}><Text style={styles.link}>{pick("Afficher les chiffres complets", "Show exact figures")}</Text></Pressable>
        <MobileFocusViewMode mode={mode} choose={choose} modes={modes} />
        <Card title={pick("Indicateurs affichés", "Visible metrics")}><View style={styles.choices}>{metrics.map(item => <Pressable key={item.key}
          accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.key) }}
          onPress={() => setSelected(previous => previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key])}
          style={[styles.choice, selected.includes(item.key) && styles.active]}><Text style={styles.label}>{pick(item.fr, item.en)}</Text></Pressable>)}</View></Card>
        {mode === "table" ? <Card title={pick("Flux et allocations", "Flows and allocations")}><ScrollView horizontal showsHorizontalScrollIndicator>
          <View><View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Indicateur", "Metric")}</Text>{research.periods.map(period => <Text key={period.period_end} style={styles.tableCell}>{period.period_end.slice(0, 10)}</Text>)}</View>
            {shown.map(item => <View key={item.key} style={styles.tableRow}><Text style={styles.tableLabel}>{pick(item.fr, item.en)}</Text>
              {research.periods.map(period => <Text key={period.period_end} style={styles.tableCell}>{showExact ? exactFinancialNumber(period[item.key].value, language) : formatted(period[item.key], period.currency, language, item.percent)}</Text>)}</View>)}</View>
        </ScrollView></Card> : null}
        {mode === "cards" || mode === "charts" ? research.periods.map(period => <Card key={period.period_end} title={`${period.period_end.slice(0, 10)} · ${period.currency ?? "N/D"}`}>
          {shown.map(item => <View key={item.key} style={styles.metric}><Text style={styles.label}>{pick(item.fr, item.en)} · {formatted(period[item.key], period.currency, language, item.percent)}</Text>
            {mode === "charts" ? <View style={styles.track}><View style={styles.zero} /><View style={[styles.bar, (period[item.key].value ?? 0) < 0 && styles.negative, signedBar(period[item.key].value,
              Math.max(1, ...research.periods.map(value => Math.abs(value[item.key].value ?? 0))))]} /></View> : null}</View>)}</Card>) : null}
      </> : <Card title={pick("Allocation du capital", "Capital allocation")}><Text style={styles.note}>{pick("Aucun exercice annuel vérifiable.", "No verifiable annual fiscal year.")}</Text></Card>}
      <Card title={pick("Sources, formules et valeurs exactes", "Sources, formulas and exact values")}><Pressable accessibilityRole="button" onPress={() => setShowSources(!showSources)}><Text style={styles.link}>{showSources ? pick("Masquer", "Hide") : pick("Voir les sources", "View sources")}</Text></Pressable>
        {showSources ? research.periods.map(period => <View key={period.period_end} style={styles.metric}><Text style={styles.label}>{period.period_end.slice(0, 10)} · {period.currency ?? "N/D"} · {period.source_confidence}</Text>
          {period.source_url?.startsWith("https://") ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(period.source_url!)}><Text style={styles.link}>{period.source_name} · {period.filed_at?.slice(0, 10) ?? "N/D"}</Text></Pressable> : <Text style={styles.note}>{period.source_name}</Text>}
          {metrics.map(item => <Text key={item.key} style={styles.note}>{pick(item.fr, item.en)} : {exactFinancialNumber(period[item.key].value, language)} · {period[item.key].status} · {period[item.key].formula}</Text>)}</View>) : null}</Card>
      <Card title={pick("Consensus analystes actuel", "Current analyst consensus")}>
        <Text style={styles.note}>{research.analysts.source_name} · {research.analysts.as_of.slice(0, 10)} · {pick("source secondaire", "secondary source")}</Text>
        {research.analysts.status === "unavailable" ? <Text style={styles.note}>{pick("Consensus indisponible.", "Consensus unavailable.")}</Text> : <>
          <View style={styles.kpis}><View style={styles.kpi}><Text style={styles.note}>{pick("Recommandation", "Recommendation")}</Text><Text style={styles.value}>{analystRecommendation(research.analysts.recommendation_key, language)}</Text></View>
            <View style={styles.kpi}><Text style={styles.note}>{pick("Cible moyenne", "Mean target")}</Text><Text style={styles.value}>{formatFinancialNumber(research.analysts.target_mean, { language })}</Text><Text style={styles.note}>{research.analysts.target_currency ?? pick("devise non vérifiée", "currency unverified")}</Text></View></View>
          {Object.values(research.analysts.distribution).every(value => value !== null) ? Object.entries(research.analysts.distribution).map(([key, count]) => {
            const total = Object.values(research.analysts.distribution).reduce<number>((sum, value) => sum + (value ?? 0), 0);
            return <View key={key} style={styles.metric}><Text style={styles.label}>{analystRecommendation(key, language)} · {count} ({total ? Math.round((count ?? 0) / total * 100) : 0} %)</Text><View style={styles.distributionTrack}><View style={[styles.distributionBar, { width: `${total ? (count ?? 0) / total * 100 : 0}%` }]} /></View></View>;
          }) : null}
          {research.analysts.estimates.map(item => <View key={`${item.period}-${item.end_date}`} style={styles.metric}><Text style={styles.label}>{item.period} · {pick("prévision", "forecast")}</Text><Text style={styles.note}>EPS {formatFinancialNumber(item.eps_average, { language, unit: "eps" })} · {pick("revenus", "revenue")} {formatFinancialNumber(item.revenue_average, { language, unit: "money" })}</Text><Text style={styles.note}>{pick("Analystes", "Analysts")} : {item.eps_analyst_count ?? "N/D"} / {item.revenue_analyst_count ?? "N/D"}</Text></View>)}
          {research.analysts.actual_vs_consensus.length ? <Text style={styles.label}>{pick("Surprises historiques", "Historical surprises")}</Text> : null}
          {research.analysts.actual_vs_consensus.map(item => <Text key={item.period} style={styles.note}>{item.period} · EPS {pick("réel", "actual")} {formatFinancialNumber(item.actual_eps, { language, unit: "eps" })} / {pick("estimé", "estimated")} {formatFinancialNumber(item.estimated_eps, { language, unit: "eps" })}</Text>)}
        </>}
        <Text style={styles.note}>{language === "fr" ? research.analysts.revision_history_reason_fr : research.analysts.revision_history_reason_en}</Text>
      </Card>
      <Card title={pick("Méthode et limites", "Method and limits")}><Pressable accessibilityRole="button" onPress={() => setShowLimits(!showLimits)}>
        <Text style={styles.link}>{showLimits ? pick("Masquer", "Hide") : pick("Afficher", "Show")}</Text></Pressable>
        {showLimits ? (language === "fr" ? research.limitations_fr : research.limitations_en).map(item => <Text key={item} style={styles.note}>• {item}</Text>) : null}</Card>
    </> : null}
  </View>;
}

const styles = createThemedStyles(colors => ({
  stack: { gap: spacing.md }, note: { ...typography.caption, color: colors.textMuted }, label: { ...typography.label, color: colors.text },
  value: { ...typography.body, color: colors.text, fontWeight: "700" },
  link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: { minHeight: 44, justifyContent: "center", padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: { minWidth: 145, flexGrow: 1, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text },
  tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" },
  metric: { gap: spacing.xs, paddingVertical: spacing.sm }, track: { height: 9, borderRadius: radius.sm, backgroundColor: colors.border },
  zero: { position: "absolute", left: "50%", height: 14, borderLeftWidth: 1, borderLeftColor: colors.text },
  bar: { position: "absolute", height: 10, borderRadius: radius.sm, backgroundColor: colors.primary },
  negative: { backgroundColor: "#c66d61" },
  distributionTrack: { height: 7, borderRadius: radius.sm, backgroundColor: colors.border },
  distributionBar: { height: 7, borderRadius: radius.sm, backgroundColor: colors.primary },
}));
