import { router, type Href } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { percentOrNd, valueOrNd } from "@/src/components/focus/format";
import type { TerminalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export type PulseRange = "3m" | "6m" | "1y";

function metric(label: string, value: string) {
  return <View key={label} style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.meta}>{label}</Text></View>;
}

export function HorizonCards({ snapshot }: { snapshot: TerminalSnapshot }) {
  const { language, pick } = useLocale();
  return <View style={styles.card} testID="terminal-horizons"><View style={styles.heading}><Text style={styles.eyebrow}>MULTI-HORIZON</Text><Text style={styles.meta}>{pick(`Couverture ${snapshot.data_quality.real_symbols}/${snapshot.data_quality.expected_symbols} · Historique ${snapshot.data_quality.history_symbols}/${snapshot.data_quality.expected_symbols}`, `Coverage ${snapshot.data_quality.real_symbols}/${snapshot.data_quality.expected_symbols} · History ${snapshot.data_quality.history_symbols}/${snapshot.data_quality.expected_symbols}`)}</Text></View><View style={styles.grid}>{snapshot.regime_horizons.map((item) => <View key={item.key} style={styles.horizon}><Text style={styles.meta}>{item.label}</Text><Text style={styles.title}>{item.regime ?? "N/D"}</Text><Text style={styles.score}>{item.score == null ? "N/D" : `${item.score.toFixed(0)}/100`}</Text><Text style={styles.meta}>{percentOrNd(item.change_percent, language)}</Text></View>)}</View>{snapshot.data_quality.warnings.map((warning) => <Text key={warning} style={styles.warning}>{warning}</Text>)}</View>;
}

export function PulseCard({ snapshot, range, onRange }: { snapshot: TerminalSnapshot; range: PulseRange; onRange: (range: PulseRange) => void }) {
  const { pick } = useLocale();
  const points = useMemo(() => {
    const days = range === "3m" ? 93 : range === "6m" ? 186 : 370;
    const latestTimestamp = snapshot.regime_history.at(-1)?.timestamp ?? 0;
    const cutoff = latestTimestamp - days * 86_400;
    return snapshot.regime_history.filter((point) => point.timestamp >= cutoff && point.regime_score != null);
  }, [range, snapshot.regime_history]);
  const width = 340, height = 170;
  const scorePath = points.map((point, index) => `${index ? "L" : "M"}${index / Math.max(points.length - 1, 1) * width},${height - (point.regime_score ?? 0) / 100 * height}`).join(" ");
  const benchmark = points.map((point) => point.benchmark_value).filter((value): value is number => value != null);
  const benchmarkMin = benchmark.length ? Math.min(...benchmark) : 0;
  const benchmarkMax = benchmark.length ? Math.max(...benchmark) : 0;
  const benchmarkPath = points.map((point, index) => point.benchmark_value == null ? "" : `${index ? "L" : "M"}${index / Math.max(points.length - 1, 1) * width},${height - (point.benchmark_value - benchmarkMin) / Math.max(benchmarkMax - benchmarkMin, 1) * height}`).join(" ");
  const regimeChanges = points.filter((point, index) => index > 0 && point.regime !== points[index - 1]?.regime).slice(-3).reverse();
  return <View style={styles.card} testID="terminal-market-pulse"><View style={styles.heading}><View><Text style={styles.eyebrow}>MARKET PULSE</Text><Text style={styles.title}>{pick("Historique du régime", "Regime history")}</Text></View><View style={styles.actions}>{(["3m", "6m", "1y"] as const).map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: range === value }} key={value} onPress={() => onRange(value)} style={[styles.button, range === value && styles.active]} testID={`terminal-pulse-${value}`}><Text style={styles.buttonText}>{value.toUpperCase()}</Text></Pressable>)}</View></View>{points.length > 1 ? <Svg height={height} testID="terminal-pulse-chart" viewBox={`0 0 ${width} ${height}`} width="100%"><Rect fill="rgba(255,74,104,.06)" height={55} width={width} y={115} /><Rect fill="rgba(246,185,74,.06)" height={45} width={width} y={70} /><Rect fill="rgba(32,202,163,.06)" height={70} width={width} y={0} /><Path d={benchmarkPath} fill="none" stroke={colors.textMuted} strokeWidth={2} /><Path d={scorePath} fill="none" stroke={colors.primary} strokeWidth={3} /></Svg> : <Text style={styles.empty}>N/D</Text>}<Text style={styles.meta}>{pick("Bleu : score Terminal · gris : TSX normalisé", "Blue: Terminal score · grey: normalized TSX")}</Text>{regimeChanges.map((point) => <Text key={point.timestamp} style={styles.meta}>{point.regime ?? "N/D"} · {new Date(point.timestamp * 1000).toLocaleDateString()}</Text>)}</View>;
}

export function BreadthCard({ snapshot }: { snapshot: TerminalSnapshot }) {
  const { language, pick } = useLocale(); const data = snapshot.breadth_pro;
  return <View style={styles.card} testID="terminal-breadth-pro"><Text style={styles.eyebrow}>BREADTH PRO</Text><View style={styles.grid}>{[
    metric(pick("Hausses / baisses", "Advancers / decliners"), `${data.advancers ?? "N/D"} / ${data.decliners ?? "N/D"}`),
    metric("MM20 / MM50 / MM200", `${valueOrNd(data.above_sma20_percent, 0, language)} / ${valueOrNd(data.above_sma50_percent, 0, language)} / ${valueOrNd(data.above_sma200_percent, 0, language)} %`),
    metric(pick("Hauts / bas 52S", "52W highs / lows"), `${data.new_highs_52w ?? "N/D"} / ${data.new_lows_52w ?? "N/D"}`),
    metric(pick("Volume titres positifs", "Positive-session volume"), valueOrNd(data.up_volume, 0, language)),
    metric(pick("Volume titres négatifs", "Negative-session volume"), valueOrNd(data.down_volume, 0, language)),
    metric(pick("Écart concentration", "Concentration spread"), `${valueOrNd(data.concentration_spread_percent_points, 2, language)} pts`),
  ]}</View>{data.divergence.active ? <Text style={styles.warning}>{data.divergence.title} · {data.divergence.explanation}</Text> : null}</View>;
}

export function RotationCard({ snapshot }: { snapshot: TerminalSnapshot }) {
  const { pick } = useLocale(); const width = 340, height = 340; const scale = (value: number | null) => width / 2 + Math.max(-20, Math.min(20, value ?? 0)) * 7;
  return <View style={styles.card} testID="terminal-rotation-matrix"><Text style={styles.eyebrow}>ROTATION 2.0</Text><Text style={styles.meta}>{pick("Rotation quantitative observée — pas des flux institutionnels", "Observed quantitative rotation — not institutional flows")}</Text><Svg height={height} viewBox={`0 0 ${width} ${height}`} width="100%"><Rect fill="rgba(255,74,104,.05)" height={height / 2} width={width / 2} x="0" y={height / 2} /><Rect fill="rgba(32,202,163,.06)" height={height / 2} width={width / 2} x={width / 2} y="0" /><Line stroke={colors.borderStrong} x1={width / 2} x2={width / 2} y1="0" y2={height} /><Line stroke={colors.borderStrong} x1="0" x2={width} y1={height / 2} y2={height / 2} />{snapshot.sector_rotation.map((item) => { const cx=scale(item.x), cy=height-scale(item.y), px=scale(item.previous_x), py=height-scale(item.previous_y); return <G key={item.sector} onPress={() => router.push({ pathname: "/(tabs)/markets", params: { universe: "tsx60", sector: item.sector } } as Href)} testID={`terminal-rotation-${item.sector}`}><Line stroke={colors.textMuted} x1={px} x2={cx} y1={py} y2={cy} /><Circle cx={cx} cy={cy} fill={colors.primary} r={Math.max(8, Math.min(19, 6 + item.member_count))} /><SvgText fill="#fff" fontSize="8" textAnchor="middle" x={cx} y={cy - 13}>{item.sector.slice(0, 16)}</SvgText></G>; })}</Svg></View>;
}

export function DriversCard({ snapshot }: { snapshot: TerminalSnapshot }) {
  const { language, pick } = useLocale();
  return <View style={styles.card} testID="terminal-drivers"><Text style={styles.eyebrow}>{pick("DRIVERS DU MARCHÉ CANADIEN", "CANADIAN MARKET DRIVERS")}</Text><View style={styles.grid}>{snapshot.market_drivers.map((item) => <View key={item.key} style={styles.metric} testID={`terminal-driver-${item.key}`}><Text style={styles.title}>{item.label}</Text><Text style={styles.metricValue}>{item.value == null ? "N/D" : `${valueOrNd(item.value, 3, language)} ${item.unit}`}</Text><Text style={styles.score}>{item.change_5d == null ? "N/D" : `${valueOrNd(item.change_5d, 2, language)} ${item.change_unit} / 5J`}</Text><Text style={styles.meta}>{item.relationship_label ?? pick("Corrélation N/D", "Correlation N/A")}</Text></View>)}</View></View>;
}

export function AnomaliesCard({ snapshot }: { snapshot: TerminalSnapshot }) {
  const { pick } = useLocale();
  return <View style={styles.card} testID="terminal-anomalies"><Text style={styles.eyebrow}>ANOMALY ENGINE</Text><Text style={styles.meta}>{pick("Rareté statistique, pas probabilité de hausse", "Statistical rarity, not upside probability")}</Text>{snapshot.anomalies.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => item.symbol && router.push({ pathname: "/stock/[ticker]", params: { ticker: item.symbol } })} style={styles.row} testID={`terminal-anomaly-${item.id}`}><View style={styles.rowText}><Text style={styles.title}>{item.title}</Text><Text style={styles.meta}>{item.detail}</Text></View><Text style={styles.score}>{item.rarity_score.toFixed(0)}/100</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, eyebrow: { ...typography.label, color: colors.primary, letterSpacing: 1 }, title: { ...typography.section, color: colors.text }, meta: { ...typography.caption, color: colors.textMuted }, score: { ...typography.label, color: colors.primary }, warning: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, horizon: { minWidth: "46%", flexGrow: 1, gap: 3, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, metric: { minWidth: "46%", flexGrow: 1, gap: 3, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, metricValue: { ...typography.section, color: colors.text }, actions: { flexDirection: "row", gap: spacing.xs }, button: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.18)" }, buttonText: { ...typography.caption, color: colors.text, fontWeight: "800" }, empty: { ...typography.body, color: colors.textMuted, textAlign: "center", padding: spacing.xl }, row: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, rowText: { flex: 1, gap: 3 },
});
