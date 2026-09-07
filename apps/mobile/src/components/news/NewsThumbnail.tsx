import { useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import { safeWebUrl } from "@/src/lib/article";
import { radius, typography } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

type ThumbnailSize = "compact" | "card" | "hero";

function sourceInitials(source: string): string {
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "A";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "A";
}

export function NewsThumbnail({ imageUrl, source, size = "card", testID = "news-thumbnail" }: {
  imageUrl?: string | null;
  source: string;
  size?: ThumbnailSize;
  testID?: string;
}) {
  useMobileTheme();
  const uri = safeWebUrl(imageUrl);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const initials = useMemo(() => sourceInitials(source), [source]);
  const failed = uri !== null && uri === failedUri;
  const dimensions = size === "hero" ? styles.hero : size === "compact" ? styles.compact : styles.card;

  if (uri && !failed) {
    return <Image
      accessibilityLabel={source}
      onError={() => setFailedUri(uri)}
      resizeMode="cover"
      source={{ uri }}
      style={[styles.base, dimensions]}
      testID={`${testID}-image`}
    />;
  }

  return <View accessibilityLabel={source} style={[styles.base, styles.fallback, dimensions]} testID={`${testID}-fallback`}>
    <Text style={[styles.initials, size === "hero" && styles.heroInitials]}>{initials}</Text>
    <Text numberOfLines={1} style={styles.fallbackLabel}>ANATOLE</Text>
  </View>;
}

const styles = createThemedStyles((colors) => ({
  base: { flexShrink: 0, overflow: "hidden", borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  compact: { width: 88, height: 72 },
  card: { width: 104, height: 92 },
  hero: { width: "100%", height: 180 },
  fallback: { alignItems: "center", justifyContent: "center", gap: 3, borderWidth: 1, borderColor: colors.borderStrong },
  initials: { ...typography.section, color: colors.primary, fontWeight: "800" },
  heroInitials: { fontSize: 32, lineHeight: 38 },
  fallbackLabel: { ...typography.caption, color: colors.textSubtle, fontSize: 9, fontWeight: "800" },
}));
