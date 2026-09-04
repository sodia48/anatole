import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { spacing } from "@/src/theme/tokens";

export function MobileFocusActions() {
  const { pick } = useLocale();
  return <View style={styles.row}><View style={styles.item}><Button label={pick("Créer une alerte", "Create alert")} onPress={() => router.push("/alerts")} variant="secondary" /></View><View style={styles.item}><Button label={pick("Portefeuille", "Portfolio")} onPress={() => router.push("/(tabs)/portfolio")} variant="secondary" /></View></View>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", gap: spacing.sm }, item: { flex: 1 } });
