import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChartWebView } from "@/src/components/ChartWebView";
import { NewsCard } from "@/src/components/market";
import { Card, Change, QueryState, uiStyles } from "@/src/components/ui";
import type { FocusSnapshot, StockNewsSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { compactSessionVolume, liveQuoteStatus, type LiveQuoteState } from "./liveStatus";

const periods = [{ label: "LIVE", range: "1d", interval: "1m" }, { label: "1S", range: "5d", interval: "5m" }, { label: "3M", range: "3mo", interval: "1d" }, { label: "6M", range: "6mo", interval: "1d" }, { label: "1A", range: "1y", interval: "1d" }, { label: "5A", range: "5y", interval: "1wk" }] as const;
export type FocusPeriod = (typeof periods)[number];
export { periods as focusPeriods };

export function MobileFocusOverview({ ticker, snapshot, period, liveState, news, newsLoading, newsError }: { ticker: string; snapshot: FocusSnapshot; period: FocusPeriod; liveState: LiveQuoteState; news?: StockNewsSnapshot; newsLoading: boolean; newsError: Error | null }) {
  const { language, pick } = useLocale();
  const performance = useMemo(() => { const first = snapshot.history[0]?.close; const last = snapshot.history.at(-1)?.close; return first && last ? ((last - first) / first) * 100 : null; }, [snapshot.history]);
  const technicals = snapshot.technicals;
  const rsi = typeof technicals.rsi_14 === "number" ? technicals.rsi_14 : null;
  const technicalLabel = rsi === null ? "N/D" : rsi > 70 ? pick("Surachat", "Overbought") : rsi < 30 ? pick("Survente", "Oversold") : pick("Neutre", "Neutral");
  const quote = snapshot.quote;
  const positive = quote.change_percent >= 0;
  const status = liveQuoteStatus(liveState, quote.delayed, pick);
  return <View style={styles.stack} testID="focus-overview-section">
    <Card title={`${ticker} · ${period.label}`}><View style={styles.liveBand}><View><Text style={[styles.liveState, liveState === "live" && !quote.delayed ? styles.liveOn : liveState === "offline" ? styles.liveOff : undefined]}>{status}</Text><Text style={styles.liveVolume}>{pick("Volume", "Volume")} {compactSessionVolume(quote.volume, language)}</Text></View><View style={styles.liveQuote}><Text style={styles.livePrice}>{quote.price.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {quote.currency}</Text><Text style={[styles.liveChange, { color: positive ? colors.positive : colors.negative }]}>{positive ? "+" : ""}{quote.change_percent.toFixed(2)} %</Text></View></View>{performance !== null ? <View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Variation", "Change")}</Text><Change value={performance} /></View> : null}<ChartWebView candles={snapshot.history} currency={quote.currency} label={`${ticker} ${period.label}`} ticker={ticker} timeframe={`${period.range}:${period.interval}`} /></Card>
    <Card title={pick("Lecture technique", "Technical summary")}><View style={uiStyles.row}><Text style={uiStyles.label}>RSI 14</Text><Text style={styles.value}>{rsi === null ? "N/D" : rsi.toFixed(2)} · {technicalLabel}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Tendance", "Trend")}</Text><Text style={styles.value}>{String(technicals.trend ?? "N/D")}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Support", "Support")}</Text><Text style={styles.value}>{typeof technicals.support === "number" ? technicals.support.toFixed(2) : "N/D"}</Text></View><View style={uiStyles.row}><Text style={uiStyles.label}>{pick("Résistance", "Resistance")}</Text><Text style={styles.value}>{typeof technicals.resistance === "number" ? technicals.resistance.toFixed(2) : "N/D"}</Text></View></Card>
    <Card title={pick("Dernières nouvelles", "Latest news")}><QueryState empty={Boolean(news && news.items.length === 0)} error={!news ? newsError : null} loading={newsLoading} />{news?.items.slice(0, 10).map((item) => <NewsCard item={item} key={item.id} />)}</Card>
  </View>;
}
const styles = StyleSheet.create({ stack: { gap: spacing.md }, liveBand: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceRaised }, liveState: { ...typography.caption, color: colors.warning, fontWeight: "800" }, liveOn: { color: colors.positive }, liveOff: { color: colors.negative }, liveVolume: { ...typography.caption, color: colors.textMuted, marginTop: 3 }, liveQuote: { alignItems: "flex-end" }, livePrice: { ...typography.section, color: colors.text }, liveChange: { ...typography.label }, value: { ...typography.body, color: colors.text, fontWeight: "700", textAlign: "right" } });
