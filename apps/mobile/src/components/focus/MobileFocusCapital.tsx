import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import type { CapitalMetricKey, CapitalValue, FundamentalCapitalResearch } from "@anatole/shared/fundamental-capital";
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
  if (value.value === null) return language === "fr" ? "N/D" : "N/A";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value.value)}${percent ? " %" : currency ? ` ${currency}` : ""}`;
}

export function MobileFocusCapital({ research, loading, error, onRetry }: {
  research?: FundamentalCapitalResearch; loading: boolean; error: Error | null; onRetry: () => void;
}) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [mode, choose] = useMobileFocusMode("anatole.focus.mobile.capital.view.v1", modes);
  const [selected, setSelected] = useState<CapitalMetricKey[]>(["operating_cash_flow", "capital_expenditure", "dividends", "repurchases", "cash_after_allocations"]);
  const [showLimits, setShowLimits] = useState(false);
  const shown = metrics.filter(item => selected.includes(item.key));
  return <View style={styles.stack} testID="focus-capital-section">
    <QueryState error={!research ? error : null} loading={loading} onRetry={onRetry} />
    <Card title={pick("Allocation du capital et analystes", "Capital allocation and analysts")}>
      <Text style={styles.note}>{pick("Exercices publiés et calculs explicités; consensus actuel séparé de l’historique.",
        "Published fiscal years and explicit calculations; current consensus separate from history.")}</Text>
    </Card>
    {research ? <>
      {research.stale ? <Text style={styles.note}>{pick("Instantané périmé : vérifiez les dates.", "Stale snapshot: check dates.")}</Text> : null}
      {research.periods.length ? <>
        <MobileFocusViewMode mode={mode} choose={choose} modes={modes} />
        <Card title={pick("Indicateurs affichés", "Visible metrics")}><View style={styles.choices}>{metrics.map(item => <Pressable key={item.key}
          accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.key) }}
          onPress={() => setSelected(previous => previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key])}
          style={[styles.choice, selected.includes(item.key) && styles.active]}><Text style={styles.label}>{pick(item.fr, item.en)}</Text></Pressable>)}</View></Card>
        {mode === "table" ? <Card title={pick("Flux et allocations", "Flows and allocations")}><ScrollView horizontal showsHorizontalScrollIndicator>
          <View><View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Indicateur", "Metric")}</Text>{research.periods.map(period => <Text key={period.period_end} style={styles.tableCell}>{period.period_end.slice(0, 10)}</Text>)}</View>
            {shown.map(item => <View key={item.key} style={styles.tableRow}><Text style={styles.tableLabel}>{pick(item.fr, item.en)}</Text>
              {research.periods.map(period => <Text key={period.period_end} style={styles.tableCell}>{formatted(period[item.key], period.currency, language, item.percent)}</Text>)}</View>)}</View>
        </ScrollView></Card> : null}
        {mode === "cards" || mode === "charts" ? research.periods.map(period => <Card key={period.period_end} title={`${period.period_end.slice(0, 10)} · ${period.currency ?? "N/D"}`}>
          {period.source_url?.startsWith("https://") ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(period.source_url!)}>
            <Text style={styles.link}>{period.source_name} · {period.filed_at?.slice(0, 10) ?? "N/D"}</Text></Pressable> : <Text style={styles.note}>{period.source_name}</Text>}
          {shown.map(item => <View key={item.key} style={styles.metric}><Text style={styles.label}>{pick(item.fr, item.en)} · {formatted(period[item.key], period.currency, language, item.percent)}</Text>
            {mode === "charts" ? <View style={styles.track}><View style={[styles.bar, { width: `${Math.abs(period[item.key].value ?? 0) /
              Math.max(1, ...research.periods.map(value => Math.abs(value[item.key].value ?? 0))) * 100}%` }]} /></View> : null}
            <Text style={styles.note}>{period[item.key].formula}</Text></View>)}</Card>) : null}
      </> : <Card title={pick("Allocation du capital", "Capital allocation")}><Text style={styles.note}>{pick("Aucun exercice annuel vérifiable.", "No verifiable annual fiscal year.")}</Text></Card>}
      <Card title={pick("Consensus analystes actuel", "Current analyst consensus")}>
        <Text style={styles.note}>{research.analysts.source_name} · {research.analysts.as_of.slice(0, 10)} · {pick("source secondaire", "secondary source")}</Text>
        {research.analysts.status === "unavailable" ? <Text style={styles.note}>{pick("Consensus indisponible.", "Consensus unavailable.")}</Text> : <>
          <Text style={styles.label}>{pick("Recommandation", "Recommendation")} : {research.analysts.recommendation_key ?? "N/D"}</Text>
          <Text style={styles.label}>{pick("Cible moyenne", "Mean target")} : {research.analysts.target_mean ?? "N/D"} ({pick("devise non vérifiée", "currency unverified")})</Text>
          <Text style={styles.note}>{Object.entries(research.analysts.distribution).map(([key, count]) => `${key}: ${count ?? "N/D"}`).join(" · ")}</Text>
          {research.analysts.estimates.map(item => <Text key={`${item.period}-${item.end_date}`} style={styles.note}>{item.period} · EPS {item.eps_average ?? "N/D"}</Text>)}
          {research.analysts.actual_vs_consensus.map(item => <Text key={item.period} style={styles.note}>{item.period} · EPS {pick("réel", "actual")} {item.actual_eps} / {pick("estimé", "estimated")} {item.estimated_eps} · Δ {item.difference_eps}</Text>)}
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
  link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: { minHeight: 44, justifyContent: "center", padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text },
  tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" },
  metric: { gap: spacing.xs, paddingVertical: spacing.sm }, track: { height: 9, borderRadius: radius.sm, backgroundColor: colors.border },
  bar: { height: 9, borderRadius: radius.sm, backgroundColor: colors.primary },
}));
