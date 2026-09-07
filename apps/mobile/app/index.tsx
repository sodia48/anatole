import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useEffect, useState } from "react";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { shouldShowOnboarding } from "@/src/components/onboarding/model";
import { colors } from "@/src/theme/tokens";
import { createThemedStyles } from "@/src/theme/palettes";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import { hasMobileAppearanceChoice, resolveMobileStartRoute } from "@/src/lib/appearanceChoice";

export default function Index() {
  useMobileTheme();
  const { state, workspace } = useMobileAccount();
  const [appearanceChoice, setAppearanceChoice] = useState<boolean | null>(null);
  const onboardingRequired = shouldShowOnboarding(workspace.data.preferences.onboarding_version);
  useEffect(() => {
    if (state === "booting" || onboardingRequired) return;
    let active = true;
    void hasMobileAppearanceChoice().then((value) => { if (active) setAppearanceChoice(value); });
    return () => { active = false; };
  }, [onboardingRequired, state]);
  if (state === "booting") return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  const route = resolveMobileStartRoute(onboardingRequired, appearanceChoice);
  if (!route) return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  return <Redirect href={route} />;
}

const styles = createThemedStyles((colors) => ({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background } }));
