import { router } from "expo-router";
import { useState } from "react";

import { AppearanceChooser } from "@/src/components/appearance/AppearanceChooser";
import { Button, Screen } from "@/src/components/ui";
import { markMobileAppearanceChoice } from "@/src/lib/appearanceChoice";
import { useLocale } from "@/src/lib/i18n";
import { useMobileTheme } from "@/src/providers/MobileThemeProvider";
import type { MobileThemeName } from "@/src/theme/palettes";

export default function AppearanceScreen() {
  const { pick } = useLocale();
  const { theme, setTheme } = useMobileTheme();
  const [selected, setSelected] = useState<MobileThemeName>(theme);
  const [saving, setSaving] = useState(false);

  const select = (next: MobileThemeName) => {
    setSelected(next);
    void setTheme(next);
  };
  const confirm = async () => {
    setSaving(true);
    await setTheme(selected);
    await markMobileAppearanceChoice();
    router.replace("/(tabs)/today");
  };

  return <Screen testID="appearance-screen"><AppearanceChooser onSelect={select} selected={selected} /><Button disabled={saving} label={saving ? pick("Enregistrement…", "Saving…") : pick("Continuer", "Continue")} onPress={() => void confirm()} /></Screen>;
}
