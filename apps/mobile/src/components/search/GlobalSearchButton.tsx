import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { anatoleRoutes } from "@/src/lib/routes";
import { colors } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
export function GlobalSearchButton() {
  useMobileTheme(); return <Pressable accessibilityLabel="Recherche Anatole" accessibilityRole="button" onPress={() => router.push(anatoleRoutes.search)} style={styles.button}><MaterialCommunityIcons color={colors.primary} name="magnify" size={24} /></Pressable>; }
const styles = createThemedStyles((colors) => ({ button: { width: 44, height: 44, alignItems: "center", justifyContent: "center" } }));
