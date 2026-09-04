import { Pressable, StyleSheet, Text, View } from "react-native";

import { moneyOrNd, percentOrNd, valueOrNd } from "@/src/components/focus/format";
import { NewsCard } from "@/src/components/market";
import { Card } from "@/src/components/ui";
import type { AlertSnapshot, PortfolioSnapshot, StockNewsItem, TerminalSnapshot, WatchlistSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { selectPersonalMovers, type TodayTarget } from "./model";

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function rotationState(value: string, language: "fr" | "en") {
  if (language === "fr") return value;
  return ({ Leadership: "Leadership", Amélioration: "Improving", Affaiblissement: "Weakening", "Sous pression": "Under pressure", Accumulation: "Accumulation", Neutre: "Neutral", Distribution: "Distribution", Faiblesse: "Weakness" } as Record<string, string>)[value] ?? value;
}

export function TodayPersonalBrief({
  hasWorkspace,
  watchlist,
  portfolio,
  terminal,
  alerts,
  personalNews,
  stale,
  onOpen,
  onPersonalize,
}: {
  hasWorkspace: boolean;
  watchlist?: WatchlistSnapshot;
  portfolio?: PortfolioSnapshot;
  terminal: TerminalSnapshot | null;
  alerts?: AlertSnapshot;
  personalNews: readonly StockNewsItem[];
  stale: boolean;
  onOpen: (target: TodayTarget) => void;
  onPersonalize: () => void;
}) {
  const { language, pick } = useLocale();
  const movers = selectPersonalMovers(watchlist);
  const topSector = [...(portfolio?.sector_allocation ?? [])].sort((left, right) => right.weight_percent - left.weight_percent)[0];
  const topSectorState = topSector
    ? terminal?.sector_rotation.find((item) => item.sector === topSector.key || item.sector === topSector.label)?.state
    : null;
  const contributor = portfolio?.contributors?.[0];
  const detractor = portfolio?.detractors?.[0];
  const triggered = alerts?.items.filter((item) => item.triggered) ?? [];
  return <Card title={pick("VOTRE MARCHÉ AUJOURD’HUI", "YOUR MARKET TODAY")} testID="today-personal">
    {!hasWorkspace ? <Pressable accessibilityRole="button" onPress={onPersonalize} style={styles.cta} testID="today-personalize"><Text style={styles.ctaTitle}>{pick("Personnalisez votre briefing", "Personalize your briefing")}</Text><Text style={styles.copy}>{pick("Ajoutez des titres, des positions ou des alertes pour retrouver ici uniquement vos données.", "Add securities, positions, or alerts to see only your data here.")}</Text></Pressable> : null}
    {stale ? <Text style={styles.stale}>{pick("Dernières données disponibles", "Latest available data")}</Text> : null}
    {movers.length ? <View style={styles.block}><Text style={styles.heading}>{pick("Mouvements personnels", "Personal movers")}</Text>{movers.map((item) => <Pressable accessibilityRole="button" key={item.symbol} onPress={() => onOpen({ kind: "stock", ticker: item.symbol })} style={styles.mover} testID={`today-personal-mover-${item.symbol}`}><View><Text style={styles.symbol}>{item.symbol}</Text><Text numberOfLines={1} style={styles.copy}>{item.name} · {item.delayed ? pick("Différé", "Delayed") : item.source}</Text></View><View style={styles.right}><Text style={styles.price}>{moneyOrNd(item.price, item.currency, false, language)}</Text><Text style={{ color: item.change_percent >= 0 ? colors.positive : colors.negative }}>{percentOrNd(item.change_percent, language)}</Text></View></Pressable>)}</View> : null}
    {portfolio ? <View style={styles.block} testID="today-portfolio"><Text style={styles.heading}>{pick("Portefeuille", "Portfolio")}</Text><View style={styles.grid}>
      <Stat label={pick("Variation du jour", "Daily change")} value={percentOrNd(portfolio.total_day_change_percent, language)} />
      <Stat label={pick("Exposition principale", "Largest exposure")} value={topSector ? `${topSector.label} · ${valueOrNd(topSector.weight_percent, 1, language)} %${topSectorState && topSectorState !== "N/D" ? ` · ${rotationState(topSectorState, language)}` : ""}` : "N/D"} />
      <Stat label={pick("Top contributeur", "Top contributor")} value={contributor ? `${contributor.symbol} · ${percentOrNd(contributor.value_percent, language)}` : "N/D"} />
      <Stat label={pick("Top détracteur", "Top detractor")} value={detractor ? `${detractor.symbol} · ${percentOrNd(detractor.value_percent, language)}` : "N/D"} />
      <Stat label={pick("Position principale", "Top position")} value={portfolio.risk ? `${valueOrNd(portfolio.risk.top_position_percent, 1, language)} %` : "N/D"} />
      <Stat label={pick("Diversification", "Diversification")} value={portfolio.risk ? `${valueOrNd(portfolio.risk.diversification_score, 0, language)}/100 · ${portfolio.risk.risk_level}` : "N/D"} />
    </View></View> : null}
    {triggered.length ? <View style={styles.block}><Text style={styles.heading}>{pick("Alertes déclenchées", "Triggered alerts")}</Text>{triggered.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => onOpen({ kind: "stock", ticker: item.symbol })} style={styles.alert}><Text style={styles.symbol}>{item.symbol}</Text><Text style={styles.copy}>{item.message}</Text></Pressable>)}</View> : null}
    {personalNews.length ? <View style={styles.block}><Text style={styles.heading}>{pick("Actualités de vos titres", "News for your securities")}</Text>{personalNews.map((item) => <NewsCard compact item={item} key={item.id} />)}</View> : null}
  </Card>;
}

const styles = StyleSheet.create({
  cta: { minHeight: 96, justifyContent: "center", gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, backgroundColor: "rgba(44,156,255,.1)" }, ctaTitle: { ...typography.section, color: colors.text }, copy: { ...typography.caption, color: colors.textMuted }, stale: { ...typography.caption, color: colors.warning }, block: { gap: spacing.sm }, heading: { ...typography.label, color: colors.primary, textTransform: "uppercase" }, mover: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, symbol: { ...typography.label, color: colors.text }, right: { alignItems: "flex-end" }, price: { ...typography.label, color: colors.text }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, stat: { minWidth: "46%", flexGrow: 1, minHeight: 64, justifyContent: "center", gap: 2, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised }, statValue: { ...typography.label, color: colors.text }, statLabel: { ...typography.caption, color: colors.textMuted }, alert: { minHeight: 58, justifyContent: "center", gap: 2, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.warning, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
});
