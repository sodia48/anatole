import { useMemo } from "react";
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
  const byKey = useMemo(() => new Map(diagnostic?.measures.map(measure => [measure.key, measure]) ?? []), [diagnostic]);
  return <View style={styles.stack} testID="focus-diagnostic-section">
    <QueryState error={!diagnostic ? error : null} loading={loading} onRetry={onRetry} />
    {diagnostic ? <>
      <Card title={pick("Diagnostic financier 360°", "Financial diagnostic 360°")}>
        <Text style={styles.note}>{diagnostic.name} · {diagnostic.financial_currency ?? pick("devise N/D", "currency N/A")}</Text>
        {diagnostic.stale ? <Text style={styles.note}>{pick("Instantané périmé; actualisation en cours ou différée.", "Stale snapshot; refresh in progress or delayed.")}</Text> : null}
        <Text style={styles.note}>{pick(diagnostic.methodology_fr, diagnostic.methodology_en)}</Text>
      </Card>
      <MobileFocusViewMode mode={mode} choose={choose} modes={modes} />
      {diagnostic.findings.length ? <Card title={pick("Constats fondés sur les données", "Data-backed findings")}>
        {diagnostic.findings.map((finding, index) => <Text key={`${finding.kind}-${index}`} style={styles.finding}>{pick(finding.text_fr, finding.text_en)}</Text>)}
      </Card> : null}
      {(diagnostic.sector_metrics ?? []).length ? <Card title={pick("Indicateurs propres au secteur", "Sector-specific metrics")}>
        <Text style={styles.note}>{pick("Seules les valeurs explicitement publiées sont affichées.", "Only explicitly published values are shown.")}</Text>
        {diagnostic.sector_metrics.map(item => <View key={item.key} style={styles.measure}>
          <Text style={styles.label}>{pick(item.label_fr, item.label_en)}</Text>
          <Text style={styles.value}>{item.value === null ? pick("N/D", "N/A") : `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(item.value)} ${item.unit}`}</Text>
          {item.source_url?.startsWith("https://") ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.source_url!)}>
            <Text style={styles.link}>{item.source_name} · {item.filed_at?.slice(0, 10) ?? pick("date N/D", "date N/A")}</Text></Pressable>
            : <Text style={styles.note}>{pick("Publication officielle non disponible", "Official publication unavailable")}</Text>}
        </View>)}
      </Card> : null}
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
  label: { ...typography.label, color: colors.text }, value: { ...typography.body, color: colors.text, fontWeight: "700" },
  source: { ...typography.caption, color: colors.textMuted }, link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  note: { ...typography.caption, color: colors.textMuted }, history: { paddingLeft: spacing.sm },
  score: { ...typography.label, color: colors.text }, finding: { ...typography.body, color: colors.text, marginBottom: spacing.sm },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text },
  tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" },
}));
