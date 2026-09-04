import { binaryTreemap, heatmapTileDetailLevel } from "@anatole/shared/heatmap";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import type { EtfHoldingDriver } from "@/src/lib/api/types";
import { colors, radius } from "@/src/theme/tokens";

function fill(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return "#334655";
  const strength = Math.min(Math.max(Math.abs(change) / 5, 0.18), 1);
  if (change > 0.005) return `rgba(0, ${Math.round(122 + strength * 72)}, ${Math.round(92 + strength * 45)}, ${0.72 + strength * 0.24})`;
  if (change < -0.005) return `rgba(${Math.round(170 + strength * 62)}, ${Math.round(30 + strength * 13)}, ${Math.round(55 + strength * 32)}, ${0.74 + strength * 0.23})`;
  return "#40586a";
}

export function EtfHoldingsHeatmap({ holdings, height = 230, onOpen }: { holdings: EtfHoldingDriver[]; height?: number; onOpen: (ticker: string) => void }) {
  const [width, setWidth] = useState(320);
  const visible = holdings.filter((holding) => holding.weight_percent > 0);
  const layout = binaryTreemap(visible.map((holding) => ({ item: holding, weight: holding.weight_percent })), { x: 0, y: 0, width, height });
  return <View onLayout={(event) => setWidth(Math.max(280, event.nativeEvent.layout.width))} style={styles.canvas} testID="etf-holdings-heatmap">
    <Svg accessibilityLabel="ETF holdings heatmap" height={height} testID="etf-holdings-heatmap-svg" width={width}>
      {layout.map(({ item, rect }) => {
        const detail = heatmapTileDetailLevel(rect, visible.length, true);
        const change = item.change_percent;
        const label = change === null ? "N/D" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
        return <G key={item.symbol} onPress={() => onOpen(item.display_symbol)} testID={`etf-xray-tile-${item.display_symbol}`}>
          <Rect fill={fill(change)} height={Math.max(0, rect.height - 1)} rx={2} stroke="#07141e" strokeWidth={1} width={Math.max(0, rect.width - 1)} x={rect.x} y={rect.y} />
          {detail >= 1 ? <SvgText fill="#fff" fontSize={detail === 1 ? 7 : 10} fontWeight="800" textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 - (detail >= 2 ? 3 : 0)}>{item.display_symbol.slice(0, 8)}</SvgText> : null}
          {detail >= 2 ? <SvgText fill="#fff" fontSize={9} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 10}>{label}</SvgText> : null}
          {detail >= 3 ? <SvgText fill="#d4ebf8" fontSize={8} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 22}>{item.weight_percent.toFixed(1)}%</SvgText> : null}
        </G>;
      })}
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  canvas: { width: "100%", overflow: "hidden", borderRadius: radius.sm, backgroundColor: colors.background },
});
