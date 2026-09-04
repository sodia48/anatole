import { buildCandleSessionFlow, type SessionFlowSnapshot } from "@anatole/shared";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/ui";
import type { FocusSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { compactNumberOrNd } from "./format";
import type { FocusPeriod } from "./MobileFocusOverview";

function width(value: number | null, total: number | null): `${number}%` {
  const percentage = value !== null && total !== null && total > 0 ? (value / total) * 100 : 0;
  return `${Math.max(0, Math.min(100, percentage))}%`;
}

export function sessionFlowForFocus(ticker: string, snapshot: FocusSnapshot, period: FocusPeriod): SessionFlowSnapshot {
  return buildCandleSessionFlow({
    ticker,
    range: period.range,
    interval: period.interval,
    candles: snapshot.history,
    source: snapshot.quote.source,
    delayed: snapshot.quote.delayed,
    generatedAt: snapshot.generated_at,
  });
}

export function MobileSessionFlow({ ticker, snapshot, period }: { ticker: string; snapshot: FocusSnapshot; period: FocusPeriod }) {
  const { language, pick } = useLocale();
  const flow = useMemo(() => sessionFlowForFocus(ticker, snapshot, period), [period, snapshot, ticker]);
  const buyerLabel = flow.estimated ? pick("Acheteurs estimés", "Estimated buyers") : pick("Acheteurs", "Buyers");
  const sellerLabel = flow.estimated ? pick("Vendeurs estimés", "Estimated sellers") : pick("Vendeurs", "Sellers");
  const totalLabel = period.label === "LIVE" ? pick("Volume session", "Session volume") : pick("Volume de la période", "Period volume");
  const delta = flow.volume_delta;
  const deltaText = delta === null ? "N/D" : `${delta >= 0 ? "+" : ""}${compactNumberOrNd(delta, language)}`;
  const ratioText = flow.buy_ratio === null ? "N/D" : `${(flow.buy_ratio * 100).toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 1 })} %`;

  return <Card testID="mobile-session-flow">
    <View style={styles.heading}>
      <View><Text style={styles.eyebrow}>{totalLabel.toUpperCase()}</Text><Text style={styles.total}>{compactNumberOrNd(flow.total_volume, language)}</Text></View>
      {flow.estimated ? <Text style={styles.badge}>{pick("ESTIMÉ", "ESTIMATED")}</Text> : null}
    </View>
    <View style={styles.split}>
      <View style={styles.metric}><Text style={styles.label}>{buyerLabel}</Text><Text style={styles.buy}>{compactNumberOrNd(flow.buy_volume, language)}</Text></View>
      <View style={styles.metric}><Text style={styles.label}>{sellerLabel}</Text><Text style={styles.sell}>{compactNumberOrNd(flow.sell_volume, language)}</Text></View>
    </View>
    <View accessibilityLabel="BUY NEUTRAL SELL" style={styles.bar}>
      <View style={[styles.buyBar, { width: width(flow.buy_volume, flow.total_volume) }]} />
      <View style={[styles.neutralBar, { width: width(flow.neutral_volume, flow.total_volume) }]} />
      <View style={[styles.sellBar, { width: width(flow.sell_volume, flow.total_volume) }]} />
    </View>
    <View style={styles.secondary}>
      <Text style={styles.secondaryText}>{pick("Delta", "Delta")} <Text style={delta !== null && delta >= 0 ? styles.buy : styles.sell}>{deltaText}</Text></Text>
      <Text style={styles.secondaryText}>{ratioText} {pick("acheteur", "buyer")}</Text>
      {flow.neutral_volume !== null && flow.neutral_volume > 0 ? <Text style={styles.secondaryText}>{pick("Neutre", "Neutral")} {compactNumberOrNd(flow.neutral_volume, language)}</Text> : null}
    </View>
    {flow.estimated ? <Text style={styles.note}>{pick("Classification estimée à partir des mouvements de prix et du volume.", "Classification estimated from price movements and volume.")}</Text> : null}
  </Card>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  eyebrow: { ...typography.label, color: colors.textMuted, letterSpacing: 0.8 },
  total: { ...typography.title, color: colors.text, marginTop: spacing.xs },
  badge: { ...typography.caption, color: colors.warning, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, overflow: "hidden" },
  split: { flexDirection: "row", gap: spacing.md },
  metric: { flex: 1, gap: spacing.xs },
  label: { ...typography.caption, color: colors.textMuted },
  buy: { ...typography.section, color: colors.positive },
  sell: { ...typography.section, color: colors.negative },
  bar: { height: 8, flexDirection: "row", overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  buyBar: { backgroundColor: colors.positive },
  neutralBar: { backgroundColor: colors.textSubtle },
  sellBar: { backgroundColor: colors.negative },
  secondary: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  secondaryText: { ...typography.caption, color: colors.textMuted },
  note: { ...typography.caption, color: colors.textSubtle },
});
