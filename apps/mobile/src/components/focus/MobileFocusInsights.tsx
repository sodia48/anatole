import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, QueryState } from "@/src/components/ui";
import { marketApi } from "@/src/lib/api/market";
import type { FocusSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { buildStockPsychology } from "./stockPsychology";

const labels: Record<string, [string, string]> = {
  momentum_20d: ["Momentum 20J", "20D momentum"], momentum_50d: ["Momentum 50J", "50D momentum"], rsi_14: ["RSI 14", "RSI 14"],
  volatility_20d: ["Volatilité 20J", "20D volatility"], relative_volume: ["Volume relatif", "Relative volume"],
  price_vs_sma20: ["Prix vs SMA20", "Price vs SMA20"], price_vs_sma50: ["Prix vs SMA50", "Price vs SMA50"],
};
const fmt = (value: number | null, unit: string, language: "fr" | "en") => value === null ? "N/D" : `${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 })}${unit}`;
const metricLabel = (key: string, pick: (fr: string, en: string) => string) => {
  const label = labels[key] ?? [key, key];
  return pick(label[0], label[1]);
};

export function MobileFocusInsights({ ticker, snapshot }: { ticker: string; snapshot: FocusSnapshot }) {
  const { language, pick } = useLocale();
  const psychology = buildStockPsychology(snapshot);
  const screener = useQuery({ queryKey: ["focus-comparables", ticker], queryFn: ({ signal }) => marketApi.screener("composite", signal), staleTime: 5 * 60_000 });
  const earnings = useQuery({ queryKey: ["focus-earnings", ticker], queryFn: ({ signal }) => marketApi.earnings(signal), staleTime: 30 * 60_000 });
  const insider = useQuery({ queryKey: ["focus-insiders", ticker], queryFn: ({ signal }) => marketApi.insiders({ market: "canada", ticker, days: 180, scanLimit: 1 }, signal), staleTime: 15 * 60_000 });
  const sector = snapshot.profile.sector;
  const comparable = screener.data?.items.filter((item) => item.ticker !== ticker && sector && item.sector === sector).slice(0, 5) ?? [];
  const event = earnings.data?.events.find((item) => item.ticker.replace(/\.TO$/i, "") === ticker);
  return <View style={styles.stack} testID="focus-insights-section">
    <Card title={pick("Psychologie Anatole · Titre", "Anatole Psychology · Security")}><Text style={styles.score}>{psychology.score === null ? "N/D" : `${psychology.score}/100`}</Text><Text style={styles.coverage}>{pick("Couverture", "Coverage")} · {psychology.coverage} %</Text>{psychology.components.map((item) => <View key={item.key} style={styles.row}><Text style={styles.label}>{metricLabel(item.key, pick)}</Text><Text style={styles.value}>{fmt(item.value, item.unit, language)}</Text></View>)}<Text style={styles.note}>{psychology.methodology}</Text></Card>
    <Card title={pick("Événements liés au titre", "Security events")}><Text style={styles.label}>{pick("Prochain résultat", "Next earnings")}</Text><Text style={styles.value}>{event ? new Date(event.starts_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA") : "N/D"}</Text>{event ? <><Text style={styles.note}>EPS · {fmt(event.eps_estimate, "", language)} ({event.eps_analyst_count ?? "N/D"})</Text><Text style={styles.note}>{pick("Revenu estimé", "Revenue estimate")} · {fmt(event.revenue_estimate, ` ${event.estimate_currency ?? ""}`, language)} ({event.revenue_analyst_count ?? "N/D"})</Text></> : null}<Text style={styles.label}>{pick("Transactions d’initiés réelles", "Actual insider transactions")} · {insider.data ? insider.data.trades.length : "N/D"}</Text><QueryState error={!earnings.data ? earnings.error : null} loading={earnings.isLoading || insider.isLoading} /></Card>
    <Card title={pick("Comparables du même secteur", "Same-sector comparables")}><QueryState error={!screener.data ? screener.error : null} loading={screener.isLoading} />{comparable.length ? comparable.map((item) => <Pressable accessibilityRole="link" key={item.ticker} onPress={() => router.push({ pathname: "/focus/[ticker]", params: { ticker: item.ticker } })} style={styles.item}><View><Text style={styles.itemTitle}>{item.ticker} · {item.name}</Text><Text style={styles.note}>{pick("Momentum", "Momentum")} {fmt(item.momentum_20d, "%", language)} · RSI {fmt(item.rsi_14, "", language)} · Score {fmt(item.score, "", language)}</Text></View><Text style={styles.value}>{fmt(item.change_percent, "%", language)}</Text></Pressable>) : !screener.isLoading ? <Text style={styles.note}>{pick("Aucun comparable disponible.", "No comparable available.")}</Text> : null}<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/compare", params: { symbols: [ticker, ...comparable.slice(0, 1).map((item) => item.ticker)].join(",") } } as never)} style={styles.button}><Text style={styles.buttonText}>{pick("Comparer", "Compare")}</Text></Pressable></Card>
  </View>;
}

const styles = StyleSheet.create({ stack: { gap: spacing.md }, score: { ...typography.hero, color: colors.text }, coverage: { ...typography.caption, color: colors.primary }, row: { minHeight: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, label: { ...typography.body, color: colors.textMuted, flex: 1 }, value: { ...typography.body, color: colors.text, fontWeight: "800" }, note: { ...typography.caption, color: colors.textSubtle }, item: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, itemTitle: { ...typography.body, color: colors.text, fontWeight: "800" }, button: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary, borderRadius: radius.sm }, buttonText: { ...typography.label, color: colors.primary } });
