import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Field } from "@/src/components/ui";
import type { PortfolioMarket, PortfolioPositionInput } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { spacing, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

export function PortfolioEditor({ positions, onSave }: { positions: PortfolioPositionInput[]; onSave: (positions: PortfolioPositionInput[]) => Promise<void> }) {
  useMobileTheme();
  const { pick } = useLocale();
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<PortfolioMarket>("CA");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  const normalizedSymbol = market === "CA" ? normalizeTicker(symbol) : symbol.trim().toUpperCase();

  const add = async () => {
    const next: PortfolioPositionInput = { symbol: normalizedSymbol, market, quantity: Number(quantity), average_cost: Number(cost) };
    if (!next.symbol || !Number.isFinite(next.quantity) || next.quantity <= 0 || !Number.isFinite(next.average_cost) || next.average_cost < 0) return;
    setSaving(true);
    try {
      await onSave([...positions.filter((item) => normalizeTicker(item.symbol) !== normalizeTicker(next.symbol)), next]);
      setSymbol(""); setQuantity(""); setCost("");
    } finally { setSaving(false); }
  };

  const placeholder = market === "US" ? "AAPL" : market === "INTL" ? "BMW.DE" : "RY";
  return <Card title={pick("Modifier le portefeuille", "Edit portfolio")}>
    <Text style={styles.marketLabel}>{pick("Marché", "Market")}</Text>
    <View style={styles.marketRow}>{([
      ["CA", pick("Canada", "Canada")],
      ["US", pick("États-Unis", "United States")],
      ["INTL", pick("International", "International")],
    ] as Array<[PortfolioMarket, string]>).map(([value, label]) => <Pressable accessibilityRole="button" key={value} onPress={() => { setMarket(value); setSymbol(""); }} style={[styles.marketChip, market === value ? styles.marketChipActive : null]}><Text style={[styles.marketChipText, market === value ? styles.marketChipTextActive : null]}>{label}</Text></Pressable>)}</View>
    <Field autoCapitalize="characters" label={pick("Symbole", "Symbol")} onChangeText={setSymbol} placeholder={placeholder} value={symbol} />
    {market !== "CA" ? <Text style={styles.note}>{market === "US" ? pick("Ticker américain exact, ex. AAPL ou BRK-B.", "Exact U.S. ticker, e.g. AAPL or BRK-B.") : pick("Ticker avec suffixe de place, ex. BMW.DE, 7203.T ou NESN.SW.", "Ticker with exchange suffix, e.g. BMW.DE, 7203.T or NESN.SW.")}</Text> : null}
    <View style={styles.fields}><View style={styles.field}><Field keyboardType="decimal-pad" label={pick("Quantité", "Quantity")} onChangeText={setQuantity} value={quantity} /></View><View style={styles.field}><Field keyboardType="decimal-pad" label={pick("Coût moyen", "Average cost")} onChangeText={setCost} value={cost} /></View></View>
    <Text style={styles.note}>{pick("Le coût moyen est dans la devise du titre; Anatole convertit la valeur du portefeuille en CAD.", "Average cost is in the security currency; Anatole converts portfolio value to CAD.")}</Text>
    <Button disabled={saving || !symbol || !quantity || cost === ""} label={pick("Ajouter ou mettre à jour", "Add or update")} onPress={() => void add()} />
  </Card>;
}
const styles = createThemedStyles((colors) => ({
  fields: { flexDirection: "row", gap: spacing.sm }, field: { flex: 1 }, note: { ...typography.caption, color: colors.textMuted },
  marketLabel: { ...typography.caption, color: colors.textMuted, fontWeight: "800", marginBottom: spacing.xs },
  marketRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  marketChip: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surfaceRaised, paddingHorizontal: spacing.xs },
  marketChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
  marketChipText: { ...typography.caption, color: colors.textMuted, fontWeight: "700", textAlign: "center" },
  marketChipTextActive: { color: colors.primary },
}));
