import AsyncStorage from "@react-native-async-storage/async-storage";

export const MOBILE_APPEARANCE_CHOICE_KEY = "anatole.mobile.appearance-choice.v1";

export async function hasMobileAppearanceChoice(): Promise<boolean> {
  return (await AsyncStorage.getItem(MOBILE_APPEARANCE_CHOICE_KEY)) === "1";
}

export async function markMobileAppearanceChoice(): Promise<void> {
  await AsyncStorage.setItem(MOBILE_APPEARANCE_CHOICE_KEY, "1");
}

export function resolveMobileStartRoute(
  onboardingRequired: boolean,
  appearanceChoice: boolean | null,
): "/onboarding" | "/appearance" | "/(tabs)/today" | null {
  if (onboardingRequired) return "/onboarding";
  if (appearanceChoice === null) return null;
  return appearanceChoice ? "/(tabs)/today" : "/appearance";
}
