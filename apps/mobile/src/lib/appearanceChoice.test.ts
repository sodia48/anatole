import AsyncStorage from "@react-native-async-storage/async-storage";

import { hasMobileAppearanceChoice, markMobileAppearanceChoice, MOBILE_APPEARANCE_CHOICE_KEY, resolveMobileStartRoute } from "./appearanceChoice";

describe("mobile appearance choice routing", () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it("sends new users to onboarding, existing users to appearance once, then Today", () => {
    expect(resolveMobileStartRoute(true, false)).toBe("/onboarding");
    expect(resolveMobileStartRoute(false, null)).toBeNull();
    expect(resolveMobileStartRoute(false, false)).toBe("/appearance");
    expect(resolveMobileStartRoute(false, true)).toBe("/(tabs)/today");
  });

  it("persists the device-local v1 marker", async () => {
    expect(await hasMobileAppearanceChoice()).toBe(false);
    await markMobileAppearanceChoice();
    expect(await AsyncStorage.getItem(MOBILE_APPEARANCE_CHOICE_KEY)).toBe("1");
    expect(await hasMobileAppearanceChoice()).toBe(true);
  });
});
