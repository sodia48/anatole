import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Button, Card, Field, Screen, ScreenHeader } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, typography } from "@/src/theme/tokens";

export default function RegisterScreen() {
  const { t, pick } = useLocale();
  const { register } = useMobileAccount();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState(""); const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() { setBusy(true); setError(null); try { await register({ email, password, displayName, inviteCode }); router.replace("/(tabs)/today"); } catch (caught) { setError(caught instanceof Error ? caught.message : pick("Inscription impossible.", "Unable to register.")); } finally { setBusy(false); } }
  return <Screen><ScreenHeader eyebrow="Anatole mobile" title={t("register")} subtitle={pick("Retrouvez le même compte et le même espace que sur le web.", "Use the same account and workspace as on the web.")} /><Card><Field label={pick("Nom affiché", "Display name")} value={displayName} onChangeText={setDisplayName} /><Field label={pick("Courriel", "Email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><Field label={pick("Mot de passe (10 caractères minimum)", "Password (10 characters minimum)")} value={password} onChangeText={setPassword} secureTextEntry /><Field label={pick("Code d’invitation (si requis)", "Invitation code (if required)")} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" />{error ? <Text style={styles.error}>{error}</Text> : null}<Button label={busy ? t("loading") : t("register")} onPress={() => void submit()} disabled={busy || !email || password.length < 10} /></Card></Screen>;
}
const styles = StyleSheet.create({ error: { ...typography.body, color: colors.negative } });
