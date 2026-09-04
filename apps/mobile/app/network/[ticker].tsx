import { useLocalSearchParams } from "expo-router";

import { MobileFocusEcosystem } from "@/src/components/focus/MobileFocusEcosystem";
import { Screen, ScreenHeader } from "@/src/components/ui";
import { useLocale } from "@/src/lib/i18n";
import { normalizeTicker } from "@/src/lib/ticker";

export default function CompanyNetworkScreen() {
  const { ticker: value } = useLocalSearchParams<{ ticker: string }>();
  const ticker = normalizeTicker(String(value ?? ""));
  const { pick } = useLocale();
  return <Screen testID="company-network-screen"><ScreenHeader eyebrow={pick("PREUVES RELATIONNELLES", "RELATIONSHIP EVIDENCE")} title={`${pick("Réseau", "Network")} · ${ticker}`} subtitle={pick("Relations publiques traçables seulement.", "Traceable public relationships only.")} /><MobileFocusEcosystem ticker={ticker} /></Screen>;
}
