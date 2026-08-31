import { etfXRaySummary, type EtfXRayAnalytics, type EtfXRayScore } from "@anatole/shared/etf-xray";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { compactNumberOrNd, percentOrNd } from "@/src/components/focus/format";
import { Card } from "@/src/components/ui";
import type { EtfHoldingsSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { EtfHoldingsHeatmap } from "./EtfHoldingsHeatmap";

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Allocation({ label, value }: { label: string; value: number }) {
  return <View style={styles.allocation}><View style={styles.allocationLine}><Text style={styles.bodyStrong}>{label}</Text><Text style={styles.value}>{percentOrNd(value)}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, value))}%` }]} /></View></View>;
}

function Score({ label, score, explanation }: { label: string; score: EtfXRayScore; explanation: string }) {
  return <View style={styles.score} testID={`etf-xray-score-${label.toLowerCase()}`}>
    <View style={styles.scoreLine}><Text style={styles.bodyStrong}>{label}</Text><Text style={styles.scoreValue}>{score.value === null ? "N/D" : `${score.value}/100`}</Text></View>
    <View style={styles.track}><View style={[styles.scoreFill, { width: `${score.value ?? 0}%`, backgroundColor: score.value === null ? colors.textSubtle : colors.cyan }]} /></View>
    <Text style={styles.formula}>{explanation}</Text>
  </View>;
}

export function EtfXRay({ snapshot, analytics, onOpen }: { snapshot: EtfHoldingsSnapshot; analytics: EtfXRayAnalytics; onOpen: (ticker: string) => void }) {
  const { language, pick } = useLocale();
  const summary = useMemo(() => etfXRaySummary(snapshot.ticker, analytics, language), [analytics, language, snapshot.ticker]);
  const currency = analytics.currencyWeights;
  const geo = analytics.geographyWeights;
  return <View style={styles.stack} testID="etf-xray-panel">
    <Card title="X-Ray Summary"><View style={styles.summary}>{summary.map((sentence) => <Text key={sentence} style={styles.summaryText}>{sentence}</Text>)}</View></Card>

    <Card title={pick("Exposition", "Exposure")}>
      <View style={styles.metrics}>
        <Metric label={pick("Positions publiées", "Published holdings")} value={String(analytics.holdingCount)} />
        <Metric label={pick("Concentration Top 5", "Top 5 concentration")} value={analytics.top5ConcentrationPercent === null ? "N/D" : percentOrNd(analytics.top5ConcentrationPercent, language)} />
        <Metric label={pick("Concentration Top 10", "Top 10 concentration")} value={analytics.top10ConcentrationPercent === null ? "N/D" : percentOrNd(analytics.top10ConcentrationPercent, language)} />
        <Metric label={pick("Plus gros titre", "Largest holding")} value={analytics.largestHoldingPercent === null ? "N/D" : percentOrNd(analytics.largestHoldingPercent, language)} />
      </View>
      <Text style={styles.subheading}>{pick("Géographie", "Geography")}</Text>
      <View style={styles.metrics}><Metric label="Canada" value={geo.canada === null ? "N/D" : percentOrNd(geo.canada, language)} /><Metric label={pick("États-Unis", "United States")} value={geo.unitedStates === null ? "N/D" : percentOrNd(geo.unitedStates, language)} /><Metric label={pick("International", "International")} value={geo.international === null ? "N/D" : percentOrNd(geo.international, language)} /></View>
      <Text style={styles.subheading}>{pick("Devises des positions", "Holding currencies")}</Text>
      <View style={styles.metrics}><Metric label="CAD" value={currency.cad === null ? "N/D" : percentOrNd(currency.cad, language)} /><Metric label="USD" value={currency.usd === null ? "N/D" : percentOrNd(currency.usd, language)} /><Metric label={pick("Autres", "Other")} value={currency.other === null ? "N/D" : percentOrNd(currency.other, language)} /></View>
      {analytics.assetClasses.length ? <><Text style={styles.subheading}>{pick("Catégories d’actifs", "Asset classes")}</Text>{analytics.assetClasses.map((item) => <Allocation key={item.key} label={item.label} value={item.weight_percent} />)}</> : null}
    </Card>

    <Card title={pick("Mini heatmap des positions", "Holdings mini heatmap")}>
      <Text style={styles.note}>{pick("Couleur = variation réelle · taille = poids publié · N/D si la cotation manque.", "Color = actual change · size = published weight · N/A when the quote is missing.")}</Text>
      <EtfHoldingsHeatmap holdings={snapshot.holdings} onOpen={onOpen} />
    </Card>

    {snapshot.sectors.length ? <Card title={pick("Secteurs", "Sectors")}>
      {analytics.dominantSector ? <Text style={styles.note}>{pick("Secteur dominant", "Dominant sector")} : <Text style={styles.bodyStrong}>{analytics.dominantSector.label} · {percentOrNd(analytics.dominantSector.weight_percent, language)}</Text></Text> : null}
      <Text style={styles.note}>{pick("Concentration sectorielle HHI", "Sector concentration HHI")} : {analytics.sectorConcentrationPercent === null ? "N/D" : `${analytics.sectorConcentrationPercent.toFixed(1)}/100`}</Text>
      {snapshot.sectors.map((item) => <Allocation key={item.key} label={item.label} value={item.weight_percent} />)}
    </Card> : null}

    <Card title={pick("Scores X-Ray", "X-Ray scores")}>
      <Score explanation={pick("35 % nombre de positions + 35 % inverse Top 10 + 30 % inverse HHI sectoriel. Minimum : 10 positions et secteurs publiés.", "35% holding count + 35% inverse Top 10 + 30% inverse sector HHI. Requires 10 holdings and sectors.")} label={pick("Diversification", "Diversification")} score={analytics.scores.diversification} />
      <Score explanation={pick("HHI normalisé des poids publiés. Minimum : 10 positions couvrant 40 %.", "Normalized HHI of published weights. Requires 10 holdings covering 40%.")} label={pick("Concentration", "Concentration")} score={analytics.scores.concentration} />
      <Score explanation={pick("Échelle logarithmique du volume quotidien en dollars : 10 k$ = 0, 100 M$ = 100. Minimum : 5 séances.", "Log scale of average daily dollar volume: $10k = 0, $100m = 100. Requires 5 sessions.")} label={pick("Liquidité", "Liquidity")} score={analytics.scores.liquidity} />
      <Score explanation={pick("60 % volatilité annualisée + 40 % drawdown maximal. Minimum : 20 clôtures réelles.", "60% annualized volatility + 40% maximum drawdown. Requires 20 actual closes.")} label={pick("Risque", "Risk")} score={analytics.scores.risk} />
    </Card>
  </View>;
}

export function EtfRiskPanel({ analytics }: { analytics: EtfXRayAnalytics }) {
  const { language, pick } = useLocale();
  return <View style={styles.stack} testID="etf-risk-panel">
    <Card title={pick("Risque observé", "Observed risk")}>
      <View style={styles.metrics}><Metric label={pick("Volatilité annualisée", "Annualized volatility")} value={analytics.annualizedVolatilityPercent === null ? "N/D" : percentOrNd(analytics.annualizedVolatilityPercent, language)} /><Metric label={pick("Drawdown maximal", "Maximum drawdown")} value={analytics.maximumDrawdownPercent === null ? "N/D" : percentOrNd(analytics.maximumDrawdownPercent, language)} /><Metric label="Beta" value="N/D" /></View>
      <Text style={styles.note}>{pick("Le score reste N/D sans au moins 20 clôtures réelles. Aucun bêta n’est estimé.", "The score stays N/A without at least 20 actual closes. Beta is never estimated.")}</Text>
      <Score explanation={pick("60 % volatilité annualisée + 40 % drawdown maximal.", "60% annualized volatility + 40% maximum drawdown.")} label={pick("Risque", "Risk")} score={analytics.scores.risk} />
    </Card>
    <Card title={pick("Liquidité observée", "Observed liquidity")}><View style={styles.metrics}><Metric label={pick("Volume quotidien moyen", "Average daily volume")} value={compactNumberOrNd(analytics.averageDailyVolume, language)} /><Metric label={pick("Volume quotidien en dollars", "Average dollar volume")} value={compactNumberOrNd(analytics.averageDollarVolume, language)} /></View><Text style={styles.note}>{pick("Calculé sur les 20 dernières séances disponibles, sans estimation d’AUM.", "Calculated from the latest 20 available sessions, without estimating AUM.")}</Text></Card>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md }, summary: { gap: spacing.sm }, summaryText: { ...typography.body, color: colors.text },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { minWidth: "30%", flexGrow: 1, gap: 2, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, metricValue: { ...typography.section, color: colors.text }, metricLabel: { ...typography.caption, color: colors.textMuted },
  subheading: { ...typography.label, color: colors.primary, marginTop: spacing.sm, textTransform: "uppercase" }, bodyStrong: { ...typography.body, color: colors.text, fontWeight: "700" }, value: { ...typography.label, color: colors.text }, note: { ...typography.caption, color: colors.textMuted },
  allocation: { gap: spacing.xs }, allocationLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, track: { height: 7, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised }, fill: { height: "100%", backgroundColor: colors.primary },
  score: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, scoreLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, scoreValue: { ...typography.section, color: colors.text }, scoreFill: { height: "100%" }, formula: { ...typography.caption, color: colors.textSubtle },
});
