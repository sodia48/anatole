import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, Field } from "@/src/components/ui";
import type { PortfolioPositionInput } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";
import { colors, spacing, typography } from "@/src/theme/tokens";

export function PortfolioEditor({ positions, onSave }: { positions: PortfolioPositionInput[]; onSave: (positions: PortfolioPositionInput[]) => Promise<void> }) {
  const { pick } = useLocale();
  const [symbol, setSymbol] = useState(""); const [quantity, setQuantity] = useState(""); const [cost, setCost] = useState(""); const [saving, setSaving] = useState(false);
  const add = async () => {
    const next = { symbol: normalizeTicker(symbol), quantity: Number(quantity), average_cost: Number(cost) };
    if (!next.symbol || !Number.isFinite(next.quantity) || next.quantity <= 0 || !Number.isFinite(next.average_cost) || next.average_cost < 0) return;
    setSaving(true);
    try {
      await onSave([...positions.filter((item) => normalizeTicker(item.symbol) !== next.symbol), next]);
      setSymbol(""); setQuantity(""); setCost("");
    } finally { setSaving(false); }
  };
  return <Card title={pick("Modifier le portefeuille", "Edit portfolio")}><Field autoCapitalize="characters" label={pick("Symbole", "Symbol")} onChangeText={setSymbol} placeholder="RY" value={symbol} /><View style={styles.fields}><View style={styles.field}><Field keyboardType="decimal-pad" label={pick("Quantité", "Quantity")} onChangeText={setQuantity} value={quantity} /></View><View style={styles.field}><Field keyboardType="decimal-pad" label={pick("Coût moyen", "Average cost")} onChangeText={setCost} value={cost} /></View></View><Text style={styles.note}>{pick("Le coût moyen sert uniquement au P/L latent; aucune transaction n’est créée.", "Average cost is used only for unrealized P/L; no transaction is created.")}</Text><Button disabled={saving || !symbol || !quantity || cost === ""} label={pick("Ajouter ou mettre à jour", "Add or update")} onPress={() => void add()} /></Card>;
}
const styles = StyleSheet.create({ fields: { flexDirection: "row", gap: spacing.sm }, field: { flex: 1 }, note: { ...typography.caption, color: colors.textMuted } });
