import { StyleSheet, Text, View } from "react-native";
import { Card, QueryState, uiStyles } from "@/src/components/ui";
import type { FundamentalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { spacing, typography } from "@/src/theme/tokens";
import { moneyOrNd, percentOrNd, valueOrNd } from "./format";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { MobileFocusViewMode, useMobileFocusMode } from "./MobileFocusViewMode";
import { MobileFocusSeries } from "./MobileFocusSeries";

const modes = ["table", "cards", "charts"] as const;

export function MobileFocusAnalysts({ snapshot, loading, error, onRetry }: { snapshot?: FundamentalSnapshot; loading: boolean; error: Error | null; onRetry: () => void }) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [mode, chooseMode] = useMobileFocusMode("anatole.focus.mobile.analysts.view.v2", modes);
  const a = snapshot?.analysts;
  const currency = snapshot?.currency ?? "CAD";
  const distribution = a ? [
    [pick("Achat fort", "Strong buy"), a.strong_buy], [pick("Achat", "Buy"), a.buy],
    [pick("Conserver", "Hold"), a.hold], [pick("Vente", "Sell"), a.sell],
    [pick("Vente forte", "Strong sell"), a.strong_sell],
  ] as const : [];
  const total = distribution.reduce((sum, [, value]) => sum + (value ?? 0), 0);
  const targets = a ? [
    [pick("Cours observé", "Current price"), a.current_price], [pick("Cible basse", "Low target"), a.target_low],
    [pick("Cible médiane", "Median target"), a.target_median], [pick("Cible moyenne", "Mean target"), a.target_mean],
    [pick("Cible haute", "High target"), a.target_high],
  ] as const : [];
  const targetValues = targets.map(([, value]) => value).filter((value): value is number => value !== null && Number.isFinite(value));
  const low = Math.min(...targetValues);
  const span = Math.max(...targetValues) - low || 1;
  return <View style={styles.stack} testID="focus-analysts-section"><QueryState error={!snapshot ? error : null} loading={loading} onRetry={onRetry} />{snapshot && a ? <>
    <MobileFocusViewMode mode={mode} choose={chooseMode} modes={modes} />
    {mode === "cards" ? <>
    <Card title={pick("Consensus", "Consensus")}><Text style={styles.recommendation}>{a.recommendation_key?.replaceAll("_", " ").toUpperCase() ?? "N/D"}</Text><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Nombre d’analystes", "Analyst count")}</Text><Text style={styles.value}>{valueOrNd(a.analyst_count, 0, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Cible basse", "Target low")}</Text><Text style={styles.value}>{moneyOrNd(a.target_low, currency, false, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Cible moyenne", "Target mean")}</Text><Text style={styles.value}>{moneyOrNd(a.target_mean, currency, false, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Cible médiane", "Target median")}</Text><Text style={styles.value}>{moneyOrNd(a.target_median, currency, false, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Cible haute", "Target high")}</Text><Text style={styles.value}>{moneyOrNd(a.target_high, currency, false, language)}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Potentiel vers moyenne", "Upside to mean")}</Text><Text style={styles.value}>{percentOrNd(a.upside_to_mean_percent, language)}</Text></View></Card>
    <Card title={pick("Répartition", "Distribution")}><View style={styles.ratings}>{distribution.map(([label, value]) => <View key={label} style={styles.rating}><Text style={styles.ratingValue}>{valueOrNd(value, 0, language)}</Text><Text style={styles.ratingLabel}>{label}</Text></View>)}</View></Card>
    </> : null}
    {mode === "table" ? <Card title={pick("Consensus détaillé", "Detailed consensus")}>
      <Text style={styles.recommendation}>{a.recommendation_key?.replaceAll("_", " ").toUpperCase() ?? "N/D"}</Text>
      <View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Analystes", "Analysts")}</Text><Text style={styles.value}>{valueOrNd(a.analyst_count, 0, language)}</Text></View>
      {targets.map(([label, value]) => <View key={label} style={styles.tableRow}><Text style={uiStyles.label}>{label}</Text><Text style={styles.value}>{moneyOrNd(value, currency, false, language)}</Text></View>)}
      {distribution.map(([label, value]) => <View key={label} style={styles.tableRow}><Text style={uiStyles.label}>{label}</Text><Text style={styles.value}>{valueOrNd(value, 0, language)}</Text></View>)}
      <Text style={styles.line}>{pick("Source", "Source")}: {snapshot.source}</Text>
    </Card> : null}
    {mode === "charts" ? <Card title={pick("Distribution et objectifs", "Distribution and targets")}>
      <Text style={styles.line}>{pick("Analystes", "Analysts")}: {valueOrNd(a.analyst_count, 0, language)} · {snapshot.source}</Text>
      {distribution.map(([label, value]) => <View key={label} style={styles.chartRow}><Text style={styles.ratingLabel}>{label}: {valueOrNd(value, 0, language)}</Text><View style={styles.track}><View style={[styles.fill, { width: `${total > 0 ? (value ?? 0) / total * 100 : 0}%` }]} /></View></View>)}
      {targetValues.length > 1 ? targets.map(([label, value]) => value === null ? null : <View key={label} style={styles.chartRow}><Text style={styles.ratingLabel}>{label}: {moneyOrNd(value, currency, false, language)}</Text><View style={styles.track}><View style={[styles.marker, { marginLeft: `${(value - low) / span * 95}%` }]} /></View></View>)
        : <Text style={styles.line}>{pick("Fourchette insuffisante.", "Insufficient target range.")}</Text>}
    </Card> : null}
    {mode === "charts" ? <>
      <MobileFocusSeries title={pick("BPA réel et consensus", "Actual and consensus EPS")}
        periods={snapshot.earnings_history.map(row => row.period)}
        series={[
          { id: "actual", fr: "BPA réel", en: "Actual EPS", values: snapshot.earnings_history.map(row => row.actual) },
          { id: "estimate", fr: "Consensus", en: "Consensus", values: snapshot.earnings_history.map(row => row.estimate) },
        ]} currency={currency} source={snapshot.source} />
      <MobileFocusSeries title={pick("Surprise du BPA", "EPS surprise")}
        periods={snapshot.earnings_history.map(row => row.period)}
        series={[{ id: "surprise", fr: "Surprise", en: "Surprise", values: snapshot.earnings_history.map(row => row.surprise_percent) }]}
        currency={currency} source={snapshot.source} unit="percent" />
      <MobileFocusSeries title={pick("BPA prévu", "Forecast EPS")}
        periods={snapshot.earnings_estimates.filter(row => row.period.endsWith("q")).map(row => row.end_date ?? row.period)}
        series={[{ id: "eps", fr: "BPA moyen", en: "Average EPS", values: snapshot.earnings_estimates.filter(row => row.period.endsWith("q")).map(row => row.eps_average) }]}
        currency={currency} source={snapshot.source} forecast />
      <MobileFocusSeries title={pick("Revenus prévus", "Forecast revenue")}
        periods={snapshot.earnings_estimates.filter(row => row.period.endsWith("y")).map(row => row.end_date ?? row.period)}
        series={[{ id: "revenue", fr: "Revenus moyens", en: "Average revenue", values: snapshot.earnings_estimates.filter(row => row.period.endsWith("y")).map(row => row.revenue_average) }]}
        currency={currency} source={snapshot.source} forecast />
    </> : null}
    <Card title={pick("Historique des résultats", "Earnings history")}>{snapshot.earnings_history.length ? snapshot.earnings_history.map((row) => <View key={row.period} style={styles.block}><Text style={styles.blockTitle}>{row.period}</Text><Text style={styles.line}>{pick("Réel", "Actual")}: {valueOrNd(row.actual, 2, language)} · {pick("Estimé", "Estimate")}: {valueOrNd(row.estimate, 2, language)} · {pick("Surprise", "Surprise")}: {percentOrNd(row.surprise_percent, language)}</Text></View>) : <Text style={styles.line}>N/D</Text>}</Card>
    <Card title={pick("Estimations", "Estimates")}>{snapshot.earnings_estimates.length ? snapshot.earnings_estimates.map((row) => <View key={row.period} style={styles.block}><Text style={styles.blockTitle}>{row.period} {row.end_date ?? ""}</Text><Text style={styles.line}>EPS {valueOrNd(row.eps_low, 2, language)} — {valueOrNd(row.eps_average, 2, language)} — {valueOrNd(row.eps_high, 2, language)} · n={valueOrNd(row.eps_analyst_count, 0, language)}</Text><Text style={styles.line}>{pick("Revenus", "Revenue")} {moneyOrNd(row.revenue_low, currency, true, language)} — {moneyOrNd(row.revenue_average, currency, true, language)} — {moneyOrNd(row.revenue_high, currency, true, language)} · n={valueOrNd(row.revenue_analyst_count, 0, language)}</Text></View>) : <Text style={styles.line}>N/D</Text>}</Card>
    <Card title={pick("Événements", "Events")}><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Résultats", "Earnings")}</Text><Text style={styles.value}>{snapshot.events.earnings_dates[0] ? new Date(snapshot.events.earnings_dates[0]).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA") : "N/D"}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>Ex-dividende</Text><Text style={styles.value}>{snapshot.events.ex_dividend_date ? new Date(snapshot.events.ex_dividend_date).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA") : "N/D"}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Dividende", "Dividend")}</Text><Text style={styles.value}>{snapshot.events.dividend_date ? new Date(snapshot.events.dividend_date).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA") : "N/D"}</Text></View></Card>
  </> : null}</View>;
}
const styles = createThemedStyles((colors) => ({ stack: { gap: spacing.md }, recommendation: { ...typography.title, color: colors.primary }, value: { ...typography.body, color: colors.text, fontWeight: "700", textAlign: "right" }, ratings: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, rating: { flexGrow: 1, minWidth: "28%", padding: spacing.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center" }, ratingValue: { ...typography.section, color: colors.text }, ratingLabel: { ...typography.caption, color: colors.textMuted }, block: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, blockTitle: { ...typography.label, color: colors.text }, line: { ...typography.caption, color: colors.textMuted }, tableRow: { ...uiStyles.row, borderBottomWidth: 1, borderBottomColor: colors.border }, chartRow: { gap: spacing.xs, marginVertical: spacing.xs }, track: { height: 12, borderRadius: 6, backgroundColor: colors.border, overflow: "hidden" }, fill: { height: 12, backgroundColor: colors.primary }, marker: { width: 3, height: 12, backgroundColor: colors.primary } }));
