import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { useLocale } from "@/src/lib/i18n";
import { colors } from "@/src/theme/tokens";

export default function TabLayout() {
  const { t } = useLocale();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 66, paddingTop: 6 }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700" } }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="today" options={{ title: t("today"), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="markets" options={{ title: t("markets"), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="chart-box-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="focus" options={{ title: t("focus"), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="chart-line" color={color} size={size} /> }} />
      <Tabs.Screen name="portfolio" options={{ title: t("portfolio"), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="briefcase-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: t("more"), tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="dots-horizontal-circle-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
