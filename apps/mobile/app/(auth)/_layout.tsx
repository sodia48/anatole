import { Stack } from "expo-router";
import { colors } from "@/src/theme/tokens";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";

export default function AuthLayout() {
  useMobileTheme();
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}><Stack.Screen name="login" options={{ title: "Connexion" }} /><Stack.Screen name="register" options={{ title: "Créer un compte" }} /></Stack>;
}
