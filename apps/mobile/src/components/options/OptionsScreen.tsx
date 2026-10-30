import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { pairOptions } from "@anatole/shared/options-chain";

import { Button, Card, Field, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import {
  optionsApi,
  type OptionContract,
  type OptionMarket,
  type OptionSide,
} from "@/src/lib/api/options";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { radius, spacing, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { defaultOptionFilters, filterOptions, loadOptionFilters, saveOptionFilters, type NumericFilter, type OptionFilters } from "./optionFilters";
import { NativeStrategyBuilder, type NativeStrategyLeg } from "./NativeStrategyBuilder";
import { NativeOptionsAssistant } from "./NativeOptionsAssistant";

type SideFilter = "both" | OptionSide;

const contractKey = (item: OptionContract) => JSON.stringify([
  item.market, item.symbol, item.side, item.contract, item.expiration, item.strike,
]);

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
  const [expiry, setExpiry] = useState("");
  const [contextRevision, setContextRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [legs, setLegs] = useState<NativeStrategyLeg[]>([]);
  const nextLegId = useRef(0);
  const [filters, setFilters] = useState<OptionFilters>({ ...defaultOptionFilters });
  const [filtersReady, setFiltersReady] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void loadOptionFilters().then((saved) => {
      if (active) setFilters(saved);
    }).catch(() => undefined).finally(() => { if (active) setFiltersReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!filtersReady) return;
    void saveOptionFilters(filters);
  }, [filters, filtersReady]);

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
    const eligible = items.filter((item) => (side === "both" || item.side === side) && (!expiry || item.expiration === expiry));
    return filterOptions(eligible, filters, chain.data?.underlying_price ?? null, Boolean(chain.data?.stale || chain.error));
  }, [chain.data, chain.error, side, expiry, filters]);
  const pairs = useMemo(() => pairOptions(contracts), [contracts]);
  const detail = contracts.find((item) => contractKey(item) === selected) ?? null;

  function switchMarket(next: OptionMarket) {
    const nextSymbol = next === "tsx" ? "RY" : "GC";
    setMarket(next);
    setSymbol(nextSymbol);
    setDraft(nextSymbol);
    setSide("both");
    setExpiry("");
    setContextRevision((value) => value + 1);
  }

  function applySymbol() {
    const next = draft.trim().toUpperCase();
    if (/^[A-Z0-9.^-]{1,16}$/.test(next)) {
      setSymbol(next);
      setExpiry("");
      setContextRevision((value) => value + 1);
    }
  }

  const analytics = chain.data?.analytics;
  const numericFields: [NumericFilter, string][] = [
    ["volume", pick("Volume minimum", "Minimum volume")], ["oi", "OI minimum"],
    ["spread", pick("Spread maximum", "Maximum spread")], ["deltaMin", "Delta min"],
    ["deltaMax", "Delta max"], ["ivMin", "IV min (%)"], ["ivMax", "IV max (%)"],
  ];

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
        eyebrow={pick("DÉRIVÉS · OPTIONS", "DERIVATIVES · OPTIONS")}
        title={pick("Options", "Options")}
        subtitle={pick(
          "Chaînes canadiennes et options sur contrats à terme de matières premières.",
          "Canadian chains and commodity futures options.",
        )}
      />

      <View style={styles.segment}>
        <Pressable
          onPress={() => switchMarket("tsx")}
          style={[styles.segmentButton, market === "tsx" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, market === "tsx" && styles.segmentTextActive]}>
            Canada · MX
          </Text>
        </Pressable>
        <Pressable
          onPress={() => switchMarket("commodities")}
          style={[styles.segmentButton, market === "commodities" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, market === "commodities" && styles.segmentTextActive]}>
            {pick("Matières", "Commodities")}
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
          placeholder={market === "tsx" ? "RY, TD, XIU…" : "GC, CL, ZC…"}
        />
        <Button label={pick("Charger la chaîne", "Load chain")} onPress={applySymbol} />
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
                  setExpiry("");
                  setContextRevision((value) => value + 1);
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

      <NativeOptionsAssistant symbol={symbol} expiration={expiry} revision={contextRevision}
        canUseChain={market === "tsx" && chain.data?.market === "tsx" && chain.data.symbol === symbol} />

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
            {analytics?.put_call_volume_ratio != null ? <Card>
              <Text style={styles.kpiLabel}>Put / Call · Vol.</Text>
              <Text style={styles.kpiValue}>{number(analytics?.put_call_volume_ratio)}</Text>
            </Card> : null}
            {analytics?.put_call_open_interest_ratio != null ? <Card>
              <Text style={styles.kpiLabel}>Put / Call · OI</Text>
              <Text style={styles.kpiValue}>{number(analytics?.put_call_open_interest_ratio)}</Text>
            </Card> : null}
            {analytics?.atm_implied_volatility != null ? <Card>
              <Text style={styles.kpiLabel}>IV ATM</Text>
              <Text style={styles.kpiValue}>
                {analytics?.atm_implied_volatility == null
                  ? "N/D"
                  : `${number(analytics.atm_implied_volatility, 1)}%`}
              </Text>
            </Card> : null}
          </View>

          <Card title={`${chain.data.symbol} · ${chain.data.name}`}>
            {chain.error ? <Text accessibilityRole="alert" style={styles.sourceDetail}>
              {pick("Actualisation impossible : les données affichées peuvent être périmées.", "Refresh failed: displayed data may be stale.")}
            </Text> : null}
            {market === "commodities" && chain.data.contracts.length ? <Text style={styles.sourceDetail}>
              {pick("Instantané récupéré", "Snapshot retrieved")}: {new Date(chain.data.generated_at).toLocaleString()}
              {chain.data.stale ? ` · ${pick("instantané périmé", "stale snapshot")}` : ""}
              {` · ${pick("fraîcheur des cotations à confirmer", "quote freshness unconfirmed")}`}
            </Text> : null}
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

            {chain.data.expirations?.length ? <ScrollView horizontal contentContainerStyle={styles.shortcuts}>
              {["", ...chain.data.expirations].map((item) => <Pressable key={item || "all"}
                accessibilityRole="button" accessibilityState={{ selected: expiry === item }}
                onPress={() => { setExpiry(item); setContextRevision((value) => value + 1); }} style={[styles.shortcut, expiry === item && styles.shortcutActive]}>
                <Text style={styles.shortcutSymbol}>{item || pick("Toutes les échéances", "All expiries")}</Text>
              </Pressable>)}
            </ScrollView> : null}

            <Button label={pick("Filtres avancés", "Advanced filters")} variant="secondary"
              disabled={!filtersReady} onPress={() => setFiltersOpen((open) => !open)} />
            {filtersOpen && filtersReady ? <View style={styles.contractRow}>
              {numericFields.map(([key, label]) => <Field key={key} label={label} accessibilityLabel={label}
                value={filters[key]} onChangeText={(value) => setFilters((current) => ({ ...current, [key]: value }))} />)}
              {([
                ["moneyness", "Moneyness", [["all", pick("Toutes", "All")], ["atm", "ATM"], ["itm", "ITM"], ["otm", "OTM"]]],
                ["availability", pick("Cotations", "Quotes"), [["all", pick("Toutes", "All")], ["quoted", "Bid / Ask"], ["missing", pick("Incomplètes", "Incomplete")]]],
                ["freshness", pick("Fraîcheur", "Freshness"), [["all", pick("Toutes", "All")], ["fresh", pick("Non différé", "Not delayed")], ["delayed", pick("Différé ou périmé", "Delayed or stale")]]],
              ] as const).map(([key, label, options]) => <View key={key}>
                <Text style={styles.shortcutSymbol}>{label}</Text>
                <ScrollView horizontal contentContainerStyle={styles.shortcuts}>
                  {options.map(([value, name]) => <Pressable key={value} accessibilityRole="button"
                    accessibilityLabel={`${label}: ${name}`} accessibilityState={{ selected: filters[key] === value }}
                    onPress={() => setFilters((current) => ({ ...current, [key]: value }))}
                    style={[styles.shortcut, filters[key] === value && styles.shortcutActive]}>
                    <Text style={styles.shortcutSymbol}>{name}</Text>
                  </Pressable>)}
                </ScrollView>
              </View>)}
              <Button label={pick("Effacer les filtres", "Clear filters")} variant="secondary"
                onPress={() => setFilters({ ...defaultOptionFilters })} />
            </View> : null}

            {pairs.length ? (
              pairs.slice(0, 80).map((pair) => (
                <View key={pair.key} style={styles.contractRow}>
                  <View style={styles.contractTop}>
                    <Text style={styles.strike}>{number(pair.strike)}</Text>
                    <Text style={styles.expiry}>{pair.expiry ?? "N/D"}{pair.contract ? ` · ${pair.contract}` : ""}</Text>
                  </View>
                  <View style={styles.pairRow}>
                    {([pair.call, pair.put] as const).map((item, index) => <View key={index} style={styles.pairSide}>
                      <Text style={[styles.badge, index === 0 ? styles.call : styles.put]}>{index === 0 ? "CALL" : "PUT"}</Text>
                      {item ? <Pressable accessibilityRole="button" accessibilityLabel={`${item.side.toUpperCase()} ${number(item.strike)} ${item.expiration ?? "N/D"} ${item.symbol}`}
                        onPress={() => setSelected(contractKey(item))} style={styles.quoteCard}>
                        <Text style={styles.metric}>Bid {number(item.bid)} · Ask {number(item.ask)}</Text>
                        <Text style={styles.metric}>{market === "commodities" ? pick("Prix fourni", "Provider price") : "Last"} {number(item.last)}</Text>
                        <Text style={styles.metric}>Vol {integer(item.volume)} · OI {integer(item.open_interest)}</Text>
                        <Text style={styles.metric}>IV {number(item.implied_volatility, 1)}% · Δ {number(item.delta, 3)}</Text>
                      </Pressable> : <Text style={styles.metric}>—</Text>}
                    </View>)}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>
                {chain.data.contracts.length ? pick("Aucun contrat ne correspond aux filtres.", "No contracts match the filters.") : market === "commodities"
                  ? pick(
                      "Aucun instantané exploitable : une source autorisée et une collecte configurée sont nécessaires.",
                      "No usable snapshot: an authorized source and configured ingestion are required.",
                    )
                  : pick(
                      "Aucune chaîne disponible pour ce symbole à cet instant.",
                      "No chain is available for this symbol right now.",
                    )}
              </Text>
            )}
            {pairs.length > 80 ? <Text style={styles.sourceDetail}>{pick("Affichage limité à 80 lignes.", "Display limited to 80 rows.")}</Text> : null}
            {detail ? <View style={styles.contractRow} accessibilityLabel={pick("Détails du contrat", "Contract details")}>
              <Text style={styles.shortcutSymbol}>{detail.symbol} · {detail.side.toUpperCase()}</Text>
              <Text style={styles.metric}>{detail.source} · {detail.expiration ?? "N/D"}</Text>
              <Text style={styles.metric}>Γ {number(detail.gamma, 4)} · Θ {number(detail.theta, 3)} · Vega {number(detail.vega, 3)}</Text>
              <Button label={pick("Ajouter au constructeur", "Add to builder")} disabled={legs.length >= 20}
                onPress={() => { const id = ++nextLegId.current; setLegs((current) => current.length >= 20 ? current : [...current, { id, contract: detail,
                  direction: "long", quantity: "1", premium: "", multiplier: "", upfront: false }]); }} />
              <Button label={pick("Fermer", "Close")} onPress={() => setSelected(null)} />
            </View> : null}
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

      <NativeStrategyBuilder legs={legs} setLegs={setLegs} />

      <Text style={styles.disclaimer}>
        {market === "commodities" ? pick(
          "Données descriptives différées lorsqu'elles sont disponibles. Les champs absents restent N/D.",
          "Descriptive delayed data when available. Missing fields remain N/A.",
        ) : pick(
          "IV et Greeks proviennent du fournisseur lorsqu'ils existent; sinon Anatole peut les estimer par Black-Scholes à partir des prix observés. Données descriptives et parfois différées.",
          "IV and Greeks come from the provider when available; otherwise Anatole may estimate them with Black-Scholes from observed prices. Descriptive and sometimes delayed data.",
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
  pairRow: { flexDirection: "row", gap: spacing.sm },
  pairSide: { flex: 1, gap: spacing.xs },
  quoteCard: { padding: spacing.sm, gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
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
