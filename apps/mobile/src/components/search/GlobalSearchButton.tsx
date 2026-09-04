import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { anatoleRoutes } from "@/src/lib/routes";
import { colors } from "@/src/theme/tokens";
export function GlobalSearchButton() { return <Pressable accessibilityLabel="Recherche Anatole" accessibilityRole="button" onPress={() => router.push(anatoleRoutes.search)} style={styles.button}><MaterialCommunityIcons color={colors.primary} name="magnify" size={24} /></Pressable>; }
const styles = StyleSheet.create({ button: { width: 44, height: 44, alignItems: "center", justifyContent: "center" } });
