import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useLocale } from "@/src/lib/i18n";
import { sessionStore } from "@/src/lib/api/session";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

type Command = "indicators" | "draw" | "compare" | "alert" | "layouts" | "strategy" | "paper" | "fundamentals" | "undo" | "redo";
type BridgeInbound = { type: "ready" | "tickerSelected" | "alertCreated" | "paperOrderChanged" | "layoutSaved" | "heightChanged" | "error"; ticker?: string; height?: number; message?: string };
const timeframes = ["1m", "5m", "15m", "1h", "1D", "1W"];
const chartTypes = ["candles", "bars", "line", "area", "heikin_ashi"];
const drawingTools = [
  { id: "cursor", fr: "Curseur", en: "Cursor" }, { id: "trendline", fr: "Ligne de tendance", en: "Trendline" },
  { id: "horizontal_line", fr: "Horizontale", en: "Horizontal" }, { id: "vertical_line", fr: "Verticale", en: "Vertical" },
  { id: "ray", fr: "Rayon", en: "Ray" }, { id: "rectangle", fr: "Rectangle", en: "Rectangle" },
  { id: "parallel_channel", fr: "Canal", en: "Channel" }, { id: "fib_retracement", fr: "Retracement Fib", en: "Fib retracement" },
  { id: "fib_extension", fr: "Extension Fib", en: "Fib extension" }, { id: "price_range", fr: "Mesure", en: "Measure" },
  { id: "text", fr: "Texte", en: "Text" },
] as const;

export function MobileFocusPro({ ticker }: { ticker: string }) {
  const { language, pick } = useLocale();
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState("1D");
  const [chartType, setChartType] = useState("candles");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const [drawingTool, setDrawingTool] = useState("cursor");
  const webUrl = typeof Constants.expoConfig?.extra?.webUrl === "string" ? Constants.expoConfig.extra.webUrl.replace(/\/+$/, "") : "https://anatole.ca";
  const uri = `${webUrl}/embed/focus/${encodeURIComponent(ticker)}?lang=${language}`;
  const post = useCallback((payload: object) => ref.current?.postMessage(JSON.stringify(payload)), []);
  useEffect(() => { let active = true; void sessionStore.get().then((token) => { if (active) setSessionToken(token); }); return () => { active = false; }; }, []);
  useEffect(() => { if (ready) post({ type: "configure", ticker, language, theme: "dark", timeframe, chartType, sessionToken }); }, [chartType, language, post, ready, sessionToken, ticker, timeframe]);
  const sendCommand = (command: Command) => command === "draw" ? setDrawOpen(true) : post({ type: "command", command });
  const controls = useMemo(() => [
    { id: "indicators" as const, label: pick("Indicateurs", "Indicators") }, { id: "draw" as const, label: pick("Dessiner", "Draw") },
    { id: "compare" as const, label: pick("Comparer", "Compare") }, { id: "alert" as const, label: pick("Alerte", "Alert") },
    { id: "layouts" as const, label: "Layouts" }, { id: "strategy" as const, label: "Strategy Lab" },
    { id: "paper" as const, label: "Paper" }, { id: "fundamentals" as const, label: pick("Événements", "Events") },
  ], [pick]);
  function onMessage(event: WebViewMessageEvent) { try { const message = JSON.parse(event.nativeEvent.data) as BridgeInbound; if (message.type === "ready") setReady(true); if (message.type === "error") setStatus(message.message ?? pick("Erreur workstation", "Workstation error")); if (["alertCreated", "layoutSaved", "paperOrderChanged"].includes(message.type)) setStatus(message.type); } catch { setStatus(pick("Message bridge invalide", "Invalid bridge message")); } }
  return <View style={styles.shell} testID="focus-pro-section">
    <View style={styles.selectors}><ScrollView horizontal showsHorizontalScrollIndicator={false}>{timeframes.map((value) => <Pressable key={value} onPress={() => { setTimeframe(value); post({ type: "timeframe", value }); }} style={[styles.chip, timeframe === value && styles.active]}><Text style={styles.chipText}>{value}</Text></Pressable>)}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false}>{chartTypes.map((value) => <Pressable key={value} onPress={() => { setChartType(value); post({ type: "chartType", value }); }} style={[styles.chip, chartType === value && styles.active]}><Text style={styles.chipText}>{value.replace("heikin_ashi", "Heikin Ashi")}</Text></Pressable>)}</ScrollView></View>
    <ScrollView contentContainerStyle={styles.actions} horizontal showsHorizontalScrollIndicator={false}>{controls.map((control) => <Pressable disabled={!ready} key={control.id} onPress={() => sendCommand(control.id)} style={styles.command}><Text style={styles.commandText}>{control.label}</Text></Pressable>)}<Pressable disabled={!ready} onPress={() => sendCommand("undo")} style={styles.command}><Text style={styles.commandText}>↶</Text></Pressable><Pressable disabled={!ready} onPress={() => sendCommand("redo")} style={styles.command}><Text style={styles.commandText}>↷</Text></Pressable></ScrollView>
    <WebView allowsFullscreenVideo bounces={false} javaScriptEnabled onMessage={onMessage} onShouldStartLoadWithRequest={(request) => request.url.startsWith(webUrl) || request.url === "about:blank"} ref={ref} source={{ uri }} style={styles.webview} testID="focus-pro-webview" />
    <Text style={styles.status}>{status ?? (ready ? pick("Workstation prête", "Workstation ready") : pick("Chargement de Focus Pro…", "Loading Focus Pro…"))}</Text>
    <Modal animationType="slide" onRequestClose={() => setDrawOpen(false)} transparent visible={drawOpen}>
      <Pressable onPress={() => setDrawOpen(false)} style={styles.scrim}><Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
        <Text style={styles.sheetTitle}>{pick("Dessiner", "Draw")}</Text>
        <View style={styles.toolGrid}>{drawingTools.map((tool) => <Pressable key={tool.id} onPress={() => { setDrawingTool(tool.id); post({ type: "drawingTool", value: tool.id }); setDrawOpen(false); }} style={[styles.tool, drawingTool === tool.id && styles.active]}><Text style={styles.commandText}>{pick(tool.fr, tool.en)}</Text></Pressable>)}</View>
        <View style={styles.undoRow}><Pressable onPress={() => post({ type: "command", command: "undo" })} style={styles.command}><Text style={styles.commandText}>↶ {pick("Annuler", "Undo")}</Text></Pressable><Pressable onPress={() => post({ type: "command", command: "redo" })} style={styles.command}><Text style={styles.commandText}>↷ {pick("Rétablir", "Redo")}</Text></Pressable></View>
      </Pressable></Pressable>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ shell: { minHeight: 720, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }, selectors: { gap: spacing.xs, padding: spacing.sm }, chip: { minHeight: 44, minWidth: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, marginRight: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" }, chipText: { ...typography.caption, color: colors.text }, actions: { paddingHorizontal: spacing.sm, gap: spacing.xs }, command: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, commandText: { ...typography.caption, color: colors.text }, webview: { minHeight: 580, backgroundColor: colors.background }, status: { ...typography.caption, color: colors.textMuted, padding: spacing.sm, textAlign: "center" }, scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.6)" }, sheet: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.lg * 2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, sheetTitle: { ...typography.title, color: colors.text }, toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, tool: { minHeight: 48, minWidth: "31%", flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, undoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm } });
