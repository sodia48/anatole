import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { focusBase100Reference, focusChartChange, focusChartIndexes, focusChartValue, focusPeriodDate,
  focusPeriodLabel,
  type FocusChartRange, type FocusChartShape } from "@anatole/shared/focus-chart";
import { Card, uiStyles } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { moneyOrNd, percentOrNd, valueOrNd } from "./format";

export type MobileSeries = { id: string; fr: string; en: string; values: (number | null)[];
  lows?: (number | null)[]; highs?: (number | null)[]; nature?: "published" | "estimate" };
type Saved = { ids?: string[]; shape?: FocusChartShape; range?: FocusChartRange; base100?: boolean };
const ranges: FocusChartRange[] = ["1y", "3y", "5y", "10y", "all"];
const shapes: FocusChartShape[] = ["line", "bar", "area", "points"];
const colors = ["#3a9fff", "#2eb88a", "#d8942c", "#dd6574", "#9a80d8"];

export function MobileFocusSeries({ title, periods, series, currency, currencies, source, sources, unit = "money", forecast = false,
  storageKey, defaultShape = "line", frequency = "annual", fiscalYearEndMonth = null }: {
  title: string; periods: string[]; series: MobileSeries[]; currency: string; currencies?: (string | null)[]; source: string;
  sources?: (string | null)[]; unit?: "money" | "per_share" | "percent" | "number"; forecast?: boolean;
  storageKey?: string; defaultShape?: FocusChartShape; frequency?: "annual" | "quarterly"; fiscalYearEndMonth?: number | null;
}) {
  const { language, pick } = useLocale();
  const [saved, setSaved] = useState<Saved>({});
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const interacted = useRef(false);
  useEffect(() => {
    if (!storageKey) return;
    let mounted = true;
    void AsyncStorage.getItem(`anatole.focus.chart.v3.${storageKey}`).then(value => {
      if (mounted && !interacted.current && value) { try { setSaved(JSON.parse(value) as Saved); } catch { /* optional */ } }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [storageKey]);
  const save = (change: Saved) => { interacted.current = true; const next = { ...saved, ...change }; setSaved(next);
    if (storageKey) void AsyncStorage.setItem(`anatole.focus.chart.v3.${storageKey}`, JSON.stringify(next)).catch(() => {});
  };
  const ids = saved.ids?.filter(id => series.some(item => item.id === id))
    ?? (series.length > 5 ? series.filter(item => item.values.some(value => value !== null)).slice(0, 3) : series).map(item => item.id);
  const visible = series.filter(item => ids.includes(item.id));
  const shape = shapes.includes(saved.shape as FocusChartShape) ? saved.shape as FocusChartShape : defaultShape;
  const range = ranges.includes(saved.range as FocusChartRange) ? saved.range as FocusChartRange : "all";
  const indexes = focusChartIndexes(periods, range);
  const labelFor = (index: number) => focusPeriodLabel(periods[index] ?? "", frequency, fiscalYearEndMonth);
  const mixedCurrencies = (unit === "money" || unit === "per_share")
    && new Set(indexes.map(index => currencies?.[index] ?? currency).filter(Boolean)).size > 1;
  const dates = indexes.map(index => focusPeriodDate(periods[index] ?? ""));
  const days = dates.slice(1).map((date, index) => date !== null && dates[index] !== null ? (date - (dates[index] as number)) / 86_400_000 : null);
  const positiveDays = days.filter((value): value is number => value !== null && value > 0).sort((a, b) => a - b);
  const typical = positiveDays[Math.floor((positiveDays.length - 1) / 2)] ?? (frequency === "quarterly" ? 91 : 365);
  const gaps = days.flatMap((value, index) => value !== null && value > Math.max(typical < 200 ? 160 : 550, typical * 1.8) ? [index + 1] : []);
  const base = focusBase100Reference(visible, indexes);
  const normalized = Boolean(saved.base100 && base !== null && indexes.length > 1 && !mixedCurrencies);
  const chartValue = (item: MobileSeries, index: number) => normalized
    ? indexes.indexOf(index) < indexes.indexOf(base as number) ? null
      : focusChartValue(item.values[index], item.values[base as number]) : item.values[index];
  const plotted = mixedCurrencies ? [] : visible.flatMap(item => indexes.map(index => chartValue(item, index))
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value)));
  const min = Math.min(0, ...plotted), max = Math.max(0, ...plotted), span = max - min || 1;
  const x = (position: number) => 24 + (indexes.length === 1 ? 138 : position / (indexes.length - 1) * 272);
  const y = (value: number) => 128 - (value - min) / span * 100;
  const format = (value: number | null, actualCurrency = currency) => unit === "percent" ? percentOrNd(value, language)
    : unit === "number" ? valueOrNd(value, 2, language) : `${moneyOrNd(value, actualCurrency, false, language)}${unit === "per_share" ? pick(" / action", " / share") : ""}`;
  const current = selectedPoint !== null && indexes.includes(selectedPoint) ? selectedPoint : null;
  const shapeNames: Record<FocusChartShape, string> = { line: pick("Courbe", "Line"), bar: pick("Barres groupées", "Grouped bars"),
    area: pick("Aire", "Area"), points: pick("Points", "Points") };
  return <Card title={title}>
    <Text style={styles.note}>{forecast ? pick("Prévisions / consensus", "Forecasts / consensus") : pick("Observations publiées", "Published observations")}
      {` · ${mixedCurrencies ? pick("devises multiples", "multiple currencies") : normalized ? "Base 100" : unit === "percent" ? "%" : unit === "number" ? pick("nombre", "number") : currency}`}</Text>
    <Text style={styles.label}>{pick("Type de graphique", "Chart type")}</Text>
    <View style={styles.selector}>{shapes.map(value => <Pressable key={value} onPress={() => save({ shape: value })}
      disabled={periods.length < 2 && (value === "line" || value === "area")}
      accessibilityRole="button" accessibilityState={{ selected: shape === value, disabled: periods.length < 2 && (value === "line" || value === "area") }} style={[styles.choice, shape === value && styles.active]}>
      <Text style={styles.choiceText}>{shapeNames[value]}</Text></Pressable>)}</View>
    <Text style={styles.label}>{pick("Période", "Period")}</Text>
    <View style={styles.selector}>{ranges.map(value => <Pressable key={value} onPress={() => { save({ range: value }); setSelectedPoint(null); }}
      disabled={value !== "all" && !periods.some(period => focusPeriodDate(period) !== null)}
      accessibilityRole="button" accessibilityState={{ selected: range === value }} style={[styles.choice, range === value && styles.active]}>
      <Text style={styles.choiceText}>{value === "all" ? pick("Tout", "All") : value}</Text></Pressable>)}</View>
    <View style={styles.selector}><Pressable onPress={() => save({ base100: false })} accessibilityRole="button"
      accessibilityState={{ selected: !normalized }} style={[styles.choice, !normalized && styles.active]}><Text style={styles.choiceText}>{pick("Valeurs réelles", "Actual values")}</Text></Pressable>
      <Pressable onPress={() => save({ base100: true })} disabled={mixedCurrencies || base === null || indexes.length < 2} accessibilityRole="button"
        accessibilityState={{ selected: normalized, disabled: mixedCurrencies || base === null || indexes.length < 2 }} style={[styles.choice, normalized && styles.active]}><Text style={styles.choiceText}>Base 100</Text></Pressable></View>
    {mixedCurrencies ? <Text style={styles.note}>{pick("Graphique indisponible : plusieurs devises. Les valeurs exactes restent ci-dessous.", "Chart unavailable: multiple currencies. Exact values remain below.")}</Text> : null}
    <Pressable onPress={() => setShowHelp(value => !value)} accessibilityRole="button"
      accessibilityState={{ expanded: showHelp }}><Text style={styles.note}>{pick("Comprendre le graphique", "About this chart")}</Text></Pressable>
    {showHelp ? <View><Text style={styles.note}>{periods.length < 2 ? pick("Un seul instantané : aucune évolution historique.", "One snapshot: no historical trend.") : null}</Text>
      {gaps.length ? <Text style={styles.note}>{pick("Les intervalles sans observations interrompent les courbes.", "Missing observation intervals break the lines.")}</Text> : null}
      {base === null ? <Text style={styles.note}>{pick("Base 100 indisponible : référence commune positive nécessaire, sans changement de signe.", "Base 100 unavailable: shared positive reference required, without sign changes.")}</Text>
        : normalized ? <Text style={styles.note}>{pick(`Base 100 au ${periods[base]}. Valeur / référence × 100.`, `Base 100 at ${periods[base]}. Value / reference × 100.`)}</Text> : null}</View> : null}
    {series.length > 1 ? <><View style={styles.selector}>
      <Pressable onPress={() => save({ ids: series.map(item => item.id) })} style={styles.choice}><Text style={styles.choiceText}>{pick("Tous", "All")}</Text></Pressable>
      <Pressable onPress={() => save({ ids: series.filter(item => item.values.some(v => v !== null)).slice(0, 3).map(item => item.id) })} style={styles.choice}><Text style={styles.choiceText}>{pick("Principaux", "Core")}</Text></Pressable>
      <Pressable onPress={() => save({ ids: series.map(item => item.id), shape: defaultShape, range: "all", base100: false })} style={styles.choice}><Text style={styles.choiceText}>{pick("Réinitialiser", "Reset")}</Text></Pressable>
    </View><View style={styles.selector}>{series.map((item, position) => <Pressable key={item.id}
      onPress={() => save({ ids: ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id] })}
      accessibilityRole="button" accessibilityState={{ selected: ids.includes(item.id) }}
      style={[styles.choice, ids.includes(item.id) && styles.active, { borderLeftColor: colors[position % colors.length], borderLeftWidth: 4 }]}>
      <Text style={styles.choiceText}>{pick(item.fr, item.en)}</Text></Pressable>)}</View></> : null}
    {plotted.length ? <Svg width="100%" height={165} viewBox="0 0 320 165"
      accessibilityLabel={`${title}. ${pick("Touchez un point pour les valeurs exactes", "Touch a point for exact values")}`}>
      <Line x1={24} x2={296} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth={1} />
      {gaps.map(position => <SvgText key={`gap-${position}`} x={(x(position - 1) + x(position)) / 2}
        y={20} textAnchor="middle" fontSize={13} fill="#94a3b8">⋯</SvgText>)}
      {current !== null ? <Line x1={x(indexes.indexOf(current))} x2={x(indexes.indexOf(current))} y1={25} y2={130} stroke="#3a9fff" strokeDasharray="4 3" /> : null}
      {visible.map((item, position) => {
        const segments: string[][] = []; let part: string[] = [];
        indexes.forEach((index, at) => { const value = chartValue(item, index);
          if (value === null || value === undefined || !Number.isFinite(value)) { if (part.length) segments.push(part); part = []; }
          else { if (gaps.includes(at) && part.length) { segments.push(part); part = []; }
            part.push(`${x(at)} ${y(value)}`); }
        }); if (part.length) segments.push(part);
        const color = colors[series.findIndex(value => value.id === item.id) % colors.length];
        const width = Math.min(15, 265 / Math.max(1, indexes.length) / Math.max(1, visible.length));
        return <G key={item.id}>
          {shape === "area" ? segments.map((segment, at) => <Path key={`area-${at}`} d={`M${segment[0]} ${y(0)} L${segment.join(" L")} L${segment[segment.length - 1]?.split(" ")[0] ?? 0} ${y(0)} Z`} fill={color} fillOpacity={0.15} />) : null}
          {shape === "line" || shape === "area" ? segments.map((segment, at) => <Path key={at} d={`M${segment.join(" L")}`} fill="none" stroke={color} strokeWidth={2} />) : null}
          {indexes.map((index, at) => { const value = chartValue(item, index);
            if (value === null || value === undefined || !Number.isFinite(value)) return null;
            const low = item.lows?.[index], high = item.highs?.[index], actual = item.values[index];
            const validRange = !normalized && low !== null && low !== undefined && high !== null && high !== undefined
              && actual !== null && actual !== undefined && Number.isFinite(low) && Number.isFinite(high) && low <= actual && actual <= high;
            return <G key={`${item.id}-${index}`}>
              {validRange ? <Line x1={x(at)} x2={x(at)} y1={y(low)} y2={y(high)} stroke={color} strokeWidth={4} opacity={0.45} /> : null}
              {shape === "bar" ? <Rect x={x(at) + (position - (visible.length - 1) / 2) * width - width / 2} y={Math.min(y(value), y(0))}
                width={Math.max(2, width - 1)} height={Math.max(1, Math.abs(y(value) - y(0)))} fill={color} />
                : <Circle cx={x(at)} cy={y(value)} r={current === index ? 6 : 4} fill={color} />}
              <Circle cx={x(at)} cy={y(value)} r={15} fill="transparent" onPress={() => setSelectedPoint(index)} testID={`focus-point-${item.id}-${index}`} />
            </G>;
          })}</G>;
      })}
      <SvgText x={24} y={158} fontSize={10} fill="#94a3b8">{labelFor(indexes[0] ?? 0)}</SvgText>
      <SvgText x={296} y={158} fontSize={10} fill="#94a3b8" textAnchor="end">{labelFor(indexes[indexes.length - 1] ?? 0)}</SvgText>
    </Svg> : !mixedCurrencies ? <Text style={styles.note}>{pick("Série insuffisante pour tracer une tendance.", "Not enough observations to plot a trend.")}</Text> : null}
    {current !== null ? <View style={styles.detail} accessibilityLiveRegion="polite">
      <View style={uiStyles.row}><Text style={styles.value}>{labelFor(current)} · {periods[current]}</Text><Pressable onPress={() => setSelectedPoint(null)} accessibilityRole="button"
        accessibilityLabel={pick("Fermer les détails", "Close details")}><Text style={styles.value}>×</Text></Pressable></View>
      {visible.map(item => { const actual = item.values[current], change = focusChartChange(item.values, indexes, current);
        return <View key={item.id} style={styles.detailRow}><Text style={styles.label}>{pick(item.fr, item.en)}</Text>
          <Text style={styles.note}>{item.nature === "estimate" || forecast ? pick("Estimation", "Estimate") : pick("Donnée publiée", "Published data")}</Text>
          <Text style={styles.value}>{format(actual ?? null, currencies?.[current] ?? currency)}{normalized ? ` · ${focusChartValue(actual, item.values[base as number])?.toFixed(2) ?? "N/D"} Base 100` : ""}</Text>
          {change ? <Text style={styles.note}>{change.percent === null ? format(change.delta) : `${change.percent.toFixed(2)} %`} {pick("depuis", "since")} {periods[change.previous]}</Text> : null}
          {forecast && item.lows?.[current] !== null && item.lows?.[current] !== undefined && item.highs?.[current] !== null && item.highs?.[current] !== undefined
            ? <Text style={styles.note}>{pick("Bas", "Low")}: {format(item.lows[current])} · {pick("Consensus", "Consensus")}: {format(actual ?? null)} · {pick("Haut", "High")}: {format(item.highs[current])}</Text> : null}</View>;
      })}
      <Text style={styles.note}>{pick("Source", "Source")}: {sources?.[current] ?? source}</Text>
    </View> : null}
    {indexes.map(index => <View key={`${periods[index]}-${index}`} style={styles.dataRow}>
      <Text style={styles.period}>{labelFor(index)} · {periods[index]}</Text>{visible.map(item => <Text key={item.id} style={styles.value}>{pick(item.fr, item.en)}: {format(item.values[index] ?? null, currencies?.[index] ?? currency)}</Text>)}
      {sources?.[index] ? <Text style={styles.note}>{sources[index]}</Text> : null}</View>)}
    <Text style={styles.note}>{pick("Source", "Source")}: {source}</Text>
  </Card>;
}

const styles = createThemedStyles(colors => ({
  note: { ...typography.caption, color: colors.textMuted }, label: { ...typography.label, color: colors.text, marginTop: spacing.xs },
  selector: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginVertical: spacing.xs },
  choice: { paddingHorizontal: spacing.sm, minHeight: 44, justifyContent: "center", borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  choiceText: { ...typography.caption, color: colors.text },
  period: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.body, color: colors.text, fontWeight: "700" },
  detail: { padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, gap: spacing.xs },
  detailRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  dataRow: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.xs },
}));
