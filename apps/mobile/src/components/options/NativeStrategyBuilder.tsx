import { useRef, useState, type ComponentProps, type Dispatch, type SetStateAction } from "react";
import { Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";

import { Button, Card, Field } from "@/src/components/ui";
import { optionsApi, type OptionContract, type OptionPayoffResponse } from "@/src/lib/api/options";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { spacing, typography } from "@/src/theme/tokens";

export type NativeStrategyLeg = {
  id: number;
  contract: OptionContract;
  direction: "long" | "short";
  quantity: string;
  premium: string;
  multiplier: string;
  upfront: boolean;
};

type Scenario = { id: number; label: string; result: OptionPayoffResponse };

function StrategyField(props: ComponentProps<typeof Field>) {
  return <Field {...props} accessibilityLabel={props.label} />;
}

function PayoffChart({ points, currency }: { points: OptionPayoffResponse["points"]; currency: string }) {
  const { colors } = useMobileTheme();
  const { pick } = useLocale();
  const values = points.map((point) => ({ x: Number(point.price), y: Number(point.profit_loss) }));
  if (values.length < 2 || values.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)) ||
      values.some((point, index) => index > 0 && point.x <= values[index - 1]!.x)) {
    return <Text style={styles.copy}>{pick("Graphique indisponible pour ces points.", "Chart unavailable for these points.")}</Text>;
  }
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const observedMin = Math.min(...values.map((point) => point.y));
  const observedMax = Math.max(...values.map((point) => point.y));
  const yMin = Math.min(0, observedMin);
  const yMax = Math.max(0, observedMax);
  const y = (value: number) => yMax === yMin ? 75 : 12 + (yMax - value) * 126 / (yMax - yMin);
  const plotted = values.map((point) => `${12 + (point.x - first.x) * 296 / (last.x - first.x)},${y(point.y)}`).join(" ");
  return <View accessible accessibilityRole="image" accessibilityLabel={pick(
    `Résultats théoriques dans la plage de ${first.x} à ${last.x}. Points calculés de ${observedMin} à ${observedMax} ${currency}.`,
    `Theoretical results over the ${first.x} to ${last.x} range. Sampled points from ${observedMin} to ${observedMax} ${currency}.`)}>
    <Text style={styles.copy}>{pick("Profit / perte dans la plage simulée", "Profit / loss in the simulated range")}</Text>
    <Svg width="100%" height={150} viewBox="0 0 320 150">
      <Line x1="12" y1={y(0)} x2="308" y2={y(0)} stroke={colors.textMuted} strokeDasharray="4 4" />
      <Polyline points={plotted} fill="none" stroke={colors.primary} strokeWidth={3} />
    </Svg>
    <Text style={styles.copy}>{pick("Sous-jacent", "Underlying")}: {first.x} – {last.x} · {pick("résultat des points", "sampled results")}: {observedMin} – {observedMax} {currency} · {pick("pointillé : zéro", "dashed line: zero")}</Text>
  </View>;
}

export function NativeStrategyBuilder({ legs, setLegs }: {
  legs: NativeStrategyLeg[];
  setLegs: Dispatch<SetStateAction<NativeStrategyLeg[]>>;
}) {
  useMobileTheme();
  const { pick } = useLocale();
  const [currency, setCurrency] = useState("");
  const [expiry, setExpiry] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const scenarioId = useRef(0);

  function update(id: number, patch: Partial<NativeStrategyLeg>) {
    setLegs((current) => current.map((leg) => leg.id === id ? { ...leg, ...patch } : leg));
  }

  function template(name: "long-call" | "long-put" | "bull-call" | "straddle") {
    const sorted = [...legs].sort((a, b) => a.contract.strike - b.contract.strike);
    const a = sorted[0];
    const b = sorted[1];
    const same = a && b && a.contract.market === b.contract.market && a.contract.underlying === b.contract.underlying &&
      a.contract.contract === b.contract.contract && a.contract.expiration != null && a.contract.expiration === b.contract.expiration;
    let directions: ("long" | "short")[] | null = null;
    if (sorted.length === 1 && a?.contract.side === "call" && name === "long-call") directions = ["long"];
    if (sorted.length === 1 && a?.contract.side === "put" && name === "long-put") directions = ["long"];
    if (sorted.length === 2 && same && name === "bull-call" && a.contract.side === "call" &&
      b.contract.side === "call" && a.contract.strike < b.contract.strike) directions = ["long", "short"];
    if (sorted.length === 2 && same && name === "straddle" && a.contract.side !== b.contract.side &&
      a.contract.strike === b.contract.strike) directions = ["long", "long"];
    if (!directions) {
      setError(pick("Les contrats ne correspondent pas au modèle choisi.", "Contracts do not match the chosen template."));
      return;
    }
    setError("");
    const selectedDirections = directions;
    setLegs(sorted.map((leg, index) => ({ ...leg, direction: selectedDirections[index] ?? "long", quantity: "1" })));
  }

  async function calculate() {
    const first = legs[0]?.contract;
    const min = Number(low);
    const max = Number(high);
    if (!first || !/^[A-Z]{3}$/.test(currency) || !/T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/i.test(expiry) ||
      Number.isNaN(Date.parse(expiry)) || !low || !high || !Number.isFinite(min) || !Number.isFinite(max) ||
      max <= min || Math.abs(min) > 1e11 || Math.abs(max) > 1e11 || (first.market === "tsx" && min < 0) ||
      legs.some(({ contract, quantity, premium, multiplier, upfront }) => !upfront || !contract.expiration ||
        contract.expiration !== expiry.slice(0, 10) || contract.market !== first.market ||
        contract.underlying !== first.underlying ||
        (first.market === "commodities" && (!first.contract || contract.contract !== first.contract)) ||
        !multiplier || !Number.isFinite(Number(multiplier)) || Number(multiplier) <= 0 ||
        !/^[1-9]\d*$/.test(quantity) || Number(quantity) > 10000 ||
        premium === "" || !Number.isFinite(Number(premium)) || Number(premium) < 0)) {
      setError(pick("Vérifiez les jambes, les spécifications et la plage. Une échéance commune avec fuseau est obligatoire.",
        "Check the legs, specifications and price range. A common expiry with time zone is required."));
      return;
    }
    setError("");
    const payload = {
      legs: legs.map(({ contract, direction, quantity, premium, multiplier }) => ({
        symbol: contract.symbol, market: contract.market === "tsx" ? "equity" as const : "futures" as const,
        underlying: contract.underlying, currency, expiry, side: contract.side, direction,
        strike: String(contract.strike), premium, quantity: Number(quantity), multiplier,
        price_source: "manual assumption", premium_style: "upfront" as const,
      })),
      domain_min: first.market === "tsx" ? "0" : null,
      domain_max: null,
      prices: Array.from({ length: 21 }, (_, index) => (min + (max - min) * index / 20).toFixed(6)),
    };
    const label = legs.map((leg) => `${leg.direction} ${leg.quantity} × ${leg.contract.symbol} @ ${leg.premium} (×${leg.multiplier})`).join(" · ") +
      ` | ${currency} | ${expiry} | ${low}–${high}`;
    setPending(true);
    try {
      const result = await optionsApi.payoff(payload);
      const id = ++scenarioId.current;
      setScenarios((previous) => [...previous, { id, label, result }].slice(-3));
    } catch {
      setError(pick("Calcul indisponible ou refusé : vérifiez les spécifications.", "Calculation unavailable or rejected: check the specifications."));
    } finally {
      setPending(false);
    }
  }

  return <Card title={pick("Constructeur de stratégie", "Strategy builder")}>
    <Text style={styles.copy}>{pick(
      "Simulation théorique à une échéance : primes et spécifications saisies par l'utilisateur, pas des cotations vérifiées. Frais, marge, exercice anticipé et change exclus.",
      "Theoretical single-expiry simulation: user-entered premiums and specifications are not verified quotes. Fees, margin, early exercise and FX are excluded.")}</Text>
    <Text style={styles.copy}>{pick("Sélectionnez des contrats dans la chaîne. Échéances et devises mixtes, prime de type futures et règlement ne sont pas modélisés.",
      "Select contracts in the chain. Mixed expiries and currencies, futures-style premiums and settlement are not modeled.")}</Text>
    <Text style={styles.copy}>{pick("La simulation transmet les jambes et hypothèses saisies à l'API Anatole.", "Simulation sends the entered legs and assumptions to the Anatole API.")}</Text>
    {!legs.length ? <Text style={styles.copy}>{pick("Aucune jambe sélectionnée.", "No legs selected.")}</Text> : null}
    {legs.map((leg, index) => <View key={leg.id} style={styles.group}>
      <Text style={styles.heading}>{index + 1}. {leg.contract.symbol} · {leg.contract.side.toUpperCase()} {leg.contract.strike} · {leg.contract.expiration ?? "N/D"}</Text>
      <Text style={styles.copy}>{leg.contract.contract ?? leg.contract.underlying} · {leg.contract.source}</Text>
      <Button label={leg.direction === "long" ? pick("Achat (modifier)", "Long (change)") : pick("Vente (modifier)", "Short (change)")}
        accessibilityLabel={pick(`Jambe ${index + 1} : ${leg.direction === "long" ? "achat" : "vente"}, modifier`,
          `Leg ${index + 1}: ${leg.direction === "long" ? "long" : "short"}, change`)}
        variant="secondary" onPress={() => update(leg.id, { direction: leg.direction === "long" ? "short" : "long" })} />
      <StrategyField label={pick(`Quantité jambe ${index + 1}`, `Leg ${index + 1} quantity`)} value={leg.quantity}
        keyboardType="numeric" onChangeText={(quantity) => update(leg.id, { quantity })} />
      <StrategyField label={pick(`Prime hypothétique jambe ${index + 1}`, `Leg ${index + 1} hypothetical premium`)} value={leg.premium}
        keyboardType="decimal-pad" onChangeText={(premium) => update(leg.id, { premium })} />
      <StrategyField label={pick(`Multiplicateur vérifié jambe ${index + 1}`, `Leg ${index + 1} verified multiplier`)} value={leg.multiplier}
        keyboardType="decimal-pad" onChangeText={(multiplier) => update(leg.id, { multiplier })} />
      <Button label={leg.upfront ? pick("Prime initiale confirmée", "Upfront premium confirmed") : pick("Confirmer prime initiale", "Confirm upfront premium")}
        accessibilityLabel={pick(`Prime initiale jambe ${index + 1} : ${leg.upfront ? "confirmée" : "non confirmée"}`,
          `Leg ${index + 1} upfront premium: ${leg.upfront ? "confirmed" : "unconfirmed"}`)}
        variant="secondary" onPress={() => update(leg.id, { upfront: !leg.upfront })} />
      <Button label={pick(`Retirer jambe ${index + 1}`, `Remove leg ${index + 1}`)} variant="secondary"
        onPress={() => setLegs((current) => current.filter((item) => item.id !== leg.id))} />
    </View>)}
    {legs.length ? <>
      <Text style={styles.heading}>{pick("Modèles", "Templates")}</Text>
      <Button label="Long call" variant="secondary" onPress={() => template("long-call")} />
      <Button label="Long put" variant="secondary" onPress={() => template("long-put")} />
      <Button label="Bull call spread" variant="secondary" onPress={() => template("bull-call")} />
      <Button label="Long straddle" variant="secondary" onPress={() => template("straddle")} />
      <StrategyField label={pick("Devise vérifiée (ex. CAD)", "Verified currency (e.g. CAD)")} value={currency}
        autoCapitalize="characters" onChangeText={(value) => setCurrency(value.toUpperCase())} />
      <StrategyField label={pick("Échéance et fuseau vérifiés", "Verified expiry and time zone")} value={expiry}
        placeholder="2027-11-25T16:00:00-05:00" autoCapitalize="none" onChangeText={setExpiry} />
      <StrategyField label={pick("Prix minimal du sous-jacent", "Minimum underlying price")} value={low}
        keyboardType="default" onChangeText={setLow} />
      <StrategyField label={pick("Prix maximal du sous-jacent", "Maximum underlying price")} value={high}
        keyboardType="default" onChangeText={setHigh} />
      <Button label={pending ? pick("Calcul en cours…", "Calculating…") : pick("Simuler à l'échéance", "Simulate at expiry")}
        disabled={pending} onPress={() => void calculate()} />
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {scenarios.map((scenario, index) => <View key={scenario.id} style={styles.group}>
      <Text style={styles.heading}>{pick(`Scénario théorique ${index + 1}`, `Theoretical scenario ${index + 1}`)}</Text>
      <Text style={styles.copy}>{scenario.label}</Text>
      <Text style={styles.copy}>{pick("Débit initial théorique", "Theoretical initial debit")}: {scenario.result.theoretical_debit ?? "N/D"} {scenario.result.currency}</Text>
      <Text style={styles.copy}>{pick("Résultat min. / max.", "Minimum / maximum result")}: {scenario.result.loss_unbounded ? pick("perte non bornée", "unbounded loss") : scenario.result.minimum_profit_loss ?? "N/D"} / {scenario.result.gain_unbounded ? pick("gain non borné", "unbounded gain") : scenario.result.maximum_profit_loss ?? "N/D"} {scenario.result.currency}</Text>
      <Text style={styles.copy}>{pick("Seuils de rentabilité", "Break-even points")}: {scenario.result.break_evens.length
        ? scenario.result.break_evens.map((point) => point.lower === point.upper ? point.lower : `${point.lower ?? "−∞"} – ${point.upper ?? "+∞"}`).join(", ")
        : pick("aucun calculé", "none calculated")}</Text>
      <PayoffChart points={scenario.result.points} currency={scenario.result.currency} />
      {scenario.result.points.map((point, pointIndex) => <Text key={pointIndex} style={styles.copy}>{point.price} → {point.profit_loss} {scenario.result.currency}</Text>)}
    </View>)}
  </Card>;
}

const styles = createThemedStyles((colors) => ({
  group: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  heading: { ...typography.label, color: colors.text },
  copy: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.negative },
}));
