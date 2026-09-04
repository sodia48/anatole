import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetInfo } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

const LAST_ONLINE_KEY = "anatole.mobile.last-online-at.v1";

function formatTime(value: string | Date | null | undefined, language: "fr" | "en"): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function DataFreshness({ asOf, delayed = false }: { asOf?: string | Date | null; delayed?: boolean }) {
  const { language, pick } = useLocale();
  const time = formatTime(asOf, language);
  if (!time && !delayed) return null;
  return <Text style={styles.muted}>{delayed ? pick("Différé", "Delayed") : pick("Dernières données", "Latest data")}{time ? ` · ${time}` : ""}</Text>;
}

export function CoverageBadge({ available, expected }: { available: number; expected: number }) {
  const { pick } = useLocale();
  return <View style={styles.badge}><Text style={styles.badgeText}>{pick("Couverture", "Coverage")} · {available}/{expected}</Text></View>;
}

export function SourceBadge({ source }: { source?: string | null }) {
  const { pick } = useLocale();
  return <View style={styles.badge}><Text style={styles.badgeText}>{source?.trim() || pick("Source N/D", "Source N/A")}</Text></View>;
}

export function OfflineBadge({ forceOffline, asOf }: { forceOffline?: boolean; asOf?: string | Date | null }) {
  const network = useNetInfo();
  const { language, pick } = useLocale();
  const offline = forceOffline ?? network.isConnected === false;
  const [lastOnlineAt, setLastOnlineAt] = useState<string | null>(null);

  useEffect(() => {
    if (!offline) {
      const value = new Date().toISOString();
      setLastOnlineAt(value);
      void AsyncStorage.setItem(LAST_ONLINE_KEY, value);
      return;
    }
    void AsyncStorage.getItem(LAST_ONLINE_KEY).then(setLastOnlineAt);
  }, [offline]);

  if (!offline) return null;
  const time = formatTime(asOf ?? lastOnlineAt, language);
  return (
    <Text accessibilityRole="alert" style={styles.offline}>
      {pick("Hors ligne", "Offline")} · {pick("Dernières données disponibles", "Latest available data")}{time ? ` · ${time}` : ""}
    </Text>
  );
}

const styles = StyleSheet.create({
  offline: { ...typography.caption, color: colors.warning, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: "rgba(246,185,74,0.1)", textAlign: "center" },
  muted: { ...typography.caption, color: colors.textMuted },
  badge: { alignSelf: "flex-start", minHeight: 28, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  badgeText: { ...typography.caption, color: colors.textMuted },
});
