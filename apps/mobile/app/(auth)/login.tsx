import { Link, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Button, Card, Field, Screen, ScreenHeader } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function LoginScreen() {
  const { t, pick } = useLocale();
  const { login } = useMobileAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { await login(email, password); router.replace("/(tabs)/today"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : pick("Connexion impossible.", "Unable to sign in.")); }
    finally { setBusy(false); }
  }
  return <Screen><ScreenHeader eyebrow="Anatole mobile" title={t("login")} subtitle={t("signInToSync")} /><Card><Field label={pick("Courriel", "Email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><Field label={pick("Mot de passe", "Password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />{error ? <Text style={styles.error}>{error}</Text> : null}<Button label={busy ? t("loading") : t("login")} onPress={() => void submit()} disabled={busy || !email || !password} /><Link href="/(auth)/register" style={styles.link}>{t("register")}</Link></Card></Screen>;
}
const styles = StyleSheet.create({ error: { ...typography.body, color: colors.negative }, link: { ...typography.body, color: colors.primary, padding: spacing.sm, textAlign: "center" } });
