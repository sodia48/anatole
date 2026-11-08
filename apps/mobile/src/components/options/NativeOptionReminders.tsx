import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { Button, Card, Field } from "@/src/components/ui";
import { optionsApi, type OptionAccountReminder, type OptionContract } from "@/src/lib/api/options";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { spacing, typography } from "@/src/theme/tokens";

export function NativeOptionReminders({ accountId, selected }: { accountId: string | null; selected: OptionContract | null }) {
  useMobileTheme();
  const { pick } = useLocale();
  const [expiryDraft, setExpiryDraft] = useState<{ key: string; value: string } | null>(null);
  const [days, setDays] = useState("7");
  const [items, setItems] = useState<OptionAccountReminder[] | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const selectedKey = selected ? JSON.stringify([selected.market, selected.underlying, selected.contract,
    selected.symbol, selected.side, selected.strike, selected.expiration]) : "";
  const expiry = expiryDraft?.key === selectedKey ? expiryDraft.value : "";

  async function refresh() {
    if (!accountId) return;
    setPending(true);
    setNotice("");
    try {
      const loaded = await optionsApi.reminders(accountId);
      if (active.current) setItems(loaded);
    } catch {
      if (active.current) setNotice(pick("Impossible de charger les rappels.", "Could not load reminders."));
    } finally {
      if (active.current) setPending(false);
    }
  }

  async function create() {
    if (!accountId || !selected || !selected.expiration ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/i.test(expiry) ||
        expiry.slice(0, 10) !== selected.expiration || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now() ||
        !/^\d+$/.test(days) || Number(days) > 30) {
      setNotice(pick("Sélectionnez un contrat et vérifiez l'échéance future, son fuseau et le délai de 0 à 30 jours.",
        "Select a contract and check its future expiry, time zone and the 0–30 day lead time."));
      return;
    }
    setPending(true);
    setNotice("");
    try {
      await optionsApi.createReminder({ expected_account_id: accountId, underlying: selected.underlying,
        expires_at: expiry, reminder_days: Number(days) });
      const loaded = await optionsApi.reminders(accountId);
      if (active.current) {
        setItems(loaded);
        setNotice(pick("Rappel enregistré sur le compte.", "Reminder saved to the account."));
      }
    } catch {
      if (active.current) setNotice(pick("Enregistrement ou actualisation impossible. Vérifiez les rappels avant de réessayer.",
        "Save or refresh failed. Check reminders before retrying."));
    } finally {
      if (active.current) setPending(false);
    }
  }

  async function remove(item: OptionAccountReminder) {
    if (!accountId) return;
    setPending(true);
    setNotice("");
    try {
      await optionsApi.deleteReminder(item.position_id, accountId);
      if (active.current) setItems((current) => current?.filter((entry) => entry.position_id !== item.position_id) ?? null);
    } catch {
      if (active.current) setNotice(pick("Suppression impossible ; actualisez la liste.", "Could not delete; refresh the list."));
    } finally {
      if (active.current) setPending(false);
    }
  }

  return <Card title={pick("Rappels d'échéance du compte", "Account expiry reminders")}>
    <Text style={styles.copy}>{pick("Notification interne seulement, selon vos préférences et la disponibilité du serveur. La conservation dépend de la base de compte configurée.",
      "In-app notification only, subject to preferences and server availability. Retention depends on the configured account database.")}</Text>
    <Text style={styles.copy}>{pick("Le compte conserve le sous-jacent, l'échéance et le délai, sans quantité ni prime. Sur mobile, un même sous-jacent et instant réutilisent le même rappel, même pour plusieurs contrats.",
      "The account stores the underlying, expiry and lead time, without quantity or premium. On mobile, the same underlying and instant reuse one reminder, even for multiple contracts.")}</Text>
    {!accountId ? <Text style={styles.copy}>{pick("Connectez-vous pour gérer les rappels du compte.", "Sign in to manage account reminders.")}</Text> : <>
      {selected ? <>
        <Text style={styles.copy}>{pick("Contrat sélectionné", "Selected contract")}: {selected.symbol} · {selected.expiration ?? "N/D"}</Text>
        <Field label={pick("Échéance du rappel avec fuseau", "Reminder expiry with time zone")}
          accessibilityLabel={pick("Échéance du rappel avec fuseau", "Reminder expiry with time zone")}
          value={expiry} placeholder="2027-11-25T16:00:00-05:00" autoCapitalize="none"
          onChangeText={(value) => setExpiryDraft({ key: selectedKey, value })} />
        <Field label={pick("Délai du rappel en jours", "Reminder lead time in days")}
          accessibilityLabel={pick("Délai du rappel en jours", "Reminder lead time in days")}
          value={days} keyboardType="numeric" onChangeText={setDays} />
        <Button label={pick("Enregistrer le rappel du compte", "Save account reminder")} disabled={pending} onPress={() => void create()} />
      </> : <Text style={styles.copy}>{pick("Sélectionnez un contrat pour créer un rappel.", "Select a contract to create a reminder.")}</Text>}
      <Button label={pick("Actualiser les rappels", "Refresh reminders")} variant="secondary" disabled={pending} onPress={() => void refresh()} />
      <Button label={pick("Ouvrir Notifications", "Open Notifications")} variant="secondary" onPress={() => router.push("/notifications")} />
      {items?.map((item) => <View key={item.position_id} style={styles.group}>
        <Text style={styles.copy}>{item.underlying} · {item.expires_at} · {item.reminder_days} {pick("jours", "days")}</Text>
        <Text style={styles.copy}>{item.triggered_at ? pick("Notification créée", "Notification created") : pick("En attente", "Pending")}</Text>
        <Button label={pick(`Supprimer rappel ${item.underlying} ${item.expires_at}`, `Delete ${item.underlying} ${item.expires_at} reminder`)}
          variant="secondary" disabled={pending} onPress={() => void remove(item)} />
      </View>)}
      {items?.length === 0 ? <Text style={styles.copy}>{pick("Aucun rappel enregistré.", "No saved reminders.")}</Text> : null}
    </>}
    {notice ? <Text accessibilityRole="alert" style={styles.copy}>{notice}</Text> : null}
  </Card>;
}

const styles = createThemedStyles((colors) => ({
  copy: { ...typography.body, color: colors.textMuted },
  group: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
}));
