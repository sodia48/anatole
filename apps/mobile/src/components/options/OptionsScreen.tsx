import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Button, Card, Field, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import {
  optionsApi,
  type OptionMarket,
  type OptionSide,
} from "@/src/lib/api/options";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";

type SideFilter = "both" | OptionSide;

function number(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value) ? "N/D" : value.toFixed(digits);
}

function integer(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? "N/D"
    : Math.round(value).toLocaleString("fr-CA");
}

export function OptionsScreen() {
  useMobileTheme();
  const { pick } = useLocale();
  const [market, setMarket] = useState<OptionMarket>("tsx");
  const [symbol, setSymbol] = useState("RY");
  const [draft, setDraft] = useState("RY");
  const [side, setSide] = useState<SideFilter>("both");

  const universe = useQuery({
    queryKey: ["options-universe", market],
    queryFn: ({ signal }) => optionsApi.universe(market, signal),
    staleTime: 5 * 60_000,
  });
  const chain = useQuery({
    queryKey: ["options-chain", market, symbol],
    queryFn: ({ signal }) => optionsApi.chain(market, symbol, undefined, signal),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  const contracts = useMemo(() => {
    const items = chain.data?.contracts ?? [];
    return side === "both" ? items : items.filter((item) => item.side === side);
  }, [chain.data, side]);

  function switchMarket(next: OptionMarket) {
    const nextSymbol = next === "tsx" ? "RY" : "GC";
    setMarket(next);
    setSymbol(nextSymbol);
    setDraft(nextSymbol);
    setSide("both");
  }

  function applySymbol() {
    const next = draft.trim().toUpperCase();
    if (/^[A-Z0-9.^-]{1,16}$/.test(next)) {
      setSymbol(next);
    }
  }

  const analytics = chain.data?.analytics;

  return (
    <Screen
      testID="options-screen"
      refreshing={chain.isRefetching || universe.isRefetching}
      onRefresh={() => {
        void universe.refetch();
        void chain.refetch();
      }}
    >
      <ScreenHeader
        eyebrow={pick("D?RIV?S ? OPTIONS", "DERIVATIVES ? OPTIONS")}
        title={pick("Options", "Options")}
        subtitle={pick(
          "Cha?nes canadiennes et options sur contrats ? terme de mati?res premi?res.",
          "Canadian chains and commodity futures options.",
        )}
      />

      <View style={styles.segment}>
        <Pressable
          onPress={() => switchMarket("tsx")}
          style={[styles.segmentButton, market === "tsx" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, market === "tsx" && styles.segmentTextActive]}>
            Canada ? MX
          </Text>
        </Pressable>
        <Pressable
          onPress={() => switchMarket("commodities")}
          style={[styles.segmentButton, market === "commodities" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, market === "commodities" && styles.segmentTextActive]}>
            {pick("Mati?res", "Commodities")}
          </Text>
        </Pressable>
      </View>

      <Card>
        <Field
          label={pick("Sous-jacent / racine", "Underlying / root")}
          value={draft}
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={setDraft}
          placeholder={market === "tsx" ? "RY, TD, XIU?" : "GC, CL, ZC?"}
        />
        <Button label={pick("Charger la cha?ne", "Load chain")} onPress={applySymbol} />
        <QueryState
          loading={universe.isLoading}
          error={universe.error}
          onRetry={() => void universe.refetch()}
        />
        {universe.data ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts}>
            {universe.data.items.slice(0, 40).map((item) => (
              <Pressable
                key={`${item.provider_symbol}-${item.symbol}`}
                onPress={() => {
                  setDraft(item.symbol);
                  setSymbol(item.symbol);
                }}
                style={[styles.shortcut, item.symbol === symbol && styles.shortcutActive]}
              >
                <Text style={styles.shortcutSymbol}>{item.symbol}</Text>
                <Text numberOfLines={1} style={styles.shortcutName}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </Card>

      <QueryState
        loading={chain.isLoading && !chain.data}
        error={!chain.data ? chain.error : null}
        onRetry={() => void chain.refetch()}
      />

      {chain.data ? (
        <>
          <View style={styles.kpis}>
            <Card>
              <Text style={styles.kpiLabel}>{pick("Contrats", "Contracts")}</Text>
              <Text style={styles.kpiValue}>{integer(analytics?.contract_count)}</Text>
            </Card>
            <Card>
              <Text style={styles.kpiLabel}>Put / Call ? Vol.</Text>
              <Text style={styles.kpiValue}>{number(analytics?.put_call_volume_ratio)}</Text>
            </Card>
            <Card>
              <Text style={styles.kpiLabel}>Put / Call ? OI</Text>
              <Text style={styles.kpiValue}>{number(analytics?.put_call_open_interest_ratio)}</Text>
            </Card>
            <Card>
              <Text style={styles.kpiLabel}>IV ATM</Text>
              <Text style={styles.kpiValue}>
                {analytics?.atm_implied_volatility == null
                  ? "N/D"
                  : `${number(analytics.atm_implied_volatility, 1)}%`}
              </Text>
            </Card>
          </View>

          <Card title={`${chain.data.symbol} ? ${chain.data.name}`}>
            <View style={styles.sideRow}>
              {(["both", "call", "put"] as const).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setSide(item)}
                  style={[styles.sideButton, side === item && styles.sideActive]}
                >
                  <Text style={[styles.sideText, side === item && styles.sideTextActive]}>
                    {item === "both" ? "Call + Put" : item.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {contracts.length ? (
              contracts.slice(0, 80).map((item) => (
                <View key={`${item.symbol}-${item.side}-${item.strike}-${item.expiration}`} style={styles.contractRow}>
                  <View style={styles.contractTop}>
                    <Text style={[styles.badge, item.side === "call" ? styles.call : styles.put]}>
                      {item.side.toUpperCase()}
                    </Text>
                    <Text style={styles.strike}>{number(item.strike)}</Text>
                    <Text style={styles.expiry}>{item.expiration}</Text>
                  </View>
                  <View style={styles.contractMetrics}>
                    <Text style={styles.metric}>Bid {number(item.bid)}</Text>
                    <Text style={styles.metric}>Ask {number(item.ask)}</Text>
                    <Text style={styles.metric}>Last {number(item.last)}</Text>
                    <Text style={styles.metric}>Vol {integer(item.volume)}</Text>
                    <Text style={styles.metric}>OI {integer(item.open_interest)}</Text>
                    <Text style={styles.metric}>
                      IV {item.implied_volatility == null ? "N/D" : `${number(item.implied_volatility, 1)}%`}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>
                {market === "commodities"
                  ? pick(
                      "Aucune cha?ne. Configure BARCHART_API_KEY sur Render avec les permissions de march? n?cessaires.",
                      "No chain. Configure BARCHART_API_KEY on Render with the required market permissions.",
                    )
                  : pick(
                      "Aucune cha?ne disponible pour ce symbole ? cet instant.",
                      "No chain is available for this symbol right now.",
                    )}
              </Text>
            )}
          </Card>

          <Card title={pick("Sources", "Sources")}>
            {chain.data.source_statuses.map((item, index) => (
              <View key={`${item.source}-${index}`} style={styles.sourceRow}>
                <View
                  style={[
                    styles.sourceDot,
                    item.status === "available"
                      ? styles.sourceOk
                      : item.status === "partial"
                        ? styles.sourcePartial
                        : styles.sourceDown,
                  ]}
                />
                <View style={styles.sourceCopy}>
                  <Text style={styles.sourceName}>{item.source}</Text>
                  <Text style={styles.sourceDetail}>{item.detail ?? item.status}</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Text style={styles.disclaimer}>
        {pick(
          "Donn?es descriptives, parfois diff?r?es. Aucune cha?ne n'est simul?e lorsqu'une source est indisponible.",
          "Descriptive, sometimes delayed data. No chain is simulated when a source is unavailable.",
        )}
      </Text>
    </Screen>
  );
}

const styles = createThemedStyles((colors) => ({
  segment: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  segmentActive: { backgroundColor: colors.primarySurface },
  segmentText: { ...typography.label, color: colors.textMuted },
  segmentTextActive: { color: colors.primary },
  shortcuts: { gap: spacing.sm, paddingVertical: spacing.xs },
  shortcut: {
    width: 120,
    gap: 2,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  shortcutActive: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  shortcutSymbol: { ...typography.label, color: colors.text },
  shortcutName: { ...typography.caption, color: colors.textMuted },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpiLabel: { ...typography.caption, color: colors.textMuted },
  kpiValue: { ...typography.section, color: colors.text },
  sideRow: { flexDirection: "row", gap: spacing.sm },
  sideButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  sideActive: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  sideText: { ...typography.caption, color: colors.textMuted },
  sideTextActive: { color: colors.primary, fontWeight: "800" },
  contractRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contractTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: {
    minWidth: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    overflow: "hidden",
    ...typography.caption,
    textAlign: "center",
    fontWeight: "800",
  },
  call: { color: colors.positive, backgroundColor: colors.positiveSurface },
  put: { color: colors.negative, backgroundColor: colors.negativeSurface },
  strike: { ...typography.section, color: colors.text },
  expiry: { marginLeft: "auto", ...typography.caption, color: colors.textMuted },
  contractMetrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { ...typography.caption, color: colors.textMuted },
  empty: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  sourceRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  sourceDot: { width: 9, height: 9, marginTop: 4, borderRadius: radius.pill },
  sourceOk: { backgroundColor: colors.positive },
  sourcePartial: { backgroundColor: colors.warning },
  sourceDown: { backgroundColor: colors.negative },
  sourceCopy: { flex: 1, gap: 2 },
  sourceName: { ...typography.label, color: colors.text },
  sourceDetail: { ...typography.caption, color: colors.textMuted },
  disclaimer: { ...typography.caption, color: colors.textSubtle, textAlign: "center" },
}));