import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocale } from "@/src/lib/i18n";
import { createThemedStyles } from "@/src/theme/palettes";
import { radius, spacing, typography } from "@/src/theme/tokens";

export type MobileFocusMode = "table" | "cards" | "charts";

export function useMobileFocusMode(key: string, modes: readonly [MobileFocusMode, ...MobileFocusMode[]]) {
  const [mode, setMode] = useState<MobileFocusMode>(modes.includes("cards") ? "cards" : modes[0]);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(key).then(saved => {
      if (active && saved && modes.includes(saved as MobileFocusMode)) setMode(saved as MobileFocusMode);
    }).catch(() => {});
    return () => { active = false; };
  }, [key, modes]);
  const choose = (value: MobileFocusMode) => {
    if (!modes.includes(value)) return;
    setMode(value);
    void AsyncStorage.setItem(key, value).catch(() => {});
  };
  return [mode, choose] as const;
}

export function MobileFocusViewMode({ mode, choose, modes }: {
  mode: MobileFocusMode; choose: (value: MobileFocusMode) => void; modes: readonly MobileFocusMode[];
}) {
  const { pick } = useLocale();
  const labels = { table: pick("Tableau", "Table"), cards: pick("Cartes", "Cards"), charts: pick("Graphiques", "Charts") };
  return <View style={styles.row} accessibilityRole="tablist">
    {modes.map(value => <Pressable key={value} onPress={() => choose(value)}
      accessibilityRole="tab" accessibilityState={{ selected: value === mode }}
      style={[styles.button, value === mode && styles.selected]}>
      <Text style={styles.label}>{labels[value]}</Text>
    </Pressable>)}
  </View>;
}

const styles = createThemedStyles(colors => ({
  row: { flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  button: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  selected: { backgroundColor: "rgba(44,156,255,.22)" },
  label: { ...typography.label, color: colors.text },
}));
