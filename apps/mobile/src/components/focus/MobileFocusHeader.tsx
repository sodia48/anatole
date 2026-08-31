import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Quote } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export function MobileFocusHeader({ quote, company, followed, liveState, onFollow }: { quote: Quote; company: string; followed: boolean; liveState: "connecting" | "live" | "offline"; onFollow: () => void }) {
  const { language, pick } = useLocale();
  const positive = quote.change_percent >= 0;
  return <View style={styles.shell}>
    <View style={styles.instrument}><View style={styles.badge}><Text style={styles.badgeText}>{quote.symbol}</Text></View><View style={styles.copy}><Text numberOfLines={1} style={styles.company}>{company}</Text><Text style={styles.meta}>{quote.exchange} · {quote.currency}</Text></View><Pressable onPress={onFollow} style={[styles.follow, followed && styles.followed]}><Text style={styles.followText}>{followed ? "★" : "☆"}</Text></Pressable></View>
    <View style={styles.quote}><Text style={styles.price}>{quote.price.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {quote.currency}</Text><Text style={[styles.change, { color: positive ? colors.positive : colors.negative }]}>{positive ? "+" : ""}{quote.change.toFixed(2)} ({positive ? "+" : ""}{quote.change_percent.toFixed(2)} %)</Text></View>
    <View style={styles.status}><Text style={[styles.live, liveState === "live" ? styles.liveOn : liveState === "offline" ? styles.liveOff : undefined]}>{liveState === "live" ? "LIVE" : liveState === "connecting" ? pick("CONNEXION", "CONNECTING") : pick("HORS LIGNE", "OFFLINE")}</Text><Text style={styles.meta}>{pick("Volume", "Volume")} {quote.volume.toLocaleString(language === "fr" ? "fr-CA" : "en-CA")} · {quote.delayed ? pick("donnée potentiellement différée", "potentially delayed data") : pick("temps réel", "real time")}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  shell: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  instrument: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, badge: { minWidth: 54, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: "#103d6f" }, badgeText: { ...typography.label, color: "#8cc9ff", textAlign: "center" }, copy: { flex: 1 }, company: { ...typography.body, color: colors.text, fontWeight: "700" }, meta: { ...typography.caption, color: colors.textMuted }, follow: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md }, followed: { backgroundColor: "rgba(44,156,255,.18)" }, followText: { fontSize: 24, color: colors.text },
  quote: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: spacing.md }, price: { ...typography.hero, color: colors.text }, change: { ...typography.label }, status: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }, live: { ...typography.caption, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.warning, color: colors.warning }, liveOn: { borderColor: colors.positive, color: colors.positive }, liveOff: { borderColor: colors.negative, color: colors.negative },
});
