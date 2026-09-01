import { Stack, router, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppProviders } from "@/src/providers/AppProviders";
import { useLocale } from "@/src/lib/i18n";
import { colors } from "@/src/theme/tokens";

void SplashScreen.preventAutoHideAsync();

function NotificationNavigation() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      if (typeof data.ticker === "string") {
        router.push({ pathname: "/focus/[ticker]", params: { ticker: data.ticker } });
      } else if (typeof data.route === "string" && data.route.startsWith("/")) {
        router.push(data.route as Href);
      } else {
        router.push("/notifications");
      }
    });
    return () => subscription.remove();
  }, []);
  return null;
}

export default function RootLayout() {
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <AppProviders>
        <NotificationNavigation />
        <StatusBar style="light" />
        <AppStack />
      </AppProviders>
    </GestureHandlerRootView>
  );
}

function AppStack() {
  const { pick } = useLocale();
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background }, headerBackButtonDisplayMode: "minimal" }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: "modal" }} />
    <Stack.Screen name="stock/[ticker]" options={{ title: "Focus", orientation: "all" }} />
    <Stack.Screen name="focus/[ticker]" options={{ title: "Focus" }} />
    <Stack.Screen name="etf/index" options={{ title: pick("ETF canadiens", "Canadian ETFs") }} />
    <Stack.Screen name="etf/[ticker]" options={{ title: "ETF" }} />
    <Stack.Screen name="screener/index" options={{ title: "Screener" }} />
    <Stack.Screen name="ipo-insiders/index" options={{ title: pick("IPO & initiés", "IPOs & insiders") }} />
    <Stack.Screen name="notifications" options={{ title: pick("Notifications", "Notifications") }} />
    <Stack.Screen name="alerts" options={{ title: pick("Alertes", "Alerts") }} />
    <Stack.Screen name="watchlist" options={{ title: "Watchlist" }} />
    <Stack.Screen name="settings" options={{ title: pick("Réglages", "Settings") }} />
  </Stack>;
}
