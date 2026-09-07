import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { createThemedStyles, mobilePalettes, type MobileThemeName, type ThemeColors } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";

type AppearanceChooserProps = {
  selected: MobileThemeName;
  onSelect: (theme: MobileThemeName) => void;
  showHeading?: boolean;
};

const OPTIONS: MobileThemeName[] = ["dark", "blue"];

function CockpitPreview({ theme }: { theme: MobileThemeName }) {
  useMobileTheme();
  const palette = mobilePalettes[theme];
  return <View style={[styles.preview, { backgroundColor: palette.background, borderColor: palette.border }]}>
    <View style={[styles.previewHeader, { backgroundColor: palette.surface }]}><View style={[styles.previewBrand, { backgroundColor: palette.primary }]} /><View style={[styles.previewHeaderLine, { backgroundColor: palette.textMuted }]} /></View>
    <View style={styles.previewKpis}>{[72, 54, 64].map((width, index) => <View key={width} style={[styles.previewKpi, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={[styles.previewKpiLabel, { backgroundColor: palette.textSubtle, width: `${width}%` }]} /><View style={[styles.previewKpiValue, { backgroundColor: index === 1 ? palette.positive : palette.primary }]} /></View>)}</View>
    <View style={styles.previewHeatmap}><View style={[styles.heatWide, { backgroundColor: "#087F60" }]} /><View style={[styles.heatTile, { backgroundColor: "#8D3042" }]} /><View style={[styles.heatTile, { backgroundColor: "#0F674F" }]} /></View>
  </View>;
}

export function AppearanceChooser({ selected, onSelect, showHeading = true }: AppearanceChooserProps) {
  useMobileTheme();
  const { pick } = useLocale();
  return <View style={styles.container}>
    {showHeading ? <View style={styles.heading}><Text style={styles.eyebrow}>{pick("APPARENCE", "APPEARANCE")}</Text><Text accessibilityRole="header" style={styles.title}>{pick("Choisis ton Anatole", "Choose your Anatole")}</Text><Text style={styles.subtitle}>{pick("Ton identité visuelle, synchronisée sur tous tes appareils.", "Your visual identity, synchronized across your devices.")}</Text></View> : null}
    <View accessibilityRole="radiogroup" style={styles.options}>
      {OPTIONS.map((theme) => {
        const checked = selected === theme;
        return <Pressable
          accessibilityLabel={theme === "dark" ? "Anatole Original" : pick("Anatole Ciel", "Anatole Sky")}
          accessibilityRole="radio"
          accessibilityState={{ checked, selected: checked }}
          key={theme}
          onPress={() => onSelect(theme)}
          style={({ pressed }) => [styles.option, checked && styles.optionSelected, pressed && styles.optionPressed]}
          testID={`appearance-${theme}`}
        >
          <CockpitPreview theme={theme} />
          <View style={styles.optionCopy}>
            <View style={styles.optionTitleRow}><Text style={styles.optionTitle}>{theme === "dark" ? "Anatole Original" : pick("Anatole Ciel", "Anatole Sky")}</Text>{checked ? <MaterialCommunityIcons color={mobilePalettes[selected].primary} name="check-circle" size={22} /> : null}</View>
            <Text style={styles.optionDescription}>{theme === "dark" ? pick("Bleu nuit · contraste maximal", "Midnight blue · maximum contrast") : pick("Bleu ciel · lumineux et épuré", "Sky blue · bright and refined")}</Text>
          </View>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = createThemedStyles((colors: ThemeColors) => ({
  container: { gap: spacing.lg },
  heading: { gap: spacing.xs },
  eyebrow: { ...typography.label, color: colors.primary, letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  options: { gap: spacing.md },
  option: { minHeight: 180, padding: spacing.md, gap: spacing.md, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  optionPressed: { opacity: 0.86 },
  optionCopy: { gap: spacing.xs },
  optionTitleRow: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  optionTitle: { ...typography.section, color: colors.text },
  optionDescription: { ...typography.body, color: colors.textMuted },
  preview: { height: 104, padding: spacing.sm, gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  previewHeader: { height: 18, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 5 },
  previewBrand: { width: 10, height: 10, borderRadius: 3 },
  previewHeaderLine: { width: 38, height: 3, borderRadius: 2, opacity: 0.7 },
  previewKpis: { height: 28, flexDirection: "row", gap: 5 },
  previewKpi: { flex: 1, padding: 5, gap: 4, borderRadius: 5, borderWidth: 1 },
  previewKpiLabel: { height: 2, borderRadius: 2, opacity: 0.65 },
  previewKpiValue: { width: "46%", height: 5, borderRadius: 2 },
  previewHeatmap: { flex: 1, flexDirection: "row", gap: 4 },
  heatWide: { flex: 1.5, borderRadius: 4 },
  heatTile: { flex: 1, borderRadius: 4 },
}));
