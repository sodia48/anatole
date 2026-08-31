import { StyleSheet, Text, View } from "react-native";

import { Card, QueryState, uiStyles } from "@/src/components/ui";
import type { FundamentalMetrics, FundamentalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { moneyOrNd, percentOrNd, valueOrNd } from "./format";

type Metric = { key: keyof FundamentalMetrics; fr: string; en: string; format?: "money" | "percent" | "number" };
const groups: { fr: string; en: string; items: Metric[] }[] = [
  { fr: "Aperçu", en: "Overview", items: [
    { key: "market_cap", fr: "Capitalisation", en: "Market cap", format: "money" }, { key: "enterprise_value", fr: "Valeur d’entreprise", en: "Enterprise value", format: "money" },
    { key: "trailing_pe", fr: "C/B historique", en: "Trailing P/E" }, { key: "forward_pe", fr: "C/B prévisionnel", en: "Forward P/E" }, { key: "price_to_book", fr: "Cours/valeur comptable", en: "P/B" }, { key: "price_to_sales", fr: "Cours/ventes", en: "P/S" },
    { key: "enterprise_to_revenue", fr: "VE/Revenus", en: "EV/Revenue" }, { key: "enterprise_to_ebitda", fr: "VE/BAIIA", en: "EV/EBITDA" }, { key: "beta", fr: "Bêta", en: "Beta" }, { key: "fifty_two_week_high", fr: "Haut 52 sem.", en: "52w high", format: "money" }, { key: "fifty_two_week_low", fr: "Bas 52 sem.", en: "52w low", format: "money" },
  ] },
  { fr: "Dividendes", en: "Dividends", items: [{ key: "dividend_rate", fr: "Taux annuel", en: "Annual rate", format: "money" }, { key: "dividend_yield", fr: "Rendement", en: "Yield", format: "percent" }, { key: "payout_ratio", fr: "Ratio de distribution", en: "Payout ratio", format: "percent" }] },
  { fr: "Croissance", en: "Growth", items: [{ key: "revenue_growth", fr: "Croissance revenus", en: "Revenue growth", format: "percent" }, { key: "earnings_growth", fr: "Croissance bénéfices", en: "Earnings growth", format: "percent" }] },
  { fr: "Rentabilité", en: "Profitability", items: [{ key: "gross_margin", fr: "Marge brute", en: "Gross margin", format: "percent" }, { key: "operating_margin", fr: "Marge opérationnelle", en: "Operating margin", format: "percent" }, { key: "profit_margin", fr: "Marge nette", en: "Profit margin", format: "percent" }, { key: "return_on_assets", fr: "Rendement actifs", en: "ROA", format: "percent" }, { key: "return_on_equity", fr: "Rendement capitaux", en: "ROE", format: "percent" }] },
  { fr: "Trésorerie / dette", en: "Cash / debt", items: [{ key: "total_cash", fr: "Trésorerie", en: "Cash", format: "money" }, { key: "total_debt", fr: "Dette", en: "Debt", format: "money" }, { key: "debt_to_equity", fr: "Dette/capitaux", en: "Debt/equity" }, { key: "current_ratio", fr: "Ratio courant", en: "Current ratio" }, { key: "quick_ratio", fr: "Ratio rapide", en: "Quick ratio" }] },
  { fr: "Flux de trésorerie", en: "Cash flow", items: [{ key: "operating_cash_flow", fr: "Flux opérationnel", en: "Operating cash flow", format: "money" }, { key: "free_cash_flow", fr: "Flux disponible", en: "Free cash flow", format: "money" }] },
];

function display(value: number | null, format: Metric["format"], currency: string, language: "fr" | "en"): string {
  if (format === "money") return moneyOrNd(value, currency, true, language);
  if (format === "percent") return percentOrNd(value, language);
  return valueOrNd(value, 2, language);
}

export function MobileFocusFundamentals({ snapshot, loading, error, onRetry }: { snapshot?: FundamentalSnapshot; loading: boolean; error: Error | null; onRetry: () => void }) {
  const { language, pick } = useLocale();
  const currency = snapshot?.financial_currency ?? snapshot?.currency ?? "CAD";
  return <View style={styles.stack} testID="focus-fundamentals-section"><QueryState error={!snapshot ? error : null} loading={loading} onRetry={onRetry} />{snapshot ? <>
    {groups.map((group) => <Card key={group.en} title={pick(group.fr, group.en)}>{group.items.map((item) => <View key={item.key} style={uiStyles.row}><Text style={uiStyles.label}>{pick(item.fr, item.en)}</Text><Text style={styles.value}>{display(snapshot.metrics[item.key], item.format, currency, language)}</Text></View>)}</Card>)}
    <Card title="TTM"><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Revenus", "Revenue")}</Text><Text style={styles.value}>{moneyOrNd(snapshot.ttm.total_revenue, snapshot.ttm.currency ?? currency, true, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>BAIIA / EBITDA</Text><Text style={styles.value}>{moneyOrNd(snapshot.ttm.ebitda, snapshot.ttm.currency ?? currency, true, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Bénéfice net", "Net income")}</Text><Text style={styles.value}>{moneyOrNd(snapshot.ttm.net_income, snapshot.ttm.currency ?? currency, true, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>FCF</Text><Text style={styles.value}>{moneyOrNd(snapshot.ttm.free_cash_flow, snapshot.ttm.currency ?? currency, true, language)}</Text></View></Card>
    <Card title={pick("Couverture et provenance", "Coverage and provenance")}><Text style={styles.status}>{snapshot.status.toUpperCase()} · {snapshot.official_coverage.status.toUpperCase()}</Text><Text style={styles.source}>{snapshot.source}</Text>{snapshot.official_coverage.message || snapshot.message ? <Text style={styles.source}>{snapshot.official_coverage.message ?? snapshot.message}</Text> : null}<Text style={styles.source}>{pick("Périodes officielles", "Official periods")}: {snapshot.official_coverage.official_periods} · {pick("Champs officiels", "Official fields")}: {snapshot.official_coverage.official_fields}</Text></Card>
  </> : null}</View>;
}
const styles = StyleSheet.create({ stack: { gap: spacing.md }, value: { ...typography.body, color: colors.text, fontWeight: "700", textAlign: "right", flexShrink: 1 }, status: { ...typography.label, color: colors.primary }, source: { ...typography.caption, color: colors.textMuted } });
