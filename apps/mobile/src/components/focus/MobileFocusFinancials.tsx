import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, QueryState, uiStyles } from "@/src/components/ui";
import type { FinancialPeriod, FundamentalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { moneyOrNd, percentOrNd } from "./format";

const fields: { key: keyof FinancialPeriod; fr: string; en: string; percent?: boolean }[] = [
  { key: "total_revenue", fr: "Revenus", en: "Revenue" }, { key: "gross_profit", fr: "Profit brut", en: "Gross profit" }, { key: "operating_income", fr: "Résultat opérationnel", en: "Operating income" }, { key: "ebitda", fr: "BAIIA", en: "EBITDA" }, { key: "net_income", fr: "Bénéfice net", en: "Net income" }, { key: "diluted_eps", fr: "BPA dilué", en: "Diluted EPS" }, { key: "operating_cash_flow", fr: "Flux opérationnel", en: "OCF" }, { key: "capital_expenditure", fr: "Dépenses en capital", en: "Capex" }, { key: "free_cash_flow", fr: "Flux disponible", en: "FCF" }, { key: "total_cash", fr: "Trésorerie", en: "Cash" }, { key: "total_debt", fr: "Dette", en: "Debt" }, { key: "total_assets", fr: "Actifs", en: "Assets" }, { key: "total_liabilities", fr: "Passifs", en: "Liabilities" }, { key: "stockholder_equity", fr: "Capitaux propres", en: "Equity" }, { key: "gross_margin", fr: "Marge brute", en: "Gross margin", percent: true }, { key: "operating_margin", fr: "Marge opérationnelle", en: "Operating margin", percent: true }, { key: "net_margin", fr: "Marge nette", en: "Net margin", percent: true }, { key: "revenue_growth_yoy", fr: "Croissance revenus", en: "Revenue growth", percent: true },
];

export function MobileFocusFinancials({ snapshot, loading, error, onRetry }: { snapshot?: FundamentalSnapshot; loading: boolean; error: Error | null; onRetry: () => void }) {
  const { language, pick } = useLocale();
  const [kind, setKind] = useState<"annual" | "quarterly">("annual");
  const periods = kind === "annual" ? snapshot?.annual_financials ?? [] : snapshot?.quarterly_financials ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = periods[Math.min(selectedIndex, Math.max(0, periods.length - 1))];
  const populated = useMemo(() => fields.filter((field) => selected?.[field.key] !== null && selected?.[field.key] !== undefined), [selected]);
  return <View style={styles.stack} testID="focus-financials-section"><QueryState error={!snapshot ? error : null} loading={loading} onRetry={onRetry} />{snapshot ? <>
    <View style={styles.segment}>{(["annual", "quarterly"] as const).map((value) => <Pressable key={value} onPress={() => { setKind(value); setSelectedIndex(0); }} style={[styles.segmentButton, kind === value && styles.active]}><Text style={styles.segmentText}>{value === "annual" ? pick("Annuel", "Annual") : pick("Trimestriel", "Quarterly")}</Text></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.periods} horizontal showsHorizontalScrollIndicator={false}>{periods.map((period, index) => <Pressable key={`${period.period_end}-${index}`} onPress={() => setSelectedIndex(index)} style={[styles.period, index === selectedIndex && styles.active]}><Text style={styles.periodText}>{new Date(period.period_end).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "short" })}</Text></Pressable>)}</ScrollView>
    {selected ? <Card title={`${kind === "annual" ? pick("Exercice", "Fiscal year") : pick("Trimestre", "Quarter")} · ${new Date(selected.period_end).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA")}`}>{populated.map((field) => <View key={field.key} style={uiStyles.row}><Text style={uiStyles.label}>{pick(field.fr, field.en)}</Text><Text style={styles.value}>{field.percent ? percentOrNd(selected[field.key] as number | null, language) : moneyOrNd(selected[field.key] as number | null, selected.currency ?? snapshot.financial_currency ?? "CAD", true, language)}</Text></View>)}{selected.source ? <Text style={styles.source}>{selected.source.source_name} · {selected.source.filed_at ? new Date(selected.source.filed_at).toLocaleDateString() : pick("date N/D", "date N/A")}</Text> : null}</Card> : <Card><Text style={styles.empty}>{pick("Aucune période disponible.", "No period available.")}</Text></Card>}
  </> : null}</View>;
}
const styles = StyleSheet.create({ stack: { gap: spacing.md }, segment: { flexDirection: "row", padding: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, active: { backgroundColor: "rgba(44,156,255,.22)", borderColor: colors.primary }, segmentText: { ...typography.label, color: colors.text }, periods: { gap: spacing.xs }, period: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, periodText: { ...typography.caption, color: colors.text }, value: { ...typography.body, color: colors.text, fontWeight: "700", textAlign: "right" }, source: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm }, empty: { ...typography.body, color: colors.textMuted } });
