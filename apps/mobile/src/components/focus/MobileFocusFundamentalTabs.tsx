import { Pressable, Text, View } from "react-native";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";

export type MobileFundamentalView = "fundamentals" | "diagnostic" | "financials" | "analysts";

const tabs: { id: MobileFundamentalView; fr: string; en: string }[] = [
  { id: "fundamentals", fr: "Synthèse", en: "Overview" },
  { id: "diagnostic", fr: "Diagnostic 360°", en: "Diagnostic 360°" },
  { id: "financials", fr: "Résultats", en: "Financials" },
  { id: "analysts", fr: "Analystes", en: "Analysts" },
];

export function MobileFocusFundamentalTabs({
  view,
  onChange,
}: {
  view: MobileFundamentalView;
  onChange: (view: MobileFundamentalView) => void;
}) {
  useMobileTheme();
  const { pick } = useLocale();
  return (
    <View style={styles.row} testID="focus-fundamental-subtabs">
      {tabs.map((item) => (
        <Pressable
          key={item.id}
          testID={`focus-fundamental-tab-${item.id}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === item.id }}
          onPress={() => onChange(item.id)}
          style={[styles.tab, view === item.id && styles.active]}
        >
          <Text style={[styles.text, view === item.id && styles.activeText]}>
            {pick(item.fr, item.en)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, width: "100%" },
  tab: {
    flexGrow: 1, minWidth: 85, minHeight: 44, justifyContent: "center",
    alignItems: "center", paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  text: { ...typography.label, color: colors.textMuted },
  activeText: { color: colors.text },
}));
