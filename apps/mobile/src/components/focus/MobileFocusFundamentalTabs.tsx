import { Pressable, Text, View } from "react-native";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";

export type MobileFundamentalView = "fundamentals" | "diagnostic" | "peers" | "scenarios" | "documents" | "capital" | "financials" | "analysts";

const spaces = [
  { id: "diagnostic", fr: "Vue d’ensemble", en: "Overview" },
  { id: "peers", fr: "Comparer", en: "Compare" },
  { id: "scenarios", fr: "Simuler", en: "Simulate" },
  { id: "financials", fr: "Explorer", en: "Explore" },
] as const;

const explore: { id: MobileFundamentalView; fr: string; en: string }[] = [
  { id: "financials", fr: "États financiers", en: "Financial statements" },
  { id: "capital", fr: "Capital et consensus", en: "Capital and consensus" },
  { id: "documents", fr: "Documents officiels", en: "Official documents" },
  { id: "fundamentals", fr: "Métriques avancées", en: "Advanced metrics" },
];

export function MobileFocusFundamentalTabs({ view, onChange }: {
  view: MobileFundamentalView;
  onChange: (view: MobileFundamentalView) => void;
}) {
  useMobileTheme();
  const { pick } = useLocale();
  const active = view === "diagnostic" || view === "peers" || view === "scenarios" ? view : "financials";
  return <View style={styles.stack} testID="focus-fundamental-subtabs">
    <View style={styles.row} accessibilityRole="tablist">{spaces.map(space => <Pressable key={space.id}
      testID={`focus-fundamental-tab-${space.id}`} accessibilityRole="tab" accessibilityState={{ selected: active === space.id }}
      onPress={() => onChange(space.id)} style={[styles.tab, active === space.id && styles.active]}>
      <Text style={[styles.text, active === space.id && styles.activeText]}>{pick(space.fr, space.en)}</Text>
    </Pressable>)}</View>
    {active === "financials" ? <View style={styles.row} accessibilityLabel={pick("Contenu à explorer", "Explore content")}>
      {explore.map(item => <Pressable key={item.id} testID={`focus-explore-${item.id}`} accessibilityRole="button"
        accessibilityState={{ selected: view === item.id || (view === "analysts" && item.id === "capital") }}
        onPress={() => onChange(item.id)} style={styles.choice}>
        <Text style={[styles.text, (view === item.id || (view === "analysts" && item.id === "capital")) && styles.activeText]}>{pick(item.fr, item.en)}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

const styles = createThemedStyles(colors => ({
  stack: { gap: spacing.xs, width: "100%" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, width: "100%" },
  tab: { flexGrow: 1, minWidth: 130, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  active: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.22)" },
  choice: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  text: { ...typography.label, color: colors.textMuted },
  activeText: { color: colors.text },
}));
