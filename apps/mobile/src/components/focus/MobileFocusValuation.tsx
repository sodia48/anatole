import { Text, View } from "react-native";
import { Card, QueryState, uiStyles } from "@/src/components/ui";
import type { FundamentalSnapshot } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { spacing, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { moneyOrNd, valueOrNd } from "./format";

type Metric = {
  key:
    | "market_cap"
    | "enterprise_value"
    | "trailing_pe"
    | "forward_pe"
    | "price_to_book"
    | "price_to_sales"
    | "enterprise_to_revenue"
    | "enterprise_to_ebitda"
    | "trailing_eps";
  fr: string;
  en: string;
  format?: "money" | "number";
};

const metrics: Metric[] = [
  { key: "market_cap", fr: "Capitalisation", en: "Market cap", format: "money" },
  { key: "enterprise_value", fr: "Valeur d’entreprise", en: "Enterprise value", format: "money" },
  { key: "trailing_pe", fr: "C/B historique", en: "Trailing P/E" },
  { key: "forward_pe", fr: "C/B anticipé", en: "Forward P/E" },
  { key: "price_to_book", fr: "Cours / valeur comptable", en: "Price / book" },
  { key: "price_to_sales", fr: "Cours / ventes", en: "Price / sales" },
  { key: "enterprise_to_revenue", fr: "VE / Revenus", en: "EV / Revenue" },
  { key: "enterprise_to_ebitda", fr: "VE / BAIIA", en: "EV / EBITDA" },
  { key: "trailing_eps", fr: "BPA historique", en: "Trailing EPS", format: "money" },
];

function display(
  value: number | null,
  format: Metric["format"],
  currency: string,
  language: "fr" | "en",
): string {
  if (format === "money") return moneyOrNd(value, currency, true, language);
  return valueOrNd(value, 2, language);
}

export function MobileFocusValuation({
  snapshot,
  loading,
  error,
  onRetry,
}: {
  snapshot?: FundamentalSnapshot;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  useMobileTheme();
  const { language, pick } = useLocale();
  const currency = snapshot?.financial_currency ?? snapshot?.currency ?? "CAD";
  const hasAny = Boolean(
    snapshot &&
      metrics.some((item) => {
        const value = snapshot.metrics[item.key];
        return value !== null && Number.isFinite(value);
      }),
  );

  return (
    <View style={styles.stack} testID="focus-valuation-section">
      <Card title={pick("Valorisation", "Valuation")}>
        <QueryState
          error={!snapshot ? error : null}
          loading={loading && !snapshot}
          onRetry={onRetry}
        />
        {snapshot && hasAny ? (
          metrics.map((item) => (
            <View key={item.key} style={uiStyles.row}>
              <Text style={uiStyles.label}>{pick(item.fr, item.en)}</Text>
              <Text style={styles.value}>
                {display(snapshot.metrics[item.key], item.format, currency, language)}
              </Text>
            </View>
          ))
        ) : snapshot && !loading ? (
          <Text style={styles.empty}>
            {pick(
              "Valorisation temporairement indisponible.",
              "Valuation data is temporarily unavailable.",
            )}
          </Text>
        ) : null}
        {snapshot?.stale || snapshot?.refresh_in_progress ? (
          <Text style={styles.refreshing}>
            {snapshot.stale
              ? pick("Dernières données disponibles", "Latest available data")
              : pick("Actualisation en cours…", "Refreshing…")}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  stack: { gap: spacing.md },
  value: {
    ...typography.body,
    color: colors.text,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  empty: { ...typography.body, color: colors.textMuted },
  refreshing: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
}));
