import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useLocale } from "@/src/lib/i18n";
import { sessionStore } from "@/src/lib/api/session";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

type Command = "indicators" | "draw" | "compare" | "alert" | "layouts" | "strategy" | "paper" | "fundamentals" | "undo" | "redo";
type BridgeInbound = { type: "ready" | "tickerSelected" | "alertCreated" | "paperOrderChanged" | "layoutSaved" | "heightChanged" | "error"; ticker?: string; height?: number; message?: string };
const timeframes = ["1m", "5m", "15m", "1h", "1D", "1W"];
const chartTypes = ["candles", "bars", "line", "area", "heikin_ashi"];

export function MobileFocusPro({ ticker }: { ticker: string }) {
  const { language, pick } = useLocale();
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState("1D");
  const [chartType, setChartType] = useState("candles");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const webUrl = typeof Constants.expoConfig?.extra?.webUrl === "string" ? Constants.expoConfig.extra.webUrl.replace(/\/+$/, "") : "https://anatole.ca";
  const uri = `${webUrl}/embed/focus/${encodeURIComponent(ticker)}?lang=${language}`;
  const post = useCallback((payload: object) => ref.current?.postMessage(JSON.stringify(payload)), []);
  useEffect(() => { let active = true; void sessionStore.get().then((token) => { if (active) setSessionToken(token); }); return () => { active = false; }; }, []);
  useEffect(() => { if (ready) post({ type: "configure", ticker, language, theme: "dark", timeframe, chartType, sessionToken }); }, [chartType, language, post, ready, sessionToken, ticker, timeframe]);
  const sendCommand = (command: Command) => post({ type: "command", command });
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
  </View>;
}
const styles = StyleSheet.create({ shell: { minHeight: 720, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }, selectors: { gap: spacing.xs, padding: spacing.sm }, chip: { minHeight: 44, minWidth: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, marginRight: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm }, active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" }, chipText: { ...typography.caption, color: colors.text }, actions: { paddingHorizontal: spacing.sm, gap: spacing.xs }, command: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm }, commandText: { ...typography.caption, color: colors.text }, webview: { minHeight: 580, backgroundColor: colors.background }, status: { ...typography.caption, color: colors.textMuted, padding: spacing.sm, textAlign: "center" } });
