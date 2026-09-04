import {
  binaryTreemap,
  groupHeatmapTiles,
  heatmapTileDetailLevel,
  layoutTileWeight,
  normalizeHeatmapTile,
  type HeatmapGroupingMode,
  type HeatmapGroup,
  type HeatmapRect,
  type NormalizedHeatmapTile,
} from "@anatole/shared/heatmap";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import type { MarketTile } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

type TileLayout = { tile: NormalizedHeatmapTile; rect: HeatmapRect; group: HeatmapGroup };

function fillFor(tile: NormalizedHeatmapTile): string {
  if (!tile.available) return "#334655";
  const strength = Math.min(Math.max(Math.abs(tile.changePercent) / 5, 0.18), 1);
  if (tile.changePercent > 0.005) return `rgba(0, ${Math.round(122 + strength * 72)}, ${Math.round(92 + strength * 45)}, ${0.72 + strength * 0.24})`;
  if (tile.changePercent < -0.005) return `rgba(${Math.round(170 + strength * 62)}, ${Math.round(30 + strength * 13)}, ${Math.round(55 + strength * 32)}, ${0.74 + strength * 0.23})`;
  return "#40586a";
}

function changeLabel(tile: NormalizedHeatmapTile): string {
  if (!tile.available) return "N/D";
  return `${tile.changePercent >= 0 ? "+" : ""}${tile.changePercent.toFixed(2)}%`;
}

function compact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/D";
  return new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function layoutGroups(groups: HeatmapGroup[], width: number, height: number): TileLayout[] {
  const groupRects = binaryTreemap(
    groups.map((group) => ({ item: group, weight: group.layoutWeight })),
    { x: 0, y: 0, width, height },
  );
  return groupRects.flatMap(({ item: group, rect }) => {
    const header = groups.length > 1 && rect.height > 42 ? 25 : 0;
    const inner = {
      x: rect.x + 1,
      y: rect.y + header + 1,
      width: Math.max(0, rect.width - 2),
      height: Math.max(0, rect.height - header - 2),
    };
    return binaryTreemap(
      group.tiles.map((tile) => ({ item: tile, weight: layoutTileWeight(tile, group.tiles.length) })),
      inner,
    ).map(({ item: tile, rect: tileRect }) => ({ tile, rect: tileRect, group }));
  });
}

export function MarketHeatmap({
  tiles,
  height = 480,
  onOpen,
  onWatchlist,
  onAlert,
  initialSector = null,
  onOpenSector,
}: {
  tiles: MarketTile[];
  height?: number;
  onOpen: (ticker: string) => void;
  onWatchlist: (ticker: string) => void;
  onAlert: (ticker: string) => void;
  initialSector?: string | null;
  onOpenSector?: (sector: string) => void;
}) {
  const { pick } = useLocale();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.max(320, window.width - spacing.lg * 2));
  const [mode, setMode] = useState<HeatmapGroupingMode>("sector");
  const [sector, setSector] = useState<string | null>(null);
  const [selected, setSelected] = useState<NormalizedHeatmapTile | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const normalized = useMemo(
    () => tiles.map((tile) => normalizeHeatmapTile(tile, pick("Autres", "Other"))).filter((tile): tile is NormalizedHeatmapTile => tile !== null),
    [pick, tiles],
  );
  useEffect(() => {
    if (!initialSector) return;
    const match = normalized.find((tile) => tile.sector.toLowerCase() === initialSector.toLowerCase());
    if (!match) return;
    const timer = setTimeout(() => {
      setMode("sector");
      setSector(match.sector);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialSector, normalized]);
  const visible = useMemo(() => sector ? normalized.filter((tile) => tile.sector === sector) : normalized, [normalized, sector]);
  const groups = useMemo(() => groupHeatmapTiles(visible, sector ? "flat" : mode, {
    fullMarket: sector ?? pick("Marché complet", "Full market"),
    gainers: pick("Hausses", "Gainers"),
    unchanged: pick("Inchangés", "Unchanged"),
    decliners: pick("Baisses", "Decliners"),
    unknownSector: pick("Autres", "Other"),
  }), [mode, pick, sector, visible]);

  function renderMap(mapWidth: number, mapHeight: number) {
    const tileLayouts = layoutGroups(groups, mapWidth, mapHeight);
    const groupRects = binaryTreemap(groups.map((group) => ({ item: group, weight: group.layoutWeight })), { x: 0, y: 0, width: mapWidth, height: mapHeight });
    return (
      <Svg accessibilityLabel={pick("Carte thermique du marché", "Market heatmap")} height={mapHeight} testID="market-heatmap-svg" width={mapWidth}>
        {groupRects.map(({ item: group, rect }) => groups.length > 1 && rect.height > 42 ? (
          <G key={`header-${group.key}`} onPress={() => mode === "sector" && setSector(group.key)}>
            <Rect fill="#0b2333" height={24} stroke="#28526d" strokeWidth={1} width={Math.max(0, rect.width - 2)} x={rect.x + 1} y={rect.y + 1} />
            <SvgText fill="#d8efff" fontSize={Math.min(11, Math.max(8, rect.width / 14))} fontWeight="700" x={rect.x + 6} y={rect.y + 17}>{group.label.slice(0, Math.max(5, Math.floor(rect.width / 8)))}</SvgText>
          </G>
        ) : null)}
        {tileLayouts.map(({ tile, rect }) => {
          const detail = heatmapTileDetailLevel(rect, visible.length, true);
          return (
            <G
              key={`${tile.ticker}-${rect.x}-${rect.y}`}
              onLongPress={() => setSelected(tile)}
              onPress={() => onOpen(tile.symbol)}
            >
              <Rect fill={fillFor(tile)} height={Math.max(0, rect.height - 1)} rx={1} stroke="#07141e" strokeWidth={1} width={Math.max(0, rect.width - 1)} x={rect.x} y={rect.y} />
              {detail >= 1 ? <SvgText fill="#fff" fontSize={detail === 1 ? 7 : 10} fontWeight="800" textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 - (detail >= 2 ? 3 : 0)}>{tile.symbol.slice(0, 8)}</SvgText> : null}
              {detail >= 2 ? <SvgText fill="#fff" fontSize={9} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 10}>{changeLabel(tile)}</SvgText> : null}
              {detail >= 3 && tile.price !== null ? <SvgText fill="#d4ebf8" fontSize={8} textAnchor="middle" x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 22}>{tile.price.toFixed(2)}</SvgText> : null}
            </G>
          );
        })}
      </Svg>
    );
  }

  const modeOptions: { id: HeatmapGroupingMode; label: string }[] = [
    { id: "sector", label: pick("Secteurs", "Sectors") },
    { id: "flat", label: pick("Global", "Market") },
    { id: "direction", label: pick("Sens", "Direction") },
  ];

  return (
    <View>
      <View style={styles.toolbar}>
        {modeOptions.map((option) => <Pressable accessibilityRole="button" key={option.id} onPress={() => { setSector(null); setMode(option.id); }} style={[styles.mode, mode === option.id && !sector && styles.modeActive]}><Text style={styles.modeText}>{option.label}</Text></Pressable>)}
        <Pressable accessibilityRole="button" onPress={() => setFullscreen(true)} style={styles.mode}><Text style={styles.modeText}>⛶</Text></Pressable>
      </View>
      {sector ? <View style={styles.sectorActions}><Pressable onPress={() => setSector(null)} style={styles.back}><Text style={styles.backText}>‹ {pick("Retour au marché", "Back to market")} · {sector}</Text></Pressable>{onOpenSector ? <Pressable onPress={() => onOpenSector(sector)} style={styles.screenerLink} testID="heatmap-open-sector-screener"><Text style={styles.backText}>{pick("Ouvrir dans Screener", "Open in Screener")} →</Text></Pressable> : null}</View> : null}
      <View onLayout={(event) => setWidth(Math.max(280, event.nativeEvent.layout.width))} style={styles.canvas}>{renderMap(width, height)}</View>
      <Text style={styles.help}>{pick("Touchez pour ouvrir Focus · appui long pour les détails", "Tap to open Focus · long press for details")}</Text>

      <Modal animationType="slide" onRequestClose={() => setSelected(null)} transparent visible={selected !== null}>
        <Pressable onPress={() => setSelected(null)} style={styles.scrim}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
            {selected ? <>
              <Text style={styles.sheetTitle}>{selected.symbol} · {selected.name}</Text>
              <Text style={styles.sheetLine}>{selected.sector}</Text>
              <View style={styles.metrics}><Text style={styles.sheetMetric}>{selected.price === null ? "N/D" : `${selected.price.toFixed(2)} CAD`}</Text><Text style={styles.sheetMetric}>{changeLabel(selected)}</Text></View>
              <Text style={styles.sheetLine}>{pick("Poids", "Weight")}: {selected.weight > 0 ? `${selected.weight.toFixed(2)}%` : "N/D"} · {pick("Volume", "Volume")}: {compact(selected.volume)}</Text>
              <Text style={styles.sheetLine}>{selected.delayed ? pick("Donnée différée", "Delayed data") : pick("Temps réel", "Real time")}</Text>
              <Pressable onPress={() => { setSelected(null); onOpen(selected.symbol); }} style={styles.action}><Text style={styles.actionText}>{pick("Ouvrir Focus", "Open Focus")}</Text></Pressable>
              <Pressable onPress={() => { setSelected(null); onWatchlist(selected.symbol); }} style={styles.actionSecondary}><Text style={styles.actionText}>{pick("Ajouter à la watchlist", "Add to watchlist")}</Text></Pressable>
              <Pressable onPress={() => { setSelected(null); onAlert(selected.symbol); }} style={styles.actionSecondary}><Text style={styles.actionText}>{pick("Créer une alerte", "Create alert")}</Text></Pressable>
            </> : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setFullscreen(false)} supportedOrientations={["portrait", "landscape"]} visible={fullscreen}>
        <View style={styles.fullscreen}>
          <Pressable onPress={() => setFullscreen(false)} style={styles.close}><Text style={styles.actionText}>× {pick("Fermer", "Close")}</Text></Pressable>
          <View style={styles.fullscreenMap}>{renderMap(window.width, Math.max(440, window.height - 64))}</View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  mode: { minHeight: 44, minWidth: 44, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  modeActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  modeText: { ...typography.caption, color: colors.text, fontWeight: "800" },
  sectorActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs }, back: { minHeight: 44, flexGrow: 1, justifyContent: "center" }, screenerLink: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm }, backText: { ...typography.label, color: colors.primary },
  canvas: { width: "100%", overflow: "hidden", borderRadius: radius.sm, backgroundColor: "#07141e" },
  help: { ...typography.caption, color: colors.textSubtle, textAlign: "center", marginTop: spacing.xs },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.58)" },
  sheet: { gap: spacing.sm, padding: spacing.xl, paddingBottom: spacing.xl * 2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  sheetTitle: { ...typography.section, color: colors.text }, sheetLine: { ...typography.body, color: colors.textMuted },
  metrics: { flexDirection: "row", justifyContent: "space-between" }, sheetMetric: { ...typography.hero, color: colors.text, fontSize: 22 },
  action: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary },
  actionSecondary: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  actionText: { ...typography.label, color: colors.text },
  fullscreen: { flex: 1, backgroundColor: colors.background }, close: { minHeight: 56, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: spacing.lg }, fullscreenMap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
