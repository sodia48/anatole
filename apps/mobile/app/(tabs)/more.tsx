import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { Button, Card, Screen, ScreenHeader } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, spacing, typography } from "@/src/theme/tokens";

const routes: { fr: string; en: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; href: Href }[] = [
  { fr: "Recherche", en: "Search", icon: "magnify", href: "/search" },
  { fr: "Comparateur", en: "Comparator", icon: "compare", href: "/compare" },
  { fr: "Découvrir", en: "Discover", icon: "compass-outline", href: "/discover" },
  { fr: "Assistant Anatole", en: "Anatole Assistant", icon: "message-processing-outline", href: "/assistant" },
  { fr: "Psychologie", en: "Psychology", icon: "chart-bell-curve-cumulative", href: "/psychology" },
  { fr: "Terminal Pro", en: "Terminal Pro", icon: "radar", href: "/terminal" },
  { fr: "ETF", en: "ETF", icon: "view-grid-outline", href: "/etf" },
  { fr: "IPO & initiés", en: "IPOs & insiders", icon: "account-tie-outline", href: "/ipo-insiders" },
  { fr: "Watchlist", en: "Watchlist", icon: "star-outline", href: "/watchlist" },
  { fr: "Alertes", en: "Alerts", icon: "bell-ring-outline", href: "/alerts" },
  { fr: "Notifications", en: "Notifications", icon: "bell-outline", href: "/notifications" },
  { fr: "Réglages", en: "Settings", icon: "cog-outline", href: "/settings" },
];

export default function MoreScreen() {
  const { state, user, logout } = useMobileAccount(); const { t, pick } = useLocale();
  return <Screen testID="more-screen"><ScreenHeader eyebrow="Anatole" title={t("more")} subtitle={user?.email ?? t("anonymous")} /><Card>{routes.map((item) => <Pressable accessibilityRole="button" key={item.href.toString()} onPress={() => router.push(item.href)} style={styles.route}><MaterialCommunityIcons name={item.icon} size={22} color={colors.primary} /><Text style={styles.routeText}>{pick(item.fr, item.en)}</Text><Text style={styles.chevron}>›</Text></Pressable>)}</Card>{state === "authenticated" ? <Button label={t("logout")} variant="danger" onPress={() => void logout()} /> : <Button label={t("login")} onPress={() => router.push("/(auth)/login")} />}</Screen>;
}
const styles = StyleSheet.create({ route: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, routeText: { flex: 1, ...typography.body, color: colors.text, fontWeight: "700" }, chevron: { fontSize: 24, color: colors.textMuted } });
