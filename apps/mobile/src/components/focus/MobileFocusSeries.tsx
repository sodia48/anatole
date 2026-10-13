import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { Card, uiStyles } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { moneyOrNd, percentOrNd, valueOrNd } from "./format";

export type MobileSeries = { id: string; fr: string; en: string; values: (number | null)[] };

export function MobileFocusSeries({ title, periods, series, currency, source, sources, unit = "money", forecast = false }: {
  title: string; periods: string[]; series: MobileSeries[]; currency: string; source: string;
  sources?: (string | null)[]; unit?: "money" | "percent" | "number"; forecast?: boolean;
}) {
  const { language, pick } = useLocale();
  const [selected, setSelected] = useState(series[0]?.id);
  const current = series.find(item => item.id === selected) ?? series[0];
  const values = current?.values ?? [];
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const span = max - min || 1;
  const x = (index: number) => 22 + (periods.length <= 1 ? 0 : index * 276 / (periods.length - 1));
  const y = (value: number) => 126 - (value - min) / span * 100;
  const paths: string[] = [];
  let path = "";
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (path) paths.push(path);
      path = "";
    } else path += `${path ? " L" : "M"}${x(index)} ${y(value)}`;
  });
  if (path) paths.push(path);
  const format = (value: number | null) => unit === "percent" ? percentOrNd(value, language)
    : unit === "money" ? moneyOrNd(value, currency, false, language) : valueOrNd(value, 2, language);
  return <Card title={title}>
    <Text style={styles.note}>{forecast ? pick("Prévisions / consensus", "Forecasts / consensus") : pick("Observations publiées", "Published observations")}</Text>
    {series.length > 1 ? <View style={styles.selector}>{series.map(item => <Pressable key={item.id}
      onPress={() => setSelected(item.id)} accessibilityRole="button" accessibilityState={{ selected: current?.id === item.id }}
      style={[styles.choice, current?.id === item.id && styles.active]}><Text style={styles.choiceText}>{pick(item.fr, item.en)}</Text></Pressable>)}</View> : null}
    {periods.length > 1 && finite.length > 1 ? <Svg width="100%" height={160} viewBox="0 0 320 160" accessibilityLabel={`${title}. ${pick("Valeurs exactes ci-dessous", "Exact values below")}`}>
      <Line x1={22} x2={298} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth={1} />
      {paths.map((part, index) => <Path key={index} d={part} fill="none" stroke="#3a9fff" strokeWidth={2} />)}
      {values.map((value, index) => value === null ? null : <Circle key={index} cx={x(index)} cy={y(value)} r={4} fill="#3a9fff" />)}
      <SvgText x={22} y={155} fontSize={10} fill="#94a3b8">{periods[0]}</SvgText>
      <SvgText x={298} y={155} fontSize={10} fill="#94a3b8" textAnchor="end">{periods[periods.length - 1]}</SvgText>
    </Svg> : <Text style={styles.note}>{pick("Série insuffisante pour tracer une tendance.", "Not enough observations to plot a trend.")}</Text>}
    {periods.map((period, index) => <View key={`${period}-${index}`} style={uiStyles.row}>
      <Text style={styles.period}>{period}</Text><Text style={styles.value}>{format(values[index] ?? null)}</Text>
      {sources?.[index] ? <Text style={styles.note}>{sources[index]}</Text> : null}
    </View>)}
    <Text style={styles.note}>{pick("Source", "Source")}: {source}</Text>
  </Card>;
}

const styles = createThemedStyles(colors => ({
  note: { ...typography.caption, color: colors.textMuted },
  selector: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginVertical: spacing.sm },
  choice: { paddingHorizontal: spacing.sm, minHeight: 44, justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  choiceText: { ...typography.caption, color: colors.text },
  period: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.body, color: colors.text, fontWeight: "700" },
}));
