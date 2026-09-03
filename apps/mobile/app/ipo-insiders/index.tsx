import { useLocalSearchParams } from "expo-router";

import { IpoInsidersScreen } from "@/src/components/ipo-insiders/IpoInsidersScreen";

export default function IpoInsidersPage() {
  const params = useLocalSearchParams<{ tab?: string | string[]; ticker?: string | string[] }>();
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const ticker = (Array.isArray(params.ticker) ? params.ticker[0] : params.ticker)?.trim().toUpperCase() ?? "";
  return <IpoInsidersScreen initialTab={tab === "insiders" ? "insiders" : "ipo"} initialTicker={ticker} />;
}
