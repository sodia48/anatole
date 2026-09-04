import { binaryTreemap } from "@anatole/shared/heatmap";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import { Card } from "@/src/components/ui";
import type { CockpitSnapshot, TerminalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { buildTodayHeatmap, type TodayHeatmapMode, type TodayHeatmapNode, type TodayTarget, type TodayUniverse } from "./model";

function fill(node: TodayHeatmapNode) {
  const strength = Math.min(Math.max(Math.abs(node.changePercent) / 5, 0.2), 1);
  if (node.changePercent > 0.005) return `rgba(0,${Math.round(126 + strength * 68)},${Math.round(90 + strength * 47)},${0.72 + strength * 0.24})`;
  if (node.changePercent < -0.005) return `rgba(${Math.round(170 + strength * 62)},${Math.round(30 + strength * 13)},${Math.round(55 + strength * 32)},${0.74 + strength * 0.23})`;
  return "#40586a";
}

export function TodayHeatmap({ cockpit, terminal, universe, onOpen }: { cockpit?: CockpitSnapshot; terminal: TerminalSnapshot | null; universe: TodayUniverse; onOpen: (target: TodayTarget) => void }) {
  const { pick } = useLocale();
  const [mode, setMode] = useState<TodayHeatmapMode>("stocks");
  const [width, setWidth] = useState(320);
  const data = useMemo(() => buildTodayHeatmap(mode, cockpit, terminal), [cockpit, mode, terminal]);
  const height = 250;
  const layout = useMemo(() => binaryTreemap(data.nodes.map((node) => ({ item: node, weight: Math.max(node.weight, Number.EPSILON) })), { x: 0, y: 0, width, height }), [data.nodes, width]);
  const open = (node: TodayHeatmapNode) => {
    if (mode === "sectors" && node.sector) onOpen({ kind: "sector", universe, sector: node.sector });
    else if (mode === "anomalies") onOpen({ kind: "terminal", symbol: node.symbol ?? undefined, anomaly: node.anomalyType ?? undefined });
    else if (node.symbol) onOpen({ kind: "stock", ticker: node.symbol });
  };
  return <Card title={pick("HEATMAP AUJOURD’HUI", "TODAY HEATMAP")} testID="today-heatmap">
    <View style={styles.segment}>{(["stocks", "sectors", "anomalies"] as TodayHeatmapMode[]).map((value) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === value }} key={value} onPress={() => setMode(value)} style={[styles.segmentButton, mode === value && styles.segmentActive]} testID={`today-heatmap-${value}`}><Text style={styles.segmentText}>{value === "stocks" ? pick("Titres", "Stocks") : value === "sectors" ? pick("Secteurs", "Sectors") : pick("Anomalies", "Anomalies")}</Text></Pressable>)}</View>
    <View onLayout={(event) => setWidth(Math.max(280, event.nativeEvent.layout.width))} style={styles.canvas}>
      {layout.length ? <Svg accessibilityLabel={pick("Heatmap compacte du marché", "Compact market heatmap")} height={height} testID="today-heatmap-svg" width={width}>{layout.map(({ item, rect }) => <G key={item.id} onPress={() => open(item)} testID={`today-heatmap-node-${item.id}`}><Rect fill={fill(item)} height={Math.max(0, rect.height - 1)} stroke="#07141e" strokeWidth={1} width={Math.max(0, rect.width - 1)} x={rect.x} y={rect.y} /><SvgText fill="#fff" fontSize={rect.width > 70 && rect.height > 45 ? 11 : 8} fontWeight="800" textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 - 2}>{item.label.slice(0, Math.max(4, Math.floor(rect.width / 9)))}</SvgText>{rect.width > 58 && rect.height > 42 ? <SvgText fill="#e8f7ff" fontSize={9} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 12}>{item.changePercent > 0 ? "+" : ""}{item.changePercent.toFixed(2)}%</SvgText> : null}{item.anomalyType && rect.width > 90 && rect.height > 64 ? <SvgText fill="#d8efff" fontSize={7} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 24}>{item.anomalyType.slice(0, 18)}</SvgText> : null}</G>)}</Svg> : <View style={styles.empty}><Text style={styles.emptyText}>N/D</Text></View>}
    </View>
    {mode === "anomalies" && data.unmapped.length ? <View style={styles.unmapped}>{data.unmapped.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => onOpen({ kind: "terminal", symbol: item.symbol ?? undefined, anomaly: item.type })} style={styles.unmappedRow} testID={`today-unmapped-${item.id}`}><Text style={styles.unmappedTitle}>{item.symbol ?? "N/D"} · {item.type}</Text><Text style={styles.unmappedMeta}>N/D heatmap · {item.title}</Text></Pressable>)}</View> : null}
  </Card>;
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", gap: spacing.xs }, segmentButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, segmentActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.2)" }, segmentText: { ...typography.caption, color: colors.text, fontWeight: "800" }, canvas: { width: "100%", minHeight: 250, overflow: "hidden", borderRadius: radius.sm, backgroundColor: "#07141e" }, empty: { height: 250, alignItems: "center", justifyContent: "center" }, emptyText: { ...typography.section, color: colors.textMuted }, unmapped: { gap: spacing.xs }, unmappedRow: { minHeight: 54, justifyContent: "center", gap: 2, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, unmappedTitle: { ...typography.label, color: colors.text }, unmappedMeta: { ...typography.caption, color: colors.textMuted },
});
