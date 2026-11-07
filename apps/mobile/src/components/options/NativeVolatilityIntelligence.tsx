import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { volatilitySeries, type VolatilitySeries } from "@anatole/shared/options-chain";

import { Button, Card } from "@/src/components/ui";
import type { OptionChainSnapshot, OptionContract } from "@/src/lib/api/options";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { spacing, typography } from "@/src/theme/tokens";

const MAX_CHART_POINTS = 80;

function value(number: number | null | undefined, digits = 2): string {
  return number != null && Number.isFinite(number) ? number.toFixed(digits) : "N/D";
}

function chartPoints(points: OptionContract[]): OptionContract[] {
  if (points.length <= MAX_CHART_POINTS) return points;
  return Array.from({ length: MAX_CHART_POINTS }, (_, index) =>
    points[Math.round(index * (points.length - 1) / (MAX_CHART_POINTS - 1))]!,
  );
}

function Smile({ series }: { series: VolatilitySeries<OptionContract> }) {
  const { colors } = useMobileTheme();
  const { pick } = useLocale();
  const points = chartPoints(series.points);
  const strikes = points.map((point) => point.strike);
  const ivs = points.map((point) => point.implied_volatility!);
  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);
  const minIv = Math.min(...ivs);
  const maxIv = Math.max(...ivs);
  const x = (strike: number) => maxStrike === minStrike ? 160 : 20 + (strike - minStrike) * 280 / (maxStrike - minStrike);
  const y = (iv: number) => maxIv === minIv ? 85 : 150 - (iv - minIv) * 130 / (maxIv - minIv);
  const calls = points.filter((point) => point.side === "call");
  const puts = points.filter((point) => point.side === "put");
  const path = (sidePoints: OptionContract[]) => sidePoints
    .map((point) => `${x(point.strike)},${y(point.implied_volatility!)}`).join(" ");

  return <View accessible accessibilityRole="image" accessibilityLabel={pick(
    `Smile IV : ${series.points.length} contrats identifiables ; ${points.length} points affichés. Strike ${value(minStrike)} à ${value(maxStrike)}, IV ${value(minIv)} à ${value(maxIv)} %.`,
    `IV smile: ${series.points.length} identifiable contracts; ${points.length} points shown. Strike ${value(minStrike)} to ${value(maxStrike)}, IV ${value(minIv)} to ${value(maxIv)}%.`,
  )}>
    <Svg width="100%" height={170} viewBox="0 0 320 170">
      <Line x1="20" y1="150" x2="300" y2="150" stroke={colors.textMuted} />
      <Line x1="20" y1="20" x2="20" y2="150" stroke={colors.textMuted} />
      {calls.length > 1 ? <Polyline points={path(calls)} fill="none" stroke={colors.positive} strokeWidth={2} /> : null}
      {puts.length > 1 ? <Polyline points={path(puts)} fill="none" stroke={colors.primary} strokeWidth={2} strokeDasharray="5 4" /> : null}
      {points.map((point, index) => <Circle key={`${point.symbol}:${index}`} cx={x(point.strike)}
        cy={y(point.implied_volatility!)} r={3.5} fill={point.side === "call" ? colors.positive : colors.primary} />)}
    </Svg>
    <Text style={styles.copy}>{pick("CALL trait plein · PUT pointillé", "CALL solid line · PUT dashed line")} · Strike {value(minStrike)}–{value(maxStrike)} · IV {value(minIv)}–{value(maxIv)} %</Text>
  </View>;
}

export function NativeVolatilityIntelligence({ chain, expiry, refreshFailed = false }: {
  chain: OptionChainSnapshot; expiry: string; refreshFailed?: boolean;
}) {
  useMobileTheme();
  const { pick } = useLocale();
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const groups = useMemo(() => volatilitySeries(
    expiry ? chain.contracts.filter((item) => item.expiration === expiry) : chain.contracts,
    chain.underlying_price,
  ), [chain.contracts, chain.underlying_price, expiry]);
  const selectedIndex = Math.max(0, groups.findIndex((group) => group.key === selectedKey));
  const selected = groups[selectedIndex];

  return <Card title={pick("Smile IV et skew 25Δ", "IV smile and 25Δ skew")}>
    <Button variant="secondary" label={open ? pick("Masquer la volatilité", "Hide volatility") : pick("Voir la volatilité", "View volatility")}
      onPress={() => setOpen((current) => !current)} />
    {open ? <View style={styles.content}>
      <Text style={styles.copy}>{pick(
        "Chaîne chargée uniquement. IV et Greeks peuvent provenir du fournisseur ou d'un modèle Anatole ; l'origine de l'IV par contrat n'est pas disponible.",
        "Loaded chain only. IV and Greeks may come from the provider or an Anatole model; per-contract IV provenance is unavailable.",
      )}</Text>
      <Text style={styles.copy}>{pick("Instantané récupéré", "Snapshot retrieved")}: {chain.generated_at}. {pick(
        "Cette heure ne garantit pas la fraîcheur des cotations.", "This time does not establish quote freshness.",
      )}</Text>
      {chain.stale || refreshFailed ? <Text style={styles.warning}>{pick(
        "Instantané périmé ou actualisation impossible.", "Stale snapshot or refresh failed.",
      )}</Text> : null}
      {chain.market === "commodities" ? <Text style={styles.warning}>{pick(
        "Fraîcheur des cotations de matières premières à confirmer.", "Commodity quote freshness is unconfirmed.",
      )}</Text> : null}
      {!selected ? <Text style={styles.copy}>{pick(
        "Aucune série de volatilité exploitable pour la chaîne et l'échéance affichées.",
        "No usable volatility series for the displayed chain and expiry.",
      )}</Text> : <>
        <Text style={styles.label}>{selected.points[0]!.underlying} · {selected.expiry}{selected.contract ? ` · ${selected.contract}` : ""} · {selectedIndex + 1}/{groups.length}</Text>
        {groups.length > 1 ? <Button variant="secondary" label={pick("Série suivante", "Next series")}
          onPress={() => setSelectedKey(groups[(selectedIndex + 1) % groups.length]!.key)} /> : null}
        {selected.points.some((point) => point.delayed) ? <Text style={styles.warning}>{pick(
          "Cette série comprend des cotations différées.", "This series includes delayed quotes.",
        )}</Text> : null}
        <Smile series={selected} />
        <Text style={styles.copy}>{pick(
          "Chaque point est un contrat chargé ; les segments relient des points affichés et ne sont pas des observations supplémentaires.",
          "Each point is a loaded contract; segments connect displayed points and are not additional observations.",
        )}</Text>
        {selected.points.length > MAX_CHART_POINTS ? <Text style={styles.copy}>{pick(
          `${MAX_CHART_POINTS} points affichés sur ${selected.points.length} ; échantillonnage des contrats identifiables.`,
          `${MAX_CHART_POINTS} of ${selected.points.length} points shown; identifiable contracts sampled.`,
        )}</Text> : null}
        <Text style={styles.label}>Skew 25Δ</Text>
        {selected.skew ? <Text style={styles.copy}>{value(selected.skew.difference)} {pick("points de pourcentage", "percentage points")}
          {` · PUT ${value(selected.skew.put.strike)} (Δ ${value(selected.skew.put.delta, 3)}) − CALL ${value(selected.skew.call.strike)} (Δ ${value(selected.skew.call.delta, 3)})`}</Text>
          : <Text style={styles.copy}>{pick("N/D : points ±0,25 delta absents, trop éloignés ou ambigus.",
            "N/A: ±0.25 delta points are missing, too distant or ambiguous.")}</Text>}
        <Text style={styles.copy}>{pick(
          "Points les plus proches de ±0,25 dans une tolérance de 0,10 ; sans interpolation ni prévision.",
          "Nearest ±0.25 points within a 0.10 tolerance; no interpolation or forecast.",
        )}</Text>
      </>}
    </View> : null}
  </Card>;
}

const styles = createThemedStyles((colors) => ({
  content: { gap: spacing.sm },
  copy: { ...typography.body, color: colors.textMuted },
  label: { ...typography.label, color: colors.text },
  warning: { ...typography.body, color: colors.warning },
}));
