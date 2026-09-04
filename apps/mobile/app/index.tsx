import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { shouldShowOnboarding } from "@/src/components/onboarding/model";
import { colors } from "@/src/theme/tokens";

export default function Index() {
  const { state, workspace } = useMobileAccount();
  if (state === "booting") return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  if (shouldShowOnboarding(workspace.data.preferences.onboarding_version)) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/today" />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background } });
