import {
  binaryTreemap,
  groupEtfHeatmapTiles,
  heatmapTileDetailLevel,
  normalizeEtfHeatmapTile,
  type EtfHeatmapGroup,
  type EtfHeatmapGroupingMode,
  type HeatmapRect,
  type NormalizedEtfHeatmapTile,
} from "@anatole/shared/heatmap";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import { compactNumberOrNd, moneyOrNd } from "@/src/components/focus/format";
import type { EtfDirectoryItem } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

type TileLayout = { tile: NormalizedEtfHeatmapTile; rect: HeatmapRect };

function fillFor(tile: NormalizedEtfHeatmapTile): string {
  if (!tile.available) return "#334655";
  const strength = Math.min(Math.max(Math.abs(tile.changePercent) / 5, 0.18), 1);
  if (tile.changePercent > 0.005) return `rgba(0, ${Math.round(122 + strength * 72)}, ${Math.round(92 + strength * 45)}, ${0.72 + strength * 0.24})`;
  if (tile.changePercent < -0.005) return `rgba(${Math.round(170 + strength * 62)}, ${Math.round(30 + strength * 13)}, ${Math.round(55 + strength * 32)}, ${0.74 + strength * 0.23})`;
  return "#40586a";
}

function changeLabel(tile: NormalizedEtfHeatmapTile): string {
  if (!tile.available) return "N/D";
  return `${tile.changePercent >= 0 ? "+" : ""}${tile.changePercent.toFixed(2)}%`;
}

function layoutGroups(groups: EtfHeatmapGroup[], width: number, height: number): TileLayout[] {
  const groupRects = binaryTreemap(groups.map((group) => ({ item: group, weight: group.weight })), { x: 0, y: 0, width, height });
  return groupRects.flatMap(({ item: group, rect }) => {
    const header = groups.length > 1 && rect.height > 42 ? 25 : 0;
    return binaryTreemap(
      group.tiles.map((tile) => ({ item: tile, weight: tile.liquidityWeight })),
      { x: rect.x + 1, y: rect.y + header + 1, width: Math.max(0, rect.width - 2), height: Math.max(0, rect.height - header - 2) },
    ).map(({ item: tile, rect: tileRect }) => ({ tile, rect: tileRect }));
  });
}

export function EtfHeatmap({ items, height = 500, onOpen }: { items: EtfDirectoryItem[]; height?: number; onOpen: (ticker: string) => void }) {
  const { language, pick } = useLocale();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.max(320, window.width - spacing.lg * 2));
  const [mode, setMode] = useState<EtfHeatmapGroupingMode>("sector");
  const [drilldown, setDrilldown] = useState<string | null>(null);
  const [selected, setSelected] = useState<NormalizedEtfHeatmapTile | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const labels = useMemo(() => ({
    otherProviders: pick("Autres fournisseurs", "Other providers"),
    otherExposures: pick("Autres expositions", "Other exposures"),
    fullMarket: pick("Marché complet", "Full market"),
    gainers: pick("Hausses", "Gainers"),
    unchanged: pick("Inchangés / N/D", "Unchanged / N/A"),
    decliners: pick("Baisses", "Decliners"),
  }), [pick]);
  const normalized = useMemo(() => items.map((item) => normalizeEtfHeatmapTile(item, labels)), [items, labels]);
  const allGroups = useMemo(() => groupEtfHeatmapTiles(normalized, mode, labels), [labels, mode, normalized]);
  const groups = useMemo(() => drilldown ? allGroups.filter((group) => group.key === drilldown) : allGroups, [allGroups, drilldown]);
  const visibleCount = groups.reduce((sum, group) => sum + group.tiles.length, 0);

  function renderMap(mapWidth: number, mapHeight: number) {
    const tileLayouts = layoutGroups(groups, mapWidth, mapHeight);
    const groupRects = binaryTreemap(groups.map((group) => ({ item: group, weight: group.weight })), { x: 0, y: 0, width: mapWidth, height: mapHeight });
    return <Svg accessibilityLabel={pick("Carte thermique des ETF", "ETF heatmap")} height={mapHeight} testID="etf-heatmap-svg" width={mapWidth}>
      {groupRects.map(({ item: group, rect }) => groups.length > 1 && rect.height > 42 ? <G key={`header-${group.key}`} onPress={() => mode !== "direction" && setDrilldown(group.key)} testID={`etf-heatmap-group-${group.key}`}>
        <Rect fill="#0b2333" height={24} stroke="#28526d" strokeWidth={1} width={Math.max(0, rect.width - 2)} x={rect.x + 1} y={rect.y + 1} />
        <SvgText fill="#d8efff" fontSize={Math.min(11, Math.max(8, rect.width / 14))} fontWeight="700" x={rect.x + 6} y={rect.y + 17}>{group.label.slice(0, Math.max(5, Math.floor(rect.width / 8)))}</SvgText>
      </G> : null)}
      {tileLayouts.map(({ tile, rect }) => {
        const detail = heatmapTileDetailLevel(rect, visibleCount, true);
        return <G key={`${tile.ticker}-${rect.x}-${rect.y}`} onLongPress={() => setSelected(tile)} onPress={() => onOpen(tile.ticker)} testID={`etf-heatmap-tile-${tile.ticker}`}>
          <Rect fill={fillFor(tile)} height={Math.max(0, rect.height - 1)} rx={1} stroke="#07141e" strokeWidth={1} width={Math.max(0, rect.width - 1)} x={rect.x} y={rect.y} />
          {detail >= 1 ? <SvgText fill="#fff" fontSize={detail === 1 ? 7 : 10} fontWeight="800" textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 - (detail >= 2 ? 3 : 0)}>{tile.ticker.slice(0, 8)}</SvgText> : null}
          {detail >= 2 ? <SvgText fill="#fff" fontSize={9} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 10}>{changeLabel(tile)}</SvgText> : null}
          {detail >= 3 ? <SvgText fill="#d4ebf8" fontSize={8} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 22}>{tile.price === null ? "N/D" : tile.price.toFixed(2)}</SvgText> : null}
        </G>;
      })}
    </Svg>;
  }

  const modes: { id: EtfHeatmapGroupingMode; label: string }[] = [
    { id: "sector", label: pick("Secteurs", "Sectors") },
    { id: "provider", label: pick("Fournisseurs", "Providers") },
    { id: "direction", label: pick("Sens du marché", "Market direction") },
  ];

  return <View testID="etf-heatmap">
    <View style={styles.toolbar}>
      {modes.map((option) => <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === option.id && !drilldown }} key={option.id} onPress={() => { setMode(option.id); setDrilldown(null); }} style={[styles.mode, mode === option.id && !drilldown && styles.modeActive]} testID={`etf-heatmap-mode-${option.id}`}><Text numberOfLines={2} style={styles.modeText}>{option.label}</Text></Pressable>)}
      <Pressable accessibilityLabel={pick("Plein écran", "Full screen")} accessibilityRole="button" onPress={() => setFullscreen(true)} style={styles.fullscreenButton} testID="etf-heatmap-fullscreen"><Text style={styles.modeText}>⛶</Text></Pressable>
    </View>
    {drilldown ? <Pressable accessibilityRole="button" onPress={() => setDrilldown(null)} style={styles.back} testID="etf-heatmap-back"><Text style={styles.backText}>‹ {pick("Retour au marché", "Back to market")} · {drilldown}</Text></Pressable> : null}
    <View onLayout={(event) => setWidth(Math.max(280, event.nativeEvent.layout.width))} style={styles.canvas}>{renderMap(width, height)}</View>
    <Text style={styles.help}>{pick("Touchez pour ouvrir l’ETF · appui long pour les détails", "Tap to open ETF · long press for details")}</Text>

    <Modal animationType="slide" onRequestClose={() => setSelected(null)} transparent visible={selected !== null}>
      <Pressable onPress={() => setSelected(null)} style={styles.scrim}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
          {selected ? <>
            <Text style={styles.sheetTitle}>{selected.ticker} · {selected.name}</Text>
            <Text style={styles.sheetLine}>{selected.provider} · {selected.sector}</Text>
            <Text style={styles.sheetLine}>{selected.exposure}</Text>
            <View style={styles.metrics}><Text style={styles.sheetMetric}>{selected.price === null ? "N/D" : moneyOrNd(selected.price, selected.currency, false, language)}</Text><Text style={[styles.sheetMetric, { color: selected.available ? selected.changePercent >= 0 ? colors.positive : colors.negative : colors.textMuted }]}>{changeLabel(selected)}</Text></View>
            <Text style={styles.sheetLine}>{pick("Volume", "Volume")}: {compactNumberOrNd(selected.volume, language)}</Text>
            <Text style={styles.sheetLine}>{selected.available ? selected.delayed ? pick("Donnée différée", "Delayed data") : pick("Temps réel", "Live") : pick("Indisponible", "Unavailable")}</Text>
            <Pressable onPress={() => { setSelected(null); onOpen(selected.ticker); }} style={styles.action}><Text style={styles.actionText}>{pick("Ouvrir l’ETF", "Open ETF")}</Text></Pressable>
          </> : null}
        </Pressable>
      </Pressable>
    </Modal>

    <Modal animationType="fade" onRequestClose={() => setFullscreen(false)} supportedOrientations={["portrait", "landscape"]} visible={fullscreen}>
      <View style={styles.fullscreen}>
        <Pressable accessibilityRole="button" onPress={() => setFullscreen(false)} style={styles.close}><Text style={styles.actionText}>× {pick("Fermer", "Close")}</Text></Pressable>
        <View style={styles.fullscreenMap}>{renderMap(window.width, Math.max(440, window.height - 64))}</View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  mode: { minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  modeActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  fullscreenButton: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  modeText: { ...typography.caption, color: colors.text, fontWeight: "800", textAlign: "center" },
  back: { minHeight: 44, justifyContent: "center" }, backText: { ...typography.label, color: colors.primary },
  canvas: { width: "100%", overflow: "hidden", borderRadius: radius.sm, backgroundColor: "#07141e" },
  help: { ...typography.caption, color: colors.textSubtle, textAlign: "center", marginTop: spacing.xs },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.58)" },
  sheet: { gap: spacing.sm, padding: spacing.xl, paddingBottom: spacing.xl * 2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  sheetTitle: { ...typography.section, color: colors.text }, sheetLine: { ...typography.body, color: colors.textMuted },
  metrics: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, sheetMetric: { ...typography.hero, color: colors.text, fontSize: 22 },
  action: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary }, actionText: { ...typography.label, color: colors.text },
  fullscreen: { flex: 1, backgroundColor: colors.background }, close: { minHeight: 56, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: spacing.lg }, fullscreenMap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
