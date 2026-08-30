import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, QueryState, Screen, ScreenHeader } from "@/src/components/ui";
import { notificationApi } from "@/src/lib/api/notifications";
import type { NotificationItem } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export default function NotificationsScreen() {
  const { state } = useMobileAccount(); const { language, pick } = useLocale(); const network = useNetInfo();
  const query = useQuery({ queryKey: ["notifications"], queryFn: notificationApi.feed, enabled: state === "authenticated" });
  async function open(item: NotificationItem) { if (!item.read_at) await notificationApi.markRead(item.id); await query.refetch(); if (item.symbol) router.push({ pathname: "/focus/[ticker]", params: { ticker: item.symbol } }); else if (item.route?.startsWith("/")) router.push(item.route as Href); }
  async function markAll() { await notificationApi.markAllRead(); await query.refetch(); }
  if (state !== "authenticated") return <Screen><ScreenHeader eyebrow="Anatole" title={pick("Notifications", "Notifications")} /><Card><Text style={styles.muted}>{pick("Une connexion est nécessaire pour consulter votre centre de notifications.", "Sign in to view your notification center.")}</Text><Button label={pick("Se connecter", "Sign in")} onPress={() => router.push("/(auth)/login")} /></Card></Screen>;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="notifications-screen">
      <FlatList
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
        ListHeaderComponent={<View style={styles.headerStack}>{network.isConnected === false ? <Text accessibilityRole="alert" style={styles.offline}>{pick("Hors ligne · dernières données disponibles", "Offline · latest available data")}</Text> : null}<ScreenHeader eyebrow={pick("Centre", "Center")} title={pick("Notifications", "Notifications")} subtitle={`${query.data?.unread_count ?? 0} ${pick("non lues", "unread")}`} action={query.data?.unread_count ? <Pressable accessibilityRole="button" onPress={() => void markAll()}><Text style={styles.link}>{pick("Tout lire", "Mark all read")}</Text></Pressable> : null} /><QueryState loading={query.isLoading} error={!query.data ? query.error : null} empty={Boolean(query.data && query.data.items.length === 0)} onRetry={() => void query.refetch()} /></View>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => void open(item)} style={[styles.item, !item.read_at && styles.unread]}><View style={[styles.dot, { backgroundColor: item.severity === "important" ? colors.negative : item.severity === "attention" ? colors.warning : colors.primary }]} /><View style={{ flex: 1, gap: spacing.xs }}><Text style={styles.title}>{item.title}</Text><Text style={styles.message}>{item.message}</Text><Text style={styles.date}>{new Date(item.created_at).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")}</Text></View></Pressable>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, list: { flexGrow: 1, padding: spacing.lg, paddingBottom: 80, gap: spacing.sm, backgroundColor: colors.background }, headerStack: { gap: spacing.md, marginBottom: spacing.md },
  muted: { ...typography.body, color: colors.textMuted }, link: { ...typography.label, color: colors.primary, minHeight: 44, textAlignVertical: "center" }, offline: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: "rgba(246,185,74,0.1)", textAlign: "center" },
  item: { minHeight: 80, flexDirection: "row", gap: spacing.md, padding: spacing.md, opacity: 0.72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, unread: { opacity: 1, borderColor: colors.borderStrong, backgroundColor: "rgba(44,156,255,0.08)" },
  dot: { width: 8, height: 8, borderRadius: radius.pill, marginTop: 7 }, title: { ...typography.body, color: colors.text, fontWeight: "700" }, message: { ...typography.body, color: colors.textMuted }, date: { ...typography.caption, color: colors.textSubtle },
});
