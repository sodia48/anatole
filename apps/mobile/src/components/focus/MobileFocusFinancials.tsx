import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Card, QueryState, uiStyles } from "@/src/components/ui";
import type { FinancialPeriod, FundamentalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { moneyOrNd, percentOrNd } from "./format";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { MobileFocusSeries } from "./MobileFocusSeries";
import { MobileFocusViewMode, useMobileFocusMode } from "./MobileFocusViewMode";
import { focusFiscalYearEndMonth, focusPeriodLabel } from "@anatole/shared/focus-chart";

const modes = ["table", "cards", "charts"] as const;

const fields: { key: keyof FinancialPeriod; fr: string; en: string; percent?: boolean }[] = [
  { key: "total_revenue", fr: "Revenus", en: "Revenue" }, { key: "gross_profit", fr: "Profit brut", en: "Gross profit" }, { key: "operating_income", fr: "Résultat opérationnel", en: "Operating income" }, { key: "ebitda", fr: "BAIIA", en: "EBITDA" }, { key: "net_income", fr: "Bénéfice net", en: "Net income" }, { key: "diluted_eps", fr: "BPA dilué", en: "Diluted EPS" }, { key: "operating_cash_flow", fr: "Flux opérationnel", en: "OCF" }, { key: "capital_expenditure", fr: "Dépenses en capital", en: "Capex" }, { key: "free_cash_flow", fr: "Flux disponible", en: "FCF" }, { key: "total_cash", fr: "Trésorerie", en: "Cash" }, { key: "total_debt", fr: "Dette", en: "Debt" }, { key: "total_assets", fr: "Actifs", en: "Assets" }, { key: "total_liabilities", fr: "Passifs", en: "Liabilities" }, { key: "stockholder_equity", fr: "Capitaux propres", en: "Equity" }, { key: "gross_margin", fr: "Marge brute", en: "Gross margin", percent: true }, { key: "operating_margin", fr: "Marge opérationnelle", en: "Operating margin", percent: true }, { key: "net_margin", fr: "Marge nette", en: "Net margin", percent: true }, { key: "revenue_growth_yoy", fr: "Croissance revenus", en: "Revenue growth", percent: true },
];

export function MobileFocusFinancials({ snapshot, loading, error, onRetry }: { snapshot?: FundamentalSnapshot; loading: boolean; error: Error | null; onRetry: () => void }) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [mode, chooseMode] = useMobileFocusMode("anatole.focus.mobile.financials.view.v2", modes);
  const [kind, setKind] = useState<"annual" | "quarterly">("annual");
  const periods = kind === "annual" ? snapshot?.annual_financials ?? [] : snapshot?.quarterly_financials ?? [];
  const fiscalYearEndMonth = focusFiscalYearEndMonth(snapshot?.annual_financials ?? []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = periods[Math.min(selectedIndex, Math.max(0, periods.length - 1))];
  const populated = fields.filter((field) => selected?.[field.key] !== null && selected?.[field.key] !== undefined);
  return <View style={styles.stack} testID="focus-financials-section"><QueryState error={!snapshot ? error : null} loading={loading} onRetry={onRetry} />{snapshot ? <>
    <View style={styles.segment}>{(["annual", "quarterly"] as const).map((value) => <Pressable key={value} onPress={() => { setKind(value); setSelectedIndex(0); }} style={[styles.segmentButton, kind === value && styles.active]}><Text style={styles.segmentText}>{value === "annual" ? pick("Annuel", "Annual") : pick("Trimestriel", "Quarterly")}</Text></Pressable>)}</View>
    <MobileFocusViewMode mode={mode} choose={chooseMode} modes={modes} />
    {mode === "cards" ? <>
      <ScrollView contentContainerStyle={styles.periods} horizontal showsHorizontalScrollIndicator={false}>{periods.map((period, index) => <Pressable key={`${period.period_end}-${index}`} onPress={() => setSelectedIndex(index)} style={[styles.period, index === selectedIndex && styles.active]}><Text style={styles.periodText}>{focusPeriodLabel(period.period_end, kind, fiscalYearEndMonth)}</Text></Pressable>)}</ScrollView>
      {selected ? <Card title={`${kind === "annual" ? pick("Exercice", "Fiscal year") : pick("Trimestre", "Quarter")} · ${new Date(selected.period_end).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA")}`}>{populated.map((field) => <View key={field.key} style={uiStyles.row}><Text style={uiStyles.label}>{pick(field.fr, field.en)}</Text><Text style={styles.value}>{field.percent ? percentOrNd(selected[field.key] as number | null, language) : moneyOrNd(selected[field.key] as number | null, selected.currency ?? snapshot.financial_currency ?? "CAD", true, language)}</Text></View>)}{selected.source ? <Text style={styles.source}>{selected.source.source_name} · {selected.source.filed_at ? new Date(selected.source.filed_at).toLocaleDateString() : pick("date N/D", "date N/A")}</Text> : null}</Card> : <Card><Text style={styles.empty}>{pick("Aucune période disponible.", "No period available.")}</Text></Card>}
    </> : null}
    {mode === "table" ? <Card title={pick("États financiers publiés", "Published financial statements")}>
      <ScrollView horizontal showsHorizontalScrollIndicator><View>
        <View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Indicateur", "Metric")}</Text>{periods.map(row => <Text key={row.period_end} style={styles.tableCell}>{focusPeriodLabel(row.period_end, kind, fiscalYearEndMonth)} · {row.period_end.slice(0, 10)}</Text>)}</View>
        {fields.map(field => <View key={field.key} style={styles.tableRow}><Text style={styles.tableLabel}>{pick(field.fr, field.en)}</Text>{periods.map(row => <Text key={row.period_end} style={styles.tableCell}>{field.percent ? percentOrNd(row[field.key] as number | null, language) : moneyOrNd(row[field.key] as number | null, row.currency ?? snapshot.financial_currency ?? "CAD", true, language)}</Text>)}</View>)}
        <View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Source", "Source")}</Text>{periods.map(row => <Text key={row.period_end} style={styles.tableCell}>{row.source?.source_name ?? snapshot.source}</Text>)}</View>
        <View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Date de dépôt", "Filed date")}</Text>{periods.map(row => <Text key={row.period_end} style={styles.tableCell}>{row.source?.filed_at ?? "N/D"}</Text>)}</View>
      </View></ScrollView><Text style={styles.source}>{snapshot.source}</Text>
    </Card> : null}
    {mode === "charts" ? <><MobileFocusSeries storageKey={`mobile.financials.${kind}.money`} title={pick("Évolution des résultats publiés", "Published financial history")}
      frequency={kind} fiscalYearEndMonth={fiscalYearEndMonth}
      periods={[...periods].reverse().map(row => row.period_end)}
      series={fields.filter(field => !field.percent && field.key !== "diluted_eps").map(field => ({ id: field.key, fr: field.fr, en: field.en, values: [...periods].reverse().map(row => row[field.key] as number | null) }))}
      currency={snapshot.financial_currency ?? snapshot.currency ?? "CAD"} currencies={[...periods].reverse().map(row => row.currency ?? snapshot.financial_currency ?? snapshot.currency ?? "CAD")} source={snapshot.source}
      sources={[...periods].reverse().map(row => `${row.source?.source_name ?? snapshot.source} · ${row.source?.filed_at ?? "N/D"}`)} />
      <MobileFocusSeries storageKey={`mobile.financials.${kind}.percent`} title={pick("Marges et croissance publiées", "Published margins and growth")}
        frequency={kind} fiscalYearEndMonth={fiscalYearEndMonth}
        periods={[...periods].reverse().map(row => row.period_end)}
        series={fields.filter(field => field.percent).map(field => ({ id: field.key, fr: field.fr, en: field.en, values: [...periods].reverse().map(row => row[field.key] as number | null) }))}
        currency={snapshot.financial_currency ?? snapshot.currency ?? "CAD"} currencies={[...periods].reverse().map(row => row.currency ?? snapshot.financial_currency ?? snapshot.currency ?? "CAD")} source={snapshot.source}
        sources={[...periods].reverse().map(row => `${row.source?.source_name ?? snapshot.source} · ${row.source?.filed_at ?? "N/D"}`)} unit="percent" />
      <MobileFocusSeries storageKey={`mobile.financials.${kind}.eps`} title={pick("BPA dilué publié", "Published diluted EPS")}
        frequency={kind} fiscalYearEndMonth={fiscalYearEndMonth}
        periods={[...periods].reverse().map(row => row.period_end)}
        series={[{ id: "diluted_eps", fr: "BPA dilué", en: "Diluted EPS", values: [...periods].reverse().map(row => row.diluted_eps) }]}
        currency={snapshot.financial_currency ?? snapshot.currency ?? "CAD"} currencies={[...periods].reverse().map(row => row.currency ?? snapshot.financial_currency ?? snapshot.currency ?? "CAD")} source={snapshot.source}
        sources={[...periods].reverse().map(row => `${row.source?.source_name ?? snapshot.source} · ${row.source?.filed_at ?? "N/D"}`)} unit="per_share" />
    </> : null}
  </> : null}</View>;
}
const styles = createThemedStyles((colors) => ({ stack: { gap: spacing.md }, segment: { flexDirection: "row", padding: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, active: { backgroundColor: "rgba(44,156,255,.22)", borderColor: colors.primary }, segmentText: { ...typography.label, color: colors.text }, periods: { gap: spacing.xs }, period: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, periodText: { ...typography.caption, color: colors.text }, value: { ...typography.body, color: colors.text, fontWeight: "700", textAlign: "right" }, source: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm }, empty: { ...typography.body, color: colors.textMuted }, tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }, tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text }, tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" } }));
