import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { Button, Card, Field } from "@/src/components/ui";
import { ApiError } from "@/src/lib/api/base";
import { optionsApi, type AccountOptionPosition, type AccountOptionPositions, type OptionContract } from "@/src/lib/api/options";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { spacing, typography } from "@/src/theme/tokens";

function decimal(value: string): number {
  const trimmed = value.trim();
  return /^\d+(?:[.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN;
}

export function NativeAccountPositions({ accountId, selected }: { accountId: string | null; selected: OptionContract | null }) {
  useMobileTheme();
  const { pick } = useLocale();
  const [snapshot, setSnapshot] = useState<AccountOptionPositions | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [quantity, setQuantity] = useState("1");
  const [multiplier, setMultiplier] = useState("");
  const [premium, setPremium] = useState("");
  const [currency, setCurrency] = useState("");
  const [expiryDraft, setExpiryDraft] = useState<{ key: string; value: string } | null>(null);
  const [confirmedKey, setConfirmedKey] = useState("");
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);
  const selectedKey = selected ? JSON.stringify([selected.market, selected.symbol, selected.contract, selected.side, selected.strike, selected.expiration]) : "";
  const expiry = expiryDraft?.key === selectedKey ? expiryDraft.value : "";
  const formKey = JSON.stringify([selectedKey, direction, quantity, multiplier, premium, currency, expiry]);
  const confirmed = Boolean(selectedKey && confirmedKey === formKey);

  function beginRequest(): AbortController | null {
    if (request.current) return null;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setNotice("");
    return controller;
  }

  function finishRequest(controller: AbortController) {
    if (request.current === controller) request.current = null;
    if (active.current) setBusy(false);
  }

  async function refresh() {
    if (!accountId) return;
    const controller = beginRequest();
    if (!controller) return;
    try {
      const result = await optionsApi.accountPositions(accountId, controller.signal);
      if (!Number.isSafeInteger(result.revision) || result.revision < 0 || !Array.isArray(result.positions)) throw new Error();
      if (active.current) setSnapshot(result);
    } catch { if (active.current) setNotice(pick("Chargement impossible.", "Could not load positions.")); }
    finally { finishRequest(controller); }
  }

  async function create() {
    const qty = Number(quantity), mult = decimal(multiplier), value = decimal(premium);
    const code = currency.trim().toUpperCase();
    if (!accountId || !snapshot || !selected?.expiration || !confirmed || !quantity.trim() || !multiplier.trim() || !premium.trim() ||
      !/^\d+$/.test(quantity.trim()) || !Number.isSafeInteger(qty) || qty < 1 || qty > 10000 || !Number.isFinite(mult) || mult <= 0 || mult > 1000000 ||
      !Number.isFinite(value) || value < 0 || value > 1000000 || !/^[A-Z]{3}$/.test(code) || code === "XXX" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(expiry) ||
      expiry.slice(0, 10) !== selected.expiration || !Number.isFinite(Date.parse(expiry)) ||
      !Number.isFinite(Date.parse(selected.expiration)) || new Date(selected.expiration).toISOString().slice(0, 10) !== selected.expiration ||
      (selected.market === "commodities" && !selected.contract)) {
      setNotice(pick("Vérifiez la date avec fuseau, les spécifications, la devise et la prime initiale.", "Check the zoned expiry, specifications, currency and upfront premium.")); return;
    }
    const controller = beginRequest();
    if (!controller) return;
    try {
      const result = await optionsApi.createAccountPosition({ expected_account_id: accountId, expected_revision: snapshot.revision,
        position: { symbol: selected.symbol, underlying: selected.underlying, market: selected.market, contract: selected.contract,
          side: selected.side, strike: selected.strike, expiration: selected.expiration, expiry_at: expiry, direction,
          quantity: qty, multiplier: mult, premium: value, currency: code, reminder_days: 7 } }, controller.signal);
      if (active.current) { setSnapshot(result); setConfirmedKey(""); setNotice(pick("Position enregistrée dans le compte.", "Position saved to account.")); }
    } catch (error) {
      if (active.current) setNotice(error instanceof ApiError && error.status === 409 ? pick("Les données ont changé ailleurs. Actualisez.", "Data changed elsewhere. Refresh.") : pick("Enregistrement incertain : actualisez avant de réessayer.", "Save uncertain: refresh before retrying."));
    } finally { finishRequest(controller); }
  }

  async function remove(item: AccountOptionPosition) {
    if (!accountId || !snapshot) return;
    const controller = beginRequest();
    if (!controller) return;
    try {
      const result = await optionsApi.saveAccountPositions({ expected_account_id: accountId, expected_revision: snapshot.revision,
        positions: snapshot.positions.filter((position) => position.id !== item.id) }, controller.signal);
      if (active.current) { setSnapshot(result); setNotice(pick("Position retirée du compte.", "Position removed from account.")); }
    } catch { if (active.current) setNotice(pick("Modification impossible ou données changées. Actualisez.", "Update failed or data changed. Refresh.")); }
    finally { finishRequest(controller); }
  }

  return <Card title={pick("Positions d'options du compte", "Account option positions")}>
    <Text style={styles.copy}>{pick("Le compte conserve contrat, quantité, prime et hypothèses sur le serveur Anatole. Aucune synchronisation avec un courtier ni transmission automatique à l'assistant.", "The account stores the contract, quantity, premium and assumptions on Anatole's server. No broker sync or automatic assistant sharing.")}</Text>
    <Text style={styles.copy}>{pick("Valeur courante, marge, frais, exercice et risque global non calculés. Vérifiez les spécifications du contrat.", "Current value, margin, fees, exercise and total risk are not calculated. Verify contract specifications.")}</Text>
    {!accountId ? <Text style={styles.copy}>{pick("Connectez-vous pour gérer les positions du compte.", "Sign in to manage account positions.")}</Text> : <>
      <Button label={snapshot ? pick("Actualiser les positions du compte", "Refresh account positions") : pick("Ouvrir les positions du compte", "Open account positions")} disabled={busy} onPress={() => void refresh()} />
      {snapshot ? <>
        {selected ? <>
          <Text style={styles.copy}>{pick("Contrat sélectionné", "Selected contract")}: {selected.symbol} · {selected.side.toUpperCase()} {selected.strike} · {selected.expiration ?? "N/D"}</Text>
          <Button label={direction === "long" ? pick("Sens : achat", "Direction: long") : pick("Sens : vente", "Direction: short")} variant="secondary" onPress={() => setDirection(direction === "long" ? "short" : "long")} />
          <Field label={pick("Quantité de contrats", "Contract quantity")} accessibilityLabel={pick("Quantité de contrats", "Contract quantity")} value={quantity} keyboardType="numeric" onChangeText={setQuantity} />
          <Field label={pick("Multiplicateur de position", "Position multiplier")} accessibilityLabel={pick("Multiplicateur de position", "Position multiplier")} value={multiplier} keyboardType="decimal-pad" onChangeText={setMultiplier} />
          <Field label={pick("Prime initiale par unité", "Upfront premium per unit")} accessibilityLabel={pick("Prime initiale par unité", "Upfront premium per unit")} value={premium} keyboardType="decimal-pad" onChangeText={setPremium} />
          <Field label={pick("Devise de la position", "Position currency")} accessibilityLabel={pick("Devise de la position", "Position currency")} value={currency} autoCapitalize="characters" onChangeText={setCurrency} />
          <Field label={pick("Échéance de la position avec fuseau", "Position expiry with time zone")} accessibilityLabel={pick("Échéance de la position avec fuseau", "Position expiry with time zone")} value={expiry} placeholder="2027-11-25T16:00:00-05:00" autoCapitalize="none" onChangeText={(value) => setExpiryDraft({ key: selectedKey, value })} />
          <Button label={confirmed ? pick("Spécifications confirmées", "Specifications confirmed") : pick("Confirmer spécifications et prime initiale", "Confirm specifications and upfront premium")} variant="secondary" onPress={() => setConfirmedKey(confirmed ? "" : formKey)} />
          <Button label={pick("Enregistrer la position du compte", "Save account position")} disabled={busy} onPress={() => void create()} />
        </> : <Text style={styles.copy}>{pick("Sélectionnez un contrat pour le suivre.", "Select a contract to track it.")}</Text>}
        {snapshot.positions.map((item) => <View key={item.id} style={styles.group}>
          <Text style={styles.copy}>{item.symbol} · {item.side.toUpperCase()} {item.strike} · {item.expiration}</Text>
          <Text style={styles.copy}>{item.direction === "long" ? pick("Achat", "Long") : pick("Vente", "Short")} · {item.quantity} × {item.multiplier} · {item.currency} · {pick("prime saisie", "entered premium")} {item.premium}</Text>
          <Button label={pick(`Retirer position ${item.symbol} ${item.id}`, `Remove position ${item.symbol} ${item.id}`)} disabled={busy} variant="secondary" onPress={() => void remove(item)} />
        </View>)}
        {snapshot.positions.length === 0 ? <Text style={styles.copy}>{pick("Aucune position dans le compte.", "No account positions.")}</Text> : null}
      </> : null}
    </>}
    {notice ? <Text accessibilityRole="alert" style={styles.copy}>{notice}</Text> : null}
  </Card>;
}

const styles = createThemedStyles((colors) => ({
  copy: { ...typography.body, color: colors.textMuted },
  group: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
}));
