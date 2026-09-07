import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { anatoleRoutes } from "@/src/lib/routes";
import { colors } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
export function IntelligenceActions({ symbol }: { symbol?: string }) {
  useMobileTheme(); return <View style={styles.row}><Pressable accessibilityLabel="Assistant Anatole" onPress={() => router.push({ pathname: anatoleRoutes.assistant, params: symbol ? { symbol } : undefined } as never)} style={styles.button}><MaterialCommunityIcons color={colors.primary} name="message-processing-outline" size={22} /></Pressable><Pressable accessibilityLabel="Recherche Anatole" onPress={() => router.push(anatoleRoutes.search)} style={styles.button}><MaterialCommunityIcons color={colors.primary} name="magnify" size={24} /></Pressable></View>; }
const styles = createThemedStyles((colors) => ({ row: { flexDirection: "row" }, button: { width: 44, height: 44, alignItems: "center", justifyContent: "center" } }));
