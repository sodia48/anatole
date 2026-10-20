import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { defaultScenarioRequest, scenarioDcfReason, scenarioKeys, type ScenarioAssumptions, type ScenarioKey,
  type ScenarioRequest, type ScenarioSimulation, type ScenarioValue } from "@anatole/shared/fundamental-scenarios";
import { Card, QueryState } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { MobileFocusViewMode, useMobileFocusMode } from "./MobileFocusViewMode";

const modes = ["cards", "table", "charts"] as const;
type MetricKey = "revenue" | "operating_income" | "net_income" | "operating_cash_flow" | "free_cash_flow" | "operating_margin" | "free_cash_flow_margin";
const labels: Record<ScenarioKey, [string, string]> = { prudent: ["Prudent", "Prudent"], central: ["Central", "Central"], optimistic: ["Optimiste", "Optimistic"] };
const fields: { key: keyof Omit<ScenarioAssumptions, "key" | "commodity_price_change_percent" | "commodity_revenue_exposure_percent">; fr: string; en: string; min: number; max: number }[] = [
  { key: "revenue_change_percent", fr: "Variation des revenus (%)", en: "Revenue change (%)", min: -80, max: 200 },
  { key: "operating_margin_change_points", fr: "Variation de marge (points)", en: "Margin change (points)", min: -20, max: 20 },
  { key: "financing_cost_change_percent", fr: "Variation du coût de financement (%)", en: "Financing cost change (%)", min: -100, max: 300 },
  { key: "incremental_cost_inflation_percent", fr: "Inflation additionnelle des coûts (%)", en: "Incremental cost inflation (%)", min: 0, max: 20 },
  { key: "capex_change_percent", fr: "Variation des investissements (%)", en: "Capex change (%)", min: -80, max: 300 },
  { key: "working_capital_use_percent_revenue", fr: "Besoin en fonds de roulement (% revenus)", en: "Working capital use (% revenue)", min: -20, max: 20 },
];
const metrics: { key: MetricKey; fr: string; en: string }[] = [
  { key: "revenue", fr: "Revenus", en: "Revenue" }, { key: "operating_income", fr: "Résultat opérationnel", en: "Operating income" },
  { key: "net_income", fr: "Bénéfice net", en: "Net income" }, { key: "operating_cash_flow", fr: "Flux opérationnel", en: "Operating cash flow" },
  { key: "free_cash_flow", fr: "Flux disponible", en: "Free cash flow" }, { key: "operating_margin", fr: "Marge opérationnelle", en: "Operating margin" },
  { key: "free_cash_flow_margin", fr: "Marge de flux disponible", en: "Free cash flow margin" },
];
const initialDraft = () => Object.fromEntries([
  ...defaultScenarioRequest.scenarios.flatMap(scenario => fields.map(field => [`${scenario.key}_${field.key}`, String(scenario[field.key])])),
  ...scenarioKeys.flatMap(key => [[`${key}_commodity_price_change_percent`, "0"], [`${key}_commodity_revenue_exposure_percent`, "0"]]),
  ["discount_rate_percent", "10"], ["terminal_growth_percent", "2"], ["forecast_fcf_growth_percent", "3"],
]);

function formatted(value: ScenarioValue | undefined, currency: string | null, language: "fr" | "en") {
  if (!value || value.value === null) return language === "fr" ? "N/D" : "N/A";
  const number = new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value.value);
  return `${number}${value.unit === "percent" ? " %" : currency ? ` ${currency}` : ""}`;
}

export function MobileFocusScenarios({ simulation, loading, error, onRetry, onCalculate }: {
  simulation?: ScenarioSimulation; loading: boolean; error: Error | null; onRetry: () => void;
  onCalculate: (request: ScenarioRequest) => void;
}) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const [mode, choose] = useMobileFocusMode("anatole.focus.mobile.scenarios.view.v1", modes);
  const [draft, setDraft] = useState<Record<string, string>>(initialDraft);
  const [dcfEnabled, setDcfEnabled] = useState(false);
  const [inputError, setInputError] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["revenue", "net_income", "free_cash_flow"]);
  const set = (key: string, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const calculate = () => {
    const read = (key: string) => Number(draft[key]);
    const required = scenarioKeys.flatMap(key => fields.map(field => `${key}_${field.key}`));
    if (simulation?.sector_family === "mining") required.push(...scenarioKeys.flatMap(key => [`${key}_commodity_price_change_percent`, `${key}_commodity_revenue_exposure_percent`]));
    if (dcfEnabled) required.push("discount_rate_percent", "terminal_growth_percent", "forecast_fcf_growth_percent");
    if (required.some(key => !draft[key]?.trim() || !Number.isFinite(read(key)))) { setInputError(true); return; }
    const scenarios = scenarioKeys.map(key => ({ key,
      ...Object.fromEntries(fields.map(field => [field.key, read(`${key}_${field.key}`)])),
      commodity_price_change_percent: simulation?.sector_family === "mining" ? read(`${key}_commodity_price_change_percent`) : null,
      commodity_revenue_exposure_percent: simulation?.sector_family === "mining" ? read(`${key}_commodity_revenue_exposure_percent`) : null,
    } as ScenarioAssumptions));
    setInputError(false);
    onCalculate({ scenarios, dcf: dcfEnabled ? {
      discount_rate_percent: read("discount_rate_percent"), terminal_growth_percent: read("terminal_growth_percent"),
      forecast_fcf_growth_percent: read("forecast_fcf_growth_percent"),
    } : null });
  };
  const shown = metrics.filter(metric => selectedMetrics.includes(metric.key));
  return <View style={styles.stack} testID="focus-scenarios-section">
    <QueryState error={!simulation ? error : null} loading={loading} onRetry={onRetry} />
    <Card title={pick("Simulateur et valorisation", "Scenario simulator and valuation")}>
      <Text style={styles.note}>{pick("Sensibilités illustratives, sans prévision ni cours certain.", "Illustrative sensitivities, not forecasts or certain market prices.")}</Text>
    </Card>
    {simulation ? <>
      <Card title={pick("Référence publiée", "Published baseline")}>
        <Text style={styles.note}>{simulation.baseline_period_end?.slice(0, 10) ?? "N/D"} · {simulation.currency ?? "N/D"}</Text>
        {simulation.baseline_stale ? <Text style={styles.note}>{pick("Source périmée : résultats fondés sur des données anciennes.", "Stale source: results based on older data.")}</Text> : null}
        {simulation.baseline_source_url?.startsWith("https://") ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(simulation.baseline_source_url!)}>
          <Text style={styles.link}>{simulation.baseline_source} · {simulation.baseline_filed_at?.slice(0, 10) ?? "N/D"}</Text></Pressable>
          : <Text style={styles.note}>{simulation.baseline_source}</Text>}
      </Card>
      <MobileFocusViewMode mode={mode} choose={choose} modes={modes} />
      <Card title={pick("Indicateurs affichés", "Visible metrics")}><View style={styles.choices}>{metrics.map(metric => <Pressable key={metric.key}
        accessibilityRole="checkbox" accessibilityState={{ checked: selectedMetrics.includes(metric.key) }}
        onPress={() => setSelectedMetrics(previous => previous.includes(metric.key) ? previous.filter(key => key !== metric.key) : [...previous, metric.key])}
        style={[styles.choice, selectedMetrics.includes(metric.key) && styles.active]}><Text style={styles.label}>{pick(metric.fr, metric.en)}</Text></Pressable>)}</View></Card>
      {mode === "table" ? <Card title={pick("Sensibilités calculées", "Calculated sensitivities")}><ScrollView horizontal showsHorizontalScrollIndicator><View>
        <View style={styles.tableRow}><Text style={styles.tableLabel}>{pick("Indicateur", "Metric")}</Text>{simulation.outcomes.map(item => <Text key={item.key} style={styles.tableCell}>{pick(...labels[item.key])}</Text>)}</View>
        {shown.map(metric => <View key={metric.key} style={styles.tableRow}><Text style={styles.tableLabel}>{pick(metric.fr, metric.en)}</Text>
          {simulation.outcomes.map(item => <Text key={item.key} style={styles.tableCell}>{formatted(item[metric.key], simulation.currency, language)}</Text>)}</View>)}
        <View style={styles.tableRow}><Text style={styles.tableLabel}>DCF / {pick("action", "share")}</Text>
          {simulation.outcomes.map(item => <Text key={item.key} style={styles.tableCell}>{item.dcf.per_share === null ? "N/D" : `${item.dcf.per_share.toFixed(2)} ${simulation.currency ?? ""}`}</Text>)}</View>
      </View></ScrollView></Card> : null}
      {mode === "cards" || mode === "charts" ? simulation.outcomes.map(item => <Card key={item.key} title={pick(...labels[item.key])}>
        {shown.map(metric => <View key={metric.key} style={styles.barRow}><Text style={styles.label}>{pick(metric.fr, metric.en)} · {formatted(item[metric.key], simulation.currency, language)}</Text>
          {mode === "charts" ? <View style={styles.track}><View style={[styles.bar, { width: `${Math.abs(item[metric.key].value ?? 0) / Math.max(1, ...simulation.outcomes.map(value => Math.abs(value[metric.key].value ?? 0))) * 100}%` }]} /></View> : null}</View>)}
        <Text style={styles.note}>DCF / {pick("action", "share")} : {item.dcf.per_share === null ? "N/D" : `${item.dcf.per_share.toFixed(2)} ${simulation.currency ?? ""}`}</Text>
        {item.dcf.reason ? <Text style={styles.note}>{scenarioDcfReason(item.dcf.reason, language)}</Text> : null}
        {item.dcf.status === "calculated" ? <View style={styles.sensitivity}><Text style={styles.label}>{pick("Sensibilité DCF", "DCF sensitivity")}</Text>
          {item.dcf.sensitivity.map(point => <Text key={`${point.discount_rate_percent}-${point.terminal_growth_percent}`} style={styles.note}>
            r {point.discount_rate_percent} % · g {point.terminal_growth_percent} % : {point.per_share.toFixed(2)} {simulation.currency}</Text>)}</View> : null}
      </Card>) : null}
      <Card title={pick("Hypothèses et limites", "Assumptions and limits")}>
        {(language === "fr" ? simulation.limitations_fr : simulation.limitations_en).map(item => <Text key={item} style={styles.note}>• {item}</Text>)}
      </Card>
    </> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAssumptions }} onPress={() => setShowAssumptions(!showAssumptions)} style={styles.choice}>
      <Text style={styles.label}>{pick("Personnaliser les hypothèses", "Customize assumptions")} {showAssumptions ? "▴" : "▾"}</Text>
    </Pressable>
    {showAssumptions ? <>
    {defaultScenarioRequest.scenarios.map(scenario => <Card key={scenario.key} title={pick(...labels[scenario.key])}>
      {fields.map(field => <View key={field.key} style={styles.field}><Text style={styles.label}>{pick(field.fr, field.en)}</Text>
        <TextInput accessibilityLabel={`${pick(...labels[scenario.key])} · ${pick(field.fr, field.en)}`}
          keyboardType="numbers-and-punctuation" value={draft[`${scenario.key}_${field.key}`]}
          onChangeText={value => set(`${scenario.key}_${field.key}`, value)} style={styles.input} /></View>)}
      {simulation?.sector_family === "mining" ? <>
        {(["commodity_price_change_percent", "commodity_revenue_exposure_percent"] as const).map(field => <View key={field} style={styles.field}>
          <Text style={styles.label}>{field === "commodity_price_change_percent" ? pick("Variation du prix de la matière première (%)", "Commodity price change (%)") : pick("Part des revenus exposée (%)", "Exposed revenue share (%)")}</Text>
          <TextInput keyboardType="numbers-and-punctuation" value={draft[`${scenario.key}_${field}`]}
            onChangeText={value => set(`${scenario.key}_${field}`, value)} style={styles.input} /></View>)}
      </> : null}
    </Card>)}
    <Card title={pick("Valorisation DCF conditionnelle", "Conditional DCF valuation")}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: dcfEnabled }} onPress={() => setDcfEnabled(!dcfEnabled)} style={styles.choice}>
        <Text style={styles.label}>{dcfEnabled ? "☑" : "□"} {pick("Saisir mes taux et calculer la DCF", "Enter my rates and calculate DCF")}</Text></Pressable>
      {dcfEnabled ? ([
        ["discount_rate_percent", "Taux d'actualisation (%)", "Discount rate (%)"],
        ["terminal_growth_percent", "Croissance terminale (%)", "Terminal growth (%)"],
        ["forecast_fcf_growth_percent", "Croissance des flux projetés (%)", "Projected cash-flow growth (%)"],
      ] as const).map(([key, fr, en]) => <View key={key} style={styles.field}><Text style={styles.label}>{pick(fr, en)}</Text>
        <TextInput keyboardType="numbers-and-punctuation" value={draft[key]} onChangeText={value => set(key, value)} style={styles.input} /></View>) : null}
    </Card>
    <Pressable accessibilityRole="button" disabled={loading} onPress={calculate} style={styles.action}><Text style={styles.actionText}>{pick("Calculer les scénarios", "Calculate scenarios")}</Text></Pressable>
    {inputError ? <Text style={styles.note}>{pick("Vérifiez les valeurs saisies.", "Check the entered values.")}</Text> : null}
    </> : null}
  </View>;
}

const styles = createThemedStyles(colors => ({
  stack: { gap: spacing.md }, note: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  label: { ...typography.label, color: colors.text }, link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  field: { gap: spacing.xs, marginBottom: spacing.sm }, input: { ...typography.body, color: colors.text, minHeight: 44, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  choice: { minHeight: 44, justifyContent: "center", padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  action: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.primary },
  actionText: { ...typography.label, color: colors.background },
  barRow: { gap: spacing.xs, marginBottom: spacing.sm }, track: { height: 9, borderRadius: radius.sm, backgroundColor: colors.border },
  bar: { height: 9, borderRadius: radius.sm, backgroundColor: colors.primary },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableLabel: { width: 145, padding: spacing.sm, ...typography.caption, color: colors.text },
  tableCell: { width: 115, padding: spacing.sm, ...typography.caption, color: colors.text, textAlign: "right" },
  sensitivity: { gap: spacing.xs, marginTop: spacing.sm },
}));
