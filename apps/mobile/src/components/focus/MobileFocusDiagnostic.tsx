import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import type { FundamentalDiagnostic, FundamentalMeasure, FundamentalObservation } from "@anatole/shared/fundamental-intelligence";
import { Card, QueryState, uiStyles } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { spacing, typography } from "@/src/theme/tokens";
import { MobileFocusSeries } from "./MobileFocusSeries";
import { MobileFocusViewMode, useMobileFocusMode } from "./MobileFocusViewMode";

const modes = ["table", "cards", "charts"] as const;

function formatted(point: FundamentalObservation | undefined, language: "fr" | "en") {
  if (!point) return language === "fr" ? "N/D" : "N/A";
  const number = new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(point.value);
  return `${number}${point.unit === "percent" ? " %" : point.unit === "ratio" ? "×" : point.currency ? ` ${point.currency}` : ""}`;
}

function Source({ point }: { point: FundamentalObservation }) {
  const { pick } = useLocale();
  const label = `${point.source_name} · ${point.period_end.slice(0, 10)}${point.filed_at ? ` · ${point.filed_at.slice(0, 10)}` : ""}`;
  if (!point.source_url?.startsWith("https://")) return <Text style={styles.source}>{label} · {pick("URL indisponible", "URL unavailable")}</Text>;
  return <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(point.source_url!)}><Text style={styles.link}>{label}</Text></Pressable>;
}

function Measure({ measure }: { measure: FundamentalMeasure }) {
  const { language, pick } = useLocale();
  const point = measure.observations[0];
  return <View style={styles.measure} testID={`focus-diagnostic-measure-${measure.key}`}>
    <Text style={styles.label}>{pick(measure.label_fr, measure.label_en)}</Text>
    <Text style={styles.value}>{formatted(point, language)}</Text>
    {point ? <Source point={point} /> : <Text style={styles.note}>{pick(measure.reason_fr ?? "Données insuffisantes", measure.reason_en ?? "Insufficient data")}</Text>}
    <Text style={styles.note}>{pick(measure.method_fr, measure.method_en)}</Text>
    {measure.observations.slice(1).map(history => <View key={history.period_end} style={styles.history}>
      <Text style={styles.note}>{history.period_end.slice(0, 10)} · {formatted(history, language)}</Text><Source point={history} />
    </View>)}
  </View>;
}

export function MobileFocusDiagnostic({ diagnostic, loading, error, onRetry }: {
  diagnostic?: FundamentalDiagnostic; loading: boolean; error: Error | null; onRetry: () => void;
}) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [mode, choose] = useMobileFocusMode("anatole.focus.mobile.diagnostic.view.v1", modes);
  const [showMissingSector, setShowMissingSector] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(diagnostic?.measures.map(measure => [measure.key, measure]) ?? []), [diagnostic]);
  const availableSector = diagnostic?.sector_metrics.filter(item => item.value !== null && item.status === "available") ?? [];
  const missingSector = diagnostic?.sector_metrics.filter(item => item.value === null || item.status !== "available") ?? [];
  return <View style={styles.stack} testID="focus-diagnostic-section">
    <QueryState error={!diagnostic ? error : null} loading={loading} onRetry={onRetry} />
    {diagnostic ? <>
      <Card title={pick("Diagnostic financier 360°", "Financial diagnostic 360°")}>
        <Text style={styles.note}>{diagnostic.name} · {diagnostic.financial_currency ?? pick("devise N/D", "currency N/A")}</Text>
        {diagnostic.stale ? <Text style={styles.note}>{pick("Instantané périmé; actualisation en cours ou différée.", "Stale snapshot; refresh in progress or delayed.")}</Text> : null}
        <Text style={styles.note}>{pick(diagnostic.methodology_fr, diagnostic.methodology_en)}</Text>
      </Card>
      <View style={styles.overviewGrid} testID="focus-diagnostic-overview">{([
        { key: "profitability", fr: "Rentabilité", en: "Profitability", keys: ["profitability"] },
        { key: "financial_strength", fr: "Solidité financière", en: "Financial strength", keys: ["liquidity", "leverage"] },
        { key: "earnings_quality", fr: "Qualité des bénéfices", en: "Earnings quality", keys: ["earnings_quality", "cash_flow"] },
        { key: "growth", fr: "Croissance", en: "Growth", keys: ["growth"] },
      ] as const).map(group => {
        const dimensions = diagnostic.dimensions.filter(item => (group.keys as readonly string[]).includes(item.key));
        const available = dimensions.reduce((total, item) => total + item.available_count, 0);
        const possible = dimensions.reduce((total, item) => total + item.measure_keys.length, 0);
        return <View key={group.key} style={styles.overviewCard}>
          <Text style={styles.overviewLabel}>{pick(group.fr, group.en)}</Text>
          <Text style={styles.coverage}>{available}/{possible} {pick("indicateurs", "measures")}</Text>
          {dimensions.length ? dimensions.map(dimension => {
            const scored = dimension.score_status === "directional" && dimension.score !== null && Number.isFinite(dimension.score);
            return <View key={dimension.key} style={styles.overviewSubdimension}>
              {dimensions.length > 1 ? <Text style={styles.label}>{pick(dimension.label_fr, dimension.label_en)}</Text> : null}
              {scored ? <Text style={styles.overviewScore}>{Math.round(dimension.score!)} / 100 · {pick("Direction historique", "Historical direction")}</Text>
                : <Text style={styles.unavailable}>{pick(dimension.score_status === "not_applicable" ? "Non applicable" : "Données insuffisantes", dimension.score_status === "not_applicable" ? "Not applicable" : "Insufficient data")}</Text>}
              <Text style={styles.note}>{pick(dimension.explanation_fr, dimension.explanation_en)}</Text>
            </View>;
          }) : <Text style={styles.unavailable}>{pick("Données insuffisantes dans cet instantané", "Insufficient data in this snapshot")}</Text>}
          {dimensions.length ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedGroup === group.key }}
            onPress={() => setExpandedGroup(expandedGroup === group.key ? null : group.key)} style={styles.missingToggle}>
            <Text style={styles.link}>{pick("Voir les calculs détaillés", "View detailed calculations")} {expandedGroup === group.key ? "▴" : "▾"}</Text>
          </Pressable> : null}
          {expandedGroup === group.key ? dimensions.flatMap(dimension => dimension.measure_keys).map(key => byKey.get(key))
            .filter((item): item is FundamentalMeasure => Boolean(item)).map(measure => <Measure key={measure.key} measure={measure} />) : null}
        </View>;
      })}</View>
      {diagnostic.findings.length ? <Card title={pick("Constats fondés sur les données", "Data-backed findings")}>
        {diagnostic.findings.map((finding, index) => <View key={`${finding.kind}-${index}`} style={styles.findingCard}>
          <Text style={styles.findingKind}>{pick(finding.kind === "strength" ? "Point fort" : finding.kind === "vulnerability" ? "Point de vigilance" : "Observation", finding.kind === "strength" ? "Strength" : finding.kind === "vulnerability" ? "Watch point" : "Observation")}</Text>
          <Text style={styles.finding}>{pick(finding.text_fr, finding.text_en)}</Text>
          <Text style={styles.note}>{finding.measure_keys.map(key => pick(byKey.get(key)?.label_fr ?? key, byKey.get(key)?.label_en ?? key)).join(" · ")}</Text>
        </View>)}
      </Card> : null}
      {(diagnostic.sector_metrics ?? []).length ? <Card title={pick("Indicateurs propres au secteur", "Sector-specific metrics")}>
        <Text style={styles.note}>{pick("Seules les valeurs explicitement publiées sont affichées.", "Only explicitly published values are shown.")}</Text>
        {availableSector.map(item => <View key={item.key} style={styles.measure}>
          <Text style={styles.label}>{pick(item.label_fr, item.label_en)}</Text>
          <Text style={styles.value}>{item.value === null ? pick("N/D", "N/A") : `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(item.value)} ${item.unit}`}</Text>
          {item.source_url?.startsWith("https://") ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.source_url!)}>
            <Text style={styles.link}>{item.source_name} · {item.filed_at?.slice(0, 10) ?? pick("date N/D", "date N/A")}</Text></Pressable>
            : <Text style={styles.note}>{pick("Publication officielle non disponible", "Official publication unavailable")}</Text>}
        </View>)}
        {missingSector.length ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMissingSector }}
          onPress={() => setShowMissingSector(!showMissingSector)} style={styles.missingToggle}>
          <Text style={styles.link}>{missingSector.length} {pick("indicateurs sans publication vérifiable", "metrics without a verifiable publication")} {showMissingSector ? "▴" : "▾"}</Text>
        </Pressable> : null}
        {showMissingSector ? <View style={styles.missingList}>
          <Text style={styles.note}>{pick("Aucune valeur vérifiable avec unité compatible dans l’instantané courant. Aucune valeur n’est estimée.", "No verifiable value with a compatible unit in the current snapshot. No value is estimated.")}</Text>
          {missingSector.map(item => <Text key={item.key} style={styles.note}>• {pick(item.label_fr, item.label_en)}</Text>)}
        </View> : null}
      </Card> : null}
      <MobileFocusViewMode mode={mode} choose={choose} modes={modes} />
      {diagnostic.dimensions.map(dimension => {
        const members = dimension.measure_keys.map(key => byKey.get(key)).filter((item): item is FundamentalMeasure => Boolean(item));
        return <Card key={dimension.key} title={pick(dimension.label_fr, dimension.label_en)}>
          <Text style={styles.note}>{pick(dimension.explanation_fr, dimension.explanation_en)}</Text>
          {dimension.score !== null ? <Text style={styles.score}>{pick("Direction historique", "Historical direction")} : {dimension.score.toFixed(0)} / 100</Text>
            : <Text style={styles.note}>{pick("Score directionnel indisponible", "Directional score unavailable")}</Text>}
          {dimension.contributions.map(contribution => <Text key={contribution.measure_key} style={styles.note}>
            {pick(byKey.get(contribution.measure_key)?.label_fr ?? contribution.measure_key, byKey.get(contribution.measure_key)?.label_en ?? contribution.measure_key)} · {contribution.points} / 100 · {pick(contribution.direction === "improving" ? "en amélioration" : contribution.direction === "stable" ? "stable" : "en recul", contribution.direction)}
          </Text>)}
          {mode === "cards" ? members.map(measure => <Measure key={measure.key} measure={measure} />) : null}
          {mode === "table" ? <ScrollView horizontal showsHorizontalScrollIndicator><View>
            <View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Indicateur", "Metric")}</Text><Text style={styles.tableCell}>{pick("Dernière valeur", "Latest value")}</Text><Text style={styles.tableCell}>{pick("Période", "Period")}</Text><Text style={styles.tableCell}>{pick("Source", "Source")}</Text></View>
            {members.map(measure => <View key={measure.key} style={styles.tableRow}><Text style={styles.tableLabel}>{pick(measure.label_fr, measure.label_en)}</Text><Text style={styles.tableCell}>{formatted(measure.observations[0], language)}</Text><Text style={styles.tableCell}>{measure.observations[0]?.period_end.slice(0, 10) ?? "N/D"}</Text><Text style={styles.tableCell}>{measure.observations[0]?.source_name ?? "N/D"}</Text></View>)}
          </View></ScrollView> : null}
          {mode === "charts" ? <>{(["money", "percent", "ratio"] as const).map(unit => {
            const group = members.filter(measure => measure.unit === unit && measure.observations.length);
            if (!group.length) return null;
            const periods = [...new Set(group.flatMap(measure => measure.observations.map(point => point.period_end.slice(0, 10))))].sort();
            const pointAt = (measure: FundamentalMeasure, period: string) => measure.observations.find(point => point.period_end.startsWith(period));
            const periodPoints = periods.map(period => group.flatMap(measure => measure.observations).find(point => point.period_end.startsWith(period)));
            return <MobileFocusSeries key={unit} storageKey={`mobile.diagnostic.${dimension.key}.${unit}`}
              title={pick(`Historique · ${unit === "money" ? "montants" : unit === "percent" ? "pourcentages" : "ratios"}`, `History · ${unit === "money" ? "amounts" : unit === "percent" ? "percentages" : "ratios"}`)}
              periods={periods} series={group.map(measure => ({ id: measure.key, fr: measure.label_fr, en: measure.label_en, values: periods.map(period => pointAt(measure, period)?.value ?? null) }))}
              currency={periodPoints[0]?.currency ?? diagnostic.financial_currency ?? ""} currencies={periodPoints.map(point => point?.currency ?? null)}
              source={pick("Sources détaillées ci-dessous", "Detailed sources below")} sources={periodPoints.map(point => point ? `${point.source_name} · ${point.filed_at?.slice(0, 10) ?? "N/D"}` : null)} unit={unit === "ratio" ? "number" : unit} />;
          })}{members.map(measure => <Measure key={measure.key} measure={measure} />)}</> : null}
        </Card>;
      })}
      {diagnostic.missing_data.length ? <Card title={pick("Données manquantes", "Missing data")}>{diagnostic.missing_data.map((item, index) => <Text key={`${item}-${index}`} style={styles.note}>{item}</Text>)}</Card> : null}
      <Text style={uiStyles.label}>{pick("Aucun score global ni recommandation d’achat ou de vente.", "No global score or buy/sell recommendation.")}</Text>
    </> : null}
  </View>;
}

const styles = createThemedStyles(colors => ({
  stack: { gap: spacing.md }, measure: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.xs },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  overviewCard: { width: "48%", minHeight: 155, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surfaceRaised, gap: spacing.xs },
  overviewLabel: { ...typography.section, color: colors.text }, overviewScore: { ...typography.label, color: colors.primary },
  overviewSubdimension: { gap: spacing.xs },
  coverage: { ...typography.caption, color: colors.textMuted }, unavailable: { ...typography.label, color: colors.textMuted },
  findingCard: { padding: spacing.md, marginBottom: spacing.sm, borderRadius: 12, backgroundColor: colors.surfaceRaised, gap: spacing.xs },
  findingKind: { ...typography.label, color: colors.primary }, missingToggle: { minHeight: 44, justifyContent: "center" }, missingList: { gap: spacing.xs, padding: spacing.sm },
  label: { ...typography.label, color: colors.text }, value: { ...typography.body, color: colors.text, fontWeight: "700" },
  source: { ...typography.caption, color: colors.textMuted }, link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  note: { ...typography.caption, color: colors.textMuted }, history: { paddingLeft: spacing.sm },
  score: { ...typography.label, color: colors.text }, finding: { ...typography.body, color: colors.text, marginBottom: spacing.sm },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text },
  tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" },
}));
